"""CLI script to generate a quiz from any uploaded PDF document.

Usage Examples:
  # Generate 5 questions and take the quiz interactively in terminal
  python generate_quiz.py --pdf ai_learnmate/backend/test_module_content.pdf --num-questions 3 --interactive

  # Generate 10 questions and export to JSON and Markdown
  python generate_quiz.py --pdf my_notes.pdf --num-questions 10 --export-md

  # Interactive prompt mode (if no args provided)
  python generate_quiz.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Ensure project root is on sys.path
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tracer.pdf_parser import extract_pdf_metadata
from tracer.quiz_generator import (
    export_quiz_to_json,
    export_quiz_to_markdown,
    generate_quiz_from_pdf,
    play_quiz_interactively,
)


def main():
    parser = argparse.ArgumentParser(
        description="Generate a quiz based on any uploaded PDF document.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--pdf",
        type=str,
        default=None,
        help="Path to the source PDF document",
    )
    parser.add_argument(
        "--num-questions",
        "-n",
        type=int,
        default=None,
        help="Number of questions to generate (decided by you)",
    )
    parser.add_argument(
        "--interactive",
        "-i",
        action="store_true",
        help="Take the generated quiz interactively right in the terminal",
    )
    parser.add_argument(
        "--student",
        type=str,
        default="Student",
        help="Candidate or student name (default: Student)",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help="Path to save the generated JSON quiz file",
    )
    parser.add_argument(
        "--export-md",
        action="store_true",
        help="Also export a readable Markdown study sheet with answer key",
    )

    args = parser.parse_args()

    # If PDF is not provided, prompt user interactively
    pdf_path_str = args.pdf
    if not pdf_path_str:
        print("\n" + "=" * 60)
        print("          AI PDF QUIZ GENERATOR (DeadLock)")
        print("=" * 60)
        pdf_path_str = input("Enter the path to your PDF file: ").strip().strip("\"'")
        while not pdf_path_str or not Path(pdf_path_str).exists():
            print(f"[!] File not found: '{pdf_path_str}'")
            pdf_path_str = input("Please enter a valid PDF path: ").strip().strip("\"'")

    pdf_path = Path(pdf_path_str).resolve()

    # If num-questions not provided via CLI, prompt the user
    num_questions = args.num_questions
    if num_questions is None:
        raw_num = input("\nHow many questions would you like to generate? [default: 5]: ").strip()
        try:
            num_questions = int(raw_num) if raw_num else 5
        except ValueError:
            num_questions = 5

    num_questions = max(1, num_questions)

    print("\n" + "=" * 60)
    print(f"[*] Inspecting Document: {pdf_path.name}")
    try:
        meta = extract_pdf_metadata(pdf_path)
        print(f"    Title:       {meta['title']}")
        print(f"    Total Pages: {meta['total_pages']}")
        print(f"    Excerpt:     {meta['sample_excerpt']}")
    except Exception as e:
        print(f"    [!] Error reading PDF: {e}")
        sys.exit(1)

    print(f"[*] Generating {num_questions} quiz questions directly from document content...")
    quiz = generate_quiz_from_pdf(pdf_path, num_questions=num_questions)
    print(f"    [PASS] Successfully created quiz with {quiz.total_questions} questions.")

    # Determine output paths
    sessions_dir = ROOT / "tracer" / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)

    json_output = Path(args.output) if args.output else (sessions_dir / f"{pdf_path.stem}_quiz.json")
    export_quiz_to_json(quiz, json_output)
    print(f"[*] Saved quiz data to: {json_output}")

    if args.export_md or not args.interactive:
        md_output = sessions_dir / f"{pdf_path.stem}_quiz_review.md"
        export_quiz_to_markdown(quiz, md_output)
        print(f"[*] Exported Markdown study sheet to: {md_output}")

    # Interactive play
    if args.interactive:
        play_quiz_interactively(quiz, student_name=args.student)
    else:
        print("[*] To take this quiz interactively in the terminal, run:")
        print(f"    python generate_quiz.py --pdf \"{pdf_path}\" --interactive")


if __name__ == "__main__":
    main()
