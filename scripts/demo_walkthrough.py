"""Automated demonstration walkthrough matching Section 4 & Section 13 of shameer.md.

Replays the exact live session:
- Student attempts 'binary_trees' with a vague response
- Gate returns BLOCK with objections and prerequisite 'recursion'
- Student chooses STEP_BACK (choice 'a')
- Topic shifts backward to 'recursion'
- Student answers 'recursion' correctly -> PASS
- State machine returns to 'binary_trees'
- Student answers 'binary_trees' correctly -> PASS -> COMPLETE
- Reads session records and verifies progression
"""

from __future__ import annotations

import sys
from pathlib import Path

# Add project root to path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tracer.runner import run_session
from tracer.store import read_all_records, session_path


def run_walkthrough():
    student_id = "shameer_walkthrough"
    sess_file = session_path(student_id)

    print("=" * 65)
    print("   ROOT-CAUSE ERROR TRACER: LIVE WALKTHROUGH DEMONSTRATION")
    print("   Matching Section 4 & Section 13 of shameer.md")
    print("=" * 65)

    answers = [
        # Step 2: Vague answer to binary_trees
        {
            "confidence": 3,
            "answer": "binary trees are node structures with left and right child",
        },
        # Step 5: Good answer to recursion
        {
            "confidence": 4,
            "answer": "A recursive function calls itself with a smaller input until it hits a base case that stops the loop.",
        },
        # Step 7: Good answer to binary_trees
        {
            "confidence": 4,
            "answer": "The root is the topmost node with no parent. Left and right children are sub-roots of their own subtrees.",
        },
    ]

    callback_decisions = ["STEP_BACK"]

    result = run_session(
        topic_id="binary_trees",
        student_id=student_id,
        stub=True,
        clear=True,
        answers=answers,
        callback_decisions=callback_decisions,
    )

    print("\n" + "=" * 65)
    print("   SESSION AUDIT & TIMELINE INSPECTION")
    print("=" * 65)

    records = read_all_records(sess_file)
    for i, r in enumerate(records, 1):
        kind = r.get("kind")
        topic = r.get("topic_id", "")
        if kind == "question":
            print(f"{i:2d}. [QUESTION]  [{topic}] Level {r.get('difficulty_level')}: \"{r.get('content')}\"")
        elif kind == "answer":
            print(f"{i:2d}. [ANSWER]    [{topic}] Conf={r.get('confidence_rating')}/5: \"{r.get('student_response')}\"")
        elif kind == "verdict":
            status = r.get("status")
            objs = r.get("objections", [])
            prereq = r.get("prerequisite_id")
            print(f"{i:2d}. [VERDICT]   [{topic}] -> {status} (Prereq: {prereq}) | Objections: {objs}")
        elif kind == "callback_response":
            print(f"{i:2d}. [CALLBACK]  [{topic}] Student Decision: {r.get('decision')}")
        elif kind == "session_summary":
            print(f"{i:2d}. [SUMMARY]   Verified: {r.get('topics_verified')}, Depth: {r.get('depth_reached')}")

    print("=" * 65)
    assert result["status"] == "COMPLETE"
    assert "recursion" in result["topics_verified"]
    assert "binary_trees" in result["topics_verified"]
    print("[SUCCESS] Walkthrough demonstration completed cleanly and verified against spec.")


if __name__ == "__main__":
    run_walkthrough()

