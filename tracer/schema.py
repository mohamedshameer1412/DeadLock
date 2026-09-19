from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class QuestionRecord(BaseModel):
    kind: Literal["question"] = "question"
    topic_id: str
    topic_label: str
    content: str
    difficulty_level: int = Field(ge=1, le=3)


class AnswerRecord(BaseModel):
    kind: Literal["answer"] = "answer"
    topic_id: str
    student_response: str
    confidence_rating: int = Field(ge=1, le=5)


class VerdictRecord(BaseModel):
    kind: Literal["verdict"] = "verdict"
    topic_id: str
    status: Literal["PASS", "BLOCK"]
    objections: list[str] = Field(default_factory=list)
    prerequisite_id: Optional[str] = None


class CallbackResponseRecord(BaseModel):
    kind: Literal["callback_response"] = "callback_response"
    topic_id: str
    decision: Literal["STEP_BACK", "RETRY", "TIMEOUT"]


class SessionSummaryRecord(BaseModel):
    kind: Literal["session_summary"] = "session_summary"
    root_topic_id: str
    final_pass_topic_id: str
    depth_reached: int
    topics_verified: list[str] = Field(default_factory=list)
    timed_out: bool = False


AnyRecord = QuestionRecord | AnswerRecord | VerdictRecord | CallbackResponseRecord | SessionSummaryRecord
