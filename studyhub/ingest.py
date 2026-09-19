"""Upload -> checks -> extract -> chunk -> store. The one function the web layer calls for a new file."""
from __future__ import annotations

import hashlib
import os
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from . import settings
from .chunker import chunk_blocks
from .extract import ExtractError, extract, sniff
from .repo import Repo


class IngestError(ValueError):
    """The upload was refused; the message is written for the student. Nothing was stored."""


@dataclass
class IngestResult:
    document_id: int
    title: str
    status: str                                              # parsed | empty | failed
    chunks: int = 0
    topics: int = 0
    duplicate: bool = False
    warnings: list[str] = field(default_factory=list)


def _upload_path(user_id: int, sha256: str) -> Path:
    return Path(settings.upload_dir()) / str(int(user_id)) / sha256           # digits and hex only: no traversal


def ingest(db: sqlite3.Connection, user_id: int, subject_id: int, filename: str, data: bytes) -> IngestResult:
    repo = Repo(db)
    if repo.get_subject(user_id, subject_id) is None:
        raise IngestError("That subject does not exist.")
    if not data:
        raise IngestError("The file is empty.")
    if len(data) > settings.max_upload_bytes():
        raise IngestError(f"The file is larger than the {settings.max_upload_bytes() / 1048576:.3g} MB limit.")

    sha = hashlib.sha256(data).hexdigest()
    existing = repo.find_document_by_hash(user_id, subject_id, sha)
    if existing:
        return IngestResult(existing["id"], existing["title"], existing["status"], duplicate=True,
                            warnings=["This exact file is already in this subject, so nothing was added."])

    try:
        kind = sniff(filename, data)
    except ExtractError as e:
        raise IngestError(str(e)) from None
    try:
        ex = extract(filename, data)
        chunks = chunk_blocks(ex.blocks, ex.title) if ex.status == "parsed" else []
        status, warnings, title, pages = ex.status, list(ex.warnings), ex.title, ex.pages
    except ExtractError as e:                                # recognised type, unusable content: keep a visible record
        chunks, status, warnings, title, pages = [], "failed", [str(e)], (filename or "upload")[:200], None

    new_chars = sum(len(c.text) for c in chunks)
    if repo.subject_chars(user_id, subject_id) + new_chars > settings.max_subject_chars():
        raise IngestError("This subject has reached its material limit. Delete a document or start another subject.")

    path = _upload_path(user_id, sha)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        tmp = path.with_suffix(".part")
        tmp.write_bytes(data)
        os.replace(tmp, path)

    doc_id = repo.store_document(user_id, subject_id, {
        "kind": kind, "title": title, "source": " ".join((filename or "upload").split())[:200], "sha256": sha,
        "bytes": len(data), "pages": pages, "status": status, "warnings": warnings}, chunks)
    if doc_id is None:                                       # lost the subject between the check and the insert
        raise IngestError("That subject does not exist.")
    return IngestResult(doc_id, title, status, len(chunks), len({c.topic_path for c in chunks}), False, warnings)


def delete_subject(db: sqlite3.Connection, user_id: int, subject_id: int) -> bool:
    """Delete a subject with everything in it, then the stored originals nothing else uses."""
    repo = Repo(db)
    hashes = repo.document_hashes(user_id, subject_id)
    if not repo.delete_subject(user_id, subject_id):
        return False
    for sha in hashes:
        if not repo.hash_in_use(user_id, sha):
            try:
                _upload_path(user_id, sha).unlink(missing_ok=True)
            except OSError:
                pass
    return True


def delete_document(db: sqlite3.Connection, user_id: int, subject_id: int, document_id: int) -> bool:
    """Delete a document and, if no other document of this user has the same bytes, the stored original."""
    gone = Repo(db).delete_document(user_id, subject_id, document_id)
    if gone is None:
        return False
    if not gone["still_used"]:
        try:
            _upload_path(user_id, gone["sha256"]).unlink(missing_ok=True)
        except OSError:
            pass
    return True
