"""Web server connecting the dummy interface to the real Python quiz generation backend.

Endpoints:
- GET /: Serves the PDF Quiz Studio frontend.
- GET /api/samples: Lists available sample PDF documents in the workspace.
- POST /api/generate-quiz: Ingests an uploaded PDF (or sample path), runs real
  extraction and question synthesis, and returns the generated quiz JSON.
"""

from __future__ import annotations

import base64
import os
import shutil
import sys
from pathlib import Path
from typing import Any

# Ensure project root is on sys.path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

from tracer.pdf_parser import extract_pdf_metadata
from tracer.quiz_generator import GeneratedQuiz, generate_quiz_from_pdf

app = FastAPI(title="DeadLock PDF Quiz Generator API")

# Allow CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = ROOT / "tracer" / "sessions" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

HTML_FILE = ROOT / "web" / "pdf_quiz_interface.html"


class GenerateRequest(BaseModel):
    sample_path: str | None = None
    file_name: str | None = None
    file_base64: str | None = None
    num_questions: int = 5
    difficulty: str = "adaptive"


@app.get("/", response_class=HTMLResponse)
def get_index():
    if HTML_FILE.exists():
        return HTMLResponse(content=HTML_FILE.read_text(encoding="utf-8"))
    return HTMLResponse("<h3>Error: web/pdf_quiz_interface.html not found</h3>", status_code=404)


@app.get("/api/samples")
def list_samples():
    """Lists pre-existing sample PDFs from the workspace."""
    sample_candidates = [
        ROOT / "ai_learnmate" / "backend" / "test_module_content.pdf",
        ROOT / "ai_learnmate" / "backend" / "media" / "learning_modules" / "pdfs" / "Neural_Networks_Overview.pdf",
        ROOT / "ai_learnmate" / "english_quiz_test.pdf",
    ]
    results = []
    for p in sample_candidates:
        if p.exists():
            try:
                meta = extract_pdf_metadata(p)
                results.append({
                    "name": p.name,
                    "title": meta["title"],
                    "pages": meta["total_pages"],
                    "rel_path": str(p.relative_to(ROOT)).replace("\\", "/"),
                })
            except Exception:
                continue
    return {"samples": results}


@app.post("/api/generate-quiz")
async def generate_quiz_endpoint(
    file: UploadFile | None = File(None),
    num_questions: int = Form(5),
    difficulty: str = Form("adaptive"),
    sample_rel_path: str | None = Form(None),
):
    """Processes uploaded PDF or selected sample and generates a live quiz."""
    try:
        target_pdf: Path | None = None

        if file and file.filename:
            # Save uploaded file
            safe_name = Path(file.filename).name
            target_pdf = UPLOAD_DIR / safe_name
            with target_pdf.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        elif sample_rel_path:
            candidate = ROOT / sample_rel_path
            if candidate.exists():
                target_pdf = candidate
            else:
                raise HTTPException(status_code=404, detail=f"Sample file '{sample_rel_path}' not found")
        else:
            # Default to test module if neither provided
            default_pdf = ROOT / "ai_learnmate" / "backend" / "test_module_content.pdf"
            if default_pdf.exists():
                target_pdf = default_pdf
            else:
                raise HTTPException(status_code=400, detail="No PDF file or sample path was provided.")

        # Ensure question count is valid
        n_q = max(1, min(25, int(num_questions)))

        # Invoke the real Python quiz generation engine!
        quiz: GeneratedQuiz = generate_quiz_from_pdf(target_pdf, num_questions=n_q)

        return JSONResponse(content=quiz.model_dump())

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Quiz generation error: {str(e)}")


class JSONUploadPayload(BaseModel):
    file_name: str
    file_base64: str
    num_questions: int = 5
    difficulty: str = "adaptive"


@app.post("/api/generate-quiz-base64")
def generate_quiz_base64(payload: JSONUploadPayload):
    """Base64 JSON alternative endpoint for environments with strict multipart restrictions."""
    try:
        safe_name = Path(payload.file_name).name
        target_pdf = UPLOAD_DIR / safe_name
        pdf_bytes = base64.b64decode(payload.file_base64)
        target_pdf.write_bytes(pdf_bytes)

        n_q = max(1, min(25, payload.num_questions))
        quiz: GeneratedQuiz = generate_quiz_from_pdf(target_pdf, num_questions=n_q)
        return JSONResponse(content=quiz.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def run_server(host: str = "127.0.0.1", port: int = 8000):
    import uvicorn
    print(f"[*] Starting DeadLock Quiz Studio backend at http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    run_server()

