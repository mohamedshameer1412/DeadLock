"""Subject-scoped keyword retrieval (SQLite FTS5, BM25).

`search()` is the only entry point the Q&A and quiz code will use. It cannot be pointed at another subject or user:
the scope is two required arguments that go straight into the SQL. Vector search can be added later behind this same
function without changing any caller.
"""
from __future__ import annotations

import re
import sqlite3

from .repo import Repo

_WORD = re.compile(r"[^\W_]+", re.UNICODE)
STOPWORDS = frozenset("""a an the and or but if then else of to in on at by for with from as is are was were be been being
do does did have has had it its this that these those i you he she we they me my your our their what which who whom
whose when where why how can could should would will shall may might must not no yes than so such into about over
under between also there here""".split())
MAX_TERMS = 12


def build_match(query: str) -> str:
    """A safe FTS5 expression from free text: content words only, each quoted, joined with OR.

    Quoting means operators the user types (AND, NEAR, *, ", -, column: filters) are treated as plain words.
    """
    seen: list[str] = []
    for word in _WORD.findall((query or "").lower()):
        if len(word) > 1 and word not in STOPWORDS and word not in seen:
            seen.append(word)
    return " OR ".join(f'"{w}"' for w in seen[:MAX_TERMS])


def search(db: sqlite3.Connection, user_id: int, subject_id: int, query: str, k: int = 5) -> list[dict]:
    """Best chunks for `query` inside this user's subject, best first. [] if nothing matches."""
    return Repo(db).search_chunks(user_id, subject_id, build_match(query), max(1, min(int(k), 20)))
