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


def is_port_available(host: str, port: int) -> bool:
    """Return True if TCP `port` can be bound on `host` cleanly right now."""
    check_hosts = ["127.0.0.1"] if host in {"0.0.0.0", "::", ""} else [host]
    if host in {"0.0.0.0", ""}:
        check_hosts.insert(0, "0.0.0.0")
    for check_host in check_hosts:
        family = socket.AF_INET6 if ":" in check_host else socket.AF_INET
        try:
            with socket.socket(family, socket.SOCK_STREAM) as sock:
                if os.name != "nt":
                    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                sock.bind((check_host, int(port)))
        except OSError:
            return False
    return True


def find_free_port(host: str = "127.0.0.1", preferred_start: int | None = None) -> int:
    """Pick an unused TCP port, trying sequentially after `preferred_start` first."""
    if preferred_start is not None:
        start = max(1024, min(65500, int(preferred_start)))
        for candidate in range(start, min(65536, start + 25)):
            if is_port_available(host, candidate):
                return candidate

    bind_host = "127.0.0.1" if host in {"0.0.0.0", "::", ""} else host
    family = socket.AF_INET6 if ":" in bind_host else socket.AF_INET
    with socket.socket(family, socket.SOCK_STREAM) as sock:
        sock.bind((bind_host, 0))
        return int(sock.getsockname()[1])


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
    port_in_use: bool = False
    use_https: bool = False
    cert_fingerprint: str | None = None


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
        self._host: str = "127.0.0.1"
        self._port: int = 8000
        self._data_dir: str = ""
        self._error_message: str | None = None
        self._port_in_use: bool = False
        self._use_https: bool = False
        self._ssl_certfile: str = ""
        self._ssl_keyfile: str = ""
        self._cert_fingerprint: str | None = None

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
        logging.getLogger("wherezy.desktop").info("%s", message)

    def snapshot(self) -> ServerSnapshot:
        with self._lock:
            port = self._port
            host = self._host
            scheme = "https" if self._use_https else "http"
            display_local_host = "127.0.0.1" if host in {"0.0.0.0", "::", ""} else host
            local_url = f"{scheme}://{display_local_host}:{port}"
            if host in {"0.0.0.0", "::", ""}:
                lan_url = f"{scheme}://{get_local_ip()}:{port}"
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
                port_in_use=self._port_in_use,
                use_https=self._use_https,
                cert_fingerprint=self._cert_fingerprint,
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
        use_https: bool = False,
        ssl_certfile: str = "",
        ssl_keyfile: str = "",
        wait_timeout: float = 8.0,
    ) -> ServerSnapshot:
        """Start the embedded FastAPI + Uvicorn server and wait for startup readiness."""
        resolved_data = str(Path(data_dir).expanduser().resolve())
        Path(resolved_data).mkdir(parents=True, exist_ok=True)
        effective_https = bool(use_https)
        cert_input = (ssl_certfile or "").strip()
        key_input = (ssl_keyfile or "").strip()
        resolved_cert: str | None = None
        resolved_key: str | None = None
        cert_fingerprint: str | None = None

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
                self._port_in_use = False
                self._emit_state()
                return self.snapshot()

            self._host = host.strip() or "127.0.0.1"
            self._port = int(port)
            self._data_dir = resolved_data
            self._use_https = effective_https
            self._ssl_certfile = cert_input
            self._ssl_keyfile = key_input
            self._cert_fingerprint = None
            self._error_message = None
            self._port_in_use = False

            if effective_https:
                try:
                    from backend.app.core.tls import (
                        get_cert_sha256_fingerprint,
                        resolve_tls_files,
                    )

                    resolved_cert, resolved_key = resolve_tls_files(
                        https_enabled=True,
                        certfile=cert_input,
                        keyfile=key_input,
                        bind_host=self._host,
                    )
                    if resolved_cert:
                        cert_fingerprint = get_cert_sha256_fingerprint(Path(resolved_cert))
                    self._cert_fingerprint = cert_fingerprint
                except Exception as exc:
                    self._status = "error"
                    self._error_message = f"TLS certificate error: {exc}"
                    self.log_event(self._error_message)
                    self._emit_state()
                    return self.snapshot()

            if not is_port_available(self._host, self._port):
                self._status = "error"
                self._port_in_use = True
                self._error_message = (
                    f"Port {self._port} is already in use by another application. "
                    "Click 'Pick a Free Port & Start' or choose another port."
                )
                self.log_event(self._error_message)
                self._emit_state()
                return self.snapshot()

            self._status = "starting"
            set_server_paused(False)
            self._wire_logging()

        os.environ["WHEREZY_DATA_DIR"] = resolved_data
        os.environ["DATA_DIR"] = resolved_data
        os.environ["WHEREZY_HOST"] = self._host
        os.environ["WHEREZY_PORT"] = str(self._port)
        os.environ["WHEREZY_HTTPS"] = "1" if effective_https else "0"

        self._emit_state()
        scheme = "https" if effective_https else "http"
        self.log_event(
            f"Starting {scheme.upper()} server on {self._host}:{self._port} (data: {resolved_data})"
        )
        if cert_fingerprint:
            self.log_event(f"TLS SHA-256 fingerprint: {cert_fingerprint}")

        import uvicorn
        from backend.app.main import app as fastapi_app

        with self._lock:
            self._bound_data_dir = resolved_data

        uvicorn_kwargs: dict[str, object] = {
            "host": self._host,
            "port": self._port,
            "log_config": None,
            "access_log": True,
            "lifespan": "on",
        }
        if resolved_cert and resolved_key:
            uvicorn_kwargs["ssl_certfile"] = resolved_cert
            uvicorn_kwargs["ssl_keyfile"] = resolved_key

        config = uvicorn.Config(fastapi_app, **uvicorn_kwargs)
        server = uvicorn.Server(config)
        # Uvicorn installs signal handlers by default when running on main thread;
        # avoid overriding signals from our background server thread.
        server.install_signal_handlers = lambda: None  # type: ignore[method-assign]

        def _serve() -> None:
            caught_error: str | None = None
            caught_port_in_use = False
            try:
                server.run()
            except SystemExit as exc:
                code = exc.code if isinstance(exc.code, int) else 1
                if code != 0:
                    caught_port_in_use = True
                    caught_error = (
                        f"Port {self._port} is already in use on {self._host}. "
                        "Click 'Pick a Free Port & Start' or choose another port."
                    )
            except OSError as exc:
                caught_port_in_use = getattr(exc, "errno", None) in {48, 98, 10048, 10013}
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
                        self._port_in_use = caught_port_in_use
                    elif not was_requested_stop and self._status in {"starting", "running", "paused"}:
                        self._status = "error"
                        self._error_message = (
                            f"Server exited unexpectedly on {self._host}:{self._port}."
                        )
                        self._port_in_use = False
                    else:
                        self._status = "stopped"
                        self._error_message = None
                        self._port_in_use = False
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
                snap = self.snapshot()
                self.log_event(f"Server listening on {snap.local_url}")
                self._emit_state()
                return snap
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
                self._port_in_use = False
                if self._status != "error":
                    self._status = "stopped"
                    self._error_message = None
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
        use_https: bool = False,
        ssl_certfile: str = "",
        ssl_keyfile: str = "",
        wait_timeout: float = 8.0,
    ) -> ServerSnapshot:
        """Stop cleanly and start again with the latest host/port/TLS/data settings."""
        self.stop(timeout=5.0)
        return self.start(
            host=host,
            port=port,
            data_dir=data_dir,
            use_https=use_https,
            ssl_certfile=ssl_certfile,
            ssl_keyfile=ssl_keyfile,
            wait_timeout=wait_timeout,
        )
