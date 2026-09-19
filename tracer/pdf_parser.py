"""PDF text extraction and preprocessing for arbitrary documents.

Uses pypdf to extract clean, normalized text from any uploaded PDF file,
with metadata inspection and semantic chunking for large documents.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from pypdf import PdfReader


def extract_text_from_pdf(
    pdf_path: str | Path,
    max_pages: int | None = None,
) -> str:
    """Extracts raw text from all (or up to max_pages) pages of a PDF file.

    Raises FileNotFoundError if the file does not exist.
    Raises ValueError if the PDF contains no extractable text.
    """
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF file not found at: {path}")

    reader = PdfReader(str(path))
    pages_to_read = len(reader.pages)
    if max_pages is not None:
        pages_to_read = min(pages_to_read, max_pages)

    extracted_pages: list[str] = []
    for i in range(pages_to_read):
        page = reader.pages[i]
        page_text = page.extract_text() or ""
        # Normalize excessive whitespace and linebreaks
        cleaned = re.sub(r"[ \t]+", " ", page_text)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
        if cleaned:
            extracted_pages.append(cleaned)

    full_text = "\n\n".join(extracted_pages).strip()
    if not full_text:
        raise ValueError(
            f"No readable text could be extracted from '{path.name}'. "
            "The document might be an image-only scan or password-protected."
        )

    return full_text


def extract_pdf_metadata(pdf_path: str | Path) -> dict[str, Any]:
    """Inspects a PDF and returns metadata including page count and summary excerpt."""
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF file not found at: {path}")

    reader = PdfReader(str(path))
    page_count = len(reader.pages)

    sample_text = ""
    for page in reader.pages[:3]:
        t = page.extract_text() or ""
        if t.strip():
            sample_text += t + " "
        if len(sample_text) > 600:
            break

    # Clean title / excerpt
    title = path.stem.replace("_", " ").replace("-", " ").title()
    if reader.metadata and reader.metadata.title:
        title = reader.metadata.title

    word_count = len(sample_text.split())

    return {
        "file_name": path.name,
        "file_path": str(path.resolve()),
        "title": title,
        "total_pages": page_count,
        "sample_excerpt": sample_text[:300].strip() + ("..." if len(sample_text) > 300 else ""),
        "approximate_words": word_count * page_count,
    }


def chunk_text(text: str, max_chars: int = 6000, overlap: int = 400) -> list[str]:
    """Splits text into manageable chunks respecting paragraph breaks."""
    if len(text) <= max_chars:
        return [text]

    paragraphs = text.split("\n\n")
    chunks: list[str] = []
    current_chunk: list[str] = []
    current_length = 0

    for para in paragraphs:
        para_len = len(para)
        if current_length + para_len > max_chars and current_chunk:
            chunk_str = "\n\n".join(current_chunk)
            chunks.append(chunk_str)
            # Keep overlap
            current_chunk = [para]
            current_length = para_len
        else:
            current_chunk.append(para)
            current_length += para_len + 2

    if current_chunk:
        chunks.append("\n\n".join(current_chunk))

    return chunks

