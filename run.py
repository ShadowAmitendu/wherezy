#!/usr/bin/env python3
"""
Wherezy Server Launcher (development & local execution wrapper).

Usage:
    python run.py [--host HOST] [--port PORT] [--data-dir DIR] [--no-reload] [--open]
"""

import multiprocessing
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.cli import main  # noqa: E402


if __name__ == "__main__":
    multiprocessing.freeze_support()
    frozen = bool(getattr(sys, "frozen", False))
    raise SystemExit(main(default_reload=not frozen))
