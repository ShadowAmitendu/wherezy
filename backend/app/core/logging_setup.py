"""Rotating file logging and frozen windowed stdio redirection for Wherezy."""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import sys
import threading
from typing import Sequence

_HANDLER_ATTR = "_wherezy_rotating_handler"
_STDIO_LOCK = threading.RLock()
_FILE_HANDLER: RotatingFileHandler | None = None


def _is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def get_logs_dir(platform: str | None = None) -> Path:
    """Resolve the persistent per-user log directory outside the install folder."""
    override = os.getenv("WHEREZY_LOGS_DIR")
    if override:
        return Path(override).expanduser().resolve()

    plat = platform or sys.platform
    if plat == "win32":
        local_appdata = os.getenv("LOCALAPPDATA")
        base = Path(local_appdata).expanduser() if local_appdata else Path.home() / "AppData" / "Local"
        return base / "Wherezy" / "logs"
    if plat == "darwin":
        return Path.home() / "Library" / "Application Support" / "Wherezy" / "logs"

    xdg_state = os.getenv("XDG_STATE_HOME")
    base = Path(xdg_state).expanduser() if xdg_state else Path.home() / ".local" / "state"
    return base / "wherezy" / "logs"


class _StreamToLogger:
    """UTF-8 line-buffered stream adapter for stdout/stderr redirection."""

    encoding = "utf-8"
    errors = "replace"

    def __init__(self, logger: logging.Logger, level: int) -> None:
        self._logger = logger
        self._level = level
        self._buffer = ""
        self._lock = threading.Lock()

    def write(self, data: str) -> int:
        if not data:
            return 0
        with self._lock:
            self._buffer += str(data)
            while "\n" in self._buffer:
                line, self._buffer = self._buffer.split("\n", 1)
                text = line.rstrip("\r")
                if text:
                    self._logger.log(self._level, "%s", text)
        return len(data)

    def writelines(self, lines) -> None:
        for line in lines:
            self.write(line)

    def flush(self) -> None:
        with self._lock:
            text = self._buffer.rstrip("\r\n")
            self._buffer = ""
        if text:
            self._logger.log(self._level, "%s", text)

    def isatty(self) -> bool:
        return False

    def writable(self) -> bool:
        return True


def _has_flag(argv: Sequence[str], flags: Sequence[str]) -> bool:
    for arg in argv:
        for flag in flags:
            if arg == flag or arg.startswith(f"{flag}="):
                return True
    return False


def ensure_rotating_log_handler(logs_dir: Path | None = None) -> tuple[RotatingFileHandler | None, Path | None]:
    """Create or reuse the shared rotating log file handler."""
    global _FILE_HANDLER
    with _STDIO_LOCK:
        target_dir = (logs_dir or get_logs_dir()).resolve()
        log_file = target_dir / "wherezy.log"
        if _FILE_HANDLER is not None and Path(_FILE_HANDLER.baseFilename).resolve() == log_file:
            return _FILE_HANDLER, log_file

        try:
            target_dir.mkdir(parents=True, exist_ok=True)
            handler = RotatingFileHandler(
                log_file,
                maxBytes=2 * 1024 * 1024,
                backupCount=5,
                encoding="utf-8",
            )
            handler.setLevel(logging.INFO)
            handler.setFormatter(
                logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
            )
            setattr(handler, _HANDLER_ATTR, True)
        except OSError:
            return None, None

        _LOG_PARENTS = ("wherezy", "wherezy.stdio", "uvicorn", "backend")
        if _FILE_HANDLER is not None:
            for name in (*_LOG_PARENTS, "wherezy.desktop", "uvicorn.error", "uvicorn.access"):
                logger = logging.getLogger(name)
                if _FILE_HANDLER in logger.handlers:
                    logger.removeHandler(_FILE_HANDLER)
            try:
                _FILE_HANDLER.close()
            except Exception:
                pass

        _FILE_HANDLER = handler

        # Attach only to top-level namespaces so propagated child logs aren't duplicated
        for name in ("wherezy", "uvicorn", "backend"):
            logger = logging.getLogger(name)
            if logger.level == logging.NOTSET:
                logger.setLevel(logging.INFO)
            if not any(getattr(h, _HANDLER_ATTR, False) for h in logger.handlers):
                logger.addHandler(handler)

        stdio_logger = logging.getLogger("wherezy.stdio")
        stdio_logger.setLevel(logging.INFO)
        stdio_logger.propagate = False
        if not any(getattr(h, _HANDLER_ATTR, False) for h in stdio_logger.handlers):
            stdio_logger.addHandler(handler)

        return handler, log_file


def configure_logging_and_stdio(raw_args: Sequence[str] | None = None, *, fallback_stream_factory=None) -> Path | None:
    """Ensure valid UTF-8 stdio streams and rotating file logging when frozen/windowed."""
    args_list = list(raw_args) if raw_args is not None else sys.argv[1:]
    wants_console_output = _has_flag(
        args_list,
        ("-h", "--help", "--version", "--headless", "--cli", "--host", "--port", "--data-dir", "--quit"),
    )

    if sys.platform == "win32" and wants_console_output:
        if sys.stdout is None or sys.stderr is None:
            try:
                import ctypes

                if ctypes.windll.kernel32.AttachConsole(-1):
                    if sys.stdout is None:
                        sys.stdout = open("CONOUT$", "w", encoding="utf-8", errors="replace", buffering=1)
                    if sys.stderr is None:
                        sys.stderr = open("CONOUT$", "w", encoding="utf-8", errors="replace", buffering=1)
            except Exception:
                pass

    log_file: Path | None = None
    handler: RotatingFileHandler | None = None
    if _is_frozen() or os.getenv("WHEREZY_LOG_TO_FILE") == "1" or sys.stdout is None or sys.stderr is None:
        handler, log_file = ensure_rotating_log_handler()

    stdio_logger = logging.getLogger("wherezy.stdio")

    if sys.stdout is None:
        if handler is not None:
            sys.stdout = _StreamToLogger(stdio_logger, logging.INFO)  # type: ignore[assignment]
        elif fallback_stream_factory is not None:
            sys.stdout = fallback_stream_factory()

    if sys.stderr is None:
        if handler is not None:
            sys.stderr = _StreamToLogger(stdio_logger, logging.ERROR)  # type: ignore[assignment]
        elif fallback_stream_factory is not None:
            sys.stderr = fallback_stream_factory()

    # In frozen GUI mode even when handles exist, still avoid losing uncaught print output
    # when standard handles aren't attached to a console; sys.stdout is already redirected above
    # when sys.stdout is None (standard PyInstaller console=False behavior).
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass

    return log_file
