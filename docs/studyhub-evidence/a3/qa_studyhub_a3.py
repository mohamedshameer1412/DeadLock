"""Real-browser + real-local-model test of StudyHub A3: real uvicorn, real Edge, real Ollama. Production scrypt cost."""
import os
import shutil
import sqlite3
import subprocess
import time

import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "qa")
REPO = "D:/projects/DeadLock"
PY = REPO + "/.venv/Scripts/python.exe"
PORT = 8101
BASE = f"http://127.0.0.1:{PORT}"
DB = os.path.join(OUT, "studyhub_a3.db")
UPLOADS = os.path.join(OUT, "a3_uploads")
EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
for s in ("", "-wal", "-shm"):
    if os.path.exists(DB + s):
        os.remove(DB + s)
shutil.rmtree(UPLOADS, ignore_errors=True)
env = dict(os.environ, STUDYHUB_DB=DB, STUDYHUB_UPLOADS=UPLOADS, PYTHONDONTWRITEBYTECODE="1", PYTHONPATH=REPO)
env.pop("STUDYHUB_SCRYPT_N", None)
env.pop("OPENROUTER_API_KEY", None)                      # this run must be local-only
server = subprocess.Popen([PY, "-m", "uvicorn", "studyhub.web.app:app", "--port", str(PORT), "--log-level", "warning"],
                          cwd=REPO, env=env, stdout=open(os.path.join(OUT, "studyhub_uvicorn_a3.log"), "w"), stderr=subprocess.STDOUT)


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
    print("server up (production scrypt, local Ollama model, no cloud key)", flush=True)
    shots = os.path.join(OUT, "shots_studyhub_a3")
    os.makedirs(shots, exist_ok=True)
    node = subprocess.run(["node", os.path.join(HERE, "browser_a3.mjs"), BASE, EDGE, os.path.join(OUT, "edge_profile_a3"), shots,
                           os.path.join(HERE, "a2files")],
                          capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=1500, stdin=subprocess.DEVNULL)
    print(node.stdout + (node.stderr or ""))
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    print("SQLITE (read directly):")
    for row in db.execute("select id, status, tier, model, dropped, substr(question,1,50) from doubts"):
        print("   doubt:", row)
    print("   claims stored:", db.execute("select count(*) from doubt_claims").fetchone()[0],
          " citations stored:", db.execute("select count(*) from doubt_citations").fetchone()[0])
    print("   spine runs (qa):", db.execute("select count(*) from runs where domain='qa'").fetchone()[0],
          " trace rows:", db.execute("select count(*) from versions").fetchone()[0])
    print("   consent flags:", [tuple(r) for r in db.execute("select username, cloud_consent from users")])
finally:
    stop()
    ns = subprocess.run("netstat -ano", capture_output=True, text=True, shell=True).stdout
    print("server stopped:", "no LISTENING socket" if not any(f":{PORT} " in l and "LISTENING" in l for l in ns.splitlines()) else "STILL LISTENING")
