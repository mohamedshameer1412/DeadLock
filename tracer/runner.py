from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

from .agents import gate_agent, spot_agent
from .schema import AnswerRecord, CallbackResponseRecord, QuestionRecord, SessionSummaryRecord, VerdictRecord
from .store import append_record, get_verified_topics, read_all_records, reconstruct_resume_state, session_path

MAX_DEPTH = 3
TIMEOUT_SECONDS = 60


def _load_graph() -> dict[str, dict[str, Any]]:
    return json.loads(Path(__file__).resolve().parent.joinpath("prerequisites.json").read_text(encoding="utf-8"))


def _topic_label(topic_id: str, graph: dict[str, dict[str, Any]]) -> str:
    return graph.get(topic_id, {}).get("label", topic_id.replace("_", " ").title())


def _prerequisite(topic_id: str, graph: dict[str, dict[str, Any]]) -> str | None:
    return graph.get(topic_id, {}).get("prerequisite")


def _default_answer_for(topic_id: str) -> str:
    if topic_id == "binary_trees":
        return "The root is the topmost node; left and right children are subtrees."
    if topic_id == "recursion":
        return "A recursive function calls itself with a smaller input until it reaches a base case."
    return "This answer explains the idea clearly enough for a checkpoint."


def _prompt_for_answer(topic_id: str, question_text: str, answers: list[dict[str, Any]], stub: bool = False) -> tuple[int, str]:
    if answers:
        nxt = answers.pop(0)
        return int(nxt.get("confidence", 3)), str(nxt.get("answer", _default_answer_for(topic_id)))
    if stub:
        return 3, _default_answer_for(topic_id)
    print(f"\nQuestion [{topic_id}] : {question_text}")
    confidence = int(input("Confidence (1-5): ").strip() or "3")
    answer = input("Your answer: ").strip()
    return confidence, answer


def _choose_decision(topic_id: str, prerequisite_id: str | None, graph: dict[str, dict[str, Any]], callback_queue: list[str], stub: bool = False) -> str:
    if callback_queue:
        decision = callback_queue.pop(0)
        if decision in {"STEP_BACK", "RETRY", "TIMEOUT"}:
            return decision
    if stub:
        return "STEP_BACK"

    print(f"\nYou missed a question on {_topic_label(topic_id, graph)}.")
    if prerequisite_id:
        print(f"This might be because {_topic_label(prerequisite_id, graph)} is unclear.")
    print("(a) Step back and review the prerequisite")
    print("(b) Try a different question on this topic")
    print(f"Timeout in {TIMEOUT_SECONDS} seconds...")
    time.sleep(0.1)
    return "STEP_BACK"


def _write_question(session_file: Path, topic_id: str, graph: dict[str, dict[str, Any]], difficulty: int, prior_verdicts: list[dict[str, Any]]) -> str:
    topic_label = _topic_label(topic_id, graph)
    objections = []
    for verdict in prior_verdicts:
        objections.extend(verdict.get("objections", []))
    payload = spot_agent(topic_id, topic_label, difficulty, objections)
    question = QuestionRecord(
        topic_id=topic_id,
        topic_label=topic_label,
        content=payload["content"],
        difficulty_level=difficulty,
    )
    append_record(question.model_dump(), session_file)
    return payload["content"]


def _write_verdict(session_file: Path, topic_id: str, question_text: str, answer_text: str, prior_verdicts: list[dict[str, Any]], graph: dict[str, dict[str, Any]]) -> dict[str, Any]:
    prereq = _prerequisite(topic_id, graph)
    verdict = gate_agent(topic_id, question_text, answer_text, prior_verdicts, prereq)
    if verdict.get("prerequisite_id") not in (None, *graph.keys()):
        verdict["prerequisite_id"] = prereq
    record = VerdictRecord(
        topic_id=topic_id,
        status=verdict["status"],
        objections=verdict.get("objections", []),
        prerequisite_id=verdict.get("prerequisite_id"),
    )
    append_record(record.model_dump(), session_file)
    return record.model_dump()


def run_session(
    topic_id: str,
    student_id: str,
    session_dir: str | Path | None = None,
    resume: bool = False,
    stub: bool = False,
    clear: bool = False,
    answers: list[dict[str, Any]] | None = None,
    callback_decisions: list[str] | None = None,
) -> dict[str, Any]:
    graph = _load_graph()
    session_file = session_path(student_id, session_dir)
    if clear and session_file.exists():
        session_file.unlink()

    records = read_all_records(session_file)
    answer_queue = list(answers or [])
    callback_queue = list(callback_decisions or [])

    if resume and records:
        state = reconstruct_resume_state(records, topic_id)
        current_topic = state["current_topic_id"]
        depth = state["depth"]
        verified = set(state["verified_topics"])
    else:
        current_topic = topic_id
        depth = 0
        verified = set()

    root_topic_id = topic_id
    while True:
        prior_verdicts = [r for r in records if r.get("kind") == "verdict" and r.get("topic_id") == current_topic]
        question_text = _write_question(session_file, current_topic, graph, 1 if current_topic != "binary_trees" else 1, prior_verdicts)
        confidence, answer_text = _prompt_for_answer(current_topic, question_text, answer_queue, stub=stub)
        append_record(AnswerRecord(topic_id=current_topic, student_response=answer_text, confidence_rating=confidence).model_dump(), session_file)

        verdict = _write_verdict(session_file, current_topic, question_text, answer_text, prior_verdicts, graph)
        records.append(verdict)

        if verdict["status"] == "PASS":
            verified.add(current_topic)
            if current_topic != root_topic_id:
                current_topic = root_topic_id
                depth = 0
                continue
            summary = SessionSummaryRecord(
                root_topic_id=root_topic_id,
                final_pass_topic_id=current_topic,
                depth_reached=depth,
                topics_verified=sorted(verified),
                timed_out=False,
            )
            append_record(summary.model_dump(), session_file)
            return {"status": "COMPLETE", "topics_verified": sorted(verified), "records": read_all_records(session_file)}

        prerequisite_id = verdict.get("prerequisite_id") or _prerequisite(current_topic, graph)
        decision = _choose_decision(current_topic, prerequisite_id, graph, callback_queue, stub=stub)
        if decision == "TIMEOUT":
            decision = "STEP_BACK"
        append_record(CallbackResponseRecord(topic_id=current_topic, decision=decision).model_dump(), session_file)
        records.append({"kind": "callback_response", "topic_id": current_topic, "decision": decision})

        if decision == "STEP_BACK":
            if prerequisite_id:
                current_topic = prerequisite_id
                depth += 1
                continue
            current_topic = root_topic_id
            continue

        current_topic = root_topic_id
        continue


def main():
    parser = argparse.ArgumentParser(description="Root-cause tracer")
    parser.add_argument("--topic", default="binary_trees")
    parser.add_argument("--student", default="demo")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--clear", action="store_true")
    parser.add_argument("--stub", action="store_true")
    parser.add_argument("--session-dir", default=".")
    args = parser.parse_args()

    run_session(
        topic_id=args.topic,
        student_id=args.student,
        session_dir=args.session_dir,
        resume=args.resume,
        stub=args.stub,
        clear=args.clear,
    )


if __name__ == "__main__":
    main()
