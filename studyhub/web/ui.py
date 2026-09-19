"""HTML for StudyHub: plain server-rendered forms, no JavaScript (so the CSP can forbid scripts outright)."""
from __future__ import annotations

import html
import time

CSS = (
    ":root{color-scheme:light dark;--accent:#0d5c5f;--link:#0d5c5f;--bad:#b91c1c;--ok:#15803d;--border:#d4d4d8;--muted:#6b7280}"
    "*{box-sizing:border-box}"
    "body{font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;max-width:44rem;margin:0 auto;padding:1.2rem 1.2rem 4rem}"
    "header{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;"
    "border-bottom:1px solid var(--border);padding-bottom:.7rem;margin-bottom:1.6rem}"
    "header .brand{font-weight:700;text-decoration:none;color:inherit}"
    "header form{display:inline;margin:0}"
    "h1{font-size:1.4rem;margin:0 0 .3rem}h2{font-size:1.05rem;margin:1.6rem 0 .5rem}"
    ".sub{color:var(--muted);font-size:.9rem;margin:0 0 1.2rem}"
    ".card{border:1px solid var(--border);border-radius:8px;padding:.9rem 1.1rem;margin:0 0 .8rem}"
    "label{display:block;font-weight:600;font-size:.9rem;margin:.8rem 0 .25rem}"
    "input[type=text],input[type=password],textarea{width:100%;font:inherit;padding:.5rem .7rem;"
    "border:1px solid #a1a1aa;border-radius:6px;background:transparent;color:inherit}"
    "textarea{min-height:5rem;resize:vertical}"
    ".btn{font:inherit;font-weight:600;padding:.5rem 1.2rem;margin-top:.9rem;border:0;border-radius:6px;"
    "background:var(--accent);color:#fff;cursor:pointer}"
    ".btn-sec{background:transparent;border:1px solid var(--border);color:inherit}"
    ".btn-bad{background:#b91c1c}"
    "a{color:var(--link)}"
    ".error{background:#fee2e2;border:1px solid #fca5a5;color:var(--bad);border-radius:6px;padding:.6rem .9rem;margin:0 0 1rem}"
    ".note{font-size:.85rem;color:var(--muted)}"
    ".row{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}"
    ".row input[type=text]{flex:1;min-width:12rem;width:auto}"
    "h3{font-size:.95rem;margin:1.2rem 0 .4rem}"
    ".warn{background:#fef3c7;border:1px solid #fcd34d;color:#78350f;border-radius:6px;padding:.4rem .7rem;margin:.5rem 0 0;font-size:.88rem}"
    ".passage{white-space:pre-wrap;font-size:.93rem;margin-top:.3rem;overflow-wrap:anywhere}"
    ".topics{margin:.2rem 0;padding-left:1.2rem}"
    "@media (prefers-color-scheme:dark){:root{--link:#5eead4;--muted:#a1a1aa;--bad:#f87171}"
    ".error{background:#450a0a;border-color:#7f1d1d}.warn{background:#3b2a05;border-color:#92400e;color:#fde68a}}"
)


def esc(v) -> str:
    return html.escape("" if v is None else str(v))


def csrf_field(token: str) -> str:
    return f"<input type='hidden' name='csrf' value='{esc(token)}'>"


def page(title: str, body: str, *, username: str | None = None, csrf: str | None = None) -> str:
    who = ""
    if username is not None and csrf:
        who = (f"<span class='note'>Signed in as <b>{esc(username)}</b></span>"
               f"<form method='post' action='/logout'>{csrf_field(csrf)}"
               "<button class='btn btn-sec' style='margin:0'>Log out</button></form>")
    return ("<!doctype html><html lang='en'><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            f"<title>{esc(title)} - StudyHub</title><style>{CSS}</style></head><body>"
            f"<header><a class='brand' href='/subjects'>StudyHub</a><div class='row'>{who}</div></header>"
            f"{body}</body></html>")


def error_box(message: str | None) -> str:
    return f"<div class='error' role='alert'>{esc(message)}</div>" if message else ""


def auth_form(kind: str, token: str, *, error: str | None = None, username: str = "") -> str:
    register = kind == "register"
    return (
        f"<h1>{'Create your account' if register else 'Log in'}</h1>"
        f"<p class='sub'>{'Your subjects and progress are private to your account.' if register else 'Welcome back.'}</p>"
        f"{error_box(error)}"
        f"<form method='post' action='/{kind}'>{csrf_field(token)}"
        f"<label for='username'>Username</label>"
        f"<input type='text' id='username' name='username' value='{esc(username)}' maxlength='32' "
        f"autocomplete='username' required autofocus>"
        f"<label for='password'>Password</label>"
        f"<input type='password' id='password' name='password' maxlength='128' "
        f"autocomplete='{'new-password' if register else 'current-password'}' required>"
        + ("<label for='password2'>Repeat password</label>"
           "<input type='password' id='password2' name='password2' maxlength='128' autocomplete='new-password' required>"
           if register else "")
        + f"<button class='btn'>{'Register' if register else 'Log in'}</button></form>"
        + (f"<p class='note'>Already registered? <a href='/login'>Log in</a></p>" if register
           else "<p class='note'>New here? <a href='/register'>Create an account</a></p>")
    )


def subjects_page(subjects: list[dict], csrf: str, *, error: str | None = None, name: str = "",
                  description: str = "") -> str:
    cards = "".join(
        f"<div class='card'><a href='/subjects/{int(s['id'])}'><b>{esc(s['name'])}</b></a>"
        + (f"<div class='note'>{esc(s['description'])}</div>" if s["description"] else "") + "</div>"
        for s in subjects) or "<p class='note'>No subjects yet. Create your first one below.</p>"
    return (
        "<h1>Your subjects</h1><p class='sub'>Each subject keeps its own materials, questions, quizzes and progress.</p>"
        f"{cards}<h2>New subject</h2>{error_box(error)}"
        f"<form method='post' action='/subjects'>{csrf_field(csrf)}"
        f"<label for='name'>Name</label><input type='text' id='name' name='name' maxlength='80' value='{esc(name)}' required>"
        f"<label for='description'>Description (optional)</label>"
        f"<textarea id='description' name='description' maxlength='500'>{esc(description)}</textarea>"
        "<button class='btn'>Create subject</button></form>"
    )


def _where(page_start, page_end) -> str:
    if page_start is None:
        return ""
    return f"p. {int(page_start)}" if page_end in (None, page_start) else f"pp. {int(page_start)}–{int(page_end)}"


def _warnings(items: list[str]) -> str:
    return "".join(f"<div class='warn'>{esc(w)}</div>" for w in items)


def materials_section(subject_id: int, documents: list[dict], topics: list[dict], csrf: str, *,
                      upload_error: str | None = None) -> str:
    sid = int(subject_id)
    rows = ""
    for d in documents:
        rows += (f"<div class='card'><a href='/subjects/{sid}/materials/{int(d['id'])}'><b>{esc(d['title'])}</b></a>"
                 f"<div class='note'>{esc(d['kind']).upper()} &middot; {esc(d['source'])} &middot; "
                 + (f"{int(d['pages'])} pages &middot; " if d["pages"] else "")
                 + f"{int(d['chunks'])} passages"
                 + ("" if d["status"] == "parsed" else f" &middot; <b>{esc(d['status'])}</b>")
                 + f"</div>{_warnings(d['warnings'])}</div>")
    rows = rows or "<p class='note'>No materials yet. Upload a PDF, a Word document or a text file.</p>"
    topic_items = "".join(f"<li>{esc(t['path'])} <span class='note'>({int(t['chunks'])} passages)</span></li>" for t in topics)
    return (
        "<h2>Materials</h2>" + rows
        + "<h3>Add material</h3>" + error_box(upload_error)
        + f"<form method='post' action='/subjects/{sid}/materials' enctype='multipart/form-data'>{csrf_field(csrf)}"
        "<label for='file'>PDF, Word (.docx) or text file (up to 20 MB)</label>"
        "<input type='file' id='file' name='file' accept='.pdf,.docx,.txt,.md,text/plain,application/pdf' required>"
        "<button class='btn'>Upload</button></form>"
        + (f"<h3>Topics found</h3><ul class='topics'>{topic_items}</ul>" if topics else "")
        + (f"<h3>Search your materials</h3><form method='get' action='/subjects/{sid}/search' class='row'>"
           "<input type='text' name='q' maxlength='200' aria-label='Search' placeholder='e.g. binary tree traversal' required>"
           "<button class='btn' style='margin:0'>Search</button></form>" if documents else "")
    )


def subject_page(subject: dict, csrf: str, *, error: str | None = None, documents: list[dict] | None = None,
                 topics: list[dict] | None = None, upload_error: str | None = None) -> str:
    sid = int(subject["id"])
    made = time.strftime("%Y-%m-%d", time.localtime(subject["created_at"]))
    return (
        f"<p class='note'><a href='/subjects'>&larr; All subjects</a></p>"
        f"<h1>{esc(subject['name'])}</h1>"
        f"<p class='sub'>{esc(subject['description']) or 'No description.'} &middot; created {made}</p>"
        + materials_section(sid, documents or [], topics or [], csrf, upload_error=upload_error)
        + "<div class='card'><b>Questions, quizzes and progress</b>"
        "<div class='note'>Arrive in the next phases.</div></div>"
        f"<h2>Rename or describe</h2>{error_box(error)}"
        f"<form method='post' action='/subjects/{sid}/edit'>{csrf_field(csrf)}"
        f"<label for='name'>Name</label><input type='text' id='name' name='name' maxlength='80' value='{esc(subject['name'])}' required>"
        f"<label for='description'>Description</label>"
        f"<textarea id='description' name='description' maxlength='500'>{esc(subject['description'])}</textarea>"
        "<button class='btn'>Save</button></form>"
        "<h2>Delete this subject</h2>"
        "<p class='note'>This permanently deletes the subject and everything inside it.</p>"
        f"<form method='post' action='/subjects/{sid}/delete'>{csrf_field(csrf)}"
        "<label><input type='checkbox' name='confirm' value='yes'> I understand this cannot be undone</label>"
        "<button class='btn btn-bad'>Delete subject</button></form>"
    )


def document_page(subject: dict, doc: dict, chunks: list[dict], csrf: str, *, notice: str | None = None) -> str:
    sid = int(subject["id"])
    items = "".join(
        f"<div class='card'><div class='note'>#{int(c['ordinal']) + 1}"
        + (f" &middot; {esc(c['heading_path'])}" if c["heading_path"] else "")
        + (f" &middot; {esc(_where(c['page_start'], c['page_end']))}" if c["page_start"] is not None else "")
        + f"</div><div class='passage'>{esc(c['text'])}</div></div>" for c in chunks)
    return (
        f"<p class='note'><a href='/subjects/{sid}'>&larr; {esc(subject['name'])}</a></p>"
        f"<h1>{esc(doc['title'])}</h1>"
        f"<p class='sub'>{esc(doc['kind']).upper()} &middot; {esc(doc['source'])} &middot; "
        + (f"{int(doc['pages'])} pages &middot; " if doc["pages"] else "")
        + f"{int(doc['chunks'])} passages &middot; {esc(doc['status'])}</p>"
        + (f"<div class='warn'>{esc(notice)}</div>" if notice else "") + _warnings(doc["warnings"])
        + (items or "<p class='note'>Nothing could be extracted from this file.</p>")
        + "<h2>Remove this material</h2><p class='note'>Its passages disappear from search, questions and quizzes.</p>"
        f"<form method='post' action='/subjects/{sid}/materials/{int(doc['id'])}/delete'>{csrf_field(csrf)}"
        "<button class='btn btn-bad'>Remove material</button></form>"
    )


def search_page(subject: dict, query: str, results: list[dict]) -> str:
    sid = int(subject["id"])
    items = "".join(
        f"<div class='card'><div class='note'><a href='/subjects/{sid}/materials/{int(r['document_id'])}'>{esc(r['doc_title'])}</a>"
        + (f" &middot; {esc(r['heading_path'])}" if r["heading_path"] else "")
        + (f" &middot; {esc(_where(r['page_start'], r['page_end']))}" if r["page_start"] is not None else "")
        + f"</div><div class='passage'>{esc(r['text'])}</div></div>" for r in results)
    return (
        f"<p class='note'><a href='/subjects/{sid}'>&larr; {esc(subject['name'])}</a></p><h1>Search</h1>"
        f"<form method='get' action='/subjects/{sid}/search' class='row'>"
        f"<input type='text' name='q' maxlength='200' value='{esc(query)}' aria-label='Search' required>"
        "<button class='btn' style='margin:0'>Search</button></form>"
        + (items or "<p class='note'>No passage in this subject matches. Nothing is guessed: try other words, "
                    "or upload material that covers it.</p>")
    )


def not_found() -> str:
    return "<h1>Not found</h1><p class='sub'>That page does not exist, or it is not yours.</p><p><a href='/subjects'>Your subjects</a></p>"
