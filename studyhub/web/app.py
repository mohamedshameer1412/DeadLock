"""StudyHub web app (Phase A1: accounts, sessions, subjects. Phase A2: materials and search).

Run:  uvicorn studyhub.web.app:app --port 8100
      STUDYHUB_DB=path/to/file.db   STUDYHUB_COOKIE_SECURE=1 (when served over HTTPS)

Security notes
  * Every state-changing request needs a CSRF token: the session's for signed-in forms, a double-submit cookie for the
    login/register forms. A wrong or missing token is a 403 and changes nothing.
  * All SQL goes through studyhub.repo, which puts user_id in every WHERE clause. Someone else's subject is a 404,
    exactly like one that does not exist.
  * No JavaScript anywhere, so the Content-Security-Policy forbids scripts entirely.
  * There is no `next=` redirect parameter (no open redirect).
"""
from __future__ import annotations

import secrets
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager, contextmanager

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse

from studyhub import auth, ingest, models, qa, retrieval, settings
from studyhub import db as studydb
from studyhub.repo import Repo, SubjectError
from studyhub.web import ui

SESSION_COOKIE, PRE_COOKIE = "sh_session", "sh_pre"


@asynccontextmanager
async def _lifespan(_app):
    """Questions still 'pending' when the process starts were cut off by the previous shutdown."""
    store = studydb.open_db()
    try:
        Repo(store.db).expire_pending_doubts(0)
    finally:
        store.close()
    yield


app = FastAPI(title="StudyHub", docs_url=None, redoc_url=None, openapi_url=None, lifespan=_lifespan)

# Which models answer a question. A function so tests (and other deployments) can swap it: (db, user) -> (tiers, notes).
tier_factory = models.build_tiers
_worker: ThreadPoolExecutor | None = None
_worker_lock = threading.Lock()


@app.middleware("http")
async def security_headers(request: Request, call_next):
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > settings.max_upload_bytes() + 64 * 1024:
        response = _html("Too large", "<h1>That upload is too large</h1><p class='sub'>The limit is "
                         f"{settings.max_upload_bytes() / 1048576:.3g} MB per file.</p>", status=413)   # before parsing the body
    else:
        response = await call_next(request)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; style-src 'unsafe-inline'; script-src 'none'; form-action 'self'; "
        "frame-ancestors 'none'; base-uri 'none'")
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Cache-Control"] = "no-store"
    return response


@contextmanager
def _open():
    """One connection per request, in the thread that uses it (sqlite3 connections are thread-bound)."""
    store = studydb.open_db()
    try:
        yield store.db
    finally:
        store.close()


def _html(title: str, body: str, *, status: int = 200, user: dict | None = None, csrf: str | None = None):
    return HTMLResponse(ui.page(title, body, username=user["username"] if user else None, csrf=csrf),
                        status_code=status)


def _signed_in(request: Request, db):
    """(user, session) or None."""
    session = auth.get_session(db, request.cookies.get(SESSION_COOKIE))
    if session is None:
        return None
    user = Repo(db).get_user(session.user_id)
    return (user, session) if user else None


def _set_session_cookie(response, token: str) -> None:
    response.set_cookie(SESSION_COOKIE, token, max_age=settings.session_days() * 86400, httponly=True,
                        samesite="lax", secure=settings.cookie_secure(), path="/")


def _forbidden():
    return _html("Forbidden", "<h1>Request refused</h1><p class='sub'>The form expired or was not sent from this site. "
                              "Go back, reload the page and try again.</p>", status=403)


def _pre_token(request: Request) -> tuple[str, bool]:
    existing = request.cookies.get(PRE_COOKIE)
    if existing and 20 <= len(existing) <= 100:
        return existing, False
    return secrets.token_urlsafe(24), True


def _with_pre_cookie(response, token: str, is_new: bool):
    if is_new:
        response.set_cookie(PRE_COOKIE, token, httponly=True, samesite="lax", secure=settings.cookie_secure(), path="/")
    return response


def _int(text: str) -> int | None:
    return int(text) if text.isdigit() and len(text) < 12 else None


# ---------------------------------------------------------------------------- basics

@app.get("/healthz")
def healthz():
    return PlainTextResponse("ok")


@app.get("/")
def home(request: Request):
    with _open() as db:
        return RedirectResponse("/subjects" if _signed_in(request, db) else "/login", status_code=303)


# ---------------------------------------------------------------------- register / login

def _auth_page(request: Request, kind: str, *, error: str | None = None, username: str = "", status: int = 200):
    token, is_new = _pre_token(request)
    response = _html("Register" if kind == "register" else "Log in",
                     ui.auth_form(kind, token, error=error, username=username), status=status)
    return _with_pre_cookie(response, token, is_new)


@app.get("/register")
def register_form(request: Request):
    return _auth_page(request, "register")


@app.get("/login")
def login_form(request: Request):
    return _auth_page(request, "login")


@app.post("/register")
def register(request: Request, username: str = Form(""), password: str = Form(""), password2: str = Form(""),
             csrf: str = Form("")):
    if not auth.same_token(csrf, request.cookies.get(PRE_COOKIE)):
        return _forbidden()
    if password != password2:
        return _auth_page(request, "register", error="The two passwords do not match.", username=username, status=400)
    with _open() as db:
        try:
            user_id = auth.register(db, username, password)
        except auth.AuthError as e:
            return _auth_page(request, "register", error=str(e), username=username, status=400)
        auth.purge_expired(db)
        token, _ = auth.create_session(db, user_id)
    response = RedirectResponse("/subjects", status_code=303)
    _set_session_cookie(response, token)
    return response


@app.post("/login")
def login(request: Request, username: str = Form(""), password: str = Form(""), csrf: str = Form("")):
    if not auth.same_token(csrf, request.cookies.get(PRE_COOKIE)):
        return _forbidden()
    ip = request.client.host if request.client else ""
    with _open() as db:
        try:
            user_id = auth.authenticate(db, username, password, ip=ip)
        except auth.AuthError as e:
            return _auth_page(request, "login", error=str(e), username=username, status=400)
        token, _ = auth.create_session(db, user_id)          # a fresh token on every login
    response = RedirectResponse("/subjects", status_code=303)
    _set_session_cookie(response, token)
    return response


@app.post("/logout")
def logout(request: Request, csrf: str = Form("")):
    with _open() as db:
        ctx = _signed_in(request, db)
        if ctx is None:
            return RedirectResponse("/login", status_code=303)
        if not auth.same_token(csrf, ctx[1].csrf):
            return _forbidden()
        auth.delete_session(db, request.cookies.get(SESSION_COOKIE))     # server-side: the cookie is now dead
    response = RedirectResponse("/login", status_code=303)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


# ----------------------------------------------------------------------------- subjects

@app.get("/subjects")
def subjects(request: Request):
    with _open() as db:
        ctx = _signed_in(request, db)
        if ctx is None:
            return RedirectResponse("/login", status_code=303)
        user, session = ctx
        return _html("Subjects", ui.subjects_page(Repo(db).list_subjects(user["id"]), session.csrf),
                     user=user, csrf=session.csrf)


@app.post("/subjects")
def create_subject(request: Request, name: str = Form(""), description: str = Form(""), csrf: str = Form("")):
    with _open() as db:
        ctx = _signed_in(request, db)
        if ctx is None:
            return RedirectResponse("/login", status_code=303)
        user, session = ctx
        if not auth.same_token(csrf, session.csrf):
            return _forbidden()
        repo = Repo(db)
        try:
            subject_id = repo.create_subject(user["id"], name, description)
        except SubjectError as e:
            return _html("Subjects", ui.subjects_page(repo.list_subjects(user["id"]), session.csrf, error=str(e),
                                                      name=name, description=description),
                         status=400, user=user, csrf=session.csrf)
    return RedirectResponse(f"/subjects/{subject_id}", status_code=303)


@app.get("/subjects/{subject_id}")
def subject(request: Request, subject_id: str):
    with _open() as db:
        ctx = _signed_in(request, db)
        if ctx is None:
            return RedirectResponse("/login", status_code=303)
        user, session = ctx
        row = Repo(db).get_subject(user["id"], _int(subject_id) or -1)
        if row is None:
            return _html("Not found", ui.not_found(), status=404, user=user, csrf=session.csrf)
        return _subject_html(db, user, session, row)


def _subject_html(db, user, session, row, *, status: int = 200, error: str | None = None, upload_error: str | None = None,
                  ask_error: str | None = None, question: str = ""):
    repo = Repo(db)
    body = ui.subject_page(row, session.csrf, error=error, upload_error=upload_error, ask_error=ask_error, question=question,
                           documents=repo.list_documents(user["id"], row["id"]), topics=repo.list_topics(user["id"], row["id"]),
                           doubts=repo.list_doubts(user["id"], row["id"], 8))
    return _html(row["name"], body, status=status, user=user, csrf=session.csrf)


@app.post("/subjects/{subject_id}/edit")
def edit_subject(request: Request, subject_id: str, name: str = Form(""), description: str = Form(""),
                 csrf: str = Form("")):
    with _open() as db:
        ctx = _signed_in(request, db)
        if ctx is None:
            return RedirectResponse("/login", status_code=303)
        user, session = ctx
        if not auth.same_token(csrf, session.csrf):
            return _forbidden()
        repo, sid = Repo(db), _int(subject_id) or -1
        row = repo.get_subject(user["id"], sid)
        if row is None:
            return _html("Not found", ui.not_found(), status=404, user=user, csrf=session.csrf)
        try:
            repo.update_subject(user["id"], sid, name, description)
        except SubjectError as e:
            return _subject_html(db, user, session, row, status=400, error=str(e))
    return RedirectResponse(f"/subjects/{sid}", status_code=303)


@app.post("/subjects/{subject_id}/delete")
def delete_subject(request: Request, subject_id: str, confirm: str = Form(""), csrf: str = Form("")):
    with _open() as db:
        ctx = _signed_in(request, db)
        if ctx is None:
            return RedirectResponse("/login", status_code=303)
        user, session = ctx
        if not auth.same_token(csrf, session.csrf):
            return _forbidden()
        repo, sid = Repo(db), _int(subject_id) or -1
        row = repo.get_subject(user["id"], sid)
        if row is None:
            return _html("Not found", ui.not_found(), status=404, user=user, csrf=session.csrf)
        if confirm != "yes":
            return _subject_html(db, user, session, row, status=400, error="Tick the box to confirm the deletion.")
        ingest.delete_subject(db, user["id"], sid)
    return RedirectResponse("/subjects", status_code=303)


# ---------------------------------------------------------------------------------------- materials

def _member(request: Request, db, subject_id: str, *, form_csrf: str | None = None):
    """Common gate for subject pages: (user, session, subject) or a ready response. A form_csrf of None = read-only."""
    ctx = _signed_in(request, db)
    if ctx is None:
        return None, RedirectResponse("/login", status_code=303)
    user, session = ctx
    if form_csrf is not None and not auth.same_token(form_csrf, session.csrf):
        return None, _forbidden()
    row = Repo(db).get_subject(user["id"], _int(subject_id) or -1)
    if row is None:
        return None, _html("Not found", ui.not_found(), status=404, user=user, csrf=session.csrf)
    return (user, session, row), None


@app.post("/subjects/{subject_id}/materials")
def upload_material(request: Request, subject_id: str, file: UploadFile = File(...), csrf: str = Form("")):
    with _open() as db:
        ctx, early = _member(request, db, subject_id, form_csrf=csrf)
        if early:
            return early
        user, session, row = ctx
        limit = settings.max_upload_bytes()
        data = file.file.read(limit + 1)
        try:
            result = ingest.ingest(db, user["id"], row["id"], file.filename or "upload", data)
        except ingest.IngestError as e:
            return _subject_html(db, user, session, row, status=400, upload_error=str(e))
    return RedirectResponse(f"/subjects/{row['id']}/materials/{result.document_id}" + ("?dup=1" if result.duplicate else ""),
                            status_code=303)


@app.get("/subjects/{subject_id}/materials/{document_id}")
def material(request: Request, subject_id: str, document_id: str, dup: str = ""):
    with _open() as db:
        ctx, early = _member(request, db, subject_id)
        if early:
            return early
        user, session, row = ctx
        repo = Repo(db)
        doc = repo.get_document(user["id"], row["id"], _int(document_id) or -1)
        if doc is None:
            return _html("Not found", ui.not_found(), status=404, user=user, csrf=session.csrf)
        chunks = repo.document_chunks(user["id"], row["id"], doc["id"])
        notice = "This exact file was already in this subject, so nothing was added." if dup == "1" else None
        return _html(doc["title"], ui.document_page(row, doc, chunks, session.csrf, notice=notice),
                     user=user, csrf=session.csrf)


@app.post("/subjects/{subject_id}/materials/{document_id}/delete")
def delete_material(request: Request, subject_id: str, document_id: str, csrf: str = Form("")):
    with _open() as db:
        ctx, early = _member(request, db, subject_id, form_csrf=csrf)
        if early:
            return early
        user, session, row = ctx
        if not ingest.delete_document(db, user["id"], row["id"], _int(document_id) or -1):
            return _html("Not found", ui.not_found(), status=404, user=user, csrf=session.csrf)
    return RedirectResponse(f"/subjects/{row['id']}", status_code=303)


@app.get("/subjects/{subject_id}/search")
def search_materials(request: Request, subject_id: str, q: str = ""):
    with _open() as db:
        ctx, early = _member(request, db, subject_id)
        if early:
            return early
        user, session, row = ctx
        q = " ".join(q.split())[:200]
        results = retrieval.search(db, user["id"], row["id"], q, k=8) if q else []
        return _html("Search", ui.search_page(row, q, results), user=user, csrf=session.csrf)


# ------------------------------------------------------------------------------------------------ questions

@contextmanager
def _open_store():
    store = studydb.open_db()
    try:
        yield store
    finally:
        store.close()


def _process(doubt_id: int, user_id: int) -> None:
    """Answer one pending question. Runs in the worker thread, with its own connection."""
    with _open_store() as store:
        repo = Repo(store.db)
        try:
            tiers, notes = tier_factory(store.db, repo.get_user(user_id))
            qa.run_doubt(store, user_id, doubt_id, tiers, notes)
        except Exception as e:                                # the student must never be left on a spinner
            repo.finish_doubt(user_id, doubt_id, status="failed", tier=None, model=None, dropped=0, claims=[], sources=[],
                              reason=f"Something went wrong while answering ({type(e).__name__}). Please try again.")


def _submit(doubt_id: int, user_id: int) -> None:
    global _worker
    if settings.qa_inline():
        _process(doubt_id, user_id)
        return
    with _worker_lock:
        if _worker is None:                                   # one at a time: a local model on a small GPU cannot do two
            _worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="qa")
        _worker.submit(_process, doubt_id, user_id)


@app.post("/subjects/{subject_id}/ask")
def ask(request: Request, subject_id: str, question: str = Form(""), csrf: str = Form("")):
    with _open() as db:
        ctx, early = _member(request, db, subject_id, form_csrf=csrf)
        if early:
            return early
        user, session, row = ctx
        repo = Repo(db)
        q = " ".join(question.split())
        error = None
        if len(q) < 3:
            error = "Type your question first."
        elif len(q) > qa.MAX_QUESTION_CHARS:
            error = f"Please keep the question under {qa.MAX_QUESTION_CHARS} characters."
        else:
            repo.expire_pending_doubts(1800)
            if repo.pending_doubts(user["id"]) >= settings.max_pending_questions():
                error = "You already have questions being answered. Wait for one to finish, then ask again."
        if error:
            return _subject_html(db, user, session, row, status=400, ask_error=error, question=question[:600])
        doubt_id = repo.create_doubt(user["id"], row["id"], q)
    _submit(doubt_id, user["id"])
    return RedirectResponse(f"/subjects/{row['id']}/questions/{doubt_id}", status_code=303)


@app.get("/subjects/{subject_id}/questions/{doubt_id}")
def question_page(request: Request, subject_id: str, doubt_id: str):
    with _open() as db:
        ctx, early = _member(request, db, subject_id)
        if early:
            return early
        user, session, row = ctx
        repo = Repo(db)
        repo.expire_pending_doubts(1800)
        d = repo.get_doubt(user["id"], row["id"], _int(doubt_id) or -1)
        if d is None:
            return _html("Not found", ui.not_found(), status=404, user=user, csrf=session.csrf)
        trace = repo.doubt_trace(user["id"], row["id"], d["id"]) if d["status"] != "pending" else []
        return _html(d["question"][:60], ui.doubt_page(row, d, trace, session.csrf), user=user, csrf=session.csrf)


@app.post("/subjects/{subject_id}/questions/{doubt_id}/feedback")
def question_feedback(request: Request, subject_id: str, doubt_id: str, value: str = Form(""), csrf: str = Form("")):
    with _open() as db:
        ctx, early = _member(request, db, subject_id, form_csrf=csrf)
        if early:
            return early
        user, session, row = ctx
        if not Repo(db).set_doubt_feedback(user["id"], row["id"], _int(doubt_id) or -1, value):
            return _html("Not found", ui.not_found(), status=404, user=user, csrf=session.csrf)
    return RedirectResponse(f"/subjects/{row['id']}/questions/{int(doubt_id)}", status_code=303)


@app.post("/subjects/{subject_id}/questions/{doubt_id}/delete")
def question_delete(request: Request, subject_id: str, doubt_id: str, csrf: str = Form("")):
    with _open() as db:
        ctx, early = _member(request, db, subject_id, form_csrf=csrf)
        if early:
            return early
        user, session, row = ctx
        if not Repo(db).delete_doubt(user["id"], row["id"], _int(doubt_id) or -1):
            return _html("Not found", ui.not_found(), status=404, user=user, csrf=session.csrf)
    return RedirectResponse(f"/subjects/{row['id']}", status_code=303)


# ------------------------------------------------------------------------------------------------- account

@app.get("/account")
def account(request: Request):
    with _open() as db:
        ctx = _signed_in(request, db)
        if ctx is None:
            return RedirectResponse("/login", status_code=303)
        user, session = ctx
        s = models.slice_config.settings(reload=False)
        return _html("Account", ui.account_page(user, session.csrf, key_configured=bool(s.api_key),
                                                allowed=models.allowed_cloud_models() if s.api_key else []),
                     user=user, csrf=session.csrf)


@app.post("/account/cloud")
def account_cloud(request: Request, consent: str = Form(""), csrf: str = Form("")):
    with _open() as db:
        ctx = _signed_in(request, db)
        if ctx is None:
            return RedirectResponse("/login", status_code=303)
        user, session = ctx
        if not auth.same_token(csrf, session.csrf):
            return _forbidden()
        Repo(db).set_cloud_consent(user["id"], consent == "yes")
    return RedirectResponse("/account", status_code=303)
