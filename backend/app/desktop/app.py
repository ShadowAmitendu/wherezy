"""Desktop GUI Controller + Windows System Tray & macOS Menu Bar app for Wherezy."""

from __future__ import annotations

import json
import os
from pathlib import Path
import queue
import secrets
import socket
import subprocess
import sys
import threading
import time
import tkinter as tk
from tkinter import filedialog
import webbrowser

from PIL import ImageTk
import pystray
import ttkbootstrap as tb
from ttkbootstrap.dialogs import Messagebox

from backend.app.core.version import APP_VERSION
from backend.app.desktop.autostart import is_autostart_enabled, set_autostart_enabled
from backend.app.desktop.config_store import (
    DEFAULT_DESKTOP_THEME,
    DesktopConfig,
    get_app_support_dir,
    get_legacy_windows_support_dir,
    load_desktop_config,
    resolve_launch_command,
    save_desktop_config,
)
from backend.app.desktop.icons import (
    STATUS_LABELS,
    create_tray_icon_image,
    load_base_icon_image,
    resolve_asset_path,
)
from backend.app.desktop.server_manager import (
    ServerSnapshot,
    WherezyServerManager,
    find_free_port,
    get_local_ip,
)


CURATED_THEMES = (
    "bootstrap-dark",
    "bootstrap-light",
    "tokyo-night-dark",
    "nord-dark",
    "catppuccin-dark",
    "one-dark",
    "dracula-dark",
    "minty-light",
    "sandstone-light",
)

STATUS_PILL_STYLES: dict[str, tuple[str, str]] = {
    "running": ("●", "@success"),
    "paused": ("⏸", "@warning"),
    "starting": ("●", "@info"),
    "error": ("●", "@danger"),
    "stopped": ("■", "@secondary"),
}


def _set_windows_app_user_model_id(app_id: str = "com.wherezy.desktop") -> None:
    if sys.platform != "win32":
        return
    try:
        import ctypes

        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
    except Exception:
        pass


def _open_folder_in_os(path: str) -> None:
    target = Path(path).expanduser().resolve()
    target.mkdir(parents=True, exist_ok=True)
    if sys.platform == "win32":
        os.startfile(str(target))  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(target)])
    else:
        subprocess.Popen(["xdg-open", str(target)])


class _SingleInstanceServer:
    """Lightweight loopback IPC socket ensuring one GUI/tray instance per user."""

    def __init__(self, on_show_requested, on_quit_requested=None) -> None:
        self._lock_file = get_app_support_dir() / "desktop-instance.json"
        self._on_show_requested = on_show_requested
        self._on_quit_requested = on_quit_requested
        self._token = secrets.token_hex(16)
        self._sock: socket.socket | None = None
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def _candidate_lock_files(self, action: str) -> list[Path]:
        candidates = [self._lock_file]
        if action == "quit":
            legacy_dir = get_legacy_windows_support_dir()
            if legacy_dir is not None:
                legacy_lock = legacy_dir / "desktop-instance.json"
                if legacy_lock not in candidates:
                    candidates.append(legacy_lock)
        return candidates

    def try_notify_existing(self, action: str = "show") -> bool:
        """If another Wherezy Desktop instance is active, signal it and return True."""
        for lock_file in self._candidate_lock_files(action):
            if not lock_file.exists():
                continue
            try:
                data = json.loads(lock_file.read_text(encoding="utf-8"))
                port = int(data.get("port", 0))
                token = str(data.get("token", ""))
                if not port or not token:
                    continue
                with socket.create_connection(("127.0.0.1", port), timeout=0.6) as conn:
                    conn.settimeout(0.6)
                    payload = json.dumps({"token": token, "action": action}).encode("utf-8")
                    conn.sendall(payload)
                    reply = conn.recv(32).decode("utf-8", errors="ignore").strip()
                    if reply == "OK":
                        return True
            except (OSError, ValueError, TypeError):
                continue
        return False

    def start(self) -> None:
        """Claim ownership of the instance lock socket and listen for wake/quit pings."""
        try:
            self._lock_file.parent.mkdir(parents=True, exist_ok=True)
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.bind(("127.0.0.1", 0))
            sock.listen(4)
            sock.settimeout(0.5)
            port = int(sock.getsockname()[1])
            self._sock = sock
            self._lock_file.write_text(
                json.dumps({"port": port, "token": self._token, "pid": os.getpid()}),
                encoding="utf-8",
            )
            self._thread = threading.Thread(
                target=self._serve_loop,
                name="wherezy-desktop-ipc",
                daemon=True,
            )
            self._thread.start()
        except OSError:
            self._sock = None

    def _serve_loop(self) -> None:
        assert self._sock is not None
        while not self._stop_event.is_set():
            try:
                conn, _ = self._sock.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            with conn:
                try:
                    raw = conn.recv(512).decode("utf-8", errors="ignore")
                    msg = json.loads(raw) if raw else {}
                    if msg.get("token") == self._token:
                        conn.sendall(b"OK")
                        msg_action = msg.get("action")
                        if msg_action == "show" and self._on_show_requested is not None:
                            self._on_show_requested()
                        elif msg_action == "quit" and self._on_quit_requested is not None:
                            self._on_quit_requested()
                except Exception:
                    pass

    def close(self) -> None:
        self._stop_event.set()
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None
        try:
            if self._lock_file.exists():
                data = json.loads(self._lock_file.read_text(encoding="utf-8"))
                if int(data.get("pid", -1)) == os.getpid():
                    self._lock_file.unlink(missing_ok=True)
        except Exception:
            pass


def request_running_instance_quit(timeout: float = 5.0) -> bool:
    """Ask an active Wherezy Desktop instance to shut down cleanly via IPC."""
    client = _SingleInstanceServer(lambda: None)
    if not client.try_notify_existing(action="quit"):
        return False
    deadline = time.monotonic() + max(0.2, timeout)
    candidates = client._candidate_lock_files("quit")
    while time.monotonic() < deadline:
        if not any(path.exists() for path in candidates):
            return True
        time.sleep(0.1)
    return True


class WherezyDesktopApp:
    """TTK Bootstrap + Tkinter desktop server controller with tray / menu bar."""

    def __init__(
        self,
        *,
        initial_host: str | None = None,
        initial_port: int | None = None,
        initial_data_dir: str | None = None,
        initial_https: bool | None = None,
        initial_ssl_certfile: str | None = None,
        initial_ssl_keyfile: str | None = None,
        start_minimized: bool = False,
        open_browser_override: bool = False,
        enable_tray: bool = True,
        enable_ipc: bool = True,
    ) -> None:
        _set_windows_app_user_model_id()

        self.config = load_desktop_config()
        if initial_host:
            self.config.host = initial_host
        if initial_port is not None:
            self.config.port = initial_port
        if initial_data_dir:
            self.config.data_dir = str(Path(initial_data_dir).expanduser())
        if initial_https is not None:
            self.config.use_https = bool(initial_https)
        if initial_ssl_certfile is not None:
            self.config.ssl_certfile = initial_ssl_certfile
        if initial_ssl_keyfile is not None:
            self.config.ssl_keyfile = initial_ssl_keyfile
        self.config = self.config.normalized()
        if (
            initial_host
            or initial_port is not None
            or initial_data_dir
            or initial_https is not None
            or initial_ssl_certfile is not None
            or initial_ssl_keyfile is not None
        ):
            save_desktop_config(self.config)

        self.start_minimized = bool(start_minimized)
        self.open_browser_override = bool(open_browser_override)
        self.enable_tray = bool(enable_tray)
        self.enable_ipc = bool(enable_ipc)

        self.server_manager = WherezyServerManager()
        self._ui_queue: queue.SimpleQueue = queue.SimpleQueue()
        self._shutting_down = False
        self._relaunch_on_exit = False
        self._tray_icon: pystray.Icon | None = None
        self._tray_active = False
        self._darwin_nsapp = None
        self._tk_icon_photo = None
        self._header_logo_photo = None

        self._ipc: _SingleInstanceServer | None = None
        if self.enable_ipc:
            self._ipc = _SingleInstanceServer(
                on_show_requested=lambda: self._dispatch(self.show_window),
                on_quit_requested=lambda: self._dispatch(self.quit_app),
            )
            action = "ping" if self.start_minimized else "show"
            if self._ipc.try_notify_existing(action=action):
                raise SystemExit(0)

        self.root = tb.Window(
            title=f"Wherezy Server Controller (v{APP_VERSION})",
            themename=DEFAULT_DESKTOP_THEME,
            light_theme="bootstrap-light",
            dark_theme=DEFAULT_DESKTOP_THEME,
            iconphoto=None,
            size=(620, 805),
            minsize=(540, 660),
        )
        self._available_themes = self._resolve_available_themes()
        selected_theme = (
            self.config.theme if self.config.theme in self._available_themes else DEFAULT_DESKTOP_THEME
        )
        if selected_theme != DEFAULT_DESKTOP_THEME:
            self.root.theme_use(selected_theme)
        self.config.theme = selected_theme

        self._configure_window_icons()

        # Tk bound variables
        self.var_theme = tk.StringVar(value=selected_theme)
        self.var_host = tk.StringVar(value=self.config.host)
        self.var_port = tk.StringVar(value=str(self.config.port))
        self.var_data_dir = tk.StringVar(value=self.config.data_dir)
        self.var_use_https = tk.BooleanVar(value=self.config.use_https)
        self.var_auto_start = tk.BooleanVar(value=self.config.auto_start_server)
        self.var_minimize_on_close = tk.BooleanVar(value=self.config.minimize_to_tray_on_close)
        self.var_open_browser = tk.BooleanVar(value=self.config.open_browser_on_start)
        self._autostart_cached = self._safe_query_autostart()
        self.var_start_with_os = tk.BooleanVar(value=self._autostart_cached)

        init_scheme = "https" if self.config.use_https else "http"
        self.var_local_url = tk.StringVar(value=f"{init_scheme}://127.0.0.1:{self.config.port}")
        self.var_lan_url = tk.StringVar(value=f"{init_scheme}://127.0.0.1:{self.config.port}")
        self.var_feedback = tk.StringVar(value="")

        self._build_ui()
        self._bind_events()

        if self._ipc is not None:
            self._ipc.start()

        self.server_manager.add_state_listener(
            lambda snap: self._dispatch(lambda: self._apply_snapshot(snap))
        )
        self.server_manager.add_log_listener(
            lambda line: self._dispatch(lambda: self._append_log_line(line))
        )

        if self.enable_tray:
            self._start_tray_icon()

        if self.start_minimized and self._tray_active:
            self.root.withdraw()

        self._apply_snapshot(
            self._stopped_snapshot_for_config(self.config, self.server_manager.snapshot())
        )
        self.root.after(25, self._drain_ui_queue)

        if self.config.auto_start_server or self.open_browser_override:
            self.root.after(150, self._startup_auto_launch)

    def _safe_query_autostart(self) -> bool:
        try:
            return is_autostart_enabled()
        except Exception:
            return False

    def _configure_window_icons(self) -> None:
        try:
            photo_img = load_base_icon_image(size=64)
            self._tk_icon_photo = ImageTk.PhotoImage(photo_img)
            self.root.iconphoto(True, self._tk_icon_photo)

            header_img = load_base_icon_image(size=40)
            self._header_logo_photo = ImageTk.PhotoImage(header_img)
        except Exception:
            self._tk_icon_photo = None
            self._header_logo_photo = None

        if sys.platform == "win32":
            for asset_name in ("wherezy.ico", "favicon.ico"):
                ico_path = resolve_asset_path(asset_name)
                if ico_path is not None:
                    try:
                        self.root.iconbitmap(default=str(ico_path))
                        break
                    except Exception:
                        pass

    def _resolve_available_themes(self) -> tuple[str, ...]:
        registered = list(self.root.theme_names())
        curated = [name for name in CURATED_THEMES if name in registered]
        extras = [name for name in registered if name not in curated]
        return tuple(curated + extras) if (curated or extras) else (DEFAULT_DESKTOP_THEME,)

    def _build_ui(self) -> None:
        container = tb.Frame(self.root, padding=16)
        container.pack(fill="both", expand=True)

        # ── Header ────────────────────────────────────────────────────────────
        header = tb.Frame(container)
        header.pack(fill="x", pady=(0, 12))

        title_left = tb.Frame(header)
        title_left.pack(side="left", fill="x", expand=True)

        if self._header_logo_photo is not None:
            tb.Label(title_left, image=self._header_logo_photo).pack(side="left", padx=(0, 10))

        title_stack = tb.Frame(title_left)
        title_stack.pack(side="left")
        tb.Label(
            title_stack,
            text="Wherezy",
            font=("Segoe UI", 16, "bold"),
        ).pack(anchor="w")
        tb.Label(
            title_stack,
            text=f"Local Server & Tray Controller · v{APP_VERSION}",
            bootstyle="secondary",
            font=("Segoe UI", 9),
        ).pack(anchor="w")

        header_right = tb.Frame(header)
        header_right.pack(side="right", anchor="center")

        self.theme_combo = tb.Combobox(
            header_right,
            textvariable=self.var_theme,
            values=self._available_themes,
            state="readonly",
            bootstyle="secondary",
            width=16,
        )
        self.theme_combo.pack(side="left", padx=(0, 8))
        self.theme_combo.bind("<<ComboboxSelected>>", lambda _e: self.change_theme())

        self.status_pill = tb.Label(
            header_right,
            text="■  Stopped",
            bootstyle="@secondary",
            font=("Segoe UI", 10, "bold"),
            padding=(12, 6),
        )
        self.status_pill.pack(side="left")

        # ── First-Run LAN Access Notice ───────────────────────────────────────
        self.lan_notice_frame = tb.Labelframe(
            container,
            text=" Network & Firewall Notice ",
            padding=10,
            bootstyle="info",
        )
        notice_msg = (
            "Wherezy defaults to 127.0.0.1 over HTTP (this PC only, no firewall prompt or cert warning). "
            "Enable LAN access (0.0.0.0) with HTTPS to encrypt Wi-Fi traffic and unlock live phone camera barcode scanning."
            if self.config.host == "127.0.0.1"
            else "Wherezy is configured for LAN access (0.0.0.0); your OS firewall may prompt on first run. "
            "Switch to 127.0.0.1-only for local PC use, or enable HTTPS for encrypted LAN traffic."
        )
        tb.Label(
            self.lan_notice_frame,
            text=notice_msg,
            font=("Segoe UI", 8),
            wraplength=560,
            justify="left",
        ).pack(fill="x", pady=(0, 6))
        notice_btns = tb.Frame(self.lan_notice_frame)
        notice_btns.pack(fill="x")
        tb.Button(
            notice_btns,
            text="Keep 127.0.0.1 Only",
            command=lambda: self._resolve_lan_notice(enable_lan=False),
            bootstyle="secondary-outline",
            cursor="hand2",
        ).pack(side="left", padx=(0, 6))
        tb.Button(
            notice_btns,
            text="LAN + HTTPS (Camera Ready)",
            command=lambda: self._resolve_lan_notice(enable_lan=True, enable_https=True),
            bootstyle="info",
            cursor="hand2",
        ).pack(side="left", padx=(0, 6))
        tb.Button(
            notice_btns,
            text="LAN Only (HTTP)",
            command=lambda: self._resolve_lan_notice(enable_lan=True, enable_https=False),
            bootstyle="info-outline",
            cursor="hand2",
        ).pack(side="left")
        if not self.config.lan_notice_shown:
            self.lan_notice_frame.pack(fill="x", pady=(0, 10))

        # ── Server Controls Card ──────────────────────────────────────────────
        self.ctrl_card = tb.Labelframe(container, text=" Server Controls ", padding=12)
        self.ctrl_card.pack(fill="x", pady=(0, 10))
        ctrl_card = self.ctrl_card

        btn_row = tb.Frame(ctrl_card)
        btn_row.pack(fill="x")
        for col in range(4):
            btn_row.columnconfigure(col, weight=1, uniform="ctrl")

        self.btn_start = tb.Button(
            btn_row,
            text="▶  Start Server",
            command=self.handle_start_or_resume,
            bootstyle="success",
            cursor="hand2",
        )
        self.btn_start.grid(row=0, column=0, sticky="ew", padx=(0, 4))

        self.btn_pause = tb.Button(
            btn_row,
            text="⏸  Pause",
            command=self.handle_pause,
            bootstyle="warning",
            cursor="hand2",
        )
        self.btn_pause.grid(row=0, column=1, sticky="ew", padx=4)

        self.btn_stop = tb.Button(
            btn_row,
            text="■  Stop",
            command=self.handle_stop,
            bootstyle="danger",
            cursor="hand2",
        )
        self.btn_stop.grid(row=0, column=2, sticky="ew", padx=4)

        self.btn_restart = tb.Button(
            btn_row,
            text="↻  Restart",
            command=self.handle_restart,
            bootstyle="secondary-outline",
            cursor="hand2",
        )
        self.btn_restart.grid(row=0, column=3, sticky="ew", padx=(4, 0))

        quick_row = tb.Frame(ctrl_card)
        quick_row.pack(fill="x", pady=(8, 0))
        for col in range(3):
            quick_row.columnconfigure(col, weight=1, uniform="quick")

        self.btn_open_web = tb.Button(
            quick_row,
            text="Open Web UI",
            command=self.open_web_ui,
            bootstyle="primary",
            cursor="hand2",
        )
        self.btn_open_web.grid(row=0, column=0, sticky="ew", padx=(0, 4))

        self.btn_copy_url = tb.Button(
            quick_row,
            text="Copy LAN URL",
            command=self.copy_lan_url,
            bootstyle="info-outline",
            cursor="hand2",
        )
        self.btn_copy_url.grid(row=0, column=1, sticky="ew", padx=4)

        self.btn_open_data = tb.Button(
            quick_row,
            text="Open Data Folder",
            command=self.open_data_folder,
            bootstyle="secondary-outline",
            cursor="hand2",
        )
        self.btn_open_data.grid(row=0, column=2, sticky="ew", padx=(4, 0))

        urls_card = tb.Labelframe(
            ctrl_card, text=" Endpoints ", padding=(10, 6), bootstyle="secondary"
        )
        urls_card.pack(fill="x", pady=(10, 0))

        row_local = tb.Frame(urls_card)
        row_local.pack(fill="x", pady=1)
        tb.Label(
            row_local,
            text="This Computer:",
            width=14,
            anchor="w",
            bootstyle="secondary",
            font=("Segoe UI", 9),
        ).pack(side="left")
        local_link = tb.Label(
            row_local,
            textvariable=self.var_local_url,
            bootstyle="info",
            cursor="hand2",
            font=("Consolas", 9, "underline"),
        )
        local_link.pack(side="left")
        local_link.bind("<Button-1>", lambda _e: self.open_web_ui(use_lan=False))

        row_lan = tb.Frame(urls_card)
        row_lan.pack(fill="x", pady=1)
        tb.Label(
            row_lan,
            text="LAN / Phone:",
            width=14,
            anchor="w",
            bootstyle="secondary",
            font=("Segoe UI", 9),
        ).pack(side="left")
        lan_link = tb.Label(
            row_lan,
            textvariable=self.var_lan_url,
            bootstyle="info",
            cursor="hand2",
            font=("Consolas", 9, "underline"),
        )
        lan_link.pack(side="left")
        lan_link.bind("<Button-1>", lambda _e: self.open_web_ui(use_lan=True))

        self.feedback_label = tb.Label(
            ctrl_card,
            textvariable=self.var_feedback,
            bootstyle="warning",
            font=("Segoe UI", 9),
            anchor="w",
            wraplength=540,
            justify="left",
        )
        self.feedback_label.pack(fill="x", pady=(6, 0))

        self.port_error_frame = tb.Frame(ctrl_card)
        tb.Button(
            self.port_error_frame,
            text="Pick a Free Port & Start",
            command=self.pick_free_port_and_start,
            bootstyle="warning",
            cursor="hand2",
        ).pack(side="left")
        tb.Label(
            self.port_error_frame,
            text="Finds an available port automatically and restarts.",
            bootstyle="secondary",
            font=("Segoe UI", 8),
        ).pack(side="left", padx=(8, 0))

        # ── Configuration & OS Startup Card ───────────────────────────────────
        cfg_card = tb.Labelframe(container, text=" Server & Startup Settings ", padding=12)
        cfg_card.pack(fill="x", pady=(0, 10))

        grid = tb.Frame(cfg_card)
        grid.pack(fill="x")
        grid.columnconfigure(1, weight=1)
        grid.columnconfigure(3, weight=1)

        tb.Label(grid, text="Host:", font=("Segoe UI", 9)).grid(
            row=0, column=0, sticky="w", padx=(0, 6), pady=4
        )
        host_combo = tb.Combobox(
            grid,
            textvariable=self.var_host,
            values=("127.0.0.1", "0.0.0.0"),
            bootstyle="primary",
            width=16,
        )
        host_combo.grid(row=0, column=1, sticky="ew", padx=(0, 12), pady=4)

        tb.Label(grid, text="Port:", font=("Segoe UI", 9)).grid(
            row=0, column=2, sticky="w", padx=(0, 6), pady=4
        )
        port_entry = tb.Entry(
            grid,
            textvariable=self.var_port,
            bootstyle="primary",
            width=10,
        )
        port_entry.grid(row=0, column=3, sticky="ew", pady=4)

        tb.Label(grid, text="Data Dir:", font=("Segoe UI", 9)).grid(
            row=1, column=0, sticky="w", padx=(0, 6), pady=4
        )
        data_row = tb.Frame(grid)
        data_row.grid(row=1, column=1, columnspan=3, sticky="ew", pady=4)
        tb.Entry(
            data_row,
            textvariable=self.var_data_dir,
            bootstyle="primary",
        ).pack(side="left", fill="x", expand=True, padx=(0, 6))
        tb.Button(
            data_row,
            text="Browse",
            command=self.browse_data_dir,
            bootstyle="secondary-outline",
            cursor="hand2",
        ).pack(side="left")

        tb.Separator(cfg_card, orient="horizontal").pack(fill="x", pady=(8, 6))

        checks = tb.Frame(cfg_card)
        checks.pack(fill="x")

        tb.Checkbutton(
            checks,
            text="Enable HTTPS (TLS) — local self-signed cert (for LAN & phone camera)",
            variable=self.var_use_https,
            command=self.toggle_https,
            bootstyle="info-round-toggle",
            cursor="hand2",
        ).pack(anchor="w", pady=3)
        tb.Checkbutton(
            checks,
            text="Start with OS (launch minimized to tray / menu bar on login)",
            variable=self.var_start_with_os,
            command=self.toggle_autostart,
            bootstyle="success-round-toggle",
            cursor="hand2",
        ).pack(anchor="w", pady=3)
        tb.Checkbutton(
            checks,
            text="Auto-start server when controller launches",
            variable=self.var_auto_start,
            command=self.save_preferences_only,
            bootstyle="primary-round-toggle",
            cursor="hand2",
        ).pack(anchor="w", pady=3)
        tb.Checkbutton(
            checks,
            text="Minimize to tray / menu bar when window is closed",
            variable=self.var_minimize_on_close,
            command=self.save_preferences_only,
            bootstyle="primary-round-toggle",
            cursor="hand2",
        ).pack(anchor="w", pady=3)
        tb.Checkbutton(
            checks,
            text="Open browser automatically when server starts",
            variable=self.var_open_browser,
            command=self.save_preferences_only,
            bootstyle="primary-round-toggle",
            cursor="hand2",
        ).pack(anchor="w", pady=3)

        apply_row = tb.Frame(cfg_card)
        apply_row.pack(fill="x", pady=(8, 0))
        tb.Button(
            apply_row,
            text="Save & Apply Settings",
            command=self.apply_settings_and_restart,
            bootstyle="primary",
            cursor="hand2",
        ).pack(side="right")

        # ── Activity Logs Card ────────────────────────────────────────────────
        log_card = tb.Labelframe(container, text=" Server Logs ", padding=10)
        log_card.pack(fill="both", expand=True, pady=(0, 10))

        log_head = tb.Frame(log_card)
        log_head.pack(fill="x", pady=(0, 4))
        tb.Label(
            log_head,
            text="Embedded Uvicorn runtime output",
            bootstyle="secondary",
            font=("Segoe UI", 8),
        ).pack(side="left")
        tb.Button(
            log_head,
            text="Clear",
            command=self.clear_logs,
            bootstyle="secondary-outline",
            cursor="hand2",
        ).pack(side="right")

        self.log_text = tb.ScrolledText(
            log_card,
            height=8,
            bootstyle="secondary-round",
            auto_hide=True,
            wrap="word",
            font=("Consolas", 8),
            state="disabled",
        )
        self.log_text.pack(fill="both", expand=True)

        # ── Footer ────────────────────────────────────────────────────────────
        footer = tb.Frame(container)
        footer.pack(fill="x")

        self.btn_hide_tray = tb.Button(
            footer,
            text="Hide to Tray / Menu Bar",
            command=self.hide_to_tray,
            bootstyle="secondary-outline",
            cursor="hand2",
        )
        self.btn_hide_tray.pack(side="left")

        tb.Button(
            footer,
            text="Quit Wherezy",
            command=self.quit_app,
            bootstyle="danger-outline",
            cursor="hand2",
        ).pack(side="right")

    def _bind_events(self) -> None:
        self.root.protocol("WM_DELETE_WINDOW", self._on_window_close)
        if sys.platform == "darwin":
            try:
                self.root.createcommand("::tk::mac::ReopenApplication", self.show_window)
            except Exception:
                pass

    def _dispatch(self, fn) -> None:
        self._ui_queue.put(fn)

    def _drain_ui_queue(self) -> None:
        if self._shutting_down:
            return
        while True:
            try:
                fn = self._ui_queue.get_nowait()
            except queue.Empty:
                break
            try:
                fn()
            except tk.TclError:
                return
            except Exception as exc:
                self.var_feedback.set(str(exc))
        if not self._shutting_down:
            self.root.after(25, self._drain_ui_queue)

    def _startup_auto_launch(self) -> None:
        snap = self.handle_start_or_resume()
        if (self.open_browser_override or self.config.open_browser_on_start) and not self.start_minimized:
            if snap.status == "running":
                self.open_web_ui(use_lan=False)

    def _launch_with_config(self, cfg: DesktopConfig, *, restart: bool = False) -> ServerSnapshot:
        fn = self.server_manager.restart if restart else self.server_manager.start
        return fn(
            host=cfg.host,
            port=cfg.port,
            data_dir=cfg.data_dir,
            use_https=cfg.use_https,
            ssl_certfile=cfg.ssl_certfile,
            ssl_keyfile=cfg.ssl_keyfile,
        )

    @staticmethod
    def _stopped_snapshot_for_config(cfg: DesktopConfig, prev: ServerSnapshot) -> ServerSnapshot:
        scheme = "https" if cfg.use_https else "http"
        display_local = "127.0.0.1" if cfg.host in {"0.0.0.0", "::", ""} else cfg.host
        local_url = f"{scheme}://{display_local}:{cfg.port}"
        lan_url = f"{scheme}://{get_local_ip()}:{cfg.port}" if cfg.host in {"0.0.0.0", "::", ""} else local_url
        return ServerSnapshot(
            status=prev.status,
            host=cfg.host,
            port=cfg.port,
            data_dir=cfg.data_dir,
            local_url=local_url,
            lan_url=lan_url,
            error_message=prev.error_message,
            port_in_use=prev.port_in_use,
            use_https=cfg.use_https,
            cert_fingerprint=prev.cert_fingerprint if cfg.use_https else None,
        )

    def _collect_form_config(self) -> DesktopConfig | None:
        raw_port = self.var_port.get().strip()
        try:
            port = int(raw_port)
            if not (1 <= port <= 65535):
                raise ValueError
        except ValueError:
            self.var_feedback.set("Port must be a number between 1 and 65535.")
            return None

        host = self.var_host.get().strip() or "127.0.0.1"
        data_dir = self.var_data_dir.get().strip() or self.config.data_dir
        cfg = DesktopConfig(
            host=host,
            port=port,
            data_dir=data_dir,
            auto_start_server=bool(self.var_auto_start.get()),
            open_browser_on_start=bool(self.var_open_browser.get()),
            minimize_to_tray_on_close=bool(self.var_minimize_on_close.get()),
            theme=(self.var_theme.get() or DEFAULT_DESKTOP_THEME).strip() or DEFAULT_DESKTOP_THEME,
            lan_notice_shown=bool(self.config.lan_notice_shown),
            use_https=bool(self.var_use_https.get()),
            ssl_certfile=self.config.ssl_certfile,
            ssl_keyfile=self.config.ssl_keyfile,
        ).normalized()
        self.config = cfg
        save_desktop_config(cfg)
        return cfg

    def save_preferences_only(self) -> None:
        cfg = DesktopConfig(
            host=self.config.host,
            port=self.config.port,
            data_dir=self.config.data_dir,
            auto_start_server=bool(self.var_auto_start.get()),
            open_browser_on_start=bool(self.var_open_browser.get()),
            minimize_to_tray_on_close=bool(self.var_minimize_on_close.get()),
            theme=(self.var_theme.get() or self.config.theme).strip() or DEFAULT_DESKTOP_THEME,
            lan_notice_shown=bool(self.config.lan_notice_shown),
            use_https=bool(self.var_use_https.get()),
            ssl_certfile=self.config.ssl_certfile,
            ssl_keyfile=self.config.ssl_keyfile,
        ).normalized()
        self.config = cfg
        save_desktop_config(cfg)

    def toggle_https(self) -> None:
        desired = bool(self.var_use_https.get())
        changed = bool(self.config.use_https) != desired
        self.save_preferences_only()
        snap = self.server_manager.snapshot()
        if changed and snap.status in {"running", "paused"}:
            restarted = self._launch_with_config(self.config, restart=True)
            if restarted.status == "running":
                if desired:
                    self.var_feedback.set(
                        "HTTPS enabled — server restarted (accept local self-signed cert prompt once in browser)."
                    )
                else:
                    self.var_feedback.set("HTTPS disabled — server restarted in HTTP mode.")
        else:
            if snap.status not in {"running", "paused"}:
                self._apply_snapshot(self._stopped_snapshot_for_config(self.config, snap))
            self.var_feedback.set(
                "HTTPS enabled — next start will serve https:// with a local TLS cert."
                if desired
                else "HTTPS disabled — next start will use plain http://."
            )

    def _resolve_lan_notice(
        self,
        *,
        enable_lan: bool,
        enable_https: bool | None = None,
    ) -> None:
        target_host = "0.0.0.0" if enable_lan else "127.0.0.1"
        target_https = self.config.use_https if enable_https is None else bool(enable_https)
        changed = (self.config.host != target_host) or (self.config.use_https != target_https)
        self.var_host.set(target_host)
        self.var_use_https.set(target_https)
        self.config.host = target_host
        self.config.use_https = target_https
        self.config.lan_notice_shown = True
        self.config = self.config.normalized()
        save_desktop_config(self.config)
        self.lan_notice_frame.pack_forget()
        snap = self.server_manager.snapshot()
        proto = "HTTPS" if target_https else "HTTP"
        if changed and snap.status in {"running", "paused"}:
            self._launch_with_config(self.config, restart=True)
            self.var_feedback.set(f"Updated binding to {target_host} ({proto}) and restarted server.")
        else:
            if snap.status not in {"running", "paused"}:
                self._apply_snapshot(self._stopped_snapshot_for_config(self.config, snap))
            self.var_feedback.set(f"Host configured for {target_host} ({proto}).")

    def pick_free_port_and_start(self) -> ServerSnapshot:
        cfg = self._collect_form_config()
        host = cfg.host if cfg is not None else self.config.host
        start_from = (cfg.port if cfg is not None else self.config.port) + 1
        free_port = find_free_port(host, preferred_start=start_from)
        self.var_port.set(str(free_port))
        updated = self._collect_form_config()
        if updated is None:
            return self.server_manager.snapshot()
        self.var_feedback.set(f"Switched to free port {free_port}.")
        return self._launch_with_config(updated, restart=True)

    def change_theme(self, theme_name: str | None = None) -> str:
        """Apply and persist the selected ttkbootstrap theme."""
        target = (theme_name or self.var_theme.get() or DEFAULT_DESKTOP_THEME).strip()
        if target not in self._available_themes:
            target = DEFAULT_DESKTOP_THEME
        self.root.theme_use(target)
        self.var_theme.set(target)
        try:
            self.theme_combo.selection_clear()
        except tk.TclError:
            pass
        self.save_preferences_only()
        return target

    def toggle_autostart(self) -> None:
        desired = bool(self.var_start_with_os.get())
        try:
            actual = set_autostart_enabled(desired)
            self._autostart_cached = bool(actual)
            self.var_start_with_os.set(actual)
            self.var_feedback.set(
                "Enabled Start with OS (minimized to tray/menu bar on login)."
                if actual
                else "Disabled Start with OS."
            )
            self._refresh_tray_visuals(self.server_manager.snapshot())
        except Exception as exc:
            self._autostart_cached = not desired
            self.var_start_with_os.set(not desired)
            self.var_feedback.set(f"Could not update Start with OS: {exc}")

    def handle_start_or_resume(self) -> ServerSnapshot:
        snap = self.server_manager.snapshot()
        if snap.status == "paused":
            self.var_feedback.set("")
            return self.server_manager.resume()

        cfg = self._collect_form_config()
        if cfg is None:
            return snap

        if self.server_manager.needs_process_restart_for_data_dir(cfg.data_dir):
            self._prompt_relaunch_for_data_dir()
            return self.server_manager.snapshot()

        self.var_feedback.set("")
        return self._launch_with_config(cfg, restart=False)

    def handle_pause(self) -> ServerSnapshot:
        return self.server_manager.pause()

    def handle_stop(self) -> ServerSnapshot:
        return self.server_manager.stop()

    def handle_restart(self) -> ServerSnapshot:
        cfg = self._collect_form_config()
        if cfg is None:
            return self.server_manager.snapshot()
        if self.server_manager.needs_process_restart_for_data_dir(cfg.data_dir):
            self._prompt_relaunch_for_data_dir()
            return self.server_manager.snapshot()
        self.var_feedback.set("")
        return self._launch_with_config(cfg, restart=True)

    def apply_settings_and_restart(self) -> None:
        cfg = self._collect_form_config()
        if cfg is None:
            return
        if self.server_manager.needs_process_restart_for_data_dir(cfg.data_dir):
            self._prompt_relaunch_for_data_dir()
            return
        snap = self.server_manager.snapshot()
        if snap.status in {"running", "paused"}:
            self._launch_with_config(cfg, restart=True)
            self.var_feedback.set("Settings saved and server restarted.")
        else:
            self.var_feedback.set("Settings saved.")
            self._apply_snapshot(self._stopped_snapshot_for_config(cfg, snap))

    def _prompt_relaunch_for_data_dir(self) -> None:
        choice = Messagebox.yesno(
            "Changing the Data Folder requires restarting the Wherezy desktop controller.\n\n"
            "Save settings and relaunch now?",
            title="Relaunch Required",
            parent=self.root,
            buttons=["Cancel:secondary", "Relaunch:primary"],
            localize=False,
        )
        if choice == "Relaunch":
            self._relaunch_on_exit = True
            self.quit_app()
        else:
            self.var_feedback.set("Data Folder saved. Relaunch Wherezy to load the new database.")

    def browse_data_dir(self) -> None:
        selected = filedialog.askdirectory(
            title="Choose Wherezy Data Folder",
            initialdir=self.var_data_dir.get() or self.config.data_dir,
            parent=self.root,
        )
        if selected:
            self.var_data_dir.set(selected)

    def open_web_ui(self, use_lan: bool = False) -> None:
        snap = self.server_manager.snapshot()
        url = snap.lan_url if use_lan else snap.local_url
        webbrowser.open(url)

    def copy_lan_url(self) -> None:
        snap = self.server_manager.snapshot()
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(snap.lan_url)
            self.root.update_idletasks()
            self.var_feedback.set(f"Copied URL: {snap.lan_url}")
        except tk.TclError:
            pass

    def open_data_folder(self) -> None:
        target = self.var_data_dir.get().strip() or self.config.data_dir
        try:
            _open_folder_in_os(target)
        except Exception as exc:
            self.var_feedback.set(f"Could not open folder: {exc}")

    def clear_logs(self) -> None:
        self.server_manager.clear_logs()
        self.log_text.configure(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.configure(state="disabled")

    def _append_log_line(self, line: str) -> None:
        self.log_text.configure(state="normal")
        self.log_text.insert("end", line + "\n")
        # Keep widget responsive on long runs
        line_count = int(self.log_text.index("end-1c").split(".")[0])
        if line_count > 500:
            self.log_text.delete("1.0", f"{line_count - 500}.0")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _apply_snapshot(self, snap: ServerSnapshot) -> None:
        status = snap.status
        label = STATUS_LABELS.get(status, status.title())
        prefix, pill_style = STATUS_PILL_STYLES.get(status, ("●", "@secondary"))

        self.status_pill.configure(text=f"{prefix}  {label}", bootstyle=pill_style)
        self.var_local_url.set(snap.local_url)
        self.var_lan_url.set(snap.lan_url)

        if snap.error_message:
            self.var_feedback.set(snap.error_message)

        if status == "error" and snap.port_in_use:
            if not self.port_error_frame.winfo_manager():
                self.port_error_frame.pack(fill="x", pady=(6, 0))
        elif self.port_error_frame.winfo_manager():
            self.port_error_frame.pack_forget()

        if status == "paused":
            self.btn_start.configure(text="▶  Resume", state="normal", bootstyle="success")
            self.btn_pause.configure(state="disabled")
            self.btn_stop.configure(state="normal")
            self.btn_restart.configure(state="normal")
            self.btn_open_web.configure(state="normal")
        elif status == "running":
            self.btn_start.configure(
                text="▶  Running", state="disabled", bootstyle="secondary-outline"
            )
            self.btn_pause.configure(state="normal")
            self.btn_stop.configure(state="normal")
            self.btn_restart.configure(state="normal")
            self.btn_open_web.configure(state="normal")
        elif status == "starting":
            self.btn_start.configure(
                text="Starting...", state="disabled", bootstyle="secondary-outline"
            )
            self.btn_pause.configure(state="disabled")
            self.btn_stop.configure(state="normal")
            self.btn_restart.configure(state="disabled")
            self.btn_open_web.configure(state="disabled")
        else:
            self.btn_start.configure(text="▶  Start Server", state="normal", bootstyle="success")
            self.btn_pause.configure(state="disabled")
            self.btn_stop.configure(state="disabled")
            self.btn_restart.configure(state="normal")
            self.btn_open_web.configure(state="disabled")

        self._refresh_tray_visuals(snap)

    def _build_tray_menu(self, snap: ServerSnapshot) -> pystray.Menu:
        status_label = STATUS_LABELS.get(snap.status, snap.status.title())
        start_or_resume_label = "Resume Server" if snap.status == "paused" else "Start Server"
        can_start_or_resume = snap.status in {"stopped", "error", "paused"}
        can_pause = snap.status == "running"
        can_stop = snap.status in {"running", "paused", "starting"}

        return pystray.Menu(
            pystray.MenuItem(
                f"Wherezy: {status_label} ({snap.local_url})",
                None,
                enabled=False,
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "Show Control Window",
                lambda _icon, _item: self._dispatch(self.show_window),
                default=True,
            ),
            pystray.MenuItem(
                "Open Web Dashboard",
                lambda _icon, _item: self._dispatch(self.open_web_ui),
                enabled=snap.status == "running",
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                start_or_resume_label,
                lambda _icon, _item: self._dispatch(self.handle_start_or_resume),
                enabled=can_start_or_resume,
            ),
            pystray.MenuItem(
                "Pause Server",
                lambda _icon, _item: self._dispatch(self.handle_pause),
                enabled=can_pause,
            ),
            pystray.MenuItem(
                "Stop Server",
                lambda _icon, _item: self._dispatch(self.handle_stop),
                enabled=can_stop,
            ),
            pystray.MenuItem(
                "Restart Server",
                lambda _icon, _item: self._dispatch(self.handle_restart),
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "Start with OS",
                lambda _icon, _item: self._dispatch(self._toggle_autostart_from_tray),
                checked=lambda _item: self._autostart_cached,
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "Quit Wherezy",
                lambda _icon, _item: self._dispatch(self.quit_app),
            ),
        )

    def _toggle_autostart_from_tray(self) -> None:
        self.var_start_with_os.set(not bool(self.var_start_with_os.get()))
        self.toggle_autostart()

    def _start_tray_icon(self) -> None:
        snap = self.server_manager.snapshot()
        image = create_tray_icon_image(status=snap.status, size=64)
        menu = self._build_tray_menu(snap)
        label = STATUS_LABELS.get(snap.status, snap.status.title())
        tooltip = f"Wherezy ({label}) — :{snap.port}"[:63]

        try:
            kwargs: dict[str, object] = {}
            if sys.platform == "darwin":
                import AppKit  # type: ignore[import-not-found]

                self._darwin_nsapp = AppKit.NSApplication.sharedApplication()
                kwargs["darwin_nsapplication"] = self._darwin_nsapp

            icon = pystray.Icon("wherezy", image, tooltip, menu, **kwargs)
            icon.run_detached()
            self._tray_icon = icon
            self._tray_active = True
        except Exception as exc:
            self._tray_icon = None
            self._tray_active = False
            self.server_manager.log_event(f"System tray unavailable on this session: {exc}")
            self.btn_hide_tray.configure(state="disabled")

    def _refresh_tray_visuals(self, snap: ServerSnapshot) -> None:
        if not self._tray_active or self._tray_icon is None:
            return
        try:
            self._tray_icon.icon = create_tray_icon_image(status=snap.status, size=64)
            label = STATUS_LABELS.get(snap.status, snap.status.title())
            self._tray_icon.title = f"Wherezy ({label}) — :{snap.port}"[:63]
            self._tray_icon.menu = self._build_tray_menu(snap)
            self._tray_icon.update_menu()
        except Exception:
            pass

    def show_window(self) -> None:
        if self._shutting_down:
            return
        self.root.deiconify()
        self.root.state("normal")
        self.root.lift()
        self.root.focus_force()
        if sys.platform == "darwin" and self._darwin_nsapp is not None:
            try:
                self._darwin_nsapp.activateIgnoringOtherApps_(True)
            except Exception:
                pass

    def hide_to_tray(self) -> None:
        if self._tray_active:
            self.root.withdraw()
        else:
            self.root.iconify()

    def _on_window_close(self) -> None:
        if self.var_minimize_on_close.get() and self._tray_active:
            self.hide_to_tray()
            return
        self.quit_app()

    def quit_app(self) -> None:
        if self._shutting_down:
            return
        self._shutting_down = True

        relaunch = self._relaunch_on_exit
        if self._ipc is not None:
            self._ipc.close()

        try:
            self.server_manager.stop(timeout=5.0)
        except Exception:
            pass

        if self._tray_icon is not None:
            tray_thread = getattr(self._tray_icon, "_thread", None)
            try:
                self._tray_icon.visible = False
            except Exception:
                pass
            try:
                self._tray_icon.stop()
            except Exception:
                pass
            if (
                tray_thread is not None
                and tray_thread.is_alive()
                and tray_thread.ident != threading.current_thread().ident
            ):
                tray_thread.join(timeout=2.0)
            self._tray_icon = None
            self._tray_active = False

        try:
            self.root.quit()
            self.root.destroy()
        except tk.TclError:
            pass
        finally:
            self._tk_icon_photo = None
            self._header_logo_photo = None

        if relaunch:
            cmd = resolve_launch_command(minimized=False)
            subprocess.Popen(cmd, close_fds=(sys.platform != "win32"))

    def run(self) -> int:
        try:
            self.root.mainloop()
        except KeyboardInterrupt:
            self.quit_app()
        return 0


def run_desktop_app(
    *,
    host: str | None = None,
    port: int | None = None,
    data_dir: str | None = None,
    use_https: bool | None = None,
    ssl_certfile: str | None = None,
    ssl_keyfile: str | None = None,
    minimized: bool = False,
    open_browser: bool = False,
) -> int:
    """Entrypoint called by CLI or frozen desktop binary to run the GUI + Tray app."""
    try:
        app = WherezyDesktopApp(
            initial_host=host,
            initial_port=port,
            initial_data_dir=data_dir,
            initial_https=use_https,
            initial_ssl_certfile=ssl_certfile,
            initial_ssl_keyfile=ssl_keyfile,
            start_minimized=minimized,
            open_browser_override=open_browser,
        )
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 0
    return app.run()


def main() -> int:
    return run_desktop_app()
