"""The ONLY place that reads or writes user-owned rows.

Every method takes `user_id` and puts it in the WHERE clause. There is no method that fetches a subject by id alone,
so a route that forgets an ownership check cannot exist: it has nothing to call. tests/test_studyhub_repo.py tries
to break this from a second user's account.
"""
from __future__ import annotations

import json
import sqlite3
import time


class SubjectError(ValueError):
    """A problem with a subject the user can be told about."""


def _clean(text: str, limit: int) -> str:
    return " ".join((text or "").split())[:limit]


class Repo:
    def __init__(self, db: sqlite3.Connection) -> None:
        self.db = db

    # ------------------------------------------------------------------ users
    def get_user(self, user_id: int) -> dict | None:
        row = self.db.execute("SELECT id, username, cloud_consent, created_at FROM users WHERE id=?",
                              (user_id,)).fetchone()
        return dict(row) if row else None

    # --------------------------------------------------------------- subjects
    def create_subject(self, user_id: int, name: str, description: str = "") -> int:
        name = _clean(name, 200)
        if not name:
            raise SubjectError("Give the subject a name.")
        if len(name) > 80:
            raise SubjectError("A subject name can be at most 80 characters.")
        description = _clean(description, 501)
        if len(description) > 500:
            raise SubjectError("A description can be at most 500 characters.")
        try:
            cur = self.db.execute("INSERT INTO subjects(user_id, name, description, created_at) VALUES (?,?,?,?)",
                                  (user_id, name, description, time.time()))
        except sqlite3.IntegrityError:
            raise SubjectError("You already have a subject with that name.") from None
        return int(cur.lastrowid)

    def list_subjects(self, user_id: int) -> list[dict]:
        rows = self.db.execute("SELECT id, name, description, created_at FROM subjects WHERE user_id=? "
                               "ORDER BY name COLLATE NOCASE", (user_id,)).fetchall()
        return [dict(r) for r in rows]

    def get_subject(self, user_id: int, subject_id: int) -> dict | None:
        """None if it does not exist OR belongs to someone else - the caller cannot tell which."""
        row = self.db.execute("SELECT id, name, description, created_at FROM subjects WHERE id=? AND user_id=?",
                              (subject_id, user_id)).fetchone()
        return dict(row) if row else None

    def update_subject(self, user_id: int, subject_id: int, name: str, description: str = "") -> bool:
        name, description = _clean(name, 200), _clean(description, 501)
        if not name:
            raise SubjectError("Give the subject a name.")
        if len(name) > 80:
            raise SubjectError("A subject name can be at most 80 characters.")
        if len(description) > 500:
            raise SubjectError("A description can be at most 500 characters.")
        try:
            cur = self.db.execute("UPDATE subjects SET name=?, description=? WHERE id=? AND user_id=?",
                                  (name, description, subject_id, user_id))
        except sqlite3.IntegrityError:
            raise SubjectError("You already have a subject with that name.") from None
        return cur.rowcount == 1

    def delete_subject(self, user_id: int, subject_id: int) -> bool:
        return self.db.execute("DELETE FROM subjects WHERE id=? AND user_id=?", (subject_id, user_id)).rowcount == 1

    # -------------------------------------------------------------- materials
    def subject_chars(self, user_id: int, subject_id: int) -> int:
        """Characters of material already stored in a subject (0 if it is not the user's)."""
        return int(self.db.execute(
            "SELECT COALESCE(SUM(LENGTH(c.text)), 0) FROM chunks c JOIN subjects s ON s.id=c.subject_id "
            "WHERE c.subject_id=? AND s.user_id=?", (subject_id, user_id)).fetchone()[0])

    def find_document_by_hash(self, user_id: int, subject_id: int, sha256: str) -> dict | None:
        row = self.db.execute(
            "SELECT d.id, d.title, d.status FROM documents d JOIN subjects s ON s.id=d.subject_id "
            "WHERE d.subject_id=? AND s.user_id=? AND d.sha256=?", (subject_id, user_id, sha256)).fetchone()
        return dict(row) if row else None

    def store_document(self, user_id: int, subject_id: int, doc: dict, chunks: list) -> int | None:
        """Insert a document with its topics and chunks in ONE transaction. None if the subject is not the user's."""
        if self.get_subject(user_id, subject_id) is None:
            return None
        self.db.execute("BEGIN")
        try:
            cur = self.db.execute(
                "INSERT INTO documents(subject_id, kind, title, source, sha256, bytes, pages, status, warnings, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (subject_id, doc["kind"], doc["title"], doc["source"], doc["sha256"], doc["bytes"], doc["pages"],
                 doc["status"], json.dumps(doc["warnings"]), time.time()))
            doc_id = int(cur.lastrowid)
            topic_ids: dict[str, int] = {}
            for ordinal, ch in enumerate(chunks):
                if ch.topic_path not in topic_ids:
                    row = self.db.execute("SELECT id FROM topics WHERE subject_id=? AND path=?",
                                          (subject_id, ch.topic_path)).fetchone()
                    if row:
                        topic_ids[ch.topic_path] = int(row[0])
                    else:
                        nxt = self.db.execute("SELECT COALESCE(MAX(ordinal), -1) + 1 FROM topics WHERE subject_id=?",
                                              (subject_id,)).fetchone()[0]
                        name = ch.topic_path.rsplit(" › ", 1)[-1]
                        topic_ids[ch.topic_path] = int(self.db.execute(
                            "INSERT INTO topics(subject_id, name, path, ordinal, origin) VALUES (?,?,?,?,?)",
                            (subject_id, name, ch.topic_path, nxt, ch.topic_origin)).lastrowid)
                self.db.execute(
                    "INSERT INTO chunks(subject_id, document_id, topic_id, ordinal, page_start, page_end, heading_path, "
                    "text, sha256) VALUES (?,?,?,?,?,?,?,?,?)",
                    (subject_id, doc_id, topic_ids[ch.topic_path], ordinal, ch.page_start, ch.page_end,
                     ch.heading_path, ch.text, ch.sha256))
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise
        return doc_id

    def list_documents(self, user_id: int, subject_id: int) -> list[dict]:
        rows = self.db.execute(
            "SELECT d.id, d.kind, d.title, d.source, d.pages, d.status, d.warnings, d.bytes, d.created_at, "
            "(SELECT COUNT(*) FROM chunks c WHERE c.document_id=d.id) AS chunks "
            "FROM documents d JOIN subjects s ON s.id=d.subject_id "
            "WHERE d.subject_id=? AND s.user_id=? ORDER BY d.created_at DESC, d.id DESC", (subject_id, user_id)).fetchall()
        return [self._doc(r) for r in rows]

    def get_document(self, user_id: int, subject_id: int, document_id: int) -> dict | None:
        row = self.db.execute(
            "SELECT d.id, d.kind, d.title, d.source, d.pages, d.status, d.warnings, d.bytes, d.sha256, d.created_at, "
            "(SELECT COUNT(*) FROM chunks c WHERE c.document_id=d.id) AS chunks "
            "FROM documents d JOIN subjects s ON s.id=d.subject_id "
            "WHERE d.id=? AND d.subject_id=? AND s.user_id=?", (document_id, subject_id, user_id)).fetchone()
        return self._doc(row) if row else None

    @staticmethod
    def _doc(row) -> dict:
        d = dict(row)
        d["warnings"] = json.loads(d["warnings"] or "[]")
        return d

    def delete_document(self, user_id: int, subject_id: int, document_id: int) -> dict | None:
        """Delete one document (its chunks go with it). Returns {sha256, still_used} so the caller can drop the file."""
        doc = self.get_document(user_id, subject_id, document_id)
        if doc is None:
            return None
        self.db.execute("DELETE FROM documents WHERE id=? AND subject_id=?", (document_id, subject_id))
        used = self.db.execute(
            "SELECT COUNT(*) FROM documents d JOIN subjects s ON s.id=d.subject_id WHERE s.user_id=? AND d.sha256=?",
            (user_id, doc["sha256"])).fetchone()[0]
        self.db.execute("DELETE FROM topics WHERE subject_id=? AND id NOT IN "
                        "(SELECT topic_id FROM chunks WHERE subject_id=? AND topic_id IS NOT NULL)", (subject_id, subject_id))
        return {"sha256": doc["sha256"], "still_used": used > 0}

    def document_hashes(self, user_id: int, subject_id: int) -> list[str]:
        return [r[0] for r in self.db.execute(
            "SELECT DISTINCT d.sha256 FROM documents d JOIN subjects s ON s.id=d.subject_id "
            "WHERE d.subject_id=? AND s.user_id=?", (subject_id, user_id))]

    def hash_in_use(self, user_id: int, sha256: str) -> bool:
        return self.db.execute(
            "SELECT 1 FROM documents d JOIN subjects s ON s.id=d.subject_id WHERE s.user_id=? AND d.sha256=? LIMIT 1",
            (user_id, sha256)).fetchone() is not None

    def list_topics(self, user_id: int, subject_id: int) -> list[dict]:
        rows = self.db.execute(
            "SELECT t.id, t.name, t.path, t.ordinal, t.origin, COUNT(c.id) AS chunks "
            "FROM topics t JOIN subjects s ON s.id=t.subject_id LEFT JOIN chunks c ON c.topic_id=t.id "
            "WHERE t.subject_id=? AND s.user_id=? GROUP BY t.id ORDER BY t.ordinal", (subject_id, user_id)).fetchall()
        return [dict(r) for r in rows]

    def document_chunks(self, user_id: int, subject_id: int, document_id: int, limit: int = 500) -> list[dict]:
        rows = self.db.execute(
            "SELECT c.id, c.ordinal, c.page_start, c.page_end, c.heading_path, c.text "
            "FROM chunks c JOIN subjects s ON s.id=c.subject_id "
            "WHERE c.document_id=? AND c.subject_id=? AND s.user_id=? ORDER BY c.ordinal LIMIT ?",
            (document_id, subject_id, user_id, limit)).fetchall()
        return [dict(r) for r in rows]

    def get_chunk(self, user_id: int, subject_id: int, chunk_id: int) -> dict | None:
        row = self.db.execute(
            "SELECT c.id, c.document_id, c.topic_id, c.page_start, c.page_end, c.heading_path, c.text, d.title AS doc_title "
            "FROM chunks c JOIN subjects s ON s.id=c.subject_id JOIN documents d ON d.id=c.document_id "
            "WHERE c.id=? AND c.subject_id=? AND s.user_id=?", (chunk_id, subject_id, user_id)).fetchone()
        return dict(row) if row else None

    def search_chunks(self, user_id: int, subject_id: int, match: str, k: int = 5) -> list[dict]:
        """BM25 keyword search inside ONE subject of ONE user. `match` must already be a safe FTS5 expression."""
        if not match:
            return []
        rows = self.db.execute(
            "SELECT c.id, c.document_id, d.title AS doc_title, c.topic_id, c.heading_path, c.page_start, c.page_end, "
            "c.text, bm25(chunks_fts) AS score "
            "FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid "
            "JOIN documents d ON d.id = c.document_id JOIN subjects s ON s.id = c.subject_id "
            "WHERE chunks_fts MATCH ? AND c.subject_id = ? AND s.user_id = ? ORDER BY score LIMIT ?",
            (match, subject_id, user_id, k)).fetchall()
        return [dict(r) for r in rows]
