"""Unit tests for PDF text extraction and quiz generation."""

from __future__ import annotations

from pathlib import Path

from tracer.pdf_parser import extract_pdf_metadata, extract_text_from_pdf
from tracer.quiz_generator import (
    export_quiz_to_json,
    export_quiz_to_markdown,
    generate_quiz_from_pdf,
    generate_quiz_from_text,
)

SAMPLE_PDF = Path(__file__).resolve().parent.parent / "ai_learnmate" / "backend" / "test_module_content.pdf"


def test_pdf_text_and_metadata_extraction():
    """Verifies that text and metadata are extracted correctly from a PDF."""
    assert SAMPLE_PDF.exists(), f"Sample PDF missing at {SAMPLE_PDF}"
    metadata = extract_pdf_metadata(SAMPLE_PDF)
    assert metadata["total_pages"] >= 1
    assert "test_module_content" in metadata["file_name"]

    text = extract_text_from_pdf(SAMPLE_PDF)
    assert len(text) > 50
    assert "Neural Networks" in text or "Perceptrons" in text or "Optimization" in text


def test_user_decides_question_count():
    """Verifies that the exact number of questions requested by the user is generated."""
    # Test user asking for 3 questions
    quiz_3 = generate_quiz_from_pdf(SAMPLE_PDF, num_questions=3)
    assert quiz_3.total_questions == 3
    assert len(quiz_3.questions) == 3

    # Test user asking for 6 questions
    quiz_6 = generate_quiz_from_pdf(SAMPLE_PDF, num_questions=6)
    assert quiz_6.total_questions == 6
    assert len(quiz_6.questions) == 6


def test_quiz_question_schema_integrity():
    """Verifies that generated questions adhere to MCQ schema rules."""
    quiz = generate_quiz_from_pdf(SAMPLE_PDF, num_questions=4)
    for q in quiz.questions:
        # Must have exactly 4 options
        assert set(q.options.keys()) == {"A", "B", "C", "D"}
        # All options must have text
        for letter in ["A", "B", "C", "D"]:
            assert len(q.options[letter].strip()) > 0
        # Correct answer must be one of A, B, C, D
        assert q.correct_answer in {"A", "B", "C", "D"}
        # Explanation must be provided
        assert len(q.explanation.strip()) > 0
        # Difficulty must be in range 1-3
        assert 1 <= q.difficulty <= 3


def test_export_to_json_and_markdown(tmp_path):
    """Verifies that quiz exports correctly to JSON and Markdown review sheets."""
    quiz = generate_quiz_from_pdf(SAMPLE_PDF, num_questions=3)

    json_file = tmp_path / "test_export.json"
    export_quiz_to_json(quiz, json_file)
    assert json_file.exists()
    assert json_file.stat().st_size > 100

    md_file = tmp_path / "test_export.md"
    export_quiz_to_markdown(quiz, md_file)
    assert md_file.exists()
    content = md_file.read_text(encoding="utf-8")
    assert "# Quiz on" in content
    assert "## Answer Key & Explanations" in content
    assert "Question 1" in content


def test_arbitrary_domain_content_generation():
    """Verifies that arbitrary text (e.g. biology, history, business) generates a valid quiz."""
    custom_material = """
    Photosynthesis is the biological process by which green plants and certain other organisms transform light energy into chemical energy.
    During photosynthesis in green plants, light energy is captured and used to convert water, carbon dioxide, and minerals into oxygen and energy-rich organic compounds.
    Chlorophyll is a pigment present in all photosynthetic organisms and is responsible for absorbing solar photons.
    The light-dependent reactions take place on the thylakoid membranes of chloroplasts.
    The Calvin cycle is a light-independent reaction occurring in the stroma that fixes carbon into glyceraldehyde 3-phosphate.
    """
    quiz = generate_quiz_from_text(custom_material, source_title="Photosynthesis Overview", num_questions=5)
    assert quiz.total_questions == 5
    assert len(quiz.questions) == 5
    assert all(q.correct_answer in {"A", "B", "C", "D"} for q in quiz.questions)


def test_web_backend_endpoint_generates_from_uploaded_pdf():
    """Verifies that the FastAPI backend endpoint receives a PDF file upload and returns generated quiz JSON."""
    from fastapi.testclient import TestClient
    from web.server import app

    client = TestClient(app)
    with open(SAMPLE_PDF, "rb") as f:
        files = {"file": ("uploaded_lecture.pdf", f, "application/pdf")}
        response = client.post("/api/generate-quiz", files=files, data={"num_questions": 3})

    assert response.status_code == 200
    data = response.json()
    assert data["total_questions"] == 3
    assert len(data["questions"]) == 3
    for q in data["questions"]:
        assert set(q["options"].keys()) == {"A", "B", "C", "D"}
        assert q["correct_answer"] in {"A", "B", "C", "D"}


