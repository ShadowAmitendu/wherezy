"""Frozen executable entrypoint wrapper delegating to repo-root `desktop_main.py`."""

import multiprocessing
from pathlib import Path
import sys

_ROOT = Path(__file__).resolve().parent.parent
if not getattr(sys, "frozen", False) and str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from desktop_main import main  # noqa: E402


if __name__ == "__main__":
    multiprocessing.freeze_support()
    raise SystemExit(main())
