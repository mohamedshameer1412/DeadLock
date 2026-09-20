"""Probe: one real question against the LIVE backend (8100) with the local model; prints how long it took and the final status."""
import json
import sys
import time
import urllib.request
import http.cookiejar
import uuid

BASE = "http://127.0.0.1:8100/api/v1"
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
csrf = json.load(op.open(BASE + "/session"))["csrf"]


def call(method, path, body=None, raw=None, ctype="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"X-CSRF-Token": csrf, "Content-Type": ctype})
    with op.open(req, timeout=60) as r:
        txt = r.read()
        return json.loads(txt) if txt else {}


name = "probe" + uuid.uuid4().hex[:6]
r = call("POST", "/register", {"username": name, "password": "correct horse battery"})
csrf = r["csrf"]
sid = call("POST", "/subjects", {"name": "Probe"})["id"]
text = open("frontend/e2e/fixtures/ds.txt", "rb").read()
b = "----x"
raw = (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"ds.txt\"\r\nContent-Type: text/plain\r\n\r\n").encode() + text + f"\r\n--{b}--\r\n".encode()
call("POST", f"/subjects/{sid}/materials", raw=raw, ctype=f"multipart/form-data; boundary={b}")
qid = call("POST", f"/subjects/{sid}/questions", {"question": "What does the pop operation do on a stack?"})["id"]
t0 = time.time()
while time.time() - t0 < float(sys.argv[1]):
    q = call("GET", f"/subjects/{sid}/questions/{qid}")
    if q["status"] != "pending":
        print("STATUS", q["status"], "after", round(time.time() - t0), "s; model", q.get("model"), "; reason", (q.get("reason") or "")[:200])
        print("claims", len(q.get("claims") or []), "dropped", q.get("dropped"))
        break
    time.sleep(5)
else:
    print("STILL PENDING after", round(time.time() - t0), "s")
