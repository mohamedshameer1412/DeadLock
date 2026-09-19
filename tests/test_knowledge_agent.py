import pytest
from pathlib import Path

from slice.records import RunState
from slice.store import Store
from demo.knowledge_agent.flow import build_flow
from demo.knowledge_agent.schema import EvidenceValidation, GroundedAnswer, ClaimVerification, Source

def test_empty_corpus(tmp_path):
    store = Store(tmp_path / "run.db")
    flow = build_flow()
    run_id = store.create_run(domain=flow.name)
    store.append(run_id, "input", {"text": "What is deadlock?"}, produced_by="user")
    store.set_state(run_id, RunState.PROBING)
    
    # We will use a mock call that just returns empty schemas
    def mock_call(*args, **kwargs):
        raise RuntimeError("Should not call LLM on empty corpus")

    from slice.runner import advance
    from slice.config import Settings
    
    settings = Settings(
        api_key="test", model="test", fallback_model="", escalation_model="",
        max_tokens=100, max_tokens_per_run=1000, max_attempts_per_step=3,
        expert_timeout_minutes=1, langfuse_public="", langfuse_secret="",
        langfuse_host="", ollama_base_url="", ollama_model="", embedding_model="BAAI/bge-m3"
    )
    
    flow_mock = build_flow(call=mock_call)
    final_state = advance(store, run_id, flow_mock, settings)
    
    # Empty corpus -> retrieve returns no chunks -> sets supported=False -> drafting outputs NOT_SUPPORTED
    ans = store.latest(run_id, "grounded_answer")
    assert ans is not None
    assert ans["status"] == "NOT_SUPPORTED"

def test_unsupported_question(tmp_path):
    from slice.retrieve import _prepare
    store = Store(tmp_path / "run.db")
    _prepare(store)
    # Insert fake chunk
    store.db.execute("INSERT INTO chunks (chunk_id, doc, ordinal, text) VALUES ('1', 'doc.txt', 0, 'Deadlock is a state.')")
    
    def mock_call(*args, **kwargs):
        step = kwargs.get("step")
        if step == "validate":
            return EvidenceValidation(supported=False, relevant_chunks=[], reason="Not enough info.")
        if step == "generate":
            return GroundedAnswer(status="NOT_SUPPORTED", answer=None, sources=[], evidence=[], explanation="")
        
    flow_mock = build_flow(call=mock_call)
    run_id = store.create_run(domain=flow_mock.name)
    store.append(run_id, "input", {"text": "Who landed on the moon?"}, produced_by="user")
    store.set_state(run_id, RunState.PROBING)
    
    from slice.runner import advance
    from slice.config import Settings
    settings = Settings("key", "test", "", "", 100, 1000, 3, 1, "", "", "", "", "", "BAAI/bge-m3")
    
    advance(store, run_id, flow_mock, settings)
    
    ans = store.latest(run_id, "grounded_answer")
    assert ans["status"] == "NOT_SUPPORTED"

def test_unsupported_generated_claim(tmp_path):
    from slice.retrieve import _prepare, _model
    import sqlite_vec
    store = Store(tmp_path / "run.db")
    _prepare(store)
    store.db.execute("INSERT INTO chunks (chunk_id, doc, ordinal, text) VALUES ('1', 'doc.txt', 0, 'Deadlock is bad.')")
    vec = list(_model().embed(["Deadlock is bad."]))[0]
    store.db.execute("INSERT INTO chunk_vec(chunk_id, emb) VALUES ('1', ?)", (sqlite_vec.serialize_float32(vec),))
    
    call_counts = {"validate": 0, "generate": 0, "verify": 0}
    
    def mock_call(*args, **kwargs):
        step = kwargs.get("step")
        call_counts[step] += 1
        
        if step == "validate":
            return EvidenceValidation(supported=True, relevant_chunks=["1"], reason="Info present.")
        elif step == "generate":
            return GroundedAnswer(status="SUPPORTED", answer="Deadlock is bad. Also aliens exist.", sources=[Source(file_name="doc.txt", page_number=None, section=None, chunk_id="1")], evidence=["Deadlock is bad."], explanation="Generated.")
        elif step == "verify":
            # Reject because of aliens
            return ClaimVerification(status="REJECT", reason="Aliens not mentioned.")
            
    flow_mock = build_flow(call=mock_call)
    run_id = store.create_run(domain=flow_mock.name)
    store.append(run_id, "input", {"text": "What is deadlock?"}, produced_by="user")
    store.set_state(run_id, RunState.PROBING)
    
    from slice.runner import advance
    from slice.config import Settings
    settings = Settings("key", "test", "", "", 100, 1000, 3, 1, "", "", "", "", "", "BAAI/bge-m3")
    
    final_state = advance(store, run_id, flow_mock, settings)
    
    # Should fail after MAX_GENERATION_RETRIES rejections
    assert final_state == RunState.FAILED
    assert call_counts["generate"] == 2 # Max retries
    assert call_counts["verify"] == 2
