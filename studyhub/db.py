"""Schema and migrations. One SQLite file holds the spine tables (runs, versions, ...) and these.

Each migration is applied once, atomically, and recorded in `schema_version`. Later phases append to MIGRATIONS;
they never edit an earlier one.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from slice.store import Store

from . import settings

MIGRATIONS: list[tuple[int, str]] = [
    (1, """
    BEGIN;

    CREATE TABLE users (
        id             INTEGER PRIMARY KEY,
        username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pw_salt        BLOB NOT NULL,
        pw_hash        BLOB NOT NULL,
        scrypt_params  TEXT NOT NULL,
        cloud_consent  INTEGER NOT NULL DEFAULT 0 CHECK (cloud_consent IN (0, 1)),
        created_at     REAL NOT NULL
    );

    -- Only the SHA-256 of the session token is stored: a copy of this table cannot be replayed as cookies.
    CREATE TABLE sessions (
        token_hash  TEXT PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf        TEXT NOT NULL,
        created_at  REAL NOT NULL,
        expires_at  REAL NOT NULL
    );
    CREATE INDEX sessions_by_user ON sessions(user_id);

    CREATE TABLE login_attempts (
        username  TEXT NOT NULL,
        ip        TEXT NOT NULL,
        at        REAL NOT NULL,
        ok        INTEGER NOT NULL
    );
    CREATE INDEX login_attempts_by_name ON login_attempts(username, at);
    CREATE INDEX login_attempts_by_ip   ON login_attempts(ip, at);

    CREATE TABLE subjects (
        id           INTEGER PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name         TEXT NOT NULL COLLATE NOCASE,
        description  TEXT NOT NULL DEFAULT '',
        created_at   REAL NOT NULL,
        UNIQUE (user_id, name)
    );

    INSERT INTO schema_version(v) VALUES (1);
    COMMIT;
    """),
]


def migrate(db: sqlite3.Connection) -> None:
    db.execute("CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)")
    current = db.execute("SELECT MAX(v) FROM schema_version").fetchone()[0] or 0
    for version, script in MIGRATIONS:
        if version > current:
            db.executescript(script)


def open_db(path: str | None = None) -> Store:
    """Open (creating if needed) the StudyHub database. Returns the spine's Store; its `.db` is the connection."""
    path = path or settings.db_path()
    if path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    store = Store(path)
    migrate(store.db)
    return store
