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
    (3, """
    BEGIN;

    -- One question a student asked about a subject, and how it ended.
    CREATE TABLE doubts (
        id           INTEGER PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_id   INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        question     TEXT NOT NULL,
        status       TEXT NOT NULL CHECK (status IN ('pending', 'answered', 'abstained', 'extractive', 'failed')),
        tier         TEXT,                             -- local | cloud | none
        model        TEXT,
        reason       TEXT NOT NULL DEFAULT '',         -- plain-words reason for an abstention or failure
        run_id       TEXT,                             -- the spine run holding the append-only trace
        dropped      INTEGER NOT NULL DEFAULT 0,       -- statements removed because a citation failed verification
        feedback     TEXT CHECK (feedback IN ('helpful', 'wrong')),
        created_at   REAL NOT NULL,
        finished_at  REAL
    );
    CREATE INDEX doubts_by_subject ON doubts(user_id, subject_id, created_at);

    -- Only statements whose citations all passed code verification are stored here.
    CREATE TABLE doubt_claims (
        doubt_id  INTEGER NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
        ordinal   INTEGER NOT NULL,
        text      TEXT NOT NULL,
        PRIMARY KEY (doubt_id, ordinal)
    );
    -- Snapshots (no foreign key to chunks): the history stays readable after a document is deleted.
    CREATE TABLE doubt_citations (
        doubt_id       INTEGER NOT NULL,
        claim          INTEGER NOT NULL,
        n              INTEGER NOT NULL,
        chunk_id       INTEGER,
        quote          TEXT NOT NULL,
        doc_title      TEXT NOT NULL,
        page_start     INTEGER,
        page_end       INTEGER,
        heading_path   TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (doubt_id, claim, n),
        FOREIGN KEY (doubt_id, claim) REFERENCES doubt_claims(doubt_id, ordinal) ON DELETE CASCADE
    );
    -- The passages retrieved for the question (what the model was allowed to see, or the closest ones on abstention).
    CREATE TABLE doubt_sources (
        doubt_id      INTEGER NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
        rank          INTEGER NOT NULL,
        chunk_id      INTEGER,
        doc_title     TEXT NOT NULL,
        page_start    INTEGER,
        page_end      INTEGER,
        heading_path  TEXT NOT NULL DEFAULT '',
        text          TEXT NOT NULL,
        matched       TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (doubt_id, rank)
    );

    -- Tokens sent to a cloud model, for the daily caps.
    CREATE TABLE cloud_usage (
        id       INTEGER PRIMARY KEY,
        user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day      TEXT NOT NULL,
        model    TEXT NOT NULL,
        tokens   INTEGER NOT NULL,
        at       REAL NOT NULL
    );
    CREATE INDEX cloud_usage_by_day ON cloud_usage(day, user_id);

    INSERT INTO schema_version(v) VALUES (3);
    COMMIT;
    """),
    (4, """
    BEGIN;
    -- Passages that read as orders to an AI: stored and searchable, never given to a model to write answers.
    ALTER TABLE chunks ADD COLUMN quarantined INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE chunks ADD COLUMN flag_reason TEXT NOT NULL DEFAULT '';
    -- The explainable answer: 'supported' or 'conflict' (the materials disagree), and the model's step-by-step reasoning.
    ALTER TABLE doubts ADD COLUMN kind TEXT NOT NULL DEFAULT 'supported';
    ALTER TABLE doubts ADD COLUMN explanation TEXT NOT NULL DEFAULT '';
    INSERT INTO schema_version(v) VALUES (4);
    COMMIT;
    """),
    (5, """
    BEGIN;

    -- One request to generate multiple-choice questions, and how it ended.
    CREATE TABLE mcq_jobs (
        id           INTEGER PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_id   INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        topic_id     INTEGER,                          -- NULL = the whole subject
        scope        TEXT NOT NULL DEFAULT '',         -- plain-words label of what was asked for
        requested    INTEGER NOT NULL,
        produced     INTEGER NOT NULL DEFAULT 0,
        rejected     INTEGER NOT NULL DEFAULT 0,       -- candidate questions that failed a check and were not kept
        status       TEXT NOT NULL CHECK (status IN ('pending', 'done', 'failed')),
        reason       TEXT NOT NULL DEFAULT '',
        tier         TEXT,
        model        TEXT,
        run_id       TEXT,                             -- the spine run holding the append-only trace
        created_at   REAL NOT NULL,
        finished_at  REAL
    );
    CREATE INDEX mcq_jobs_by_subject ON mcq_jobs(user_id, subject_id, created_at);

    -- The question bank. Only questions that passed every check are stored. Source details are snapshots, so a question
    -- stays readable (and shows where it came from) after the document is deleted.
    CREATE TABLE mcq_items (
        id            INTEGER PRIMARY KEY,
        subject_id    INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        topic_id      INTEGER REFERENCES topics(id) ON DELETE SET NULL,
        job_id        INTEGER REFERENCES mcq_jobs(id) ON DELETE SET NULL,
        topic_path    TEXT NOT NULL DEFAULT '',
        question      TEXT NOT NULL,
        options       TEXT NOT NULL,                   -- JSON list of exactly 4, already shuffled by the app
        answer_index  INTEGER NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
        explanation   TEXT NOT NULL DEFAULT '',
        quote         TEXT NOT NULL,                   -- exact words from the material that support the answer
        chunk_id      INTEGER,
        doc_title     TEXT NOT NULL DEFAULT '',
        page_start    INTEGER,
        page_end      INTEGER,
        heading_path  TEXT NOT NULL DEFAULT '',
        solver        TEXT NOT NULL DEFAULT 'skipped' CHECK (solver IN ('agreed', 'skipped')),
        model         TEXT,
        key           TEXT NOT NULL,                   -- normalised question text, to refuse exact duplicates
        created_at    REAL NOT NULL
    );
    CREATE UNIQUE INDEX mcq_items_unique ON mcq_items(subject_id, key);
    CREATE INDEX mcq_items_by_topic ON mcq_items(subject_id, topic_id);

    INSERT INTO schema_version(v) VALUES (5);
    COMMIT;
    """),
    (6, """\
    BEGIN;

    -- One quiz attempt by a student on a subject's MCQ bank.
    -- topic_ids_json = JSON list of topic IDs included (empty = whole subject).
    -- topic_stack_json = JSON list of topic IDs currently being worked through (backward-pass stack).
    -- topics_verified_json = JSON list of topic IDs that received a PASS this attempt.
    CREATE TABLE quiz_attempts (
        id                    INTEGER PRIMARY KEY,
        user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_id            INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        topic_ids_json        TEXT NOT NULL DEFAULT '[]',
        started_at            REAL NOT NULL,
        finished_at           REAL,
        is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        score                 REAL NOT NULL DEFAULT 0,
        max_score             REAL NOT NULL DEFAULT 0,
        correct_answers       INTEGER NOT NULL DEFAULT 0,
        incorrect_answers     INTEGER NOT NULL DEFAULT 0,
        -- Behaviour (adapted from ai_learnmate QuizSession)
        total_tab_switches    INTEGER NOT NULL DEFAULT 0,
        total_fullscreen_exits INTEGER NOT NULL DEFAULT 0,
        total_copy_attempts   INTEGER NOT NULL DEFAULT 0,
        avg_response_time     REAL NOT NULL DEFAULT 0,
        behavior_score        REAL NOT NULL DEFAULT 100,
        -- Backward-pass state (from tracer/flow.py)
        current_difficulty    INTEGER NOT NULL DEFAULT 1 CHECK (current_difficulty BETWEEN 1 AND 3),
        topic_stack_json      TEXT NOT NULL DEFAULT '[]',
        depth                 INTEGER NOT NULL DEFAULT 0,
        topics_verified_json  TEXT NOT NULL DEFAULT '[]',
        had_timeout           INTEGER NOT NULL DEFAULT 0 CHECK (had_timeout IN (0, 1)),
        attempt_number        INTEGER NOT NULL DEFAULT 1,
        -- Backward-pass callback state: waiting | step_back | retry | none
        callback_state        TEXT NOT NULL DEFAULT 'none' CHECK (callback_state IN ('none', 'waiting', 'step_back', 'retry', 'timeout')),
        -- Append-only JSON list of verdict dicts (topic_id, status, objections, prerequisite_id)
        -- Kept on the row for simplicity; never mutated, only appended via JSON_EACH / Python.
        verdict_log_json      TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX quiz_attempts_by_subject ON quiz_attempts(user_id, subject_id, started_at);
    CREATE INDEX quiz_attempts_active ON quiz_attempts(user_id, is_active);

    -- One answered (or skipped) MCQ within an attempt.
    CREATE TABLE attempt_answers (
        id                    INTEGER PRIMARY KEY,
        attempt_id            INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
        item_id               INTEGER NOT NULL REFERENCES mcq_items(id) ON DELETE CASCADE,
        chosen_index          INTEGER,         -- NULL if not yet answered
        is_correct            INTEGER,         -- NULL if not yet answered
        response_time         REAL,            -- seconds from question display to submit
        hesitation_count      INTEGER NOT NULL DEFAULT 0,  -- times answer changed before submit
        confidence_level      REAL NOT NULL DEFAULT 0.5,   -- 0-1 computed from time+hesitations
        answered_at           REAL
    );
    CREATE INDEX attempt_answers_by_attempt ON attempt_answers(attempt_id);

    -- Proctoring events recorded by browser JS (adapted from ai_learnmate ProctoringEvent).
    -- severity scale: tab_switch=60, full_screen_exit=30, copy_attempt=20, paste_attempt=20, browser_resize=10
    CREATE TABLE quiz_proctoring_events (
        id          INTEGER PRIMARY KEY,
        attempt_id  INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
        event_type  TEXT NOT NULL CHECK (event_type IN (
                        'tab_switch', 'full_screen_exit', 'copy_attempt',
                        'paste_attempt', 'browser_resize', 'auto_submit')),
        severity    INTEGER NOT NULL DEFAULT 0,
        details_json TEXT NOT NULL DEFAULT '{}',
        captured_at REAL NOT NULL
    );
    CREATE INDEX proctor_events_by_attempt ON quiz_proctoring_events(attempt_id);

    -- Per-topic mastery derived from attempt_answers (recomputable from scratch).
    -- state: unknown | learning | mastered | weak
    CREATE TABLE topic_progress (
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        topic_id    INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        answered    INTEGER NOT NULL DEFAULT 0,
        correct     INTEGER NOT NULL DEFAULT 0,
        mastery     REAL NOT NULL DEFAULT 0.0,
        state       TEXT NOT NULL DEFAULT 'unknown' CHECK (state IN ('unknown', 'learning', 'mastered', 'weak')),
        updated_at  REAL NOT NULL,
        PRIMARY KEY (user_id, subject_id, topic_id)
    );

    -- Prerequisite graph edges. Only confirmed=1 edges are ever followed in code.
    -- origin: 'manual' (user set it), 'suggested' (auto-detected, not yet confirmed).
    CREATE TABLE topic_prereqs (
        topic_id    INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        prereq_id   INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        confirmed   INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0, 1)),
        origin      TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'suggested')),
        PRIMARY KEY (topic_id, prereq_id)
    );

    INSERT INTO schema_version(v) VALUES (6);
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
