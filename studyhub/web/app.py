"""StudyHub web app (Phase A1: accounts, sessions, subjects).

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
from contextlib import contextmanager

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse

from studyhub import auth, settings
from studyhub import db as studydb
from studyhub.repo import Repo, SubjectError
from studyhub.web import ui

SESSION_COOKIE, PRE_COOKIE = "sh_session", "sh_pre"
app = FastAPI(title="StudyHub", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def security_headers(request: Request, call_next):
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
        return _html(row["name"], ui.subject_page(row, session.csrf), user=user, csrf=session.csrf)


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
            return _html(row["name"], ui.subject_page(row, session.csrf, error=str(e)), status=400,
                         user=user, csrf=session.csrf)
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
            return _html(row["name"], ui.subject_page(row, session.csrf, error="Tick the box to confirm the deletion."),
                         status=400, user=user, csrf=session.csrf)
        repo.delete_subject(user["id"], sid)
    return RedirectResponse("/subjects", status_code=303)
