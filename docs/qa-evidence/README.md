# QA evidence

Raw output behind [`../FULL_TEST_REPORT.md`](../FULL_TEST_REPORT.md), copied unedited from the QA run of
2026-09-19 against commit `e59038c`. Nothing here was hand-written or altered.

**[`generated-quizzes.md`](generated-quizzes.md) — all 13 model-generated study packs, readable.** Notes, questions,
options with the marked answer, explanations, source quotes, and the validator's real verdict on each. Extracted read-only
from the run databases; scripted fixture packs and hand-authored test inputs are excluded.

**Not included:** the per-test SQLite databases (1.6 MB, binary) and the Edge profile directories.

## logs/

| File | What it is | Label |
|---|---|---|
| `pytest_before.txt`, `pytest_after.txt` | `python -m pytest -v`: 343 passed, 4 skipped, 0 failed, both times | UNIT |
| `doctor_default.txt`, `doctor_ollama.txt` | `scripts/doctor.py` with defaults / `LLM_PROVIDER=ollama` | environment |
| `live_gen.txt` | study generator alone, real `llama3.1`, actual structured output | LIVE OLLAMA |
| `live_validator.txt` | validator cases A–F, real audit + code checks | LIVE OLLAMA |
| `live_revision.txt` | reject → structured feedback → revise → approve (v1 is a hand-authored flawed input) | LIVE OLLAMA |
| `live_scenario1.txt` | orchestrator scenario 1, full real pipeline | LIVE OLLAMA |
| `live_grounding.txt` | 5-fact source, per-question grounding | LIVE OLLAMA |
| `live_injection.txt` | 4 adversarial sources through the full pipeline | LIVE OLLAMA |
| `offline_1.txt` | fixture scenarios 1–5, revision-limit and bypass tests, fixture provider | FIXTURE |
| `offline_2.txt`, `offline_3.txt` | provider failure modes against a controlled fake server / closed port; whole-run failures | FAILURE-INJECTION |
| `persist.txt` | crash-and-continue and human-review persistence across real OS processes | FIXTURE + real processes |
| `frontend.txt` | 31 HTTP checks, real-browser run (23/23), 4 direct SQLite checks | FRONTEND |
| `frontend_run1_18of23.txt` | the **first** browser run, 18/23 (the 5 failures were case-sensitive assertions in the test, not the app) | FRONTEND |
| `frontend_live.txt` | real Edge → real server → real `llama3.1`, 16/16 | FRONTEND + LIVE OLLAMA |
| `demo_fixture.txt`, `demo_live.txt` | `scripts/demo_fixture.py`, `scripts/demo_live.py --provider ollama` | demo scripts |
| `cli_run.txt` | a CLI stub run used by the feedback CLI test | FIXTURE |
| `chain_log.txt` | start/end times of the live test chain | — |
| `llm_calls.jsonl` | **every real model call**: prompt messages, output, seconds, tokens | LIVE OLLAMA |

## screenshots-fixture/, screenshots-live-ollama/

Real PNGs captured from headless Microsoft Edge 153 during the browser tests (input page, run page, revision, trace,
saved feedback, human review; and the live run's loading state, final page, trace and feedback).

## harness/

The scripts that produced the logs. **They are reference material, not part of the test suite:** they use absolute
paths (`D:/projects/DeadLock`, the Edge install path) and write to a scratch directory (`QA_OUT`), so adjust those
before re-running. `qa_live.py` needs Ollama running with `llama3.1:latest`; the browser scripts need Edge and Node 22.
