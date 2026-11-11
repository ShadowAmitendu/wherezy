"""Thread-safe embedded Uvicorn server lifecycle controller for Wherezy Desktop."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime
import logging
import os
from pathlib import Path
import socket
import sys
import threading
import time
from typing import Callable

from backend.app.core.runtime_state import set_server_paused


def get_local_ip() -> str:
    """Resolve the active LAN IPv4 address for display, falling back to 127.0.0.1."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("10.255.255.255", 1))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


@dataclass(frozen=True)
class ServerSnapshot:
    """Immutable view of current desktop server state for UI/tray rendering."""

    status: str  # "stopped" | "starting" | "running" | "paused" | "error"
    host: str
    port: int
    data_dir: str
    local_url: str
    lan_url: str
    error_message: str | None = None


class _MemoryLogHandler(logging.Handler):
    """Captures server and application logs into a bounded callback-backed buffer."""

    def __init__(self, on_line: Callable[[str], None]) -> None:
        super().__init__(level=logging.INFO)
        self._on_line = on_line
        self.setFormatter(
            logging.Formatter("[%(asctime)s] %(levelname)s %(name)s: %(message)s", "%H:%M:%S")
        )

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
        except Exception:
            msg = record.getMessage()
        self._on_line(msg)


class WherezyServerManager:
    """Manages an in-process Uvicorn server on a dedicated background thread."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._status: str = "stopped"
        self._host: str = "0.0.0.0"
        self._port: int = 8000
        self._data_dir: str = ""
        self._error_message: str | None = None

        self._server = None
        self._thread: threading.Thread | None = None
        self._bound_data_dir: str | None = None

        self._logs: deque[str] = deque(maxlen=500)
        self._state_listeners: list[Callable[[ServerSnapshot], None]] = []
        self._log_listeners: list[Callable[[str], None]] = []

        self._log_handler = _MemoryLogHandler(self._append_log)
        self._logging_wired = False

    def _wire_logging(self) -> None:
        if self._logging_wired:
            return
        for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "backend"):
            logger = logging.getLogger(name)
            logger.setLevel(logging.INFO)
            if self._log_handler not in logger.handlers:
                logger.addHandler(self._log_handler)
        self._logging_wired = True

    def add_state_listener(self, cb: Callable[[ServerSnapshot], None]) -> None:
        with self._lock:
            if cb not in self._state_listeners:
                self._state_listeners.append(cb)

    def add_log_listener(self, cb: Callable[[str], None]) -> None:
        with self._lock:
            if cb not in self._log_listeners:
                self._log_listeners.append(cb)

    def get_logs(self) -> list[str]:
        with self._lock:
            return list(self._logs)

    def clear_logs(self) -> None:
        with self._lock:
            self._logs.clear()

    def _append_log(self, line: str) -> None:
        with self._lock:
            self._logs.append(line)
            listeners = list(self._log_listeners)
        for cb in listeners:
            try:
                cb(line)
            except Exception:
                pass

    def log_event(self, message: str) -> None:
        ts = datetime.now().strftime("%H:%M:%S")
        self._append_log(f"[{ts}] INFO wherezy.desktop: {message}")

    def snapshot(self) -> ServerSnapshot:
        with self._lock:
            port = self._port
            host = self._host
            display_local_host = "127.0.0.1" if host in {"0.0.0.0", "::", ""} else host
            local_url = f"http://{display_local_host}:{port}"
            if host in {"0.0.0.0", "::", ""}:
                lan_url = f"http://{get_local_ip()}:{port}"
            else:
                lan_url = local_url
            return ServerSnapshot(
                status=self._status,
                host=host,
                port=port,
                data_dir=self._data_dir,
                local_url=local_url,
                lan_url=lan_url,
                error_message=self._error_message,
            )

    def _emit_state(self) -> None:
        snap = self.snapshot()
        with self._lock:
            listeners = list(self._state_listeners)
        for cb in listeners:
            try:
                cb(snap)
            except Exception:
                pass

    def needs_process_restart_for_data_dir(self, data_dir: str) -> bool:
        """Return True if DB engine was already initialized for another data folder."""
        resolved = str(Path(data_dir).expanduser().resolve())
        with self._lock:
            return bool(self._bound_data_dir and self._bound_data_dir != resolved)

    def start(
        self,
        *,
        host: str,
        port: int,
        data_dir: str,
        wait_timeout: float = 8.0,
    ) -> ServerSnapshot:
        """Start the embedded FastAPI + Uvicorn server and wait for startup readiness."""
        resolved_data = str(Path(data_dir).expanduser().resolve())
        Path(resolved_data).mkdir(parents=True, exist_ok=True)

        with self._lock:
            if self._status in {"running", "paused", "starting"}:
                if self._status == "paused":
                    return self.resume()
                return self.snapshot()

            if self.needs_process_restart_for_data_dir(resolved_data):
                self._status = "error"
                self._error_message = (
                    "Data folder changed after initial load; relaunch Wherezy to switch databases."
                )
                self._emit_state()
                return self.snapshot()

            self._host = host.strip() or "0.0.0.0"
            self._port = int(port)
            self._data_dir = resolved_data
            self._error_message = None
            self._status = "starting"
            set_server_paused(False)
            self._wire_logging()

        os.environ["WHEREZY_DATA_DIR"] = resolved_data
        os.environ["DATA_DIR"] = resolved_data
        os.environ["WHEREZY_HOST"] = self._host
        os.environ["WHEREZY_PORT"] = str(self._port)

        self._emit_state()
        self.log_event(f"Starting server on {self._host}:{self._port} (data: {resolved_data})")

        import uvicorn
        from backend.app.main import app as fastapi_app

        with self._lock:
            self._bound_data_dir = resolved_data

        config = uvicorn.Config(
            fastapi_app,
            host=self._host,
            port=self._port,
            log_config=None,
            access_log=True,
            lifespan="on",
        )
        server = uvicorn.Server(config)
        # Uvicorn installs signal handlers by default when running on main thread;
        # avoid overriding signals from our background server thread.
        server.install_signal_handlers = lambda: None  # type: ignore[method-assign]

        def _serve() -> None:
            caught_error: str | None = None
            try:
                server.run()
            except SystemExit as exc:
                code = exc.code if isinstance(exc.code, int) else 1
                if code != 0:
                    caught_error = (
                        f"Server could not bind to {self._host}:{self._port} "
                        "(port may already be in use)."
                    )
            except OSError as exc:
                caught_error = f"Network error on {self._host}:{self._port}: {exc}"
            except BaseException as exc:
                caught_error = f"Server stopped unexpectedly: {exc}"
            finally:
                set_server_paused(False)
                with self._lock:
                    was_requested_stop = bool(getattr(server, "should_exit", False))
                    self._server = None
                    self._thread = None
                    if caught_error:
                        self._status = "error"
                        self._error_message = caught_error
                    elif not was_requested_stop and self._status in {"starting", "running", "paused"}:
                        self._status = "error"
                        self._error_message = (
                            f"Server exited unexpectedly on {self._host}:{self._port}."
                        )
                    else:
                        self._status = "stopped"
                        self._error_message = None
                if caught_error:
                    self.log_event(caught_error)
                else:
                    self.log_event("Server stopped.")
                self._emit_state()

        thread = threading.Thread(target=_serve, name="wherezy-uvicorn", daemon=True)
        with self._lock:
            self._server = server
            self._thread = thread
        thread.start()

        deadline = time.monotonic() + max(0.5, wait_timeout)
        while time.monotonic() < deadline:
            if getattr(server, "started", False):
                with self._lock:
                    if self._status == "starting":
                        self._status = "running"
                self.log_event(f"Server listening on http://127.0.0.1:{self._port}")
                self._emit_state()
                return self.snapshot()
            if not thread.is_alive():
                thread.join(timeout=0.5)
                break
            time.sleep(0.05)

        if not thread.is_alive():
            thread.join(timeout=0.5)

        return self.snapshot()

    def pause(self) -> ServerSnapshot:
        """Hold incoming requests with HTTP 503 while keeping the port bound."""
        with self._lock:
            if self._status != "running":
                return self.snapshot()
            set_server_paused(True)
            self._status = "paused"
        self.log_event("Server paused (returning HTTP 503 until resumed).")
        self._emit_state()
        return self.snapshot()

    def resume(self) -> ServerSnapshot:
        """Resume serving requests immediately after a pause."""
        with self._lock:
            if self._status != "paused":
                return self.snapshot()
            set_server_paused(False)
            self._status = "running"
        self.log_event("Server resumed.")
        self._emit_state()
        return self.snapshot()

    def stop(self, timeout: float = 5.0) -> ServerSnapshot:
        """Gracefully shut down the embedded Uvicorn server."""
        set_server_paused(False)
        with self._lock:
            server = self._server
            thread = self._thread
            if server is None:
                self._status = "stopped"
                self._emit_state()
                return self.snapshot()
            self.log_event("Stopping server...")
            server.should_exit = True

        if thread is not None and thread.is_alive():
            thread.join(timeout=timeout)

        with self._lock:
            if thread is None or not thread.is_alive():
                self._server = None
                self._thread = None
                if self._status != "error":
                    self._status = "stopped"
        self._dispose_db_engine()
        self._emit_state()
        return self.snapshot()

    def _dispose_db_engine(self) -> None:
        """Close pooled SQLite connections when stopping the embedded server."""
        db_mod = sys.modules.get("backend.app.core.db")
        engine = getattr(db_mod, "engine", None) if db_mod is not None else None
        if engine is not None:
            try:
                engine.dispose()
            except Exception:
                pass

    def restart(
        self,
        *,
        host: str,
        port: int,
        data_dir: str,
        wait_timeout: float = 8.0,
    ) -> ServerSnapshot:
        """Stop cleanly and start again with the latest host/port/data settings."""
        self.stop(timeout=5.0)
        return self.start(host=host, port=port, data_dir=data_dir, wait_timeout=wait_timeout)
