# NEXUS — One-Day Development Progress and Agent Testing Report

## 1. Executive Summary

NEXUS is an agentic adaptive learning system designed to guide students through a structured learning cycle:

```text
Learn → Question → Answer → Evaluate → Progress or Revisit
```

The current implementation focuses on a knowledge-agent workflow that:

1. Receives a topic from the student.
2. Retrieves relevant academic knowledge from a provided source.
3. Generates a question for the selected topic.
4. Collects the student's confidence level and answer.
5. Evaluates the answer using a separate evaluation agent.
6. Stores structured records for future learning decisions.
7. Routes the student forward or backward based on the evaluation result.

The demonstrated workflow uses two primary agents:

- `spot_agent` — identifies and asks a topic-focused question.
- `gate_agent` — evaluates the student's answer and controls progression.

The current internal development estimate is approximately **80% complete**. This percentage is an internal progress estimate and is not a judging score or independently verified completion percentage.

---

## 2. Development Objective

The primary objective for the development session was to implement and demonstrate a working agentic learning slice for NEXUS.

The development work focused on:

- Creating a usable command-line interaction.
- Connecting the agent workflow to a knowledge source.
- Generating topic-specific questions.
- Collecting student answers and confidence levels.
- Evaluating student responses through a separate agent.
- Maintaining structured records.
- Protecting prerequisite routing through application-controlled graph logic.
- Producing an execution trace that can be demonstrated to judges.

The intended learning flow is:

```text
Student selects topic
        ↓
Knowledge source is consulted
        ↓
spot_agent generates a question
        ↓
Student provides confidence and answer
        ↓
gate_agent evaluates the answer
        ↓
VerdictRecord is created
        ↓
Complete or Backward Pass
```

---

## 3. Development Workflow — From Start to Testing

### Stage 1: Define the Agentic Workflow

The first stage was to define the state-based workflow used by the NEXUS knowledge agent.

The implemented flow is:

```text
spot_agent
    ↓
QUESTIONING
    ↓
Student submits answer
    ↓
EVALUATING
    ↓
gate_agent
    ↓
COMPLETE or BACKWARD_PASS
```

The system separates question generation from answer evaluation so that each component can be developed, tested, and improved independently.

This separation provides the following benefits:

- The question-generation prompt can be changed without modifying evaluation logic.
- The evaluation prompt can be improved independently.
- The system can maintain a clear boundary between asking a question and judging an answer.
- Graph-based progression can be controlled by application code rather than relying entirely on model output.

---

### Stage 2: Implement the CLI Knowledge Agent

A command-line interface was created to provide a simple and demonstrable interaction model.

The following command was used:

```bash
python -m demo.knowledge_agent.cli ask "Explain Partitioning Using Inheritance"
```

The CLI provides:

- Agent-run initialization.
- Topic input.
- Question-generation interaction.
- Processing feedback.
- Final agent state output.

The CLI is useful for early testing because it allows the core agent workflow to be tested before a complete graphical interface is finalized.

---

### Stage 3: Integrate the Knowledge Source

The knowledge agent was connected to the following academic source:

```text
Postgresql support for partitioning and inheritance.pdf
```

The source was used to support the topic:

```text
Partitioning Using Inheritance
```

The retrieved source output referenced pages including:

- Page 1
- Page 3
- Page 4

The retrieved content covered concepts such as:

- Parent and child tables.
- Table inheritance.
- The `INHERITS` clause.
- Check constraints.
- Multiple inheritance.
- Custom partitioning logic.
- Partition maintenance.
- Flexibility in designing child tables.

The purpose of source retrieval is to ensure that the agent's questions and evaluations are connected to academic material rather than being generated without a knowledge basis.

---

### Stage 4: Implement `spot_agent`

The `spot_agent` is responsible for identifying the current learning topic and asking a suitable question.

#### Main responsibilities

- Read the current `topic_id`.
- Read the current `topic_label`.
- Read the current `difficulty_level`.
- Read previous objections or learning issues.
- Call the prompt located at:

```text
tracer/prompts/spot.md
```

- Use Ollama for model interaction.
- Display the generated question in the terminal.
- Collect the student's confidence level from 1 to 5.
- Collect the student's answer.
- Write one `QuestionRecord`.
- Write one `AnswerRecord`.

#### Input information

```text
topic_id
topic_label
difficulty_level
prior_objections
```

#### Completion condition

The `spot_agent` is considered complete when:

1. A question has been generated.
2. The student has submitted a confidence level.
3. The student has submitted an answer.
4. The corresponding records have been written.

#### Design decision

The question generator and gate evaluator are separated so they can be tuned independently.

A fallback mechanism is also included to reduce the possibility of the state machine stopping because of an invalid or unexpected model response.

---

### Stage 5: Implement `gate_agent`

The `gate_agent` is responsible for evaluating the student's response.

The agent calls the prompt located at:

```text
tracer/prompts/gate.md
```

The prompt is executed through Ollama.

#### Main responsibilities

- Read the latest `QuestionRecord`.
- Read the latest `AnswerRecord`.
- Read the complete prior verdict history for the topic.
- Evaluate whether the student's answer is sufficient.
- Produce one `VerdictRecord`.
- Support progression or backward routing.

#### Input information

```text
QuestionRecord
AnswerRecord
prior verdict history for the topic
```

The evaluator considers:

- The question that was asked.
- The answer submitted by the student.
- The student's previous evaluation history.
- The topic being evaluated.
- Previously identified weaknesses or objections.

#### Completion condition

The `gate_agent` is considered complete when a verdict has been stored.

---

### Stage 6: Protect Graph-Controlled Routing

A key implementation decision is that the language model does not have complete control over prerequisite routing.

The application code overrides the `prerequisite_id` using the graph lookup.

This ensures that:

- The model cannot invent a nonexistent prerequisite node.
- The system follows the defined topic graph.
- Routing remains consistent with the learning structure.
- Model-generated output cannot directly corrupt the progression graph.
- The system reduces the risk of hallucinated prerequisite relationships.

The model evaluates the answer, while the application controls the actual route.

This creates a separation between:

```text
Model decision support
        +
Application-controlled workflow routing
```

---

### Stage 7: Implement Structured Persistence

The workflow is designed to store structured records rather than only displaying unstructured text.

The main record types are:

- `QuestionRecord`
- `AnswerRecord`
- `VerdictRecord`

#### QuestionRecord

Stores information related to the generated question.

Possible information includes:

- Topic identifier.
- Topic label.
- Difficulty level.
- Generated question.
- Run or interaction identifier.

#### AnswerRecord

Stores information related to the student's response.

Possible information includes:

- Student answer.
- Confidence level.
- Topic identifier.
- Related question identifier.
- Run or interaction identifier.

#### VerdictRecord

Stores information related to the evaluation.

Possible information includes:

- Evaluation result.
- Answer sufficiency.
- Identified weakness or objection.
- Routing decision.
- Related topic.
- Previous verdict context.

Structured persistence is important because NEXUS requires historical learning information to support:

- Repeated evaluation.
- Weakness identification.
- Adaptive questioning.
- Backward passes.
- Future progress analysis.

---

## 4. CLI Execution Evidence

### Command Executed

```bash
python -m demo.knowledge_agent.cli ask "Explain Partitioning Using Inheritance"
```

### Terminal Output

```text
Agent started. Run ID: run_7b24f425bd85
Question: Explain Partitioning Using Inheritance
Processing...

Final Agent State: complete
```

### Execution Interpretation

The output demonstrates that:

1. The agent started successfully.
2. A unique run identifier was generated.
3. The requested topic was accepted.
4. The system processed the request.
5. The final agent state was reported as `complete`.

The displayed output confirms a successful demonstrated CLI execution. It does not, by itself, prove the reliability of every possible route or the complete persistence and backward-pass behavior.

---

## 5. Agent Testing Workflow

Testing was organized around the available CLI behavior, knowledge retrieval, agent responsibilities, structured records, and graph-controlled routing.

The following test cases distinguish between behavior demonstrated by the supplied execution output and behavior that still requires direct verification.

### KA-001 — Natural-Language Topic Input

**Objective:** Verify that the CLI accepts a natural-language topic.

**Input:**

```text
Explain Partitioning Using Inheritance
```

**Expected result:**

- The topic is accepted by the CLI.
- The agent begins processing.

**Observed result:**

- The topic was accepted.
- Processing started.

**Status:** PASS

---

### KA-002 — Agent Run Initialization

**Objective:** Verify that a new agent run is initialized.

**Expected result:**

- The system creates and displays a run identifier.

**Observed result:**

```text
Agent started. Run ID: run_7b24f425bd85
```

**Status:** PASS

---

### KA-003 — Document Source Retrieval

**Objective:** Verify that the knowledge workflow uses the relevant academic document.

**Knowledge source:**

```text
Postgresql support for partitioning and inheritance.pdf
```

**Topic:**

```text
Partitioning Using Inheritance
```

**Expected result:**

- Relevant content is retrieved from the source.
- The retrieved content is related to the requested topic.

**Observed result:**

- Source output referenced pages 1, 3, and 4.
- The retrieved content discussed inheritance-based partitioning.

**Status:** PASS

---

### KA-004 — Grounded Answer Generation

**Objective:** Verify that the agent produces content related to the selected academic topic.

**Expected result:**

- The response should remain connected to the requested topic.
- The output should use information from the supplied source.

**Observed result:**

The generated content addressed topics such as:

- Child-table flexibility.
- Multiple inheritance.
- Custom partitioning logic.
- Root and child tables.
- The `INHERITS` clause.
- Check constraints.
- Partition maintenance.

**Status:** PASS

---

### KA-005 — Evidence and Grounding Output

**Objective:** Verify that the knowledge response includes identifiable source evidence.

**Expected result:**

- Source pages or source references should be available.
- The response should be traceable to the academic material.

**Observed result:**

- Source output referenced pages 1, 3, and 4.
- The relevant section was identified as `Partitioning Using Inheritance`.

**Status:** PASS

---

### KA-006 — Final Agent State

**Objective:** Verify that the agent reports a final state after processing.

**Expected result:**

```text
Final Agent State: complete
```

**Observed result:**

```text
Final Agent State: complete
```

**Status:** PASS

---

### KA-007 — QuestionRecord Persistence

**Objective:** Verify that `spot_agent` stores a structured `QuestionRecord`.

**Expected result:**

- One question record is written for the interaction.
- The record includes the relevant topic and generated question.

**Current evidence:**

- The implementation description states that `spot_agent` writes a `QuestionRecord`.
- The supplied terminal output does not directly display or verify the stored record.

**Status:** NOT VERIFIED

**Required verification:**

- Inspect the persistence layer or stored record.
- Confirm that the record exists after execution.
- Confirm that the record is linked to the correct run and topic.

---

### KA-008 — AnswerRecord Persistence

**Objective:** Verify that the student's confidence and answer are stored.

**Expected result:**

- One `AnswerRecord` is written.
- The answer and confidence level are associated with the relevant question and topic.

**Current evidence:**

- The implementation description states that `spot_agent` writes an `AnswerRecord`.
- The supplied terminal output does not directly display or verify the stored record.

**Status:** NOT VERIFIED

**Required verification:**

- Submit a test confidence value.
- Submit a test answer.
- Inspect the stored `AnswerRecord`.
- Confirm that the values are persisted correctly.

---

### KA-009 — VerdictRecord Persistence

**Objective:** Verify that `gate_agent` stores an evaluation result.

**Expected result:**

- One `VerdictRecord` is written after evaluation.
- The verdict is linked to the question, answer, and topic.

**Current evidence:**

- The implementation description states that `gate_agent` writes a `VerdictRecord`.
- The supplied CLI output does not directly display or verify the stored verdict.

**Status:** NOT VERIFIED

**Required verification:**

- Execute the evaluation stage.
- Inspect the persisted verdict.
- Confirm that the verdict contains the expected routing or evaluation information.

---

### KA-010 — Graph-Controlled Prerequisite Routing

**Objective:** Verify that prerequisite routing is controlled by the graph lookup rather than freely selected by the model.

**Expected result:**

- The application overrides `prerequisite_id`.
- The selected prerequisite exists in the defined graph.
- The model cannot create an invalid prerequisite node.

**Current evidence:**

- The implementation description states that the code overrides `prerequisite_id` through graph lookup.
- No direct routing trace was included in the supplied CLI output.

**Status:** NOT VERIFIED

**Required verification:**

- Test a valid prerequisite route.
- Attempt to provide an invalid model-generated prerequisite.
- Confirm that the application ignores the invalid value.
- Confirm that the final route comes from the graph.

---

### KA-011 — Backward-Pass Workflow

**Objective:** Verify that the system can route a student backward when the answer is insufficient.

**Expected result:**

```text
EVALUATING → BACKWARD_PASS
```

The system should identify the relevant prerequisite or weaker topic and route the student accordingly.

**Current evidence:**

- The architecture includes a `BACKWARD_PASS` state.
- The supplied CLI output only shows a final state of `complete`.
- No actual backward-pass execution trace was supplied.

**Status:** NOT VERIFIED

**Required verification:**

- Submit an intentionally incomplete answer.
- Run the evaluator.
- Confirm that the verdict identifies the weakness.
- Confirm that the system routes to the correct prerequisite topic.
- Confirm that the route is graph-controlled.

---

## 6. Testing Summary

| Test ID | Test Area | Status | Evidence |
|---|---|---:|---|
| KA-001 | Natural-language topic input | PASS | Topic accepted by CLI |
| KA-002 | Agent run initialization | PASS | Run ID displayed |
| KA-003 | Document source retrieval | PASS | Relevant source pages and section identified |
| KA-004 | Grounded answer generation | PASS | Topic-related content generated |
| KA-005 | Evidence and grounding output | PASS | Source references displayed |
| KA-006 | Final agent state | PASS | `Final Agent State: complete` |
| KA-007 | QuestionRecord persistence | NOT VERIFIED | Direct record inspection required |
| KA-008 | AnswerRecord persistence | NOT VERIFIED | Direct record inspection required |
| KA-009 | VerdictRecord persistence | NOT VERIFIED | Direct record inspection required |
| KA-010 | Graph-controlled prerequisite routing | NOT VERIFIED | Routing trace required |
| KA-011 | Backward-pass workflow | NOT VERIFIED | Incomplete-answer test required |

### Summary Interpretation

The supplied execution evidence demonstrates successful topic acceptance, agent initialization, knowledge-source usage, topic-related generation, source grounding, and final completion reporting.

The remaining verification work concerns internal state persistence, graph-controlled routing, and the backward-pass behavior. These areas require execution logs, database or storage inspection, and negative-path testing.

---

## 7. Judging Criteria Alignment

The project is aligned with the stated judging structure:

```text
Criterion 1: Working Agentic Slice       — 35
Criterion 2: Evidence Real People Used It — 35
Criterion 3: Whether It Helped           — 20
Criterion 4: How We Worked / Show It     — 10
Total                                    — 100
```

### Criterion 1 — Working Agentic Slice — 35

The current implementation addresses the working agentic slice through:

- A CLI entry point.
- Topic-based interaction.
- Knowledge-source integration.
- `spot_agent` question generation.
- `gate_agent` answer evaluation.
- Structured records.
- State-based workflow design.
- Application-controlled prerequisite routing.

**Current evidence:**

- CLI execution completed.
- The final agent state was reported as `complete`.
- The source and topic were identified.
- The agent responsibilities and workflow were defined.

**Evidence still required:**

- Direct proof of record persistence.
- A complete question-to-verdict execution trace.
- A successful backward-pass trace.
- Proof that invalid prerequisite values are rejected or overridden.

---

### Criterion 2 — Evidence That Real People Used It — 35

The supplied CLI output demonstrates a development execution, but it does not establish evidence that external or independent users tested the system.

Useful evidence for this criterion should include:

- A recorded live demonstration.
- Test participants using the system.
- Participant names or anonymized identifiers where appropriate.
- Test date and time.
- Input topics.
- User answers.
- System verdicts.
- Screenshots or terminal recordings.
- Observed issues and corrections.

**Current status:** Not established by the supplied output.

The current evidence should therefore be described as developer-run testing unless independent user testing is completed and documented.

---

### Criterion 3 — Whether It Helped — 20

NEXUS is intended to help students by:

- Identifying weak concepts.
- Asking topic-specific questions.
- Considering confidence levels.
- Evaluating answer sufficiency.
- Supporting backward learning routes.
- Building a history of questions, answers, and verdicts.
- Supporting adaptive learning rather than only static content delivery.

However, educational effectiveness requires user-based evidence.

Potential evidence includes:

- Improvement between repeated attempts.
- Reduction in repeated mistakes.
- Student confidence changes.
- Correctness before and after a backward pass.
- Time required to reach topic completion.
- Student feedback about clarity and usefulness.

**Current status:** The intended benefit is defined, but measurable learning-effectiveness evidence has not yet been established in the supplied execution output.

---

### Criterion 4 — How We Worked and Show It — 10

The development process can be demonstrated through:

- The state-machine workflow.
- Separation of `spot_agent` and `gate_agent`.
- Prompt files for independent tuning.
- CLI execution.
- Knowledge-source integration.
- Structured persistence design.
- Graph-controlled routing.
- Explicit testing and verification status.
- Honest distinction between demonstrated and unverified behavior.

The report should present both successful results and remaining verification tasks. This makes the development process traceable and reduces the risk of claiming functionality that has not been directly demonstrated.

---

## 8. Remaining One-Day Completion Plan

The remaining work should be completed in the following order.

### Step 1 — Verify Structured Records

Confirm that the following records are written correctly:

```text
QuestionRecord
AnswerRecord
VerdictRecord
```

For each record, verify:

- Correct topic identifier.
- Correct run identifier.
- Correct question-answer relationship.
- Correct timestamp or execution reference where applicable.
- Correct persistence location.

---

### Step 2 — Capture a Complete Successful Trace

Record a complete interaction containing:

```text
Topic input
    ↓
Question generation
    ↓
Confidence submission
    ↓
Answer submission
    ↓
Evaluation
    ↓
VerdictRecord
    ↓
COMPLETE
```

Capture:

- Terminal output.
- Relevant logs.
- Stored records.
- Final state.

---

### Step 3 — Execute a Negative Answer Test

Use an incomplete or incorrect answer to test the evaluation behavior.

Verify that:

- The evaluator recognizes insufficient content.
- The verdict records the weakness.
- The system does not incorrectly mark the topic as complete.
- The appropriate backward route is selected.

---

### Step 4 — Verify Graph-Controlled Routing

Test the routing logic with:

1. A valid prerequisite.
2. An invalid or nonexistent prerequisite.
3. A model response that attempts to select an incorrect node.

Verify that the application:

- Uses the graph lookup.
- Rejects invalid nodes.
- Prevents hallucinated prerequisite IDs.
- Produces a valid route.

---

### Step 5 — Demonstrate the Backward Pass

Capture a complete backward-pass execution:

```text
QUESTIONING
    ↓
EVALUATING
    ↓
Insufficient answer
    ↓
BACKWARD_PASS
    ↓
Prerequisite topic
```

The trace should include:

- The original topic.
- The submitted answer.
- The verdict.
- The identified weakness.
- The graph-selected prerequisite.
- The next topic or state.

---

### Step 6 — Conduct a Small User Test

Ask one or more independent users to test the workflow.

Record:

- User or participant identifier.
- Topic used.
- Question generated.
- Answer submitted.
- Confidence level.
- Verdict.
- Whether the user understood the feedback.
- Any issue encountered.
- Correction made after testing.

Do not describe developer-only execution as independent user evidence.

---

### Step 7 — Prepare the Live Demonstration

The live demonstration should follow a short, repeatable sequence:

1. Start the CLI.
2. Enter a topic.
3. Show the retrieved academic source.
4. Display the generated question.
5. Submit confidence and answer.
6. Run evaluation.
7. Show the verdict.
8. Demonstrate either completion or backward routing.
9. Show the stored records.
10. Explain how graph-controlled routing prevents invalid prerequisites.

---

## 9. Limitations and Honest Disclosure

The following limitations apply to the current evidence:

1. The CLI run does not prove the reliability of all agentic routes.
2. Record persistence requires direct verification.
3. The full backward-pass workflow requires an actual execution trace.
4. External-user evidence has not been established by the supplied output.
5. Educational effectiveness requires user-based evidence.
6. The 80% figure is an internal development estimate, not a judging score or independently verified completion percentage.

The report should not claim that unverified components are fully operational until direct evidence is collected.

---

## 10. Conclusion

The current NEXUS development session produced a demonstrable CLI-based knowledge-agent workflow with academic source integration and a defined agentic architecture.

The demonstrated execution confirms:

- Successful agent initialization.
- Topic acceptance.
- Knowledge-source usage.
- Topic-related content generation.
- Source evidence identification.
- Final completion-state reporting.

The implementation also includes an architectural separation between `spot_agent` and `gate_agent`, structured learning records, and application-controlled graph routing.

The next priority is to convert the implementation claims into directly verifiable evidence by:

- Inspecting persisted records.
- Capturing a complete question-to-verdict trace.
- Testing insufficient answers.
- Demonstrating the backward-pass route.
- Verifying graph-controlled prerequisite selection.
- Conducting and documenting independent user testing.

The report maintains a distinction between demonstrated behavior, implementation-level claims, and functionality that still requires verification. This distinction should be preserved in the final submission and live judging demonstration.
