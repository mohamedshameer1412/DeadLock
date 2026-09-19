import argparse
from pathlib import Path
import json

from slice.config import settings
from slice.store import Store
from slice.records import RunState
from slice.runner import advance
from slice.retrieve import ingest

from .flow import build_flow

def main():
    parser = argparse.ArgumentParser(description="Knowledge Agent CLI")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose output")
    subparsers = parser.add_subparsers(dest="command")

    idx_parser = subparsers.add_parser("index")
    idx_parser.add_argument("--folder", required=True, help="Folder containing documents")

    ask_parser = subparsers.add_parser("ask")
    ask_parser.add_argument("query", help="The question to ask")

    trace_parser = subparsers.add_parser("trace")
    trace_parser.add_argument("--run-id", help="Specific run ID to trace")

    args = parser.parse_args()
    store = Store()

    if args.command == "index":
        print(f"Indexing documents in {args.folder}...")
        res = ingest(store, args.folder)
        print(json.dumps(res, indent=2))
        
    elif args.command == "ask":
        flow = build_flow()
        run_id = store.create_run(domain=flow.name)
        store.append(run_id, "input", {"text": args.query}, produced_by="user")
        store.set_state(run_id, RunState.PROBING)
        
        print(f"Agent started. Run ID: {run_id}\nQuestion: {args.query}\nProcessing...")
        final_state = advance(store, run_id, flow, settings(reload=True))
        
        print(f"\nFinal Agent State: {final_state.value}")
        ans = store.latest(run_id, "grounded_answer")
        
        if ans:
            print("\n" + "="*40)
            print("ANSWER")
            print("="*40)
            print(ans.get("answer") or f"[{ans.get('status')}]")
            
            if ans.get("sources"):
                print("\nSOURCE")
                print("-" * 6)
                for s in ans["sources"]:
                    loc = []
                    if s.get("page_number"): loc.append(f"Page: {s['page_number']}")
                    if s.get("section"): loc.append(f"Section: {s['section']}")
                    loc_str = "\n".join(loc)
                    print(f"[FILE] {s['file_name']}")
                    if loc_str:
                        print(loc_str)
                    print()
                    
            if ans.get("evidence"):
                print("\nEVIDENCE")
                print("-" * 8)
                for e in ans["evidence"]:
                    print(f'"{e}"\n')
                    
            print("\nVERIFICATION / GROUNDING")
            print("-" * 24)
            print(ans.get("explanation"))
            print("="*40)
        else:
            fail = store.latest(run_id, "failure")
            print(f"\nFailed to generate an answer.\nReason: {json.dumps(fail, indent=2)}")
            
    elif args.command == "trace":
        runs = store.list_runs(limit=1) if not args.run_id else [{"id": args.run_id}]
        if not runs:
            print("No runs found.")
            return
        run_id = runs[0]["id"]
        print(f"Trace for Run {run_id}:")
        history = store.replay(run_id)
        for v in history:
            print(f"\n[{v.seq}] {v.kind.upper()} (by {v.produced_by})")
            if v.kind != "retrieval_attempt": # omit chunks from trace print
                print(json.dumps(v.payload, indent=2))
            else:
                print(f"Retrieved {len(v.payload.get('chunks', []))} chunks.")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
