"""Frozen executable entrypoint for PyInstaller builds of Wherezy."""

import multiprocessing
from backend.app.cli import main


if __name__ == "__main__":
    multiprocessing.freeze_support()
    raise SystemExit(main())
