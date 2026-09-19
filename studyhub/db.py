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
    (2, """
    BEGIN;

    -- One uploaded file. The original bytes live on disk (data/uploads/<user>/<sha256>), never in SQLite.
    CREATE TABLE documents (
        id           INTEGER PRIMARY KEY,
        subject_id   INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        kind         TEXT NOT NULL CHECK (kind IN ('txt', 'pdf', 'docx', 'url')),
        title        TEXT NOT NULL,
        source       TEXT NOT NULL,                   -- the file name as uploaded, or the URL
        sha256       TEXT NOT NULL,
        bytes        INTEGER NOT NULL,
        pages        INTEGER,
        status       TEXT NOT NULL CHECK (status IN ('parsed', 'empty', 'failed')),
        warnings     TEXT NOT NULL DEFAULT '[]',      -- JSON list of things the student should know
        created_at   REAL NOT NULL,
        UNIQUE (subject_id, sha256)
    );

    CREATE TABLE topics (
        id          INTEGER PRIMARY KEY,
        subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        path        TEXT NOT NULL,                    -- "Chapter 3 > Trees"
        ordinal     INTEGER NOT NULL,
        origin      TEXT NOT NULL CHECK (origin IN ('heading', 'document', 'manual')),
        UNIQUE (subject_id, path)
    );

    CREATE TABLE chunks (
        id            INTEGER PRIMARY KEY,
        subject_id    INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        topic_id      INTEGER REFERENCES topics(id) ON DELETE SET NULL,
        ordinal       INTEGER NOT NULL,
        page_start    INTEGER,
        page_end      INTEGER,
        heading_path  TEXT NOT NULL DEFAULT '',
        text          TEXT NOT NULL,
        sha256        TEXT NOT NULL
    );
    CREATE INDEX chunks_by_subject ON chunks(subject_id, document_id, ordinal);
    CREATE INDEX chunks_by_topic ON chunks(topic_id);

    -- Keyword index (BM25). Searches always join back to chunks and filter by subject_id.
    CREATE VIRTUAL TABLE chunks_fts USING fts5(text, content='chunks', content_rowid='id', tokenize='porter unicode61');
    CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
    END;
    CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
    END;

    INSERT INTO schema_version(v) VALUES (2);
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
