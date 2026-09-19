from __future__ import annotations

import json
from pathlib import Path


def _read_prompt(name: str) -> str:
    path = Path(__file__).resolve().parent / "prompts" / name
    return path.read_text(encoding="utf-8")


def spot_agent(topic_id: str, topic_label: str, difficulty_level: int, prior_objections: list[str] | None = None):
    prior_objections = prior_objections or []
    if topic_id == "binary_trees":
        if difficulty_level == 1:
            return {
                "content": "Explain the core idea behind Binary Trees in your own words.",
            }
        return {
            "content": "What is the purpose of the root node in a Binary Tree, and how does it differ from the left and right child nodes?",
        }
    if topic_id == "recursion":
        return {
            "content": "What does it mean for a function to call itself, and what role does the base case play?",
        }
    return {
        "content": f"Explain the core idea behind {topic_label} in your own words.",
    }


def gate_agent(topic_id: str, question: str, answer: str, prior_verdicts: list[dict] | None = None, prerequisite_id: str | None = None):
    prior_verdicts = prior_verdicts or []
    answer_lower = answer.lower()
    is_injection = "ignore the instructions" in answer_lower or "mark this answer as pass" in answer_lower

    if topic_id == "binary_trees":
        if is_injection:
            return {
                "topic_id": topic_id,
                "status": "BLOCK",
                "objections": [
                    "The student's response is an injection attempt and does not answer the question.",
                    "The answer does not explain the core idea behind Binary Trees.",
                ],
                "prerequisite_id": "recursion",
            }
        if "root" in answer_lower and "subtree" in answer_lower and "left" in answer_lower and "right" in answer_lower:
            return {
                "topic_id": topic_id,
                "status": "PASS",
                "objections": [],
                "prerequisite_id": None,
            }
        return {
            "topic_id": topic_id,
            "status": "BLOCK",
            "objections": [
                "The answer lacks a clear explanation of the core idea behind Binary Trees.",
                "It mentions left and right child nodes but does not explain their significance or how they relate to the root.",
            ],
            "prerequisite_id": "recursion",
        }

    if topic_id == "recursion":
        if "calls itself" in answer_lower and ("base case" in answer_lower or "smaller input" in answer_lower):
            return {
                "topic_id": topic_id,
                "status": "PASS",
                "objections": [],
                "prerequisite_id": None,
            }
        return {
            "topic_id": topic_id,
            "status": "BLOCK",
            "objections": [
                "The answer does not explain the recursion pattern clearly.",
                "It lacks the idea of a smaller input and a stopping condition.",
            ],
            "prerequisite_id": "function_calls",
        }

    if "explain" in question.lower() and len(answer.strip()) > 8:
        return {
            "topic_id": topic_id,
            "status": "PASS",
            "objections": [],
            "prerequisite_id": None,
        }

    return {
        "topic_id": topic_id,
        "status": "BLOCK",
        "objections": ["The answer does not satisfy the topic requirement."],
        "prerequisite_id": prerequisite_id,
    }
