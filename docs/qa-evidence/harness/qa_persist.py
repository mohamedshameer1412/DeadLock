"""PERSISTENCE across real OS processes. FIXTURE replies (scripted) - the process boundary is real.

driver:  python qa_persist.py                      (spawns the child processes below)
child :  python qa_persist.py <mode> <db> [run_id]
"""
import os
import subprocess
import sys
import time

os.environ["LLM_PROVIDER"] = "fixture"
from qa_common import *  # noqa: F401,F403
from qa_common import (RunState, build_flow, callback, checks, runner, settings, trace, Store)
from demo.study import feedback
from demo.study.samples import SAMPLE
from demo.study.stub import SCENARIOS, V1, V2, Scripted, audit_v1, ok_audit


class DiesOnSecondGeneration(Scripted):
    """Real generation #1, then the whole PROCESS is killed (no cleanup, no atexit)."""

    def __call__(self, **kw):
        if kw.get("step") == "generate" and self.count("generate") == 1:
            print("child: >>> killing this process now (os._exit(9)) <<<", flush=True)
            os._exit(9)
        return super().__call__(**kw)


def child(mode, db, run_id=None):
    cfg = settings()
    if mode == "crash":
        store = Store(db)
        run = store.create_run("study", {"mode": "QA persistence"})
        store.append(run, "input", {"text": SAMPLE}, produced_by="qa")
        print(f"RUN_ID={run}", flush=True)
        runner.advance(store, run, build_flow(DiesOnSecondGeneration([V1, V2], [audit_v1(), ok_audit(V2)])), cfg)
    elif mode == "inspect_and_continue":
        store = Store(db)
        s = trace.summary(store, run_id)
        print(f"reloaded run {run_id}: state={store.get_state(run_id).value}  drafts={s['drafts']}  "
              f"verdicts={len(store.history(run_id, 'verdict'))}  tokens={s['tokens']}")
        v = store.history(run_id, "verdict")[0].payload
        print(f"persisted verdict 1: {v['status']} {[(i['origin'], i['code']) for i in v['issues']]}")
        print(f"persisted trace path so far: {s['path']}")
        print("persisted step records:", [(x.payload['state'], x.payload['next']) for x in store.history(run_id, 'step')])
        resumed = Scripted([V2], [ok_audit(V2)])
        final = runner.advance(store, run_id, build_flow(resumed), cfg)
        d = store.history(run_id, "draft")
        print(f"CONTINUED in a new process -> {final.value}; drafts now {len(d)}; "
              f"generate calls this process: {resumed.count('generate')}")
        prompt = resumed.calls[0]["messages"][1]["content"]
        print("revision prompt used the feedback persisted by the DEAD process:",
              "quote_not_in_source" in prompt and "not_exactly_one_correct" in prompt)
        print(f"revision history: {[(x.seq, x.produced_by) for x in d]}")
        print(f"final trace path: {trace.summary(store, run_id)['path']}")
    elif mode == "park":
        store = Store(db)
        run = store.create_run("study", {"mode": "QA human-review persistence"})
        store.append(run, "input", {"text": SAMPLE}, produced_by="qa")
        final = runner.advance(store, run, build_flow(SCENARIOS["stuck"][1]()), cfg)
        print(f"RUN_ID={run}")
        print(f"parked: {final.value} ; open questions: {len(callback.pending(store, run))}", flush=True)
    elif mode == "after_park":
        store = Store(db)
        (q,) = callback.pending(store, run_id)
        print(f"reloaded: state={store.get_state(run_id).value}; pending question {q.id}; "
              f"context keys={sorted(q.context)}; drafts={len(store.history(run_id, 'draft'))}")
        rec = feedback.submit(store, run_id, {"useful": False, "comment": "left while waiting for review", "tester": "qa-persist"})
        print(f"feedback written before this process exits: #{rec['seq']} draft={rec['draft']} run_state={rec['run_state']}")
    elif mode == "finish":
        store = Store(db)
        print(f"reloaded: state={store.get_state(run_id).value}; feedback rows={len(feedback.for_run(store, run_id))}")
        (q,) = callback.pending(store, run_id)
        callback.answer(store, q.id, "APPROVE checked in a third process", who="qa-reviewer")
        final = runner.advance(store, run_id, build_flow(Scripted([], [])), cfg)
        print(f"answered + advanced in a third process -> {final.value}")
        print(f"result: {store.latest(run_id, 'result')}")
        print(f"feedback still there: {[(f['tester'], f['comment']) for f in feedback.for_run(store, run_id)]}")
        text = trace.render_text(store, run_id)
        print("trace contains: HUMAN REVIEW REQUIRED=%s REVIEWER ANSWER=%s TESTER FEEDBACK=%s" % (
            "HUMAN REVIEW REQUIRED" in text, "REVIEWER ANSWER" in text, "TESTER FEEDBACK" in text))
        print(f"path: {trace.summary(store, run_id)['path']}")


def spawn(*args):
    env = dict(os.environ, PYTHONPATH=os.path.dirname(os.path.abspath(__file__)), PYTHONUNBUFFERED="1",
               PYTHONDONTWRITEBYTECODE="1", QA_OUT=OUT, LLM_PROVIDER="fixture")
    p = subprocess.run([sys.executable, os.path.abspath(__file__), *args], capture_output=True, text=True,
                       env=env, timeout=120, stdin=subprocess.DEVNULL)
    return p.returncode, (p.stdout + p.stderr).strip()


def rid_of(out):
    return next(l.split("=", 1)[1] for l in out.splitlines() if l.startswith("RUN_ID="))


if __name__ == "__main__":
    if len(sys.argv) > 1:
        child(*sys.argv[1:])
        sys.exit(0)

    def new(name):
        path = os.path.join(OUT, name)
        for s in ("", "-wal", "-shm"):
            if os.path.exists(path + s):
                os.remove(path + s)
        return path

    print("=" * 100 + "\nPERSISTENCE 1 [FIXTURE replies, REAL processes]: process killed mid-revision, another process continues\n" + "=" * 100)
    db = new("persist_crash.db")
    code, out = spawn("crash", db)
    print(f"process A (start run, generate v1, get rejected, begin revision, then KILLED) exit code = {code}")
    print("   " + out.replace("\n", "\n   "))
    rid = rid_of(out)
    code, out = spawn("inspect_and_continue", db, rid)
    print(f"\nprocess B (a brand-new process) exit code = {code}")
    print("   " + out.replace("\n", "\n   "))

    print("\n" + "=" * 100 + "\nPERSISTENCE 2 [FIXTURE replies, REAL processes]: human-review state and feedback across three processes\n" + "=" * 100)
    db = new("persist_review.db")
    code, out = spawn("park", db)
    print(f"process A (run until the revision limit, park on a human, EXIT) exit code = {code}\n   " + out.replace("\n", "\n   "))
    rid = rid_of(out)
    code, out = spawn("after_park", db, rid)
    print(f"\nprocess B (reload the parked run, add tester feedback, EXIT) exit code = {code}\n   " + out.replace("\n", "\n   "))
    code, out = spawn("finish", db, rid)
    print(f"\nprocess C (reload, human answers, run completes) exit code = {code}\n   " + out.replace("\n", "\n   "))
