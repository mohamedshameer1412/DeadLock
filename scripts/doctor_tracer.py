"""Diagnostic script for Root-Cause Error Tracer environment and dependencies.

Checks:
1. Python runtime & pydantic dependency.
2. Prerequisite graph DAG validity (no cycles, no dangling references).
3. Local Ollama server connectivity & model availability.
4. OpenRouter API fallback configuration.
5. Session directory read/write permissions.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

# Add project root to path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def check_python() -> bool:
    print(f"[*] Python version: {sys.version.split()[0]}")
    try:
        import pydantic

        print(f"  [PASS] pydantic installed ({pydantic.__version__})")
        return True
    except ImportError:
        print("  [FAIL] pydantic is not installed (pip install pydantic)")
        return False


def check_graph() -> bool:
    graph_path = ROOT / "tracer" / "prerequisites.json"
    if not graph_path.exists():
        print(f"  [FAIL] Missing {graph_path}")
        return False
    try:
        graph = json.loads(graph_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  [FAIL] JSON parse error in {graph_path}: {e}")
        return False

    # Check for dangling prerequisite pointers
    errors = []
    for topic_id, data in graph.items():
        prereq = data.get("prerequisite")
        if prereq and prereq not in graph:
            errors.append(f"Topic '{topic_id}' points to unknown prerequisite '{prereq}'")

    # Check for cycles
    def has_cycle(node: str, visited: set[str], path: list[str]) -> bool:
        if node in path:
            return True
        prereq = graph.get(node, {}).get("prerequisite")
        if not prereq or prereq not in graph:
            return False
        return has_cycle(prereq, visited, path + [node])

    for topic_id in graph:
        if has_cycle(topic_id, set(), []):
            errors.append(f"Cycle detected starting at '{topic_id}'")

    if errors:
        for err in errors:
            print(f"  [FAIL] {err}")
        return False

    print(f"  [PASS] Prerequisite graph verified ({len(graph)} nodes, DAG valid, no cycles)")
    return True


def check_ollama() -> bool:
    host = os.getenv("OLLAMA_HOST") or "http://127.0.0.1:11434"
    print(f"[*] Checking local Ollama endpoint at {host}...")
    try:
        req = urllib.request.Request(f"{host}/api/tags", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = [m.get("name") for m in data.get("models", [])]
            print(f"  [PASS] Ollama server is running. Available models: {', '.join(models) or 'None'}")
            model_target = os.getenv("OLLAMA_MODEL") or "llama3.1:8b"
            matched = any(model_target in m for m in models)
            if matched:
                print(f"  [PASS] Target model '{model_target}' is installed and ready.")
            else:
                print(f"  [NOTE] Target model '{model_target}' not found. Run: ollama pull {model_target}")
            return True
    except Exception:
        print(f"  [INFO] Local Ollama server not reachable at {host}.")
        print("         Agent will automatically use OpenRouter API fallback or deterministic heuristic mode.")
        return False


def check_openrouter() -> bool:
    env_file = ROOT / ".env"
    key = os.getenv("OPENROUTER_API_KEY")
    if not key and env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("OPENROUTER_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("\"'")
                break
    if key and key.startswith("sk-or-"):
        print(f"  [PASS] OpenRouter API key detected ({key[:10]}...) - available as cloud fallback.")
        return True
    else:
        print("  [INFO] OpenRouter API key not configured (optional). Agent will use local Ollama / heuristic mode.")
        return False


def check_sessions() -> bool:
    sess_dir = ROOT / "tracer" / "sessions"
    sess_dir.mkdir(parents=True, exist_ok=True)
    test_file = sess_dir / ".write_test"
    try:
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink()
        print(f"  [PASS] Session storage directory is writable ({sess_dir})")
        return True
    except Exception as e:
        print(f"  [FAIL] Cannot write to {sess_dir}: {e}")
        return False


def main():
    print("=" * 60)
    print("      ROOT-CAUSE ERROR TRACER - SYSTEM DOCTOR")
    print("=" * 60)
    p = check_python()
    g = check_graph()
    o = check_ollama()
    r = check_openrouter()
    s = check_sessions()
    print("=" * 60)
    if p and g and s:
        print("[READY] All core requirements are satisfied. You can run:")
        print("        python runner.py --topic binary_trees --student demo --stub")
    else:
        print("[WARNING] Some checks failed. Review issues above.")
    print("=" * 60)


if __name__ == "__main__":
    main()

