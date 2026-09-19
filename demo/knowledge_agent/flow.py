"""The handlers and domain rules for the Knowledge Agent."""
from __future__ import annotations

import json
from types import SimpleNamespace

from slice.llm import complete
from slice.records import RunState
from slice.retrieve import search

from .schema import EvidenceValidation, GroundedAnswer, ClaimVerification
from .prompts import VALIDATION_PROMPT, GENERATION_PROMPT, VERIFICATION_PROMPT

MAX_RETRIEVAL_ATTEMPTS = 3
MAX_GENERATION_RETRIES = 2

def build_flow(call=complete):
    
    def handle_probing(ctx) -> RunState:
        """Retrieval and Evidence Validation (PROBING state)."""
        input_record = ctx.latest("input")
        if not input_record:
            ctx.append("failure", {"kind": "missing_input", "detail": "No input provided."}, "system")
            return RunState.FAILED
            
        question = input_record["text"]
        
        attempts = ctx.history("retrieval_attempt")
        if len(attempts) >= MAX_RETRIEVAL_ATTEMPTS:
            # We failed to find sufficient evidence after max attempts. Transition to drafting to return NOT_SUPPORTED.
            return RunState.DRAFTING
            
        # Basic query reformulation for retries could happen here. For now, use the original question.
        query = question
        
        chunks = search(ctx.store, query, k=5)
        chunk_dicts = []
        for c in chunks:
            chunk_dicts.append({
                "chunk_id": c.chunk_id,
                "doc": c.doc,
                "page": c.page,
                "section": c.section,
                "ordinal": c.ordinal,
                "text": c.text,
                "cite": c.cite()
            })
            
        ctx.append("retrieval_attempt", {"query": query, "chunks": chunk_dicts}, "system")
        
        if not chunks:
            ctx.append("evidence_validation", {"supported": False, "relevant_chunks": [], "reason": "No documents found."}, "agent:validator")
            return RunState.DRAFTING
            
        chunks_text = "\n\n".join(f"[{c['chunk_id']}] {c['cite']}\n{c['text']}" for c in chunk_dicts)
        messages = [
            {"role": "system", "content": VALIDATION_PROMPT},
            {"role": "user", "content": f"QUESTION:\n{question}\n\nCHUNKS:\n{chunks_text}"}
        ]
        
        validation = call(settings=ctx.settings, budget=ctx.budget, messages=messages, schema=EvidenceValidation, step="validate")
        ctx.append("evidence_validation", validation.model_dump(), "agent:validator")
        
        # Evidence validation is done, move to drafting (if unsupported, drafting will generate NOT_SUPPORTED response)
        return RunState.DRAFTING

    def handle_drafting(ctx) -> RunState:
        """Generation of Grounded Answer (DRAFTING state)."""
        input_record = ctx.latest("input")
        question = input_record["text"]
        
        generations = ctx.history("grounded_answer")
        if len(generations) >= MAX_GENERATION_RETRIES:
            ctx.append("failure", {"kind": "generation_exhausted", "detail": "Failed to generate a supported answer after max retries."}, "system")
            return RunState.FAILED
            
        # Get the latest validation and chunks
        val = ctx.latest("evidence_validation")
        retrieval = ctx.latest("retrieval_attempt")
        
        if not val or not val.get("supported"):
            # Evidence was insufficient. Output NOT_SUPPORTED directly to avoid hallucination.
            answer_payload = {
                "status": "NOT_SUPPORTED",
                "answer": None,
                "sources": [],
                "evidence": [],
                "explanation": val.get("reason", "Insufficient evidence.") if val else "No evidence found."
            }
            ctx.append("grounded_answer", answer_payload, "system")
            return RunState.COMPLETE
            
        chunks = retrieval["chunks"]
        chunks_text = "\n\n".join(f"[{c['chunk_id']}] {c['cite']}\n{c['text']}" for c in chunks)
        
        # If there are verification failures in history, pass them as feedback
        verifications = ctx.history("claim_verification")
        feedback = ""
        if verifications and verifications[-1].payload.get("status") == "REJECT":
            feedback = f"\n\nPREVIOUS ATTEMPT REJECTED:\n{verifications[-1].payload.get('reason')}\nPlease fix these issues and ensure ALL claims are supported."
            
        messages = [
            {"role": "system", "content": GENERATION_PROMPT},
            {"role": "user", "content": f"QUESTION:\n{question}\n\nEVIDENCE:\n{chunks_text}{feedback}"}
        ]
        
        answer = call(settings=ctx.settings, budget=ctx.budget, messages=messages, schema=GroundedAnswer, step="generate")
        ctx.append("grounded_answer", answer.model_dump(), "agent:generator")
        
        if answer.status != "SUPPORTED":
            # If the model explicitly says NOT_SUPPORTED or CONFLICT, we accept it and finish.
            return RunState.COMPLETE
            
        return RunState.GATING

    def handle_gating(ctx) -> RunState:
        """Verification of Generated Claims (GATING state)."""
        answer_record = ctx.latest("grounded_answer")
        retrieval_record = ctx.latest("retrieval_attempt")
        
        chunks = retrieval_record["chunks"]
        chunks_text = "\n\n".join(f"[{c['chunk_id']}] {c['cite']}\n{c['text']}" for c in chunks)
        
        messages = [
            {"role": "system", "content": VERIFICATION_PROMPT},
            {"role": "user", "content": f"GENERATED ANSWER:\n{json.dumps(answer_record, indent=2)}\n\nEVIDENCE:\n{chunks_text}"}
        ]
        
        verification = call(settings=ctx.settings, budget=ctx.budget, messages=messages, schema=ClaimVerification, step="verify")
        ctx.append("claim_verification", verification.model_dump(), "agent:verifier")
        
        if verification.status == "SUPPORTED":
            return RunState.COMPLETE
        else:
            return RunState.DRAFTING

    return SimpleNamespace(
        name="knowledge_agent",
        handlers={
            RunState.PROBING: handle_probing,
            RunState.DRAFTING: handle_drafting,
            RunState.GATING: handle_gating,
        },
    )
