from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field

class Source(BaseModel):
    """Provenance for a retrieved chunk."""
    file_name: str = Field(description="The source document name")
    page_number: int | None = Field(description="Page number, if available")
    section: str | None = Field(description="Section or header, if available")
    chunk_id: str = Field(description="The unique chunk ID")

class EvidenceValidation(BaseModel):
    """Result of checking if retrieved chunks contain sufficient evidence."""
    supported: bool = Field(description="True ONLY if the chunks contain sufficient information to fully answer the question.")
    relevant_chunks: list[str] = Field(description="List of chunk_ids that contain relevant information.")
    reason: str = Field(description="Reasoning for why the evidence is sufficient or insufficient.")

class GroundedAnswer(BaseModel):
    """The generated answer, grounded strictly in the provided sources."""
    status: Literal["SUPPORTED", "NOT_SUPPORTED", "CONFLICT"]
    answer: str | None = Field(description="The actual answer. None if status is NOT_SUPPORTED.")
    sources: list[Source] = Field(description="Sources used to generate the answer.")
    evidence: list[str] = Field(description="Exact quotes from the sources that support the answer.")
    explanation: str = Field(description="Step-by-step reasoning for the answer based ONLY on the evidence.")

class ClaimVerification(BaseModel):
    """Result of verifying that generated claims match the evidence."""
    status: Literal["SUPPORTED", "REJECT"]
    reason: str = Field(description="If REJECT, explain which specific factual claims are NOT present in the evidence. If SUPPORTED, write a brief success note.")
