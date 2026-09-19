"""The ONLY place that reads or writes user-owned rows.

Every method takes `user_id` and puts it in the WHERE clause. There is no method that fetches a subject by id alone,
so a route that forgets an ownership check cannot exist: it has nothing to call. tests/test_studyhub_repo.py tries
to break this from a second user's account.
"""
from __future__ import annotations

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
