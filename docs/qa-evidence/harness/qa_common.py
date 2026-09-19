"""QA harness helpers. Lives in the scratchpad; the repository is not modified.

Nothing here decides a verdict. A `Recorder` wraps the REAL provider and logs every call;
`validator_only` starts a run at GATING with a hand-authored draft (a labelled test INPUT)
so the real validator handler judges it while the generator is switched off.
"""
import json
import os
import re
import sys
import time

REPO = "D:/projects/DeadLock"
OUT = os.environ.get("QA_OUT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "qa"))
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, REPO)
os.environ.setdefault("LLM_PROVIDER", "ollama")

from demo.study import checks, trace                                   # noqa: E402
from demo.study.flow import (_generator_settings, _validator_settings,  # noqa: E402
                             build_audit_messages, build_flow, build_generate_messages)
from demo.study.schema import Audit, StudyPack                         # noqa: E402
from slice import callback, runner                                     # noqa: E402
from slice.budget import Budget                                        # noqa: E402
from slice.config import settings                                      # noqa: E402
from slice.llm import ModelError                                       # noqa: E402
from slice.providers import get_provider                               # noqa: E402
from slice.records import RunState                                     # noqa: E402
from slice.store import Store                                          # noqa: E402

# The source the QA brief specifies (29 words).
G = ("Photosynthesis is the process by which green plants convert light energy into chemical "
     "energy. Chlorophyll absorbs light energy. Carbon dioxide and water are used to produce "
     "glucose and oxygen.")

LOG = os.path.join(OUT, "llm_calls.jsonl")


class Recorder:
    """Wraps a real provider. Logs every call - step, model, seconds, tokens, output."""

    def __init__(self, real, tag, block_generate=False):
        self.real, self.tag, self.block_generate = real, tag, block_generate
        self.calls = []

    def __call__(self, *, settings, budget, messages, schema=None, model=None,
                 step="call", timeout=120.0):
        if self.block_generate and step == "generate":
            raise ModelError("QA harness: generator disabled for a validator-only test")
        t0, tok0 = time.time(), budget.tokens_used()
        entry = {"tag": self.tag, "step": step, "model": settings.ollama_model,
                 "messages": messages, "at": time.strftime("%H:%M:%S")}
        try:
            out = self.real(settings=settings, budget=budget, messages=messages,
                            schema=schema, model=model, step=step, timeout=timeout)
        except BaseException as e:
            entry.update(error=f"{type(e).__name__}: {e}"[:300], seconds=round(time.time() - t0, 1))
            self._log(entry)
            raise
        entry.update(seconds=round(time.time() - t0, 1), tokens=int(budget.tokens_used() - tok0),
                     output=out.model_dump() if hasattr(out, "model_dump") else out)
        self._log(entry)
        return out

    def _log(self, entry):
        self.calls.append(entry)
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def last(self, step):
        return next((c for c in reversed(self.calls) if c["step"] == step and "output" in c), None)


def new_store(name):
    path = os.path.join(OUT, f"{name}.db")
    for suffix in ("", "-wal", "-shm"):
        if os.path.exists(path + suffix):
            os.remove(path + suffix)
    return Store(path), path


def q(question, options, answer, why, quote):
    return {"question": question, "options": options, "answer": answer,
            "explanation": why, "source_quote": quote}


NOTES_OK = ["Green plants convert light energy into chemical energy through photosynthesis.",
            "Chlorophyll absorbs the light energy that drives the process.",
            "Carbon dioxide and water are used to produce glucose and oxygen."]
Q1 = q("What does chlorophyll do during photosynthesis?",
       ["It absorbs light energy", "It produces glucose from oxygen", "It stores carbon dioxide",
        "It releases water"], "A", "Chlorophyll absorbs light energy, which drives photosynthesis.",
       "Chlorophyll absorbs light energy.")
Q2 = q("Which two substances are used to produce glucose and oxygen?",
       ["Nitrogen and water", "Glucose and oxygen", "Carbon dioxide and water",
        "Chlorophyll and oxygen"], "C",
       "The source states that carbon dioxide and water are used to produce glucose and oxygen.",
       "Carbon dioxide and water are used to produce glucose and oxygen.")
Q3 = q("Into what form of energy do green plants convert light energy?",
       ["Heat energy", "Chemical energy", "Sound energy", "Nuclear energy"], "B",
       "Green plants convert light energy into chemical energy.",
       "green plants convert light energy into chemical energy")


def pack(notes=None, qs=None, title="Photosynthesis"):
    return {"title": title, "notes": list(notes or NOTES_OK), "questions": list(qs or [Q1, Q2, Q3])}


def validator_only(tag, source, pack_dict):
    """Run the REAL validator handler (real Ollama audit + real code checks) on a
    hand-authored draft. The generator is switched off, so a rejection ends the run."""
    cfg = settings()
    rec = Recorder(get_provider(cfg), tag, block_generate=True)
    store, _ = new_store(f"val_{tag}")
    run = store.create_run("study", {"mode": f"QA validator-only: {tag}"})
    store.append(run, "input", {"text": source}, produced_by="qa")
    store.append(run, "draft", pack_dict, produced_by="qa:hand-authored-test-input")
    store.set_state(run, RunState.GATING)
    final = runner.advance(store, run, build_flow(rec), cfg)
    verdict = store.history(run, "verdict")[0].payload
    audit = rec.last("audit")
    out = {"tag": tag, "final_state": final.value, "verdict": verdict,
           "audit": audit["output"] if audit else None,
           "seconds": audit["seconds"] if audit else None,
           "failure": store.latest(run, "failure")}
    store.close()
    return out


def show_verdict(r):
    v = r["verdict"]
    print(f"   VERDICT: {v['status']}   ({len(v['issues'])} issue(s); audit took {r['seconds']}s)")
    for i in v["issues"]:
        print(f"     - [{i['origin']}] {i['where']} {i['code']}: {i['detail'][:150]}")
    for w in v.get("warnings", []):
        print(f"     ! warning: {w}")
    a = r["audit"]
    if a:
        letters = ["".join(qa["supported"]) or "-" for qa in a["questions"]]
        print(f"   auditor raw: notes_faithful={a['notes_faithful']}  supported={letters}  "
              f"clear={[qa['clear'] for qa in a['questions']]}  "
              f"explanation_valid={[qa['explanation_valid'] for qa in a['questions']]}  "
              f"injection_quote={a['injection_quote']!r}")
