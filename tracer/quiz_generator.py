"""Quiz generation and interactive evaluation engine for PDF documents.

Supports:
- Generating user-specified number of questions (N) directly from document text.
- 3-tier generation resilience: Local Ollama -> OpenRouter API -> Heuristic Extractor.
- Multiple-choice questions with 4 distinct options, verified answers, and explanations.
- Exporting to JSON and Markdown study sheets.
- Interactive terminal quiz player with instant feedback and concept breakdown.
"""

from __future__ import annotations

import datetime
import json
import os
import re
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from .agents import _api_key, _local_model_enabled, _ollama_generate, _openrouter_generate
from .pdf_parser import extract_pdf_metadata, extract_text_from_pdf


class QuizQuestion(BaseModel):
    """A single multiple-choice quiz question."""

    question_number: int = Field(ge=1)
    question_text: str = Field(min_length=5)
    options: dict[str, str] = Field(description="Dictionary mapping 'A', 'B', 'C', 'D' to option text")
    correct_answer: Literal["A", "B", "C", "D"]
    explanation: str = Field(default="")
    difficulty: int = Field(default=1, ge=1, le=3)
    concept_tag: str = Field(default="General")


class GeneratedQuiz(BaseModel):
    """Complete generated quiz with metadata."""

    title: str
    source_file: str
    total_questions: int
    created_at: str = Field(default_factory=lambda: datetime.datetime.now().isoformat())
    questions: list[QuizQuestion]


class QuizAttempt(BaseModel):
    """Results of a student's quiz submission."""

    student_name: str
    score: int
    total: int
    percentage: float
    time_taken_seconds: float = 0.0
    detailed_responses: list[dict[str, Any]] = Field(default_factory=list)


def _read_prompt_template() -> str:
    path = Path(__file__).resolve().parent / "prompts" / "quiz_gen.md"
    return path.read_text(encoding="utf-8")


def _clean_sentence(s: str) -> str:
    """Strip leading bullets, numbers, special chars and normalize whitespace."""
    s = re.sub(r"^\s*[\-\*\u2022\d]+[.)]\s*", "", s)   # strip bullets/numbering
    s = re.sub(r"\s+", " ", s)                           # collapse whitespace
    s = s.strip(" \t\r\n\"'")
    return s


def _extract_definition_pairs(text: str) -> list[tuple[str, str]]:
    """Extract (subject, definition) pairs from definitional sentences.

    Returns list of (subject, full_predicate) tuples for clean 'What is X?' questions.
    """
    pairs: list[tuple[str, str]] = []
    pattern = re.compile(
        r"([A-Z][^.!?\n]{3,60}?)\s+(?:is|are|refers to|defined as|means|denotes)\s+([^.!?\n]{10,150})[.!?]",
        re.IGNORECASE,
    )
    for m in pattern.finditer(text):
        subject = _clean_sentence(m.group(1))
        predicate = _clean_sentence(m.group(2))
        if (
            subject
            and predicate
            and len(subject) >= 3
            and len(predicate) >= 10
            and subject[0].isupper()
            and not re.search(r"[{}\\<>]", subject)
        ):
            pairs.append((subject, predicate))
    return pairs


def _extract_content_sentences(text: str) -> list[str]:
    """Extract clean, meaningful full sentences from the document."""
    raw = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)
    cleaned: list[str] = []
    for s in raw:
        s = _clean_sentence(s)
        if (
            30 <= len(s) <= 220
            and s
            and s[0].isupper()
            and not re.search(r"[{}\\<>|]", s)
            and re.search(r"[a-z]", s)  # not ALL-CAPS noise
        ):
            cleaned.append(s)
    return list(dict.fromkeys(cleaned))  # deduplicate, preserve order


def _build_distractors_from_facts(
    correct: str,
    all_facts: list[str],
    index: int,
    exclude_containing: str = "",
) -> list[str]:
    """Pick 3 plausible wrong-answer sentences from other document facts.

    Excludes any fact that contains `correct` or `exclude_containing` as a
    substring, preventing obvious giveaways.
    """
    correct_lower = correct.lower()[:60]
    exclude_lower = exclude_containing.lower()[:60]
    candidates = [
        f for f in all_facts
        if f != correct
        and len(f) > 15
        and correct_lower not in f.lower()
        and (not exclude_lower or exclude_lower not in f.lower())
    ]
    if len(candidates) >= 3:
        step = max(1, len(candidates) // 4)
        raw_picks = [
            candidates[index % len(candidates)],
            candidates[(index + step) % len(candidates)],
            candidates[(index + step * 2) % len(candidates)],
        ]
        seen: set[str] = set()
        unique_picks: list[str] = []
        for p in raw_picks:
            if p not in seen:
                seen.add(p)
                unique_picks.append(p)
        if len(unique_picks) == 3:
            return [p[:120] for p in unique_picks]

    # Not enough unique facts — pad with clearly-wrong generic options
    generic = [
        "This concept is not discussed anywhere in the document.",
        "This describes the opposite of what the document explains.",
        "This is an external standard not covered by the material.",
    ]
    result: list[str] = [c[:120] for c in candidates[:3]] + generic
    return result[:3]


def _heuristic_generate_quiz(
    text: str,
    source_title: str,
    num_questions: int,
) -> GeneratedQuiz:
    """Robust offline fallback generator.

    Produces semantically and syntactically correct MCQs purely from the
    document text.  Two strategies are combined:

    1. Definitional pairs ("X is/are Y") → clean "What is X?" questions
       with 3 distractors drawn from other document sentences.
    2. Content sentences → "Which statement is supported by the text?" MCQs.

    No random word fragments or external knowledge injected.
    """
    def_pairs = _extract_definition_pairs(text)
    content_sentences = _extract_content_sentences(text)
    all_fact_sentences = content_sentences[:]

    questions: list[QuizQuestion] = []
    used_subjects: set[str] = set()
    fact_index = 0

    for i in range(num_questions):
        # Strategy 1: use a clean definitional pair when available
        chosen_pair: tuple[str, str] | None = None
        for pair in def_pairs:
            if pair[0] not in used_subjects:
                chosen_pair = pair
                used_subjects.add(pair[0])
                break

        if chosen_pair:
            subject, predicate = chosen_pair
            q_text = f"What is {subject}?"
            correct = predicate[:120].rstrip(",;")
            # Exclude any sentence containing the subject so the definition can't be reconstructed from a distractor
            distractors = _build_distractors_from_facts(correct, all_fact_sentences, i, exclude_containing=subject)
        else:
            # Strategy 2: content sentence as the correct answer
            if not content_sentences:
                q_text = f"Which of the following best describes the subject matter of '{source_title}'?"
                correct = f"The document covers topics related to {source_title}."
                distractors = [
                    "The document exclusively discusses unrelated historical events.",
                    "The document is a legal contract with no educational content.",
                    "The document contains only raw data tables without explanations.",
                ]
            else:
                fact = content_sentences[fact_index % len(content_sentences)]
                fact_index += 1
                q_text = "Which of the following statements is directly supported by the document?"
                correct = fact[:120].rstrip(",;")
                distractors = _build_distractors_from_facts(fact, all_fact_sentences, i)

        # Distribute correct answer across A/B/C/D positions
        letters = ["A", "B", "C", "D"]
        correct_pos = letters[i % 4]
        all_opts = [correct] + distractors[:3]
        # Swap so correct_pos index holds `correct`
        swap_idx = letters.index(correct_pos)
        cur_idx = all_opts.index(correct)
        if cur_idx != swap_idx:
            all_opts[cur_idx], all_opts[swap_idx] = all_opts[swap_idx], all_opts[cur_idx]

        options = {
            "A": all_opts[0],
            "B": all_opts[1],
            "C": all_opts[2],
            "D": all_opts[3],
        }

        explanation_text = (
            f"This answer is drawn directly from the document: \"{correct[:100]}...\""
            if len(correct) > 100 else
            f"This answer is drawn directly from the document: \"{correct}\""
        )

        questions.append(
            QuizQuestion(
                question_number=i + 1,
                question_text=q_text,
                options=options,
                correct_answer=correct_pos,  # type: ignore
                explanation=explanation_text,
                difficulty=((i % 3) + 1),
                concept_tag=source_title[:30],
            )
        )

    return GeneratedQuiz(
        title=f"Quiz on {source_title}",
        source_file=source_title,
        total_questions=len(questions),
        questions=questions,
    )


def generate_quiz_from_text(
    text: str,
    source_title: str,
    num_questions: int = 5,
) -> GeneratedQuiz:
    """Generates a structured quiz from raw text using AI with offline fallback.

    Args:
        text: Extracted document text
        source_title: Name or title of the source document
        num_questions: Exact number of questions requested by user
    """
    if num_questions < 1:
        num_questions = 5

    # Truncate to reasonable context window if needed (first ~20,000 chars)
    trimmed_text = text[:22000].strip()
    prompt_template = _read_prompt_template()
    prompt = (
        prompt_template.replace("{{source_title}}", source_title)
        .replace("{{num_questions}}", str(num_questions))
        .replace("{{document_text}}", trimmed_text)
    )

    payload = None

    # 1. Try local Ollama if available
    if _local_model_enabled():
        payload = _ollama_generate(prompt, temperature=0.3, timeout=60.0)

    # 2. Try OpenRouter API if available
    if not payload and _api_key():
        payload = _openrouter_generate(prompt, temperature=0.3, timeout=60.0, max_tokens=4000)

    # 3. If model returned valid structure, parse into QuizQuestion objects
    if isinstance(payload, dict) and "questions" in payload:
        raw_questions = payload.get("questions") or []
        parsed_questions: list[QuizQuestion] = []
        for i, raw_q in enumerate(raw_questions[:num_questions], 1):
            try:
                opts = raw_q.get("options", {})
                # Normalize options dictionary to A, B, C, D
                cleaned_opts = {
                    "A": str(opts.get("A", opts.get("a", "Option A"))),
                    "B": str(opts.get("B", opts.get("b", "Option B"))),
                    "C": str(opts.get("C", opts.get("c", "Option C"))),
                    "D": str(opts.get("D", opts.get("d", "Option D"))),
                }
                correct = str(raw_q.get("correct_answer", "A")).upper().strip()
                if correct not in {"A", "B", "C", "D"}:
                    correct = "A"

                parsed_questions.append(
                    QuizQuestion(
                        question_number=i,
                        question_text=str(raw_q.get("question_text", f"Question {i}")).strip(),
                        options=cleaned_opts,
                        correct_answer=correct,  # type: ignore
                        explanation=str(raw_q.get("explanation", "Verified from source text.")).strip(),
                        difficulty=int(raw_q.get("difficulty", ((i % 3) + 1))),
                        concept_tag=str(raw_q.get("concept_tag", source_title)),
                    )
                )
            except Exception:
                continue

        if len(parsed_questions) == num_questions:
            return GeneratedQuiz(
                title=str(payload.get("title") or f"Quiz on {source_title}"),
                source_file=source_title,
                total_questions=len(parsed_questions),
                questions=parsed_questions,
            )

    # 4. Fallback to robust heuristic generator
    return _heuristic_generate_quiz(text, source_title, num_questions)


def generate_quiz_from_pdf(
    pdf_path: str | Path,
    num_questions: int = 5,
) -> GeneratedQuiz:
    """Extracts text from a PDF and produces a structured GeneratedQuiz.

    Args:
        pdf_path: Path to the target PDF file
        num_questions: The number of questions specified by the user
    """
    path = Path(pdf_path)
    metadata = extract_pdf_metadata(path)
    text = extract_text_from_pdf(path)
    return generate_quiz_from_text(
        text=text,
        source_title=metadata["title"],
        num_questions=num_questions,
    )


def export_quiz_to_json(quiz: GeneratedQuiz, target_path: str | Path) -> Path:
    """Saves the generated quiz as a clean JSON file."""
    path = Path(target_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(quiz.model_dump_json(indent=2), encoding="utf-8")
    return path


def export_quiz_to_markdown(quiz: GeneratedQuiz, target_path: str | Path) -> Path:
    """Exports a formatted Markdown review sheet with questions and answer key."""
    path = Path(target_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        f"# {quiz.title}",
        f"**Source Document:** `{quiz.source_file}`  ",
        f"**Total Questions:** {quiz.total_questions}  ",
        f"**Generated On:** {quiz.created_at[:19].replace('T', ' ')}  ",
        "\n---\n",
        "## Questions\n",
    ]

    for q in quiz.questions:
        diff_stars = "*" * q.difficulty
        lines.append(f"### Question {q.question_number} `[Difficulty {q.difficulty} {diff_stars}]` `[{q.concept_tag}]`")
        lines.append(f"{q.question_text}\n")
        for letter in ["A", "B", "C", "D"]:
            lines.append(f"- **({letter})** {q.options[letter]}")
        lines.append("")

    lines.append("\n---\n")
    lines.append("## Answer Key & Explanations\n")
    for q in quiz.questions:
        correct_text = q.options[q.correct_answer]
        lines.append(f"**Q{q.question_number}:** ({q.correct_answer}) {correct_text}")
        lines.append(f"> *Explanation:* {q.explanation}\n")

    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def play_quiz_interactively(
    quiz: GeneratedQuiz,
    student_name: str = "Student",
) -> QuizAttempt:
    """Interactive terminal player allowing a student to take the generated quiz."""
    import time

    start_time = time.time()
    score = 0
    responses: list[dict[str, Any]] = []

    print("\n" + "=" * 60)
    print(f"   INTERACTIVE QUIZ: {quiz.title.upper()}")
    print(f"   Candidate: {student_name} | Total Questions: {quiz.total_questions}")
    print("=" * 60)

    for q in quiz.questions:
        diff_label = ["Easy", "Medium", "Hard"][min(2, q.difficulty - 1)]
        print(f"\n[Q{q.question_number}/{quiz.total_questions}] ({diff_label} - Concept: {q.concept_tag})")
        print(f"  {q.question_text}\n")

        for opt in ["A", "B", "C", "D"]:
            print(f"    ({opt}) {q.options[opt]}")

        # Capture user selection
        user_choice = ""
        while user_choice not in {"A", "B", "C", "D"}:
            user_choice = input("\nYour Answer (A/B/C/D): ").strip().upper()

        is_correct = (user_choice == q.correct_answer)
        if is_correct:
            score += 1
            print("  [CORRECT!]")
        else:
            print(f"  [INCORRECT] The correct answer was ({q.correct_answer}).")

        print(f"  Explanation: {q.explanation}")
        print("-" * 60)

        responses.append({
            "question_number": q.question_number,
            "question_text": q.question_text,
            "user_choice": user_choice,
            "correct_answer": q.correct_answer,
            "is_correct": is_correct,
            "concept_tag": q.concept_tag,
        })

    duration = time.time() - start_time
    percentage = (score / quiz.total_questions) * 100.0 if quiz.total_questions > 0 else 0.0

    print("\n" + "=" * 60)
    print("                 QUIZ COMPLETE")
    print(f"  Candidate:     {student_name}")
    print(f"  Final Score:   {score} / {quiz.total_questions} ({percentage:.1f}%)")
    print(f"  Time Taken:    {duration:.1f} seconds")

    if percentage >= 80:
        grade = "EXCELLENT (Mastery Demonstrated)"
    elif percentage >= 60:
        grade = "PASS (Good Understanding)"
    else:
        grade = "NEEDS REVIEW (Consider Reviewing Prerequisite Concepts)"
    print(f"  Verdict:       {grade}")
    print("=" * 60)

    return QuizAttempt(
        student_name=student_name,
        score=score,
        total=quiz.total_questions,
        percentage=round(percentage, 1),
        time_taken_seconds=round(duration, 1),
        detailed_responses=responses,
    )

