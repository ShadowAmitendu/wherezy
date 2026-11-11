"""Desktop executable entrypoint for PyInstaller (`wherezy.spec`) and source launches."""

from __future__ import annotations

import multiprocessing
from pathlib import Path
import sys
from typing import Sequence


def _ensure_repo_on_path() -> None:
    if getattr(sys, "frozen", False):
        return
    repo_root = Path(__file__).resolve().parent
    if (repo_root / "backend" / "app").is_dir() and str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))


def main(argv: Sequence[str] | None = None) -> int:
    multiprocessing.freeze_support()
    _ensure_repo_on_path()

    raw_args = list(sys.argv[1:] if argv is None else argv)

    from backend.app.core.logging_setup import configure_logging_and_stdio

    configure_logging_and_stdio(raw_args)

    from backend.app.cli import (
        _has_flag,
        build_parser,
        launch_desktop_from_args,
        main as cli_main,
        should_launch_gui,
    )

    if not should_launch_gui(raw_args) or _has_flag(
        raw_args,
        ("--quit", "--enable-autostart", "--disable-autostart", "--headless", "--cli"),
    ):
        return cli_main(raw_args)

    args = build_parser(default_reload=False).parse_args(raw_args)
    return launch_desktop_from_args(args, raw_args)


if __name__ == "__main__":
    raise SystemExit(main())
