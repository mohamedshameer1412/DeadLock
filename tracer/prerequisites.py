import json
from pathlib import Path


def _load_prerequisites():
    return json.loads(Path(__file__).resolve().parent.joinpath("prerequisites.json").read_text(encoding="utf-8"))
