"""LIVE cloud check (a few cents at most): with cloud consent ON, one question, three practice questions, one coach paragraph.
Prints which model answered each. Uses a throwaway account; nothing is printed that could contain a key."""
import http.cookiejar
import json
import sys
import time
import urllib.request
import uuid

BASE = "http://127.0.0.1:8100/api/v1"
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
csrf = json.load(op.open(BASE + "/session"))["csrf"]


def call(method, path, body=None, raw=None, ctype="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"X-CSRF-Token": csrf, "Content-Type": ctype})
    try:
        with op.open(req, timeout=60) as r:
            t = r.read()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        return {"_http": e.code, **(json.loads(e.read() or b"{}"))}


def wait(fn, done, limit):
    t0 = time.time()
    while time.time() - t0 < limit:
        v = fn()
        if done(v):
            return v, round(time.time() - t0)
        time.sleep(3)
    return v, round(time.time() - t0)


name = "chk" + uuid.uuid4().hex[:7].replace("a", "1").replace("b", "2").replace("c", "3").replace("d", "4").replace("e", "5").replace("f", "6")
csrf = call("POST", "/register", {"username": name, "password": "correct horse battery"})["csrf"]
sid = call("POST", "/subjects", {"name": "Cloud"})["id"]
text = open("frontend/e2e/fixtures/ds.txt", "rb").read()
b = "----x"
raw = (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"ds.txt\"\r\nContent-Type: text/plain\r\n\r\n").encode() + text + f"\r\n--{b}--\r\n".encode()
call("POST", f"/subjects/{sid}/materials", raw=raw, ctype=f"multipart/form-data; boundary={b}")
print("consent:", call("PUT", "/account/cloud", {"consent": True}))

qid = call("POST", f"/subjects/{sid}/questions", {"question": "What does the pop operation do on a stack?"})["id"]
q, secs = wait(lambda: call("GET", f"/subjects/{sid}/questions/{qid}"), lambda v: v.get("status") != "pending", 180)
print(f"QUESTION: {q.get('status')} in {secs}s | model={q.get('model')} tier={q.get('tier')} claims={len(q.get('claims') or [])} reason={(q.get('reason') or '')[:120]}")

job = call("POST", f"/subjects/{sid}/mcq/jobs", {"count": 3})
if "id" not in job:
    print("MCQ job refused:", job)
else:
    j, secs = wait(lambda: call("GET", f"/subjects/{sid}/mcq/jobs/{job['id']}"), lambda v: v.get("status") != "pending", 300)
    print(f"PRACTICE (3 requested): {j.get('status')} in {secs}s | produced={j.get('produced')} rejected={j.get('rejected')} model={j.get('model')} tier={j.get('tier')} reason={(j.get('reason') or '')[:100]}")

call("POST", f"/subjects/{sid}/roadmap/coach")
r, secs = wait(lambda: call("GET", f"/subjects/{sid}/roadmap"), lambda v: v.get("coach", {}).get("status") != "pending", 180)
c = r.get("coach", {})
print(f"COACH: {c.get('status')} in {secs}s | model={c.get('model')} from_model={c.get('from_model')} | {c.get('text', '')[:160]}")
print("USER:", name, "subject", sid)
