"""Minimal state machine for the root-cause tracer."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class State(str, Enum):
    QUESTIONING = "QUESTIONING"
    EVALUATING = "EVALUATING"
    BACKWARD_PASS = "BACKWARD_PASS"
    COMPLETE = "COMPLETE"


@dataclass
class SessionState:
    current_topic_id: str
    current_difficulty: int = 1
    depth: int = 0
    verified_topics: list[str] | None = None
    state: State = State.QUESTIONING

    def __post_init__(self):
        if self.verified_topics is None:
            self.verified_topics = []
