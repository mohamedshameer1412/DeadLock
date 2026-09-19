"""Extract every MODEL-generated study pack from the QA/exploration databases into readable markdown.

Included : drafts written by the generator (produced_by == agent:generator) in runs whose mode says a real
           model was used, plus the generator-alone run (from the recorded call log).
Excluded : scripted fixture runs and hand-authored test inputs. Nothing is edited or invented.
"""
import glob
import json
import os
import sqlite3
import sys
import time

S = sys.argv[1]
OUT = sys.argv[2]
SKIP = ("stub", "fixture", "FIXTURE", "persistence", "validator-only", "QA scenario cycle")


def rows(db, sql, *a):
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        return c.execute(sql, a).fetchall()
    finally:
        c.close()


def render_pack(p, src_note=""):
    out = [f"**{p['title']}**", "", "Notes:"]
    out += [f"- {n}" for n in p["notes"]]
    out.append("")
    for i, q in enumerate(p["questions"], 1):
        out.append(f"**Q{i}. {q['question']}**")
        for L, o in zip("ABCD", q["options"]):
            out.append(f"- {'**' + L + '. ' + o + '**  ✔ (marked correct)' if L == q['answer'] else L + '. ' + o}")
        out.append(f"- *Why:* {q['explanation']}")
        out.append(f"- *Source:* “{q['source_quote']}”")
        out.append("")
    return "\n".join(out)


dbs = sorted(set(glob.glob(f"{S}/*.db") + glob.glob(f"{S}/qa/*.db")))
runs = []
for db in dbs:
    try:
        for rid, mode, created in rows(db, "select id, meta_json, created_at from runs"):
            meta = json.loads(mode)
            m = meta.get("mode", "")
            if any(k in m for k in SKIP):
                continue
            every = rows(db, "select seq, produced_by from versions where run_id=? and kind='draft' order by seq", rid)
            ordinal = {seq: n for n, (seq, _) in enumerate(every, 1)}          # true position among ALL drafts
            others = [n for n, (_, by) in enumerate(every, 1) if by != 'agent:generator']
            drafts = [(seq, pl, ordinal[seq], others) for seq, pl, _ in rows(db, "select seq, payload_json, created_at from versions where run_id=? and kind='draft' and produced_by='agent:generator' order by seq", rid)]
            if not drafts:
                continue
            src = rows(db, "select payload_json from versions where run_id=? and kind='input' limit 1", rid)[0][0]
            verdicts = [json.loads(p) for (p,) in rows(db, "select payload_json from versions where run_id=? and kind='verdict' order by seq", rid)]
            state = rows(db, "select state from runs where id=?", rid)[0][0]
            runs.append((created, os.path.basename(db), rid, m, json.loads(src)["text"], drafts, verdicts, state))
    except sqlite3.Error as e:
        print("skip", db, e)

runs.sort()
lines = ["# Model-generated study packs (real `llama3.1:latest`)", "",
         "Extracted read-only from the run databases produced during the 2026-09-19 exploration and QA passes.",
         "Every pack below was written by the **generator** (a real model call). Scripted fixture packs and the",
         "hand-authored test inputs used in the validator tests are **not** included.",
         "Verdicts are the validator's real decisions. Nothing was edited.", "",
         "| # | Run | Source (words) | Drafts | Final state |", "|---|---|---|---|---|"]
body = []
for n, (created, db, rid, mode, src, drafts, verdicts, state) in enumerate(runs, 1):
    lines.append(f"| {n} | `{rid}` ({db}) | {len(src.split())} | {len(drafts)} | {state} |")
    when = time.strftime("%H:%M", time.localtime(created))
    body += [f"\n---\n\n## {n}. `{rid}` — {when} — {db}", "", f"*Mode:* {mode}", "", "**Source given to the model:**", ""]
    body += ["> " + l for l in src.splitlines()]
    if drafts and drafts[0][3]:
        body += ["", f"*Draft(s) {drafts[0][3]} in this run were hand-authored test inputs and are not shown; the pack below was written by the real generator.*"]
    for seq, payload, k, _others in drafts:
        p = json.loads(payload)
        v = next((x for x in verdicts if x.get("draft") == k), None)
        body += ["", f"### Draft {k}" + (" (revision)" if k > 1 else ""), "", render_pack(p)]
        if v:
            body.append(f"*Validator verdict on draft {k}:* **{v['status']}**" + ("" if not v["issues"] else " — " + "; ".join(f"[{i['origin']}] {i['code']} @ {i['where']}" for i in v["issues"])))
    body.append(f"\n*Final run state:* **{state}**")

# the generator-alone run: its output was printed and logged, not stored in a run database
calls = [json.loads(l) for l in open(f"{S}/qa/llm_calls.jsonl", encoding="utf-8")]
g = next((c for c in calls if c["tag"] == "gen" and c["step"] == "generate" and "output" in c), None)
if g:
    n = len(runs) + 1
    src = g["messages"][1]["content"].split("<<<SOURCE\n")[1].split("\nSOURCE>>>")[0]
    lines.append(f"| {n} | generator-alone test (call log, tag `gen`) | {len(src.split())} | 1 | not run through the validator |")
    body += [f"\n---\n\n## {n}. Generator tested alone — {g['at']} — from `logs/llm_calls.jsonl`", "",
             "*Mode:* LIVE OLLAMA, generator only (no validator involved)", "", "**Source given to the model:**", "", "> " + src, "",
             "### Draft 1", "", render_pack(g["output"])]

open(OUT, "w", encoding="utf-8").write("\n".join(lines + body) + "\n")
print(f"{len(runs)} runs with model-generated drafts (+1 generator-alone); total drafts:", sum(len(r[5]) for r in runs) + (1 if g else 0))
for created, db, rid, mode, src, drafts, verdicts, state in runs:
    print(f"  {rid}  {db:22s} drafts={len(drafts)} state={state:15s} mode={mode[:60]}")
