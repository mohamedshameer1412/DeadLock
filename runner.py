"""Root CLI entrypoint for Root-Cause Error Tracer.

Allows running directly from workspace root:
  python runner.py --topic binary_trees --student shameer --clear
  python runner.py --topic binary_trees --student shameer --resume
  python runner.py --topic binary_trees --student shameer --stub
"""

import sys
from pathlib import Path

# Ensure workspace root is in sys.path
root_dir = Path(__file__).resolve().parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from tracer.runner import main

if __name__ == "__main__":
    main()

