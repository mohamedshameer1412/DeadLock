# Pre-Event Assets

This is a declaration of everything brought into the Agent-a-thon from before 19 September 2026. Anything not listed here was written during the event.

Product: **Nexus** (Python package `studyhub`), an AI study and assessment platform. Backend in FastAPI and SQLite (`studyhub/`), web app in Next.js (`frontend/`).

## 1. Prior Code

### 1.1 Starter kit (the base of this repository)

- Forked from https://github.com/rsimhan/agentic-slice-kit
- Working repository: https://github.com/mohamedshameer1412/DeadLock
- What the starter provides (`slice/`), used unchanged or lightly changed unless noted:

| File | Purpose |
|---|---|
| `slice/runner.py` | State-machine orchestration of a run |
| `slice/store.py` | SQLite persistence: runs, append-only versions, state |
| `slice/llm.py`, `slice/providers.py` | Model calls: OpenRouter and Ollama providers, JSON output, timeouts |
| `slice/budget.py` | Token and call budget with retries |
| `slice/retrieve.py` | Chunk, embed and search inside the run database (sqlite-vec, fastembed). Kept from the starter; Nexus searches its own material with SQLite full-text search in `studyhub/retrieval.py` |
| `slice/callback.py`, `slice/records.py` | Expert callback and typed records |
| `slice/config.py` | Settings from environment / `.env` (small change: not read under pytest) |
| `tests/test_budget.py`, `test_store.py`, `test_runner.py`, `test_providers.py`, `test_callback.py`, `test_architecture.py`, `test_smoke.py`, `test_integration.py` | The starter's automated tests |
| `corpus/`, `demo/SPEC-SAMPLE.md` | The starter's sample corpus and spec sample (not used by Nexus itself) |

- **`tracer` example from the starter kit, ported into Nexus** (the starter's `tracer/agents.py`, `tracer/flow.py` and its `spot`/`gate` prompts):
  - `studyhub/quiz_agents.py`: question-generator and answer-evaluator agents (prompt templates mirror the tracer's `spot.md` and `gate.md`; provider call and safe fallback pattern).
  - `studyhub/quiz_flow.py`: the quiz state machine (questioning, evaluating, backward pass, complete) made stateless for the web (state kept in `quiz_attempts`).
  - Later, the owner asked for multiple-choice-only quizzes, so the open-ended spot/gate path is no longer used by the web UI. The state machine still creates and stores quiz attempts.

### 1.2 Earlier project: `ai_learnmate` (adaptive learning and proctored quizzes)

A Django / DRF / Celery / Channels project with a React frontend and machine-learning models. It is **not included in this repository**. Only the rules and data shapes listed under "Used" were carried over, and the code was rewritten in Python and SQLite (no files copied).

| File in `ai_learnmate` | What it does there | Used in Nexus? |
|---|---|---|
| `backend/quiz/models.py`: `QuizSession` (fields for tab switches, full-screen exits, average response time, behaviour score) | One quiz attempt with behaviour counters | **Used**: the same fields on `quiz_attempts` (`studyhub/db.py`, migration 6) and the behaviour score in `studyhub/scoring.py` |
| `backend/quiz/models.py`: `Response.save()` (lines ~271–313) | Per-answer record with `hesitation_count`, `confidence_level` from response time and hesitation (0.9 / 0.7 / 0.5 / 0.3 bands) | **Used**: the same fields on `attempt_answers` and the same rule in `studyhub/scoring.py` `compute_confidence`. The main topic confidence shown to students is a new IRT model (see section 6), not this rule |
| `backend/proctoring/models.py`: `ProctoringEvent` | Proctoring event types with severity scores (tab switch 60, full-screen exit 30, and so on) | **Used**: event types and severity scale in `studyhub/scoring.py` `SEVERITY` and the `quiz_proctoring_events` table. Copy, paste and resize values are ours. The camera face check (no face, several faces) is new work, not from `ai_learnmate` |
| `backend/users/mastery_views.py` (mastered at 0.7) and `backend/analytics/views.py` (weak below 0.4) | Mastery vector and weak-topic thresholds | **Used**: thresholds 0.70 / 0.40 and the "at least 2 answers" rule in `studyhub/scoring.py` (topic `mastered` / `learning` / `weak`) |
| `backend/users/learning_dna_views.py` | Onboarding diagnostic and learning profile | **Same idea only**: our experience-level prompt and mixed-difficulty diagnostic were built new |
| `backend/ml_engine/weak_topic_predictor.py` (RandomForest), `performance_predictor.py` (XGBoost), `engagement_detector.py` (Keras), `train_models.py`, `ml_models/*.pkl`, `ML_data/*.csv` | Trained models and their training data | **Not used.** No model file or dataset was brought in. Nexus has no trained model: its risk score is a plain formula |
| `backend/quiz/ai_generator.py`, `utils/gemini_service.py`, `quiz/text_grader.py` | Gemini-based question generation and grading | **Not used.** Prompts and pipelines were written new for OpenRouter and Ollama, with a code-side verifier |
| `backend/quiz/pdf_parser.py`, `utils/ocr_processor.py`, `quiz/pdf_generator.py` | PDF parsing, OCR, PDF output | **Not used** (Nexus reads files with `pypdf` / `python-docx` in `studyhub/extract.py`) |
| Django, DRF, Celery (`quiz/tasks.py`), Channels (`quiz/consumers.py`), the React frontend | Web stack | **Not used** |

### 1.3 Earlier project: `JobGenie` (AI career assistant)

A Django backend with a Next.js frontend: resume and job matching, skill-gap analysis, career roadmap, alerts. **Not included in this repository.** Ideas and flows were rebuilt for studying; no source files were copied, and it used a different model provider and a jobs database.

| File in `JobGenie` | What it does there | Used in Nexus? |
|---|---|---|
| `backend/jobs/ai_views.py`: `skill_gap` (line ~193) | Compares a user's skills with a job's required skills, lists missing skills and "build a mini project using X" suggestions | **Idea used**: `studyhub/roadmap.py` (skill gaps per topic, from every kind of test) and `studyhub/career.py` (job description, skills, gaps, next steps with project suggestions) |
| `backend/jobs/ai_views.py`: `career_roadmap` (line ~531) and `jobs/models.py` `CachedRoadmap` | Weekly/monthly learning plan with milestones and mini projects; result cached and refreshed when the profile changes | **Idea used**: the weekly roadmap with milestones and mini-projects in `studyhub/roadmap.py`; the "changes when the inputs change" hash (`plan_hash`) that marks the coach paragraph stale |
| `backend/accounts/ats_scoring.py`: `calculate_ats_match` | A match score between a resume and a job description | **Idea used**: the "match to target" readiness score (`roadmap.py`) and the weighted readiness against a job description (`career.py` `score`) |
| `backend/accounts/otp_service.py`, `PasswordResetOTP` model, frontend `forgot-password` and `reset-password` pages | E-mail one-time-code password reset | **Flow used**: `studyhub/otp.py`, `mailer.py`, `mail_templates.py`, `frontend/app/(auth)/forgot-password`. Rewritten with keyed hashing of the code, try limits, cooldowns and per-address/per-network limits, which the original did not have |
| `backend/accounts/cache_manager.py`, `local_nlp.py` | Cache and local text matching to cut paid API calls | **Same motive only**: local-first models for simple checks and per-task model order in `studyhub/models.py` |
| `backend/alerts/`, `accounts/notification_service.py` | Alerts and notifications | **Same spirit only**: the weekly summary e-mail in `studyhub/digest.py` |
| `backend/jobs/services/ai_engine.py` (embeddings), job sync (`adzuna_client.py`, `dic_scraper.py`), resume files (`resume_ai.py`, `resume_parser.py`, `section_optimizer.py`, `summary_generator.py`, `page_control.py`), `link_validation.py`, `push_service.py` | Job search, resume tools, push | **Not used** |

### 1.4 UI template: `src.zip` (sign-in and sign-up screen)

A Next.js template supplied by the team before the event, kept in the repository root as `src.zip`. It contains `src/app/page.js` (a split-screen login and register page with a sliding switch, built with `framer-motion` and `lucide-react`), `src/app/globals.css` (its styles), `src/app/layout.js` and `favicon.ico`. It was a front-end demonstration only (it validated the form and showed an alert); it had no backend calls.

- **Used:** the layout, the look and the sliding animation, re-built as `frontend/components/nexus/auth-shell.jsx`, `auth-screen.jsx`, `auth-fields.jsx` and `frontend/app/(auth)/auth.css` (class names prefixed `au-`). The same frame now also carries the password-reset page.
- **Added by us at the event:** real sign-in and sign-up against the API with email as the login, username, field validation, password strength and Caps Lock hints, error handling, keyboard and screen-reader support, reduced-motion support, mobile layout, and brand text that describes what Nexus really does.
- **Not used:** its `layout.js` (Geist fonts and the default Next.js metadata), the "Remember me" box (sessions have a fixed lifetime here), and the placeholder terms and forgot-password alerts.

## 2. Prior Prompts / Agent Definitions

- The starter kit's demo prompts and workflow, and the `tracer` `spot` and `gate` prompts, used as the base for `studyhub/quiz_agents.py` (see 1.1).
- `ai_learnmate` and `JobGenie` contain Gemini prompts. **None were reused**: every prompt in `studyhub/qa.py`, `mcq.py`, `roadmap.py`, `career.py`, `tutor.py` was written during the event.
- No production agent was developed specifically for this Agent-a-thon before the event.

## 3. Evaluation Sets

- No project-specific evaluation dataset was prepared before the event. The evaluation questions, sample materials (`data/sample-materials/`) and the model bake-off (`scripts/agent_bakeoff.py`, `docs/studyhub-evidence/agents/`) were written during the event.
- The training and sample data in `ai_learnmate` (`ML_data/`) were **not** used.

## 4. Datasets and External Assets

- No dataset was gathered before the event.
- Third-party files bundled in the repository:
  - `frontend/public/mediapipe/blaze_face_short_range.tflite` and `frontend/public/mediapipe/wasm/`: Google MediaPipe face detector model and runtime (Apache-2.0), served locally. Used for the assessment camera check.
  - A public-domain astronaut portrait from the `scikit-image` test data, used only by the test helper `frontend/scripts/make-face-video.py` to fake a webcam. Not shipped in the app.
  - `frontend/public/logo.png`: the team's own logo.
- Models run, not bundled: local **Ollama** `llama3.1` 8B (Q4_K_M) and six **OpenRouter** models on an allow-list in `studyhub/models.py` (`qwen/qwen3.7-flash`, `openai/gpt-oss-120b`, `deepseek/deepseek-v4-flash-0731`, `z-ai/glm-5.3-flash`, `mistralai/mistral-small-3.2-24b-instruct`, `inclusionai/ling-3.0-flash`).

## 5. Libraries and Tools

Beyond the obvious (Python, Pydantic, HTTPX, SQLite, FastAPI, Pytest, OpenRouter API):

- Python: `sqlite-vec`, `fastembed` (starter kit), `uvicorn`, `python-multipart`, `pypdf`, `python-docx`. Standard library only for e-mail (`smtplib`), hashing and the web fetcher.
- Frontend: Next.js 15, React 19, Tailwind CSS, `framer-motion` (from the `src.zip` template), Radix UI primitives, TanStack Query, react-hook-form, zod, sonner, lucide-react, class-variance-authority, clsx, tailwind-merge, `@mediapipe/tasks-vision`.
- Testing tools: Playwright, axe-core, Vitest, Testing Library, ESLint.
- Services: Ollama (local models), OpenRouter (cloud models), Gmail SMTP (verification and reset codes).

## 6. Event Work

Everything below was written during the Agent-a-thon and is not from the projects above:

- Cited question answering with a code-side verifier (every quote must be verbatim in the uploaded material): `studyhub/qa.py`, `citations.py`, `retrieval.py`.
- Practice-question generation with verification and an independent solver: `studyhub/mcq.py`.
- Topic-wise confidence with a Bayesian three-parameter IRT model, adaptive question choice, backtracking, revision and diagnostic quizzes: `studyhub/insights.py`.
- Skill gaps, weekly roadmap, coach paragraph, what-if simulator, risk score and learning debt, self-check: `studyhub/roadmap.py`, `foresight.py`.
- Career goals from a job description: `studyhub/career.py`.
- Learner twin, error patterns, drift, past-paper weighting, worked examples, improvement loop and planner: `studyhub/twin.py`, `patterns.py`, `tutor.py`.
- Measured model routing between OpenRouter and Ollama: `studyhub/models.py`, `scripts/agent_bakeoff.py`, `docs/OLLAMA-VS-OPENROUTER.md`.
- Accounts, sessions, e-mail codes, safe web fetcher, secret scanner: `studyhub/auth.py`, `otp.py`, `webfetch.py`, `scripts/scan_secrets.py`.
- The Next.js web app in `frontend/`, with the assessment integrity checks (tab switch, full screen, camera).
- About 1,000 automated tests in `tests/`.
