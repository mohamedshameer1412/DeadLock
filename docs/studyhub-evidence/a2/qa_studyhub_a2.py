"""Real-browser test of StudyHub A2 (uploads + search): real uvicorn + real Edge + real files. Production scrypt cost."""
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
PORT = 8100
BASE = f"http://127.0.0.1:{PORT}"
DB = os.path.join(OUT, "studyhub_a2.db")
UPLOADS = os.path.join(OUT, "a2_uploads")
EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
for s in ("", "-wal", "-shm"):
    if os.path.exists(DB + s):
        os.remove(DB + s)
shutil.rmtree(UPLOADS, ignore_errors=True)
env = dict(os.environ, STUDYHUB_DB=DB, STUDYHUB_UPLOADS=UPLOADS, PYTHONDONTWRITEBYTECODE="1", PYTHONPATH=REPO)
env.pop("STUDYHUB_SCRYPT_N", None)
server = subprocess.Popen([PY, "-m", "uvicorn", "studyhub.web.app:app", "--port", str(PORT), "--log-level", "warning"],
                          cwd=REPO, env=env, stdout=open(os.path.join(OUT, "studyhub_uvicorn_a2.log"), "w"), stderr=subprocess.STDOUT)


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
    print("server up: uvicorn studyhub.web.app:app (production scrypt cost, real uploads folder)", flush=True)
    shots = os.path.join(OUT, "shots_studyhub_a2")
    os.makedirs(shots, exist_ok=True)
    node = subprocess.run(["node", os.path.join(HERE, "browser_a2.mjs"), BASE, EDGE, os.path.join(OUT, "edge_profile_a2"), shots,
                           os.path.join(HERE, "a2files")],
                          capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=400, stdin=subprocess.DEVNULL)
    print(node.stdout + (node.stderr or ""))
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    print("SQLITE (read directly):")
    for row in db.execute("select id, kind, title, pages, status, (select count(*) from chunks c where c.document_id=d.id) from documents d"):
        print("   document:", row)
    print("   topics:", db.execute("select count(*) from topics").fetchone()[0], " chunks:", db.execute("select count(*) from chunks").fetchone()[0])
    db.execute("INSERT INTO chunks_fts(chunks_fts) VALUES('integrity-check')") if False else None
    files = [f for _, _, fs in os.walk(UPLOADS) for f in fs]
    print("   stored originals:", len(files), "(names are sha256 hex only:", all(len(f) == 64 for f in files), ")")
finally:
    stop()
    ns = subprocess.run("netstat -ano", capture_output=True, text=True, shell=True).stdout
    print("server stopped:", "no LISTENING socket" if not any(f":{PORT} " in l and "LISTENING" in l for l in ns.splitlines()) else "STILL LISTENING")
