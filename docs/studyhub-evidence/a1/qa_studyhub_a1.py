"""Real-browser test of StudyHub A1: real uvicorn + real Edge. Production scrypt cost (no STUDYHUB_SCRYPT_N override)."""
import os
import sqlite3
import subprocess
import sys
import time

import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "qa")
REPO = "D:/projects/DeadLock"
PY = REPO + "/.venv/Scripts/python.exe"
PORT = 8100
BASE = f"http://127.0.0.1:{PORT}"
DB = os.path.join(OUT, "studyhub_a1.db")
EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
for s in ("", "-wal", "-shm"):
    if os.path.exists(DB + s):
        os.remove(DB + s)
env = dict(os.environ, STUDYHUB_DB=DB, PYTHONDONTWRITEBYTECODE="1", PYTHONPATH=REPO)
env.pop("STUDYHUB_SCRYPT_N", None)
server = subprocess.Popen([PY, "-m", "uvicorn", "studyhub.web.app:app", "--port", str(PORT), "--log-level", "warning"],
                          cwd=REPO, env=env, stdout=open(os.path.join(OUT, "studyhub_uvicorn.log"), "w"), stderr=subprocess.STDOUT)


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
            if httpx.get(BASE + "/healthz", timeout=2).status_code == 200:
                break
        except httpx.HTTPError:
            time.sleep(0.5)
    print(f"server up: uvicorn studyhub.web.app:app  db={os.path.basename(DB)}  (production scrypt cost)", flush=True)
    shots = os.path.join(OUT, "shots_studyhub_a1")
    os.makedirs(shots, exist_ok=True)
    node = subprocess.run(["node", os.path.join(HERE, "browser_a1.mjs"), BASE, EDGE, os.path.join(OUT, "edge_profile_a1"), shots],
                          capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300, stdin=subprocess.DEVNULL)
    print(node.stdout + (node.stderr or ""))
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    print("SQLITE (read directly):")
    for row in db.execute("select id, username, length(pw_hash), scrypt_params from users"):
        print("   user:", row)
    print("   password plaintext anywhere in the file?", "correct horse battery" in "".join(db.iterdump()))
    print("   subjects:", db.execute("select user_id, name from subjects order by id").fetchall())
    print("   live sessions:", db.execute("select count(*) from sessions").fetchone()[0])
finally:
    stop()
    ns = subprocess.run("netstat -ano", capture_output=True, text=True, shell=True).stdout
    print("server stopped:", "no LISTENING socket" if not any(f":{PORT} " in l and "LISTENING" in l for l in ns.splitlines()) else "STILL LISTENING")
