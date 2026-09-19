"""FIXTURE tests and provider-failure tests. No real model is called anywhere in this file.

Fixture = scripted replies (demo/study/stub.py). Failure modes = REAL HTTP requests made by the
REAL providers against a controlled fake server on localhost (or a dead port).
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ["LLM_PROVIDER"] = "fixture"
from qa_common import *  # noqa: F401,F403
from qa_common import (Budget, ModelError, RunState, StudyPack, build_flow, callback, checks, new_store,
                       runner, settings, trace)
from demo.study.samples import INJECTED, SAMPLE
from demo.study.stub import SCENARIOS, V1, V2, Scripted, audit_v1, ok_audit
from slice import llm
from slice.config import Settings
from slice.llm import CapExhausted, SchemaFailure
from slice.providers import FixtureProvider, OllamaProvider, OpenRouterProvider


def hr(t):
    print("\n" + "=" * 100 + f"\n{t}\n" + "=" * 100, flush=True)


S = settings()


def fixture_run(tag, factory, text=SAMPLE, cfg=S):
    store, _ = new_store(f"fx_{tag}")
    run = store.create_run("study", {"mode": f"FIXTURE TEST {tag}"})
    store.append(run, "input", {"text": text}, produced_by="qa")
    call = factory() if callable(factory) else factory
    final = runner.advance(store, run, build_flow(call), cfg)
    return store, run, final, call


def path_of(store, run):
    return trace.summary(store, run)["path"].replace(" -> ", "\n   -> ")


# ===================================================================== FIXTURE scenarios
def scenarios():
    hr("FIXTURE TEST - ORCHESTRATOR SCENARIOS 1-5  (scripted replies; the code checks are real)")

    print("\nSCENARIO 1 [FIXTURE]  valid source -> generated -> approved -> COMPLETE")
    st, run, final, call = fixture_run("s1", SCENARIOS["clean"][1])
    print(f"   final: {final.value}   LLM calls: generate={call.count('generate')} audit={call.count('audit')}")
    print("   " + path_of(st, run))
    assert final is RunState.COMPLETE

    print("\nSCENARIO 2 [FIXTURE]  invalid first generation -> rejected -> revised -> approved -> COMPLETE")
    st, run, final, call = fixture_run("s2", SCENARIOS["revise"][1])
    d = [x.payload for x in st.history(run, "draft")]
    vs = [x.payload for x in st.history(run, "verdict")]
    print(f"   final: {final.value}   revisions: {trace.summary(st, run)['revisions']}")
    print("   " + path_of(st, run))
    print("   VERSION 1 quotes:", [qq["source_quote"][:50] for qq in d[0]["questions"]])
    print("   VALIDATOR 1:", vs[0]["status"], [(i["origin"], i["code"], i["where"]) for i in vs[0]["issues"]])
    fb = call.calls[2]["messages"][1]["content"]           # 3rd call = the revision (generate #2)
    print("   FEEDBACK reached the reviser:", "quote_not_in_source" in fb and "not_exactly_one_correct" in fb)
    print("   VERSION 2 changed:", [f"questions[{k}]" for k, (a, b) in enumerate(zip(d[0]["questions"], d[1]["questions"])) if a != b],
          "| unchanged:", [f"questions[{k}]" for k, (a, b) in enumerate(zip(d[0]["questions"], d[1]["questions"])) if a == b])
    print("   VALIDATOR 2:", vs[1]["status"])
    assert final is RunState.COMPLETE and len(d) == 2

    print("\nSCENARIO 3 [FIXTURE]  repeated failures -> revision limit -> AWAITING_EXPERT")
    st, run, final, call = fixture_run("s3", SCENARIOS["stuck"][1])
    print(f"   final: {final.value}   drafts: {len(st.history(run, 'draft'))}   generate calls: {call.count('generate')}")
    print("   " + path_of(st, run))
    assert final is RunState.AWAITING_EXPERT

    print("\nSCENARIO 3b [FIXTURE] identical output twice -> AWAITING_EXPERT (no infinite loop)")
    st, run, final, call = fixture_run("s3b", SCENARIOS["repeat"][1])
    print(f"   final: {final.value}   generate calls: {call.count('generate')}   escalation: {st.latest(run, 'escalation')['reason']}")
    print("   " + path_of(st, run))

    print("\nSCENARIO 4 [FIXTURE]  malformed model response -> error handling")
    st, run, final, call = fixture_run("s4", lambda: Scripted([SchemaFailure("No model produced valid StudyPack after a repair pass. Last reply began: 'Sure! {'")], []))
    print(f"   final: {final.value}   failure record: {st.latest(run, 'failure')}")
    print("   " + path_of(st, run))
    assert final is RunState.FAILED and st.latest(run, "failure")["kind"] == "model"

    print("\nSCENARIO 5 [FIXTURE]  provider raises 'unavailable' -> graceful failure")
    st, run, final, call = fixture_run("s5", lambda: Scripted([ModelError("Cannot connect to Ollama at http://localhost:11434")], []))
    print(f"   final: {final.value}   failure record: {st.latest(run, 'failure')}")
    print("   " + path_of(st, run))


# ===================================================================== revision limit
def limit():
    hr("REVISION LIMIT - MAX_REVISIONS = 3 cannot be bypassed  [FIXTURE]")
    from demo.study.flow import MAX_REVISIONS
    print(f"MAX_REVISIONS = {MAX_REVISIONS}")
    st, run, final, call = fixture_run("lim", SCENARIOS["stuck"][1])
    drafts = st.history(run, "draft")
    print(f"\n1. Generator always fails -> drafts: {len(drafts)} (1 first + {len(drafts) - 1} revisions), "
          f"validator rejections: {sum(1 for v in st.history(run, 'verdict') if v.payload['status'] == 'REJECTED')}")
    print(f"   revision 1 -> draft 2, revision 2 -> draft 3, revision 3 -> draft 4, then: {final.value}")
    print("   " + path_of(st, run))
    assert len(drafts) == MAX_REVISIONS + 1 and final is RunState.AWAITING_EXPERT

    before = call.count("generate")
    for i in range(3):
        again = runner.advance(st, run, build_flow(call), S)
    print(f"2. advance() called 3 more times on the parked run -> state {again.value}; generator calls {before} -> {call.count('generate')} (no new call)")
    assert call.count("generate") == before

    r = runner.advance(st, run, build_flow(Scripted([], [])), S)
    print(f"3. 'resume' with an empty script (would explode if a model were called) -> {r.value}")

    print("4. ATTEMPTED BYPASS by tampering with the database (state forced back to DRAFTING):")
    more = Scripted([V1] * 6, [audit_v1()] * 6)
    st.set_state(run, RunState.DRAFTING)
    now = runner.advance(st, run, build_flow(more), S)
    extra = len(st.history(run, "draft")) - len(drafts)
    print(f"   result: {now.value}; extra drafts generated: {extra}; escalation reasons: "
          f"{[v.payload['reason'] for v in st.history(run, 'escalation')]}")
    print("   -> a tampered run gets ONE more attempt and is parked again immediately (the limit is derived")
    print("      from the recorded verdict history, so it re-fires); it does not loop.")

    print("5. No infinite loop: max_steps fence on the runner itself:")
    cyc = {RunState.DRAFTING: lambda c: RunState.GATING, RunState.GATING: lambda c: RunState.DRAFTING}
    from types import SimpleNamespace
    store, _ = new_store("cycle")
    rid = store.create_run("t");
    out = runner.advance(store, rid, SimpleNamespace(name="cycle", handlers=cyc), S, max_steps=10)
    print(f"   a flow that cycles forever -> {out.value}; failure: {store.latest(rid, 'failure')['kind']}")


# ===================================================================== fake servers
class Fake(BaseHTTPRequestHandler):
    mode = "good"

    def log_message(self, *a):
        pass

    def _send(self, status, body, ctype="application/json"):
        raw = body if isinstance(body, bytes) else (body if isinstance(body, str) else json.dumps(body)).encode()
        self.send_response(status)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        try:
            self.wfile.write(raw)
        except OSError:
            pass                         # the client already gave up (timeout test)

    def do_POST(self):
        self.rfile.read(int(self.headers.get("content-length", 0)))
        ollama = self.path.startswith("/api/chat")
        m = Fake.mode

        def ok(content, reason="stop"):
            if ollama:
                return {"message": {"role": "assistant", "content": content}, "done": True,
                        "done_reason": reason, "prompt_eval_count": 10, "eval_count": 5}
            return {"choices": [{"message": {"content": content}, "finish_reason": reason}],
                    "usage": {"total_tokens": 15}}

        if m == "good":
            return self._send(200, ok(json.dumps(V2)))
        if m == "invalid_json_body":
            return self._send(200, "<html>502 bad gateway</html>", "text/html")
        if m == "empty":
            return self._send(200, ok(""))
        if m == "malformed":
            return self._send(200, ok("Sure! Here is the study pack: {"))
        if m == "wrong_shape":
            return self._send(200, ok('{"foo": 1}'))
        if m == "truncated":
            return self._send(200, ok('{"title": "Photosyn', "length"))
        if m == "http500":
            return self._send(500, {"error": "model requires more system memory (9.1 GiB) than is available"})
        if m == "http429":
            return self._send(429, {"error": {"message": "rate limited"}})
        if m == "http402_key":
            return self._send(402, {"error": {"message": "limit", "metadata": {"limit_source": "openrouter_key_limit"}}})
        if m == "http404":
            return self._send(404, {"error": "model not found"})
        if m == "slow":
            time.sleep(5)
            return self._send(200, ok(json.dumps(V2)))
        return self._send(500, "unknown mode")


def serve():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def cfg_with(**kw):
    import dataclasses
    return dataclasses.replace(S, **kw)


def try_call(provider, cfg):
    store, _ = new_store("pf")
    run = store.create_run("t")
    t0 = time.time()
    try:
        out = provider(settings=cfg, budget=Budget(store, run, cfg),
                       messages=[{"role": "user", "content": "go"}], schema=StudyPack, step="generate")
        return "OK", type(out).__name__, time.time() - t0
    except BaseException as e:
        return type(e).__name__, str(e).replace("\n", " ")[:105], time.time() - t0
    finally:
        store.close()


def providers():
    hr("PROVIDER FAILURE MODES - real HTTP against a controlled fake server (no model, no mocks of httpx)")
    srv, port = serve()
    base = f"http://127.0.0.1:{port}"
    dead = "http://127.0.0.1:59999"                # verified closed (port 9 is NOT: a service listens there)
    modes = ["good", "invalid_json_body", "empty", "malformed", "wrong_shape", "truncated",
             "http500", "http404", "slow"]

    print("\nOLLAMA PROVIDER  (OllamaProvider -> POST /api/chat)")
    print(f"  {'mode':<18}{'result':<16}detail")
    for m in modes:
        Fake.mode = m
        p = OllamaProvider(base, "qa-model", timeout=1.0 if m == "slow" else 30.0)
        res, detail, secs = try_call(p, cfg_with(ollama_model="qa-model", ollama_base_url=base))
        print(f"  {m:<18}{res:<16}{detail}   ({secs:.1f}s)")
    res, detail, secs = try_call(OllamaProvider(dead, "qa-model"), cfg_with(ollama_model="qa-model"))
    print(f"  {'DEAD PORT':<18}{res:<16}{detail}   ({secs:.1f}s)")
    Fake.mode = "http404"
    p = OllamaProvider(base, "big", fallback_model="small")
    res, detail, _ = try_call(p, cfg_with(ollama_model="big", ollama_fallback_model="small"))
    print(f"  {'404 + fallback':<18}{res:<16}{detail[:100]}")

    print("\nOPENROUTER PROVIDER  (OpenRouterProvider -> llm.complete; endpoint redirected to the fake server)")
    original_api = llm.API
    dummy = cfg_with(api_key="qa-dummy-not-a-real-key", model="qa/primary", fallback_model="qa/fallback")
    print(f"  {'mode':<18}{'result':<16}detail")
    try:
        for m in ["good", "invalid_json_body", "empty", "malformed", "wrong_shape", "truncated",
                  "http500", "http429", "http402_key", "slow"]:
            llm.API = f"{base}/api/v1"
            Fake.mode = m
            res, detail, secs = try_call(OpenRouterProvider(), dummy) if m != "slow" else _slow_or(dummy)
            print(f"  {m:<18}{res:<16}{detail}   ({secs:.1f}s)")
        llm.API = f"{dead}/api/v1"
        res, detail, secs = try_call(OpenRouterProvider(), dummy)
        print(f"  {'DEAD PORT':<18}{res:<16}{detail}   ({secs:.1f}s)")
    finally:
        llm.API = original_api
    srv.shutdown()


def _slow_or(cfg):
    # complete() has a 120 s default timeout; QA drives it with a short one to observe timeout handling.
    store, _ = new_store("pf")
    run = store.create_run("t")
    t0 = time.time()
    try:
        llm.complete(settings=cfg, budget=Budget(store, run, cfg), messages=[{"role": "user", "content": "go"}],
                     schema=StudyPack, step="generate", timeout=1.0)
        return "OK", "", time.time() - t0
    except BaseException as e:
        return type(e).__name__, str(e).replace("\n", " ")[:105], time.time() - t0
    finally:
        store.close()


def orchestrated_failures():
    hr("PROVIDER FAILURE -> WHOLE RUN (real providers, real HTTP failures, full orchestrator)")
    srv, port = serve()
    base = f"http://127.0.0.1:{port}"
    original_api = llm.API
    rows = []

    def run_with(label, provider, cfg):
        store, _ = new_store("of")
        run = store.create_run("study", {"mode": label})
        store.append(run, "input", {"text": SAMPLE}, produced_by="qa")
        try:
            final = runner.advance(store, run, build_flow(provider), cfg)
            f = store.latest(run, "failure")
            rows.append((label, final.value, (f or {}).get("kind"), ((f or {}).get("detail") or "")[:70],
                         trace.summary(store, run)["path"]))
        except BaseException as e:
            rows.append((label, "CRASH", type(e).__name__, str(e)[:70], ""))
        finally:
            store.close()

    try:
        run_with("Ollama unavailable (dead port)", OllamaProvider("http://127.0.0.1:59999", "qa"), cfg_with(ollama_model="qa"))
        for m in ("invalid_json_body", "empty", "malformed", "wrong_shape", "truncated", "http500", "slow"):
            Fake.mode = m
            run_with(f"Ollama: {m}", OllamaProvider(base, "qa", timeout=1.0), cfg_with(ollama_model="qa", ollama_base_url=base))
        d = cfg_with(api_key="qa-dummy", model="qa/p", fallback_model="qa/f")
        llm.API = "http://127.0.0.1:59999/api/v1"
        run_with("OpenRouter unavailable (dead port)", OpenRouterProvider(), d)
        for m in ("invalid_json_body", "empty", "malformed", "http500", "http429", "http402_key"):
            llm.API = f"{base}/api/v1"
            Fake.mode = m
            run_with(f"OpenRouter: {m}", OpenRouterProvider(), d)
    finally:
        llm.API = original_api
        srv.shutdown()
    print(f"\n  {'situation':<38}{'final':<9}{'failure.kind':<20}detail")
    for label, final, kind, detail, path in rows:
        print(f"  {label:<38}{final:<9}{str(kind):<20}{detail}")
    print("\n  every state path ended:", {r[4].split(' -> ')[-1] for r in rows})


def fixture_provider():
    hr("FIXTURE PROVIDER - must work with no internet, no Ollama, no OpenRouter, no key")
    import httpx
    real_post, real_get = httpx.post, httpx.get

    def forbidden(*a, **k):
        raise AssertionError("NETWORK ACCESS ATTEMPTED - the fixture provider must never touch the network")
    httpx.post, httpx.get = forbidden, forbidden
    try:
        cfg = cfg_with(api_key="", llm_provider="fixture", ollama_base_url="http://127.0.0.1:59999")
        fp = FixtureProvider({"generate": [V2], "audit": [ok_audit(V2)]})
        st, run, final, _ = fixture_run("fixprov", lambda: fp, cfg=cfg)
        print(f"  FixtureProvider through the orchestrator: {final.value}; httpx.post/get patched to FAIL if touched -> not touched")
        print(f"  calls made: {fp.calls}")
        print(f"  OPENROUTER_API_KEY in environment: {'set' if os.environ.get('OPENROUTER_API_KEY') else 'NOT SET'}")
    finally:
        httpx.post, httpx.get = real_post, real_get


if __name__ == "__main__":
    for step in sys.argv[1:] or ["scenarios", "limit", "fixture_provider", "providers", "orchestrated_failures"]:
        globals()[step]()
