"""End-to-end verification that quiz generation works correctly."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tracer.quiz_generator import generate_quiz_from_text

SAMPLE_TEXT = """
Python is a high-level, interpreted programming language known for its simplicity and readability.
A variable is a named storage location that holds a value in a program.
A function is a reusable block of code that performs a specific task when called.
Object-oriented programming is a paradigm that organizes code around objects and classes.
A class is a blueprint for creating objects that share common attributes and methods.
Inheritance is a mechanism where a child class derives properties from a parent class.
An exception is an error that disrupts normal program execution and must be handled.
A loop is a control flow structure that repeats a block of code until a condition is met.
A list is an ordered, mutable collection of items in Python.
A dictionary is an unordered collection of key-value pairs used for fast lookups.
"""

# Try with a real PDF if available
pdfs = list(Path(".").rglob("*.pdf"))
if pdfs:
    from tracer.pdf_parser import extract_pdf_metadata, extract_text_from_pdf
    p = pdfs[0]
    print(f"[PDF] Using: {p}")
    meta = extract_pdf_metadata(p)
    text = extract_text_from_pdf(p)
    title = meta["title"]
    print(f"[PDF] Extracted {len(text):,} chars")
else:
    print("[TEXT] No PDF found — using built-in sample text")
    text = SAMPLE_TEXT.strip()
    title = "Python Programming Basics"

num_q = 5
quiz = generate_quiz_from_text(text, title, num_questions=num_q)

print(f"\n{'='*60}")
print(f"  QUIZ: {quiz.title}")
print(f"  Questions: {quiz.total_questions}")
print(f"{'='*60}\n")

all_ok = True
for q in quiz.questions:
    diff = ["Easy", "Medium", "Hard"][q.difficulty - 1]
    print(f"Q{q.question_number} [{diff}]: {q.question_text}")
    for k, v in q.options.items():
        mark = " <-- ANSWER" if k == q.correct_answer else ""
        print(f"  ({k}) {v}{mark}")
    print(f"  Explanation: {q.explanation}\n")

    # Basic sanity checks
    if len(q.question_text) < 10:
        print(f"  [FAIL] Question text too short!")
        all_ok = False
    if q.correct_answer not in q.options:
        print(f"  [FAIL] Correct answer key missing from options!")
        all_ok = False
    if len(set(q.options.values())) < 4:
        print(f"  [WARN] Some options are duplicates")

print("=" * 60)
if all_ok:
    print("  ALL CHECKS PASSED - Quiz generation is working correctly")
else:
    print("  SOME CHECKS FAILED - Review output above")
print("=" * 60)
