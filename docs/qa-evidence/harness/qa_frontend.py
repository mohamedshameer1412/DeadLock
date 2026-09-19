"""FRONTEND test: the REAL FastAPI app served by a REAL uvicorn process (fixture provider).

Part 1: every HTTP endpoint.  Part 2: a real Edge browser (browser_test.mjs).  Part 3: SQLite.
The server's provider is `fixture` (scripted replies) so results are deterministic - that is the
FIXTURE label. A live-Ollama pass through the same server is a separate run.
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import time

import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "qa")
REPO = "D:/projects/DeadLock"
PY = REPO + "/.venv/Scripts/python.exe"
PORT = int(os.environ.get("QA_PORT", "8090"))
BASE = f"http://127.0.0.1:{PORT}"
PROVIDER = os.environ.get("QA_PROVIDER", "fixture")
DB = os.path.join(OUT, f"frontend_{PROVIDER}.db")
EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

sys.path.insert(0, REPO)
from demo.study.samples import INJECTED, SAMPLE  # noqa: E402

for s in ("", "-wal", "-shm"):
    if os.path.exists(DB + s):
        os.remove(DB + s)

env = dict(os.environ, SLICE_DB=DB, LLM_PROVIDER=PROVIDER, PYTHONDONTWRITEBYTECODE="1", PYTHONPATH=REPO)
env.pop("OPENROUTER_API_KEY", None)
server = subprocess.Popen([PY, "-m", "uvicorn", "web.study_ui:app", "--port", str(PORT), "--log-level", "warning"],
                          cwd=REPO, env=env, stdout=open(os.path.join(OUT, "uvicorn.log"), "w"), stderr=subprocess.STDOUT)
rows = []


def check(name, ok, evidence=""):
    rows.append((name, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  ::  {str(evidence)[:150]}", flush=True)


def stop_server():
    out = subprocess.run("netstat -ano", capture_output=True, text=True, shell=True).stdout
    for line in out.splitlines():
        if f":{PORT} " in line and "LISTENING" in line:
            subprocess.run(["taskkill", "/F", "/T", "/PID", line.split()[-1]], capture_output=True)
    try:
        server.kill()
    except Exception:
        pass


try:
    for _ in range(60):
        try:
            if httpx.get(BASE + "/", timeout=2).status_code == 200:
                break
        except httpx.HTTPError:
            time.sleep(0.5)
    print(f"server: uvicorn web.study_ui:app  port {PORT}  provider={PROVIDER}  db={os.path.basename(DB)}\n", flush=True)

    c = httpx.Client(base_url=BASE, timeout=30)
    print("=" * 96 + "\nPART 1 - HTTP ENDPOINTS (FRONTEND TEST, fixture provider)\n" + "=" * 96)
    r = c.get("/")
    check("GET /  (Screen 1: input)", r.status_code == 200 and "<textarea" in r.text and "Generate study pack" in r.text and "fixture (scripted replies" in r.text, f"{r.status_code}, textarea+button+honest mode banner")

    g = c.post("/api/generate", json={"source": SAMPLE, "title": "QA topic", "scenario": "revise"})
    gj = g.json(); rid = gj.get("run_id")
    check("POST /api/generate (valid source, scenario revise)", g.status_code == 200 and gj["state"] == "complete", gj)
    a = c.get(f"/api/run/{rid}").json()
    check("GET /api/run/{id}: state, draft, verdict, summary", a["state"] == "complete" and a["draft"] and a["verdict"]["status"] == "APPROVED" and a["summary"]["path"] == "drafting -> gating -> drafting -> gating -> complete", f"path={a['summary']['path']} drafts={a['summary']['drafts']}")
    check("  result record: approved by validator after 1 revision", a["result"]["approved_by"] == "validator" and a["result"]["revisions"] == 1, a["result"])
    for path, needles in [("", ["Notes", "Quiz", "marked correct", "quote found in source", "Was this study material useful?"]),
                          ("/trace", ["Execution Trace", "VALIDATOR  REJECTED", "quote_not_in_source", "VALIDATOR  APPROVED"]),
                          ("/revision", ["Draft 1", "REJECTED", "Changed from draft 1", "1 of 3 revisions used"])]:
        t = c.get(f"/run/{rid}{path}").text
        check(f"GET /run/{{id}}{path}  content", all(n in t for n in needles), [n for n in needles if n not in t] or "all expected content present")

    s = c.post("/api/generate", json={"source": SAMPLE, "scenario": "stuck"}).json()
    sa = c.get(f"/api/run/{s['run_id']}").json()
    check("stuck scenario -> AWAITING_EXPERT after 3 revisions", sa["state"] == "awaiting_expert" and sa["summary"]["revisions"] == 3 and sa["awaiting_review"], f"revisions={sa['summary']['revisions']} escalation={sa['escalation']['reason']}")
    rv = c.post(f"/api/run/{s['run_id']}/review", json={"decision": "APPROVE", "notes": "ok", "who": "qa"})
    check("POST /api/run/{id}/review APPROVE -> complete, attributed to the human", rv.status_code == 200 and rv.json()["state"] == "complete" and c.get(f"/api/run/{s['run_id']}").json()["result"]["approved_by"] == "human:qa", rv.json())
    s2 = c.post("/api/generate", json={"source": SAMPLE, "scenario": "repeat"}).json()["run_id"]
    check("POST review REJECT -> failed with human_rejected", c.post(f"/api/run/{s2}/review", json={"decision": "REJECT", "notes": "no"}).json()["state"] == "failed" and c.get(f"/api/run/{s2}").json()["failure"]["kind"] == "human_rejected")
    check("POST review on a finished run -> 409", c.post(f"/api/run/{rid}/review", json={"decision": "APPROVE"}).status_code == 409)
    check("POST /api/run/{id}/resume on a finished run is harmless", c.post(f"/api/run/{rid}/resume").status_code == 200 and c.get(f"/api/run/{rid}").json()["state"] == "complete")

    print("\n-- error handling")
    check("empty source -> 422", c.post("/api/generate", json={"source": ""}).status_code == 422)
    check("missing source -> 422", c.post("/api/generate", json={}).status_code == 422)
    check("invalid JSON -> 400", c.post("/api/generate", content="{", headers={"content-type": "application/json"}).status_code == 400)
    check("unknown scenario -> 422", c.post("/api/generate", json={"source": SAMPLE, "scenario": "nope"}).status_code == 422)
    short = c.post("/api/generate", json={"source": "too short"}).json()["run_id"]
    check("too-short source -> run FAILED input_too_short (recorded, not a crash)", c.get(f"/api/run/{short}").json()["failure"]["kind"] == "input_too_short")
    inj = c.post("/api/generate", json={"source": INJECTED}).json()["run_id"]
    ij = c.get(f"/api/run/{inj}").json()
    check("injected source (screen catches it) -> FAILED source_injection, no draft", ij["failure"]["kind"] == "source_injection" and ij["draft"] is None)
    check("unknown run: API 404, pages say 'not found'", c.get("/api/run/run_nope").status_code == 404 and "not found" in c.get("/run/run_nope").text.lower() and "not found" in c.get("/run/run_nope/trace").text.lower())

    print("\n-- feedback")
    fb = c.post(f"/api/run/{rid}/feedback", json={"useful": True, "rating": 5, "comment": "clear", "confusing": "", "tester": "api-qa"})
    check("POST feedback -> 201, attached to the right run", fb.status_code == 201 and fb.json()["run_id"] == rid and fb.json()["feedback"]["draft"] == 2, fb.json()["feedback"])
    check("GET /api/run/{id}/feedback returns it", [f["tester"] for f in c.get(f"/api/run/{rid}/feedback").json()["feedback"]] == ["api-qa"])
    check("GET /api/feedback returns it with run context", any(f["run_id"] == rid for f in c.get("/api/feedback").json()["feedback"]))
    check("feedback appears in the trace", "TESTER FEEDBACK  (api-qa): useful" in c.get(f"/run/{rid}/trace").text)
    check("feedback on an unknown run -> 404", c.post("/api/run/run_nope/feedback", json={"useful": True}).status_code == 404)
    for label, body in [("empty {}", {}), ("useful as a string", {"useful": "yes"}), ("rating 9", {"useful": True, "rating": 9}), ("comment 1001 chars", {"useful": True, "comment": "x" * 1001}), ("unknown field", {"useful": True, "oops": 1})]:
        check(f"invalid feedback ({label}) -> 422 and nothing stored", c.post(f"/api/run/{rid}/feedback", json=body).status_code == 422)
    check("stored feedback count is still exactly 1", len(c.get(f"/api/run/{rid}/feedback").json()["feedback"]) == 1)
    xss = c.post(f"/api/run/{s['run_id']}/feedback", json={"useful": True, "comment": "<script>alert(1)</script>", "tester": "<b>x</b>"})
    page = c.get(f"/run/{s['run_id']}").text
    check("feedback text is HTML-escaped on the page", xss.status_code == 201 and "<script>alert(1)</script>" not in page and "&lt;script&gt;" in page)

    print("\n" + "=" * 96 + "\nPART 2 - REAL BROWSER (Microsoft Edge, DevTools protocol) - FRONTEND TEST\n" + "=" * 96, flush=True)
    profile = os.path.join(OUT, "edge_profile"); shots = os.path.join(OUT, "shots")
    os.makedirs(shots, exist_ok=True)
    node = subprocess.run(["node", os.path.join(HERE, "browser_test.mjs"), BASE, EDGE, profile, shots],
                          capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=240, stdin=subprocess.DEVNULL)
    print(node.stdout + node.stderr)
    browser_run = re.search(r"RUN_ID=(\S+)", node.stdout)

    print("=" * 96 + "\nPART 3 - PERSISTENCE: read the SQLite file directly (no app code)\n" + "=" * 96)
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    n_runs = db.execute("select count(*) from runs").fetchone()[0]
    fbrows = db.execute("select run_id, produced_by, payload_json from versions where kind='feedback' order by seq").fetchall()
    check(f"SQLite holds the runs created above ({n_runs} runs)", n_runs >= 8)
    check("feedback rows exist in `versions` (kind='feedback')", len(fbrows) >= 3, [(r[0][-6:], r[1]) for r in fbrows])
    if browser_run:
        bf = [r for r in fbrows if r[0] == browser_run.group(1)]
        check("the feedback typed in the BROWSER is in the database under that run id", len(bf) == 1 and json.loads(bf[0][2])["comment"] == "Question 3 was too easy" and bf[0][1] == "tester:browser-qa", bf[0][2][:120] if bf else "none")
    check("the append-only trigger refuses to edit feedback", "append-only" in str(subprocess.run([PY, "-c", f"import sqlite3;c=sqlite3.connect(r'{DB}');\ntry:\n c.execute(\"update versions set payload_json='{{}}' where kind='feedback'\")\nexcept Exception as e: print(e)"], capture_output=True, text=True).stdout))
    print(f"\nHTTP/DB CHECKS: {sum(1 for _, ok in rows if ok)}/{len(rows)} passed")
finally:
    stop_server()
    ns = subprocess.run("netstat -ano", capture_output=True, text=True, shell=True).stdout
    print("server stopped:", "no LISTENING socket on the port" if not any(f":{PORT} " in l and "LISTENING" in l for l in ns.splitlines()) else "STILL LISTENING")
