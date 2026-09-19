"""LIVE frontend test: real Edge -> real uvicorn (LLM_PROVIDER=ollama) -> real llama3.1."""
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
PORT = 8091
BASE = f"http://127.0.0.1:{PORT}"
DB = os.path.join(OUT, "frontend_live.db")
EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
for s in ("", "-wal", "-shm"):
    if os.path.exists(DB + s):
        os.remove(DB + s)
env = dict(os.environ, SLICE_DB=DB, LLM_PROVIDER="ollama", PYTHONDONTWRITEBYTECODE="1", PYTHONPATH=REPO)
env.pop("OPENROUTER_API_KEY", None)
server = subprocess.Popen([PY, "-m", "uvicorn", "web.study_ui:app", "--port", str(PORT), "--log-level", "warning"],
                          cwd=REPO, env=env, stdout=open(os.path.join(OUT, "uvicorn_live.log"), "w"), stderr=subprocess.STDOUT)


def stop():
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
    print(f"server up: LLM_PROVIDER=ollama  db={os.path.basename(DB)}", flush=True)
    shots = os.path.join(OUT, "shots_live")
    os.makedirs(shots, exist_ok=True)
    node = subprocess.run(["node", os.path.join(HERE, "browser_live.mjs"), BASE, EDGE, os.path.join(OUT, "edge_profile_live"), shots],
                          capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900, stdin=subprocess.DEVNULL)
    print(node.stdout + (node.stderr or ""))
    rid = re.search(r"RUN_ID=(\S+)", node.stdout)
    if rid:
        db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
        print("SQLITE (read directly), records of the live run:")
        for seq, kind, by in db.execute("select seq, kind, produced_by from versions where run_id=? order by seq", (rid.group(1),)):
            print(f"   #{seq:<3} {kind:<9} {by}")
finally:
    stop()
