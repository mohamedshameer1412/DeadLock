"""Plain-text explanation of how an answer was produced. Used by the web page and by the terminal command, so both say the
same thing from the same recorded steps (the spine's append-only trace)."""
from __future__ import annotations


def step_text(step: dict) -> str:
    """One recorded step, in plain words. `step` is {"kind": ..., "payload": {...}}."""
    k, p = step["kind"], step["payload"]
    if k == "question":
        return "Question received."
    if k == "retrieval":
        n = len(p["relevant"])
        return (f"Searched only this subject's materials for: {', '.join(p['terms'])}. "
                f"{n} passage{'s' if n != 1 else ''} matched enough of these words to be used.")
    if k == "tier_skipped":
        return "Skipped: " + p["note"] + "."
    if k == "draft":
        n = p["claims"] if isinstance(p["claims"], int) else len(p["claims"])
        return f"Draft {p.get('attempt', 1)} by the {p['tier']} model: {n} statement{'s' if n != 1 else ''} ({p.get('seconds', '?')} s)."
    if k == "verification":
        bad = "; ".join(f"statement {f['claim']}: {' '.join(f['problems'])}" for f in p["failed"])
        return (f"Checked every quote against the passages (by the app, not by a model). Verified: "
                f"{', '.join(str(i) for i in p['ok']) or 'none'}." + (f" Rejected: {bad}" if bad else ""))
    if k == "revision":
        return f"Asked the model to fix the rejected statements (draft {p['attempt']})."
    if k == "revision_stopped":
        return "Stopped revising: " + p["why"] + "."
    if k == "model_error":
        return f"The {p['tier']} model failed: {p['error']}"
    if k == "tier_failed":
        return f"The {p['tier']} model gave nothing verifiable ({p['why']}); trying the next option."
    if k == "unexpected_error":
        return f"Internal error: {p['type']}."
    if k == "explanation":
        return ("Explanation from the model was kept." if p["shown"] else f"Explanation not shown: {p['note']}.") + (
            " The model reported a conflict between passages." if p["kind"] == "conflict" else "")
    if k == "final":
        return f"Result: {p['status']}."
    return k


def verification_rows(claims: list[dict], dropped: int, trace: list[dict]) -> list[str]:
    """What was checked, in plain words, from the answer and its recorded steps."""
    quotes = {(x["chunk_id"], x["quote"]) for c in claims for x in c["citations"]}
    drafts = [s for s in trace if s["kind"] == "draft"]
    focus = next((s["payload"].get("focus") for s in trace if s["kind"] == "retrieval"), None) or []
    focus = [focus] if isinstance(focus, str) else focus
    exp = next((s["payload"] for s in trace if s["kind"] == "explanation"), None)
    rows = [f"Every quote ({len(quotes)}) was found word for word in your material.",
            "Every number in a statement also appears in its quote.",
            "Only your own subject's passages were searched, and passages that read like instructions to an AI were not "
            "shown to the model."]
    if focus:
        rows.append("Each statement mentions " + " or ".join(f'"{f}"' for f in focus) + ", the key word of your question.")
    if len(drafts) > 1:
        rows.append(f"The model was asked to correct itself {len(drafts) - 1} time{'s' if len(drafts) != 2 else ''} "
                    "because earlier drafts failed these checks.")
    if dropped:
        rows.append(f"{int(dropped)} statement{'s' if dropped != 1 else ''} failed the checks and "
                    f"{'were' if dropped != 1 else 'was'} removed.")
    if exp and not exp["shown"] and exp["note"]:
        rows.append(f"The model's explanation was not shown: {exp['note']}.")
    return rows
