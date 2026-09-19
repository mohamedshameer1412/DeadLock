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
                    "text, sha256, quarantined, flag_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (subject_id, doc_id, topic_ids[ch.topic_path], ordinal, ch.page_start, ch.page_end,
                     ch.heading_path, ch.text, ch.sha256, 1 if ch.flags else 0, "; ".join(ch.flags)[:300]))
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
            "SELECT c.id, c.ordinal, c.page_start, c.page_end, c.heading_path, c.text, c.quarantined, c.flag_reason "
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

    def matching_chunk_ids(self, user_id: int, subject_id: int, match: str, chunk_ids: list[int]) -> list[int]:
        """Which of `chunk_ids` (in this user's subject) contain the term(s) in the safe FTS expression `match`."""
        if not match or not chunk_ids:
            return []
        marks = ",".join("?" * len(chunk_ids))
        rows = self.db.execute(
            "SELECT c.id FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN subjects s ON s.id = c.subject_id "
            f"WHERE chunks_fts MATCH ? AND c.subject_id = ? AND s.user_id = ? AND c.id IN ({marks})",
            (match, subject_id, user_id, *[int(i) for i in chunk_ids])).fetchall()
        return [int(r[0]) for r in rows]

    def term_frequency(self, user_id: int, subject_id: int, match: str, answers: bool = False) -> int:
        """In how many passages of this user's subject the safe FTS expression `match` occurs."""
        if not match:
            return 0
        return int(self.db.execute(
            "SELECT COUNT(*) FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN subjects s ON s.id = c.subject_id "
            "WHERE chunks_fts MATCH ? AND c.subject_id = ? AND s.user_id = ? AND c.quarantined <= ?",
            (match, subject_id, user_id, 0 if answers else 1)).fetchone()[0])

    def search_chunks(self, user_id: int, subject_id: int, match: str, k: int = 5, answers: bool = False) -> list[dict]:
        """BM25 keyword search inside ONE subject of ONE user. `match` must already be a safe FTS5 expression.
        With answers=True, quarantined passages (instruction-like text) are left out."""
        if not match:
            return []
        rows = self.db.execute(
            "SELECT c.id, c.document_id, d.title AS doc_title, c.topic_id, c.heading_path, c.page_start, c.page_end, "
            "c.text, c.quarantined, bm25(chunks_fts) AS score "
            "FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid "
            "JOIN documents d ON d.id = c.document_id JOIN subjects s ON s.id = c.subject_id "
            "WHERE chunks_fts MATCH ? AND c.subject_id = ? AND s.user_id = ? AND c.quarantined <= ? ORDER BY score LIMIT ?",
            (match, subject_id, user_id, 0 if answers else 1, k)).fetchall()
        return [dict(r) for r in rows]

    # ---------------------------------------------------------------- doubts
    def create_doubt(self, user_id: int, subject_id: int, question: str) -> int | None:
        """Record a new question as 'pending'. None if the subject is not the user's."""
        if self.get_subject(user_id, subject_id) is None:
            return None
        return int(self.db.execute(
            "INSERT INTO doubts(user_id, subject_id, question, status, created_at) VALUES (?,?,?,'pending',?)",
            (user_id, subject_id, question, time.time())).lastrowid)

    def pending_doubts(self, user_id: int) -> int:
        return int(self.db.execute("SELECT COUNT(*) FROM doubts WHERE user_id=? AND status='pending'",
                                   (user_id,)).fetchone()[0])

    def set_doubt_run(self, user_id: int, doubt_id: int, run_id: str) -> None:
        self.db.execute("UPDATE doubts SET run_id=? WHERE id=? AND user_id=?", (run_id, doubt_id, user_id))

    def finish_doubt(self, user_id: int, doubt_id: int, *, status: str, tier: str | None, model: str | None,
                     reason: str, dropped: int, claims: list[dict], sources: list[dict], kind: str = "supported",
                     explanation: str = "") -> bool:
        """Close a pending question and store what will be shown, atomically. False if it was not pending/yours."""
        self.db.execute("BEGIN")
        try:
            cur = self.db.execute(
                "UPDATE doubts SET status=?, tier=?, model=?, reason=?, dropped=?, finished_at=?, kind=?, explanation=? "
                "WHERE id=? AND user_id=? AND status='pending'",
                (status, tier, model, reason, dropped, time.time(), kind, explanation, doubt_id, user_id))
            if cur.rowcount != 1:
                self.db.execute("ROLLBACK")
                return False
            for i, claim in enumerate(claims):
                self.db.execute("INSERT INTO doubt_claims(doubt_id, ordinal, text) VALUES (?,?,?)",
                                (doubt_id, i, claim["text"]))
                for n, c in enumerate(claim["citations"]):
                    self.db.execute(
                        "INSERT INTO doubt_citations(doubt_id, claim, n, chunk_id, quote, doc_title, page_start, page_end, "
                        "heading_path) VALUES (?,?,?,?,?,?,?,?,?)",
                        (doubt_id, i, n, c["chunk_id"], c["quote"], c["doc_title"], c["page_start"], c["page_end"],
                         c["heading_path"]))
            for rank, s in enumerate(sources):
                self.db.execute(
                    "INSERT INTO doubt_sources(doubt_id, rank, chunk_id, doc_title, page_start, page_end, heading_path, "
                    "text, matched) VALUES (?,?,?,?,?,?,?,?,?)",
                    (doubt_id, rank, s["id"], s["doc_title"], s["page_start"], s["page_end"], s["heading_path"],
                     s["text"], json.dumps(s["matched"])))
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise
        return True

    def get_doubt(self, user_id: int, subject_id: int, doubt_id: int) -> dict | None:
        row = self.db.execute(
            "SELECT d.* FROM doubts d JOIN subjects s ON s.id=d.subject_id "
            "WHERE d.id=? AND d.subject_id=? AND d.user_id=? AND s.user_id=?",
            (doubt_id, subject_id, user_id, user_id)).fetchone()
        if row is None:
            return None
        d = dict(row)
        d["claims"] = []
        for c in self.db.execute("SELECT ordinal, text FROM doubt_claims WHERE doubt_id=? ORDER BY ordinal", (doubt_id,)):
            cites = [dict(x) for x in self.db.execute(
                "SELECT n, chunk_id, quote, doc_title, page_start, page_end, heading_path FROM doubt_citations "
                "WHERE doubt_id=? AND claim=? ORDER BY n", (doubt_id, c["ordinal"]))]
            d["claims"].append({"text": c["text"], "citations": cites})
        d["sources"] = []
        for s in self.db.execute("SELECT chunk_id, doc_title, page_start, page_end, heading_path, text, matched "
                                 "FROM doubt_sources WHERE doubt_id=? ORDER BY rank", (doubt_id,)):
            item = dict(s)
            item["matched"] = json.loads(item["matched"] or "[]")
            d["sources"].append(item)
        return d

    def list_doubts(self, user_id: int, subject_id: int, limit: int = 20) -> list[dict]:
        rows = self.db.execute(
            "SELECT d.id, d.question, d.status, d.tier, d.created_at, d.feedback FROM doubts d "
            "JOIN subjects s ON s.id=d.subject_id WHERE d.subject_id=? AND d.user_id=? AND s.user_id=? "
            "ORDER BY d.created_at DESC, d.id DESC LIMIT ?", (subject_id, user_id, user_id, limit)).fetchall()
        return [dict(r) for r in rows]

    def set_doubt_feedback(self, user_id: int, subject_id: int, doubt_id: int, value: str | None) -> bool:
        if value not in (None, "helpful", "wrong"):
            return False
        return self.db.execute("UPDATE doubts SET feedback=? WHERE id=? AND subject_id=? AND user_id=?",
                               (value, doubt_id, subject_id, user_id)).rowcount == 1

    def delete_doubt(self, user_id: int, subject_id: int, doubt_id: int) -> bool:
        return self.db.execute("DELETE FROM doubts WHERE id=? AND subject_id=? AND user_id=?",
                               (doubt_id, subject_id, user_id)).rowcount == 1

    def expire_pending_doubts(self, older_than_seconds: float) -> int:
        """Maintenance (not user-scoped): a question still pending long after it started was cut off by a restart."""
        return self.db.execute(
            "UPDATE doubts SET status='failed', reason='This question was interrupted (the app restarted). Ask it again.', "
            "finished_at=? WHERE status='pending' AND created_at < ?", (time.time(), time.time() - older_than_seconds)).rowcount

    # ------------------------------------------------------------- cloud use
    def set_cloud_consent(self, user_id: int, on: bool) -> None:
        self.db.execute("UPDATE users SET cloud_consent=? WHERE id=?", (1 if on else 0, user_id))

    def cloud_tokens_today(self, day: str, user_id: int | None = None) -> int:
        if user_id is None:
            return int(self.db.execute("SELECT COALESCE(SUM(tokens),0) FROM cloud_usage WHERE day=?", (day,)).fetchone()[0])
        return int(self.db.execute("SELECT COALESCE(SUM(tokens),0) FROM cloud_usage WHERE day=? AND user_id=?",
                                   (day, user_id)).fetchone()[0])

    def record_cloud_usage(self, user_id: int, day: str, model: str, tokens: int) -> None:
        self.db.execute("INSERT INTO cloud_usage(user_id, day, model, tokens, at) VALUES (?,?,?,?,?)",
                        (user_id, day, model, int(tokens), time.time()))

    def doubt_trace(self, user_id: int, subject_id: int, doubt_id: int) -> list[dict]:
        """The spine's append-only steps for one of this user's questions, oldest first."""
        rows = self.db.execute(
            "SELECT v.seq, v.kind, v.produced_by, v.payload_json, v.created_at FROM versions v "
            "JOIN doubts d ON d.run_id = v.run_id JOIN subjects s ON s.id = d.subject_id "
            "WHERE d.id=? AND d.subject_id=? AND d.user_id=? AND s.user_id=? ORDER BY v.seq",
            (doubt_id, subject_id, user_id, user_id)).fetchall()
        return [{"seq": r["seq"], "kind": r["kind"], "by": r["produced_by"], "at": r["created_at"],
                 "payload": json.loads(r["payload_json"])} for r in rows]
