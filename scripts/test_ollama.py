"""Diagnostic: verify Ollama/Qwen3 response structure for the knowledge agent.

IMPORTANT: reasoning != final answer
The message["reasoning"] field is Qwen3's internal chain-of-thought.
It must NEVER be used as the grounded answer or as evidence.
Only message["content"] is used as the model output.
"""
import httpx
import json
import sys

BASE = "http://localhost:11434"


def check_connectivity():
    print("=== Ollama Connectivity ===")
    try:
        r = httpx.get(f"{BASE}/api/tags", timeout=5)
        models = [m["name"] for m in r.json().get("models", [])]
        print(f"  Status:         OK")
        print(f"  Models:         {models}")
        return True
    except Exception as e:
        print(f"  Status:         UNREACHABLE")
        print(f"  Error:          {e}")
        return False


def call_model(max_tokens: int, prompt: str, model: str = "qwen3:8b") -> dict:
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": "You are a JSON output system. Return valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
    }
    r = httpx.post(f"{BASE}/v1/chat/completions", json=body, timeout=120)
    return r.status_code, r.json()


def report(label, status_code, data):
    print(f"\n--- {label} ---")
    choice = data["choices"][0]
    msg = choice["message"]
    content = msg.get("content") or ""
    reasoning = msg.get("reasoning") or ""
    finish = choice.get("finish_reason", "unknown")
    usage = data.get("usage", {})

    print(f"  Model:              {data.get('model', '?')}")
    print(f"  HTTP:               {status_code}")
    print(f"  Finish reason:      {finish}")
    print(f"  Content length:     {len(content)}")
    print(f"  Reasoning length:   {len(reasoning)}")
    print(f"  Content available:  {'YES' if content.strip() else 'NO  <-- PROBLEM'}")
    print(f"  Reasoning avail:    {'YES (internal only, not used as answer)' if reasoning.strip() else 'NO'}")
    print(f"  Tokens used:        {usage.get('completion_tokens', '?')} completion / {usage.get('total_tokens', '?')} total")
    if content.strip():
        print(f"  Content preview:    {repr(content[:200])}")
    if finish == "length" and not content.strip():
        print(f"  DIAGNOSIS:          MODEL_GENERATION_LIMIT — reasoning consumed entire budget.")
        print(f"                      Fix: raise SLICE_MAX_TOKENS in .env")
    elif finish == "length" and content.strip():
        print(f"  DIAGNOSIS:          TRUNCATED — content was cut off mid-reply.")
    elif not content.strip():
        print(f"  DIAGNOSIS:          MODEL_EMPTY_RESPONSE — unknown cause, check Ollama logs.")
    else:
        print(f"  DIAGNOSIS:          OK")


if __name__ == "__main__":
    if not check_connectivity():
        sys.exit(1)

    simple_prompt = 'Return exactly: {"supported": true, "relevant_chunks": ["c1"], "reason": "test ok"}'

    print("\n=== Test A: 1200 tokens (old default) ===")
    code, data = call_model(1200, simple_prompt)
    report("1200 tokens", code, data)

    print("\n=== Test B: 8192 tokens (new .env setting) ===")
    code, data = call_model(8192, simple_prompt)
    report("8192 tokens", code, data)

    print("\n=== Test C: Realistic agent prompt at 8192 tokens ===")
    agent_prompt = (
        "QUESTION:\nExplain range partitioning\n\n"
        "EVIDENCE:\n[chunk001] doc.pdf (p1)#0\n"
        "Range partitioning is a method of dividing data into partitions based on ranges of values.\n\n"
        "Based ONLY on the evidence above, return a JSON object matching this schema:\n"
        '{"supported": <bool>, "relevant_chunks": [<list of chunk_ids>], "reason": <string>}'
    )
    code, data = call_model(8192, agent_prompt)
    report("Realistic agent prompt @ 8192", code, data)

    print()
    print("NOTE: reasoning field is internal chain-of-thought only.")
    print("      It is NEVER used as the answer or as evidence.")
