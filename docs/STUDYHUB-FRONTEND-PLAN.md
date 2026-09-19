# StudyHub frontend plan: the flow from start to end

What a student sees and does, screen by screen, what is built, and what is left. Based on the routes and pages in the code on
2026-09-20 and on [STUDYHUB-DESIGN.md](STUDYHUB-DESIGN.md).

**Status legend:** ✅ built and tested in a real browser · 🟡 built, **not** browser-tested or not reviewed (the quiz screens: written by
another agent, uncommitted, fixed for answer integrity and CSP on 2026-09-20 but never opened in Edge) · ⬜ planned, not built.

## 1. Design rules (do not break these)

| Rule | Why |
|---|---|
| **Server-rendered HTML, plain forms, POST then redirect.** No SPA, no React, no build step. | Small, testable, safe; the owner asked for no animations or frameworks. |
| **No JavaScript, except one nonce-guarded script on the quiz question page.** Every other page is sent with `script-src 'none'`. | Escaping is the first defence, the CSP is the second. Do not loosen the site-wide policy again. |
| **Every state-changing request carries the session CSRF token** (a hidden `csrf` field, or the `X-CSRF-Token` header for the quiz script). | A page on another site must not be able to act for the student. |
| **Somebody else's page is a 404, never a 403.** | Existence is not leaked. |
| **Everything the student or a model wrote is escaped.** Model output is data. | Stored XSS. |
| **Long work runs in the background;** the page says "working" and refreshes itself every 4 s (`<meta refresh>`). | A local model takes 10 s to several minutes. |
| **Nothing is invented on screen.** No model → the page says so and shows the student's own passages; an answer shows its quote and source. | The product's core promise. |
| One column, `max-width` 44 rem, CSS variables for light and dark, ≥16 px text, 16 px side gutters, works at 375 px. | Phones and small windows. |

## 2. Site map

| Screen | Route | Status |
|---|---|---|
| Home (redirect only) | `GET /` → `/subjects` or `/login` | ✅ |
| Register / Log in / Log out | `/register`, `/login`, `POST /logout` | ✅ |
| Subjects list + create | `GET/POST /subjects` | ✅ |
| **Subject hub** | `GET /subjects/{id}` (+ `/edit`, `/delete`) | ✅ (but see gap G1) |
| Upload material | `POST /subjects/{id}/materials` | ✅ |
| Material view / remove | `/subjects/{id}/materials/{doc}` (+ `/delete`) | ✅ |
| Search | `GET /subjects/{id}/search?q=` | ✅ |
| Ask a question → answer page | `POST /ask`, `GET /questions/{id}` (+ `/feedback`, `/delete`) | ✅ |
| Generate MCQs → job page | `POST /mcq/generate`, `GET /mcq/jobs/{id}` | ✅ |
| Question bank | `GET /mcq` (`?topic=`) (+ `/mcq/{id}/delete`) | ✅ |
| Quiz home | `GET /quiz` | 🟡 |
| Quiz start | `POST /quiz/start` | 🟡 |
| Quiz question page | `GET /quiz/attempt/{id}` , `POST …/answer` | 🟡 |
| Diagnostic (open answer) | same page, `POST …/diagnostic/answer` | 🟡 |
| Prerequisite check (step back / retry) | `GET/POST …/callback` | 🟡 |
| Quiz result | `GET /quiz/result/{id}` | 🟡 |
| Progress dashboard + prerequisite editor | `GET /progress`, `POST /prereq/set`, `POST /prereq/delete` | 🟡 |
| Account (cloud consent) | `GET /account`, `POST /account/cloud` | ✅ |
| Web URL as material | (new form in the Materials section) | ⬜ |
| Per-topic detail page | `GET /subjects/{id}/topics/{tid}` | ⬜ |

## 3. Shared layout and components

- **Header** on every signed-in page: `StudyHub` (→ subjects) · `Account` · `Signed in as <name>` · `Log out` (a POST form).
- **Back link** at the top of every inner page (`← Subject name`); no other breadcrumb.
- **Components** (already in `ui.py`): `.card`, `.note` (small grey), `.warn` (amber), `.error` (red, `role=alert`), `.badge`, `blockquote` (evidence),
  `<details>` (progressive disclosure, no JS), `<mark>` (search hits), `.step` (log lines), `.btn`, `.btn-sec`, `.btn-bad`.
- **Empty state** on every list: one sentence saying what to do next ("No materials yet. Upload a PDF…").
- **Feedback after an action:** redirect to the page that shows the result; validation problems re-render the same page with HTTP 400 and an
  `.error` box that keeps what the student typed.

## 4. The journey, start to end

### Stage 1 — Arrive, register, log in ✅
1. Visitor opens `/` → redirected to **/login** (or /subjects if already signed in).
2. **/register**: username (3–32, lowercase letters/digits/. - _), password (8–128), repeat. Errors: taken, weak, mismatch. Success → session cookie → **/subjects**.
3. **/login**: one generic error for wrong user or wrong password; after 5 failures the account is locked 15 min ("Too many attempts").
4. Session lasts 7 days; an expired or logged-out cookie sends the student to /login.

### Stage 2 — Subjects ✅
- **/subjects** lists the student's subjects (name, description). A form creates one (name ≤ 80, description ≤ 500; duplicate name refused).
- Unlimited subjects. Each subject is a separate world: its own materials, questions, MCQs, quizzes, progress.

### Stage 3 — The subject hub ✅ (navigation gap G1)
Top to bottom today: title and description → **Ask a question** (+ recent questions) → **Multiple-choice questions** (generate form + link to the bank)
→ **Materials** (list, topics found, upload form, search box) → a placeholder card "Quizzes and progress: arrive in the next phases" → rename → delete (checkbox confirm).

### Stage 4 — Upload material ✅ (URLs ⬜)
1. Choose a PDF, DOCX or TXT (≤ 20 MB) → Upload.
2. Lands on the **material page**: title, type, pages, passage count, and a list of passages with heading and **PDF page**.
3. Warnings shown as amber boxes on the page and in the list: scanned PDF (no OCR, 0 passages), PDF without bookmarks (one topic),
   passages that read like instructions to an AI (quarantined, never used for answers), non-UTF-8 text.
4. Refusals (HTTP 400 on the hub): wrong type, empty, too large (413), subject full. Same file again → "already in this subject".
5. Remove material: button on the material page; its passages leave search, answers and question generation.
6. ⬜ **Web URL**: a text field next to the file input; states: fetching, fetched (same material page), blocked address (private/loopback), too large, timeout.

### Stage 5 — Search ✅
Search box (hub and search page). Results: strong matches first with matched words highlighted, document · section · PDF page; weaker matches labelled
"may not be about your topic"; nothing found → "Nothing is guessed".

### Stage 6 — Ask a question, get an explainable answer ✅
1. The Ask form appears only when the subject has material. Question 3–500 characters; at most 2 waiting per student.
2. **Working page** (refreshes itself): "Reading your materials and writing an answer…".
3. **Answer page** (the anatomy is fixed):
   `question` · status badge · **Answer** (numbered statements with `[1]` markers) · **Sources and evidence** (file · section · PDF page, the exact quote,
   "✓ found in your material") · **Explanation, step by step** (labelled as the model's reasoning) · **Verification** (ticked list of what the app checked) ·
   who wrote it · **This helped / This looks wrong** · **How this was produced** (collapsed log) · Delete.
4. Other outcomes, each with its own badge and text: **Not answered: nothing was guessed** (with closest passages, verbatim); **No model:
   matching passages only**; **Your materials disagree** (both sides, each with its quote); **Something went wrong**.
5. History: the 8 most recent questions on the hub, with their status.

### Stage 7 — Generate multiple-choice questions ✅
1. Form: topic (Whole subject or one topic) + count 1–10 → **Generate questions**.
2. **Job page** (refreshes): "Reading your materials and writing questions…" (a few minutes locally).
3. Finished: "Finished: N of M questions kept", the reason if fewer, the number of candidates rejected, the new questions, and a collapsed log.
4. **Question card:** stem, options A–D, and a closed **Show answer and source** section holding the answer letter and text, the explanation, the
   exact quote with its source and two ticks (found in the material; confirmed by an independent reader).
5. **Bank** (`/mcq`): all questions, topic filter links, delete per question.

### Stage 8 — Take a quiz 🟡
1. **Quiz home** (`/quiz`): topic choice, question count available, **Start quiz**, weak topics, recent attempts. *Needs the gaps below.*
2. **Question page:** one MCQ at a time from the queue, progress bar (answered/total, correct), submit. The page script (nonce-guarded) measures
   response time and answer changes and reports tab switches, full-screen exits and copy/paste to the server, with the session token.
3. When the MCQs are done, the **diagnostic**: an open question on the weakest topic; the answer is judged (PASS / BLOCK with objections).
4. **BLOCK → Prerequisite check** page: "You missed a question on X. This might be because Y is unclear." Choose **Step back to Y** or **Try X again**.
   Step back asks about the prerequisite; a PASS returns to the original topic (depth limit 3).
5. **Result page:** score, behaviour score, trust score, topics to review, per-question breakdown.

### Stage 9 — Progress 🟡
**Progress** (`/progress`): per-topic mastery (answered, correct, state: unknown / learning / mastered / weak) and the **prerequisite graph**
editor (choose a topic and its prerequisite; remove). Weak topics feed the quiz home.

### Stage 10 — Account and sign-out ✅
**Account:** one checkbox, "Allow cloud models as a fallback for my questions", with a plain warning that retrieved passages (never whole files) are sent to
OpenRouter. Off by default. **Log out** ends the session on the server.

## 5. State matrix (every screen must handle these)

| State | Behaviour |
|---|---|
| Loading / background job | Page refreshes every 4 s; text says what is happening and that leaving is safe. |
| Empty | One sentence naming the next action. |
| Validation error | HTTP 400, same page, `.error` box, input preserved. |
| Model unavailable / times out | Status badge says so; the student's own passages are shown; nothing is invented. |
| Refused by policy (cloud off, no consent, caps) | Reason appears in the log, never blocks the local path. |
| Not yours / does not exist | Same 404 page. |
| Server restarted while working | The pending item is marked failed with "interrupted, ask again". |
| Session expired | Redirect to /login. |

## 6. Gaps and the plan

| # | Gap | Fix | Done when |
|---|---|---|---|
| **G1** | The hub still says "Quizzes and progress: arrive in the next phases". **Quiz home and Progress cannot be reached from the UI.** | Replace the card with a **sub-navigation row** under the title: `Materials · Ask · Questions · Quiz · Progress`, each a link with a count. | Real-browser test clicks each link from the hub. |
| G2 | Quiz screens were never opened in a browser. | Write `docs/studyhub-evidence/c/` harness (same method as a1–b): start quiz, answer, skip, diagnostic, step back, result, progress, second account 404. | All checks pass; screenshots read. |
| G3 | Monitoring is silent. The page records tab switches and blocks copy/paste without telling the student. | A **notice before Start quiz** saying what is measured and why; show the behaviour score on the result page with its meaning. Decide with the owner whether blocking copy/paste is wanted at all (it harms accessibility). | Notice visible; owner's decision recorded. |
| G4 | No way to resume an unfinished attempt; starting a new one silently abandons the old. | Quiz home shows "Continue your quiz (4 of 10)" and asks before abandoning. | Test: refresh mid-quiz returns to the same question. |
| G5 | The error message after a rejected answer only says "could not be recorded". | Name the cause (already answered, question removed, quiz finished). | Text per cause tested. |
| G6 | Term drift: "question / doubt / MCQ / quiz". | Use **Question** (asked by the student), **Practice question** (MCQ), **Quiz** (attempt) everywhere. | One pass over `ui.py`, tests updated. |
| G7 | Subjects list shows no progress. | Add a mastery summary per subject card (e.g. "3 of 8 topics mastered"). | Value matches the progress page. |
| G8 | No per-topic page. | `/subjects/{id}/topics/{tid}`: its passages, questions asked, practice questions, mastery, prerequisite. | Linked from progress and material pages. |
| G9 | Long lists (history, bank, attempts) are unbounded. | Show 20, then "older". | 200-item test stays fast. |
| G10 | Web URLs (Stage 4). | Phase D, with the address-safety rules from the design (§10). | Blocked-address and redirect tests. |
| G11 | Mobile and keyboard use are untested. | Run every screen at 375 px and with the keyboard only; fix overflow (long quotes, options), focus order, contrast in dark mode. | Screenshots at 375 px; checklist ticked. |

Priority: **G1 → G2 → G3 → G4** first (they make the finished backend reachable and honest), then G5–G9, then G10–G11.

## 7. Sketches

```
Subject hub
+---------------------------------------------------------------+
| StudyHub                       Account  Signed in as sam [Log out]|
| <- All subjects                                               |
| Data Structures                                               |
| Materials 3 | Ask | Questions 12 | Quiz | Progress            |  <- G1
|                                                               |
| Ask a question  [ textarea                        ] [Ask]     |
|   recent: "What does pop do?"  Answered from your materials    |
| Multiple-choice questions  [Topic v] [5] [Generate]           |
| Materials  [ds.txt 3 passages] [notes.pdf 2 pages ! scanned]  |
+---------------------------------------------------------------+

Answer page
  What does the pop operation do on a stack?     (Answered from your materials)
  Answer   1. The pop operation removes the top element. [1]
  Sources and evidence
    [1] ds - section: Data Structures > Stacks - PDF p. 3
        | the pop operation removes the element from the top
        ok These exact words were found in your material
  Explanation, step by step   (the model's reasoning, not verified word for word)
  Verification   ok quotes found   ok numbers   ok key word "pop"
  [This helped] [This looks wrong]      > How this was produced

Quiz question                               Result
  Question 3 of 10  [#####-----] 2 correct     Score 7/10   Behaviour 90   Trust 85
  Q text                                       Topics to review: Recursion (weak)
  ( ) A  ( ) B  ( ) C  ( ) D  [Submit]         Per-question breakdown (your answer, correct, source)
```

## 8. How the frontend is tested

- **HTTP tests** (`TestClient`, scripted models): every route for status, ownership (second account → 404), CSRF (403), escaping, headers.
- **Real-browser tests** (Edge over the DevTools protocol, real server, real local model): `docs/studyhub-evidence/{a1,a2,a3,b}`. Results so far: register/subjects
  19/19, uploads and search 17/17, questions 13/13, MCQ generation 17/17. **Quiz and progress: none yet (G2).**
- **Per-screen checklist:** works at 375 px and 900 px; keyboard only; light and dark contrast; no JavaScript errors; CSP is `script-src 'none'`
  except the one quiz page, whose nonce changes on every response; every list has an empty state.
- **The CSP test is strict on purpose** (`tests/test_studyhub_quiz_integrity.py`): if it is loosened, the build should fail.

## 9. Not in this plan

Animations, a JavaScript framework, offline mode, a mobile app, real-time collaboration, teacher dashboards, OCR, spaced repetition, email.
