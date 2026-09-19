from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .schema import AnyRecord


def session_path(student_id: str, session_dir: str | Path | None = None) -> Path:
    base = Path(session_dir) if session_dir is not None else Path(__file__).resolve().parent / "sessions"
    base.mkdir(parents=True, exist_ok=True)
    return base / f"{student_id}_progress.jsonl"


def append_record(record: dict[str, Any], file_path: str | Path) -> None:
    path = Path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_all_records(file_path: str | Path) -> list[dict[str, Any]]:
    path = Path(file_path)
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))
    return records


def get_verified_topics(records: list[dict[str, Any]]) -> list[str]:
    verified: list[str] = []
    for record in records:
        if record.get("kind") == "verdict" and record.get("status") == "PASS":
            topic_id = record.get("topic_id")
            if topic_id and topic_id not in verified:
                verified.append(topic_id)
    return verified


def reconstruct_resume_state(records: list[dict[str, Any]], root_topic_id: str):
    callback_records = [r for r in records if r.get("kind") == "callback_response"]
    if callback_records:
        last = callback_records[-1]
        current_topic = last.get("topic_id", root_topic_id)
        depth = sum(1 for r in callback_records if r.get("decision") == "STEP_BACK")
    else:
        current_topic = root_topic_id
        depth = 0
    verified = get_verified_topics(records)
    return {
        "current_topic_id": current_topic,
        "depth": depth,
        "verified_topics": verified,
    }
