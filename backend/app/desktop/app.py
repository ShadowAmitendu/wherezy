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
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
import webbrowser

from PIL import ImageTk
import pystray

from backend.app.cli import APP_VERSION
from backend.app.desktop.autostart import is_autostart_enabled, set_autostart_enabled
from backend.app.desktop.config_store import (
    DesktopConfig,
    get_app_support_dir,
    load_desktop_config,
    resolve_launch_command,
    save_desktop_config,
)
from backend.app.desktop.icons import (
    STATUS_COLORS,
    STATUS_LABELS,
    create_tray_icon_image,
    load_base_icon_image,
    resolve_asset_path,
)
from backend.app.desktop.server_manager import ServerSnapshot, WherezyServerManager


# Slate theme palette matching the Wherezy showcase & web UI
BG_ROOT = "#0f172a"
BG_CARD = "#1e293b"
BG_INPUT = "#0b1220"
BORDER_SUBTLE = "#334155"
TEXT_PRIMARY = "#f8fafc"
TEXT_SECONDARY = "#cbd5e1"
TEXT_MUTED = "#94a3b8"
ACCENT_BLUE = "#2563eb"
ACCENT_BLUE_HOVER = "#1d4ed8"
ACCENT_LINK = "#38bdf8"
BTN_SECONDARY = "#334155"
BTN_PAUSE = "#b45309"
BTN_DANGER = "#dc2626"
BTN_SUCCESS = "#15803d"


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

    def __init__(self, on_show_requested) -> None:
        self._lock_file = get_app_support_dir() / "desktop-instance.json"
        self._on_show_requested = on_show_requested
        self._token = secrets.token_hex(16)
        self._sock: socket.socket | None = None
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def try_notify_existing(self, action: str = "show") -> bool:
        """If another Wherezy Desktop instance is active, signal it and return True."""
        if not self._lock_file.exists():
            return False
        try:
            data = json.loads(self._lock_file.read_text(encoding="utf-8"))
            port = int(data.get("port", 0))
            token = str(data.get("token", ""))
            if not port or not token:
                return False
            with socket.create_connection(("127.0.0.1", port), timeout=0.45) as conn:
                conn.settimeout(0.45)
                payload = json.dumps({"token": token, "action": action}).encode("utf-8")
                conn.sendall(payload)
                reply = conn.recv(32).decode("utf-8", errors="ignore").strip()
                return reply == "OK"
        except (OSError, ValueError, TypeError):
            return False

    def start(self) -> None:
        """Claim ownership of the instance lock socket and listen for wake pings."""
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
                        if msg.get("action") == "show":
                            self._on_show_requested()
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


class WherezyDesktopApp:
    """Tkinter desktop server controller paired with system tray / macOS menu bar."""

    def __init__(
        self,
        *,
        initial_host: str | None = None,
        initial_port: int | None = None,
        initial_data_dir: str | None = None,
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
        self.config = self.config.normalized()
        if initial_host or initial_port is not None or initial_data_dir:
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
        self._logs_visible = True

        self._ipc: _SingleInstanceServer | None = None
        if self.enable_ipc:
            self._ipc = _SingleInstanceServer(lambda: self._dispatch(self.show_window))
            action = "ping" if self.start_minimized else "show"
            if self._ipc.try_notify_existing(action=action):
                raise SystemExit(0)

        self.root = tk.Tk()
        self.root.title(f"Wherezy Server Controller (v{APP_VERSION})")
        self.root.configure(bg=BG_ROOT)
        self.root.geometry("560x680")
        self.root.minsize(500, 580)
        self._configure_window_icons()
        self._configure_ttk_theme()

        # Tk bound variables
        self.var_host = tk.StringVar(value=self.config.host)
        self.var_port = tk.StringVar(value=str(self.config.port))
        self.var_data_dir = tk.StringVar(value=self.config.data_dir)
        self.var_auto_start = tk.BooleanVar(value=self.config.auto_start_server)
        self.var_minimize_on_close = tk.BooleanVar(value=self.config.minimize_to_tray_on_close)
        self.var_open_browser = tk.BooleanVar(value=self.config.open_browser_on_start)
        self._autostart_cached = self._safe_query_autostart()
        self.var_start_with_os = tk.BooleanVar(value=self._autostart_cached)

        self.var_local_url = tk.StringVar(value=f"http://127.0.0.1:{self.config.port}")
        self.var_lan_url = tk.StringVar(value=f"http://127.0.0.1:{self.config.port}")
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

        self._apply_snapshot(self.server_manager.snapshot())
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

    def _configure_ttk_theme(self) -> None:
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure(
            "Wherezy.TCombobox",
            fieldbackground=BG_INPUT,
            background=BG_CARD,
            foreground=TEXT_PRIMARY,
            bordercolor=BORDER_SUBTLE,
            arrowcolor=TEXT_SECONDARY,
        )

    def _build_ui(self) -> None:
        container = tk.Frame(self.root, bg=BG_ROOT, padx=16, pady=14)
        container.pack(fill="both", expand=True)

        # ── Header ────────────────────────────────────────────────────────────
        header = tk.Frame(container, bg=BG_ROOT)
        header.pack(fill="x", pady=(0, 12))

        title_left = tk.Frame(header, bg=BG_ROOT)
        title_left.pack(side="left", fill="x", expand=True)

        if self._header_logo_photo is not None:
            tk.Label(
                title_left,
                image=self._header_logo_photo,
                bg=BG_ROOT,
            ).pack(side="left", padx=(0, 10))

        title_stack = tk.Frame(title_left, bg=BG_ROOT)
        title_stack.pack(side="left")
        tk.Label(
            title_stack,
            text="Wherezy",
            bg=BG_ROOT,
            fg=TEXT_PRIMARY,
            font=("Segoe UI", 16, "bold"),
        ).pack(anchor="w")
        tk.Label(
            title_stack,
            text=f"Local Server & Tray Controller · v{APP_VERSION}",
            bg=BG_ROOT,
            fg=TEXT_MUTED,
            font=("Segoe UI", 9),
        ).pack(anchor="w")

        self.status_pill = tk.Label(
            header,
            text="● Stopped",
            bg=BG_CARD,
            fg=TEXT_SECONDARY,
            font=("Segoe UI", 10, "bold"),
            padx=12,
            pady=6,
            relief="solid",
            bd=1,
        )
        self.status_pill.pack(side="right", anchor="center")

        # ── Server Controls Card ──────────────────────────────────────────────
        ctrl_card = tk.Frame(
            container,
            bg=BG_CARD,
            padx=14,
            pady=12,
            highlightbackground=BORDER_SUBTLE,
            highlightthickness=1,
        )
        ctrl_card.pack(fill="x", pady=(0, 10))

        btn_row = tk.Frame(ctrl_card, bg=BG_CARD)
        btn_row.pack(fill="x")

        self.btn_start = self._make_button(
            btn_row, "▶  Start Server", self.handle_start_or_resume, bg=BTN_SUCCESS
        )
        self.btn_start.pack(side="left", fill="x", expand=True, padx=(0, 6))

        self.btn_pause = self._make_button(
            btn_row, "⏸  Pause", self.handle_pause, bg=BTN_PAUSE
        )
        self.btn_pause.pack(side="left", fill="x", expand=True, padx=3)

        self.btn_stop = self._make_button(
            btn_row, "■  Stop", self.handle_stop, bg=BTN_DANGER
        )
        self.btn_stop.pack(side="left", fill="x", expand=True, padx=3)

        self.btn_restart = self._make_button(
            btn_row, "↻  Restart", self.handle_restart, bg=BTN_SECONDARY
        )
        self.btn_restart.pack(side="left", fill="x", expand=True, padx=(6, 0))

        quick_row = tk.Frame(ctrl_card, bg=BG_CARD)
        quick_row.pack(fill="x", pady=(10, 0))

        self.btn_open_web = self._make_button(
            quick_row, "Open Web UI", self.open_web_ui, bg=ACCENT_BLUE
        )
        self.btn_open_web.pack(side="left", fill="x", expand=True, padx=(0, 6))

        self.btn_copy_url = self._make_button(
            quick_row, "Copy LAN URL", self.copy_lan_url, bg=BTN_SECONDARY
        )
        self.btn_copy_url.pack(side="left", fill="x", expand=True, padx=3)

        self.btn_open_data = self._make_button(
            quick_row, "Open Data Folder", self.open_data_folder, bg=BTN_SECONDARY
        )
        self.btn_open_data.pack(side="left", fill="x", expand=True, padx=(6, 0))

        # Endpoints display inside control card
        urls_frame = tk.Frame(ctrl_card, bg=BG_INPUT, padx=10, pady=8)
        urls_frame.pack(fill="x", pady=(10, 0))

        row_local = tk.Frame(urls_frame, bg=BG_INPUT)
        row_local.pack(fill="x", pady=1)
        tk.Label(
            row_local, text="This Computer:", width=14, anchor="w", bg=BG_INPUT, fg=TEXT_MUTED,
            font=("Segoe UI", 9),
        ).pack(side="left")
        local_link = tk.Label(
            row_local,
            textvariable=self.var_local_url,
            bg=BG_INPUT,
            fg=ACCENT_LINK,
            cursor="hand2",
            font=("Consolas", 9, "underline"),
        )
        local_link.pack(side="left")
        local_link.bind("<Button-1>", lambda _e: self.open_web_ui(use_lan=False))

        row_lan = tk.Frame(urls_frame, bg=BG_INPUT)
        row_lan.pack(fill="x", pady=1)
        tk.Label(
            row_lan, text="LAN / Phone:", width=14, anchor="w", bg=BG_INPUT, fg=TEXT_MUTED,
            font=("Segoe UI", 9),
        ).pack(side="left")
        lan_link = tk.Label(
            row_lan,
            textvariable=self.var_lan_url,
            bg=BG_INPUT,
            fg=ACCENT_LINK,
            cursor="hand2",
            font=("Consolas", 9, "underline"),
        )
        lan_link.pack(side="left")
        lan_link.bind("<Button-1>", lambda _e: self.open_web_ui(use_lan=True))

        self.feedback_label = tk.Label(
            ctrl_card,
            textvariable=self.var_feedback,
            bg=BG_CARD,
            fg="#fbbf24",
            font=("Segoe UI", 9),
            anchor="w",
            wraplength=500,
            justify="left",
        )
        self.feedback_label.pack(fill="x", pady=(6, 0))

        # ── Configuration & OS Startup Card ───────────────────────────────────
        cfg_card = tk.Frame(
            container,
            bg=BG_CARD,
            padx=14,
            pady=12,
            highlightbackground=BORDER_SUBTLE,
            highlightthickness=1,
        )
        cfg_card.pack(fill="x", pady=(0, 10))

        tk.Label(
            cfg_card,
            text="Server & Startup Settings",
            bg=BG_CARD,
            fg=TEXT_PRIMARY,
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor="w", pady=(0, 8))

        grid = tk.Frame(cfg_card, bg=BG_CARD)
        grid.pack(fill="x")
        grid.columnconfigure(1, weight=1)
        grid.columnconfigure(3, weight=1)

        tk.Label(grid, text="Host:", bg=BG_CARD, fg=TEXT_SECONDARY, font=("Segoe UI", 9)).grid(
            row=0, column=0, sticky="w", padx=(0, 6), pady=4
        )
        host_combo = ttk.Combobox(
            grid,
            textvariable=self.var_host,
            values=("0.0.0.0", "127.0.0.1"),
            style="Wherezy.TCombobox",
            width=16,
        )
        host_combo.grid(row=0, column=1, sticky="ew", padx=(0, 12), pady=4)

        tk.Label(grid, text="Port:", bg=BG_CARD, fg=TEXT_SECONDARY, font=("Segoe UI", 9)).grid(
            row=0, column=2, sticky="w", padx=(0, 6), pady=4
        )
        port_entry = tk.Entry(
            grid,
            textvariable=self.var_port,
            bg=BG_INPUT,
            fg=TEXT_PRIMARY,
            insertbackground=TEXT_PRIMARY,
            relief="solid",
            bd=1,
            width=10,
        )
        port_entry.grid(row=0, column=3, sticky="ew", pady=4)

        tk.Label(grid, text="Data Dir:", bg=BG_CARD, fg=TEXT_SECONDARY, font=("Segoe UI", 9)).grid(
            row=1, column=0, sticky="w", padx=(0, 6), pady=4
        )
        data_row = tk.Frame(grid, bg=BG_CARD)
        data_row.grid(row=1, column=1, columnspan=3, sticky="ew", pady=4)
        tk.Entry(
            data_row,
            textvariable=self.var_data_dir,
            bg=BG_INPUT,
            fg=TEXT_PRIMARY,
            insertbackground=TEXT_PRIMARY,
            relief="solid",
            bd=1,
        ).pack(side="left", fill="x", expand=True, padx=(0, 6))
        self._make_button(data_row, "Browse", self.browse_data_dir, bg=BTN_SECONDARY, padx=10).pack(
            side="left"
        )

        checks = tk.Frame(cfg_card, bg=BG_CARD)
        checks.pack(fill="x", pady=(6, 4))

        self._make_checkbox(
            checks,
            "Start with OS (launch minimized to tray / menu bar on login)",
            self.var_start_with_os,
            command=self.toggle_autostart,
        ).pack(anchor="w", pady=2)
        self._make_checkbox(
            checks,
            "Auto-start server when controller launches",
            self.var_auto_start,
            command=self.save_preferences_only,
        ).pack(anchor="w", pady=2)
        self._make_checkbox(
            checks,
            "Minimize to tray / menu bar when window is closed",
            self.var_minimize_on_close,
            command=self.save_preferences_only,
        ).pack(anchor="w", pady=2)
        self._make_checkbox(
            checks,
            "Open browser automatically when server starts",
            self.var_open_browser,
            command=self.save_preferences_only,
        ).pack(anchor="w", pady=2)

        apply_row = tk.Frame(cfg_card, bg=BG_CARD)
        apply_row.pack(fill="x", pady=(6, 0))
        self._make_button(
            apply_row,
            "Save & Apply Settings",
            self.apply_settings_and_restart,
            bg=ACCENT_BLUE,
            padx=12,
        ).pack(side="right")

        # ── Activity Logs Card ────────────────────────────────────────────────
        log_card = tk.Frame(
            container,
            bg=BG_CARD,
            padx=14,
            pady=10,
            highlightbackground=BORDER_SUBTLE,
            highlightthickness=1,
        )
        log_card.pack(fill="both", expand=True, pady=(0, 10))

        log_head = tk.Frame(log_card, bg=BG_CARD)
        log_head.pack(fill="x", pady=(0, 6))
        tk.Label(
            log_head,
            text="Server Logs",
            bg=BG_CARD,
            fg=TEXT_PRIMARY,
            font=("Segoe UI", 10, "bold"),
        ).pack(side="left")
        self._make_button(
            log_head, "Clear", self.clear_logs, bg=BTN_SECONDARY, padx=8, pady=2
        ).pack(side="right")

        self.log_text = scrolledtext.ScrolledText(
            log_card,
            height=8,
            bg=BG_INPUT,
            fg=TEXT_SECONDARY,
            insertbackground=TEXT_PRIMARY,
            font=("Consolas", 8),
            relief="flat",
            wrap="word",
            state="disabled",
        )
        self.log_text.pack(fill="both", expand=True)

        # ── Footer ────────────────────────────────────────────────────────────
        footer = tk.Frame(container, bg=BG_ROOT)
        footer.pack(fill="x")

        self.btn_hide_tray = self._make_button(
            footer,
            "Hide to Tray / Menu Bar",
            self.hide_to_tray,
            bg=BTN_SECONDARY,
            padx=12,
        )
        self.btn_hide_tray.pack(side="left")

        self._make_button(
            footer,
            "Quit Wherezy",
            self.quit_app,
            bg=BTN_DANGER,
            padx=14,
        ).pack(side="right")

    def _make_button(
        self,
        parent,
        text: str,
        command,
        *,
        bg: str,
        fg: str = TEXT_PRIMARY,
        padx: int = 10,
        pady: int = 6,
    ) -> tk.Button:
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=bg,
            fg=fg,
            activebackground=bg,
            activeforeground=fg,
            disabledforeground="#94a3b8",
            relief="flat",
            bd=0,
            padx=padx,
            pady=pady,
            cursor="hand2",
            font=("Segoe UI", 9, "bold"),
        )

    def _make_checkbox(self, parent, text: str, variable: tk.BooleanVar, command) -> tk.Checkbutton:
        return tk.Checkbutton(
            parent,
            text=text,
            variable=variable,
            command=command,
            bg=BG_CARD,
            fg=TEXT_SECONDARY,
            activebackground=BG_CARD,
            activeforeground=TEXT_PRIMARY,
            selectcolor=BG_INPUT,
            highlightthickness=0,
            bd=0,
            anchor="w",
            font=("Segoe UI", 9),
        )

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

    def _collect_form_config(self) -> DesktopConfig | None:
        raw_port = self.var_port.get().strip()
        try:
            port = int(raw_port)
            if not (1 <= port <= 65535):
                raise ValueError
        except ValueError:
            self.var_feedback.set("Port must be a number between 1 and 65535.")
            return None

        host = self.var_host.get().strip() or "0.0.0.0"
        data_dir = self.var_data_dir.get().strip() or self.config.data_dir
        cfg = DesktopConfig(
            host=host,
            port=port,
            data_dir=data_dir,
            auto_start_server=bool(self.var_auto_start.get()),
            open_browser_on_start=bool(self.var_open_browser.get()),
            minimize_to_tray_on_close=bool(self.var_minimize_on_close.get()),
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
        ).normalized()
        self.config = cfg
        save_desktop_config(cfg)

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
        return self.server_manager.start(host=cfg.host, port=cfg.port, data_dir=cfg.data_dir)

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
        return self.server_manager.restart(host=cfg.host, port=cfg.port, data_dir=cfg.data_dir)

    def apply_settings_and_restart(self) -> None:
        cfg = self._collect_form_config()
        if cfg is None:
            return
        if self.server_manager.needs_process_restart_for_data_dir(cfg.data_dir):
            self._prompt_relaunch_for_data_dir()
            return
        snap = self.server_manager.snapshot()
        if snap.status in {"running", "paused"}:
            self.server_manager.restart(host=cfg.host, port=cfg.port, data_dir=cfg.data_dir)
            self.var_feedback.set("Settings saved and server restarted.")
        else:
            self.var_feedback.set("Settings saved.")
            self._apply_snapshot(
                ServerSnapshot(
                    status=snap.status,
                    host=cfg.host,
                    port=cfg.port,
                    data_dir=cfg.data_dir,
                    local_url=f"http://{'127.0.0.1' if cfg.host in {'0.0.0.0', '::', ''} else cfg.host}:{cfg.port}",
                    lan_url=snap.lan_url,
                    error_message=snap.error_message,
                )
            )

    def _prompt_relaunch_for_data_dir(self) -> None:
        answer = messagebox.askyesno(
            "Relaunch Required",
            "Changing the Data Folder requires restarting the Wherezy desktop controller.\n\n"
            "Save settings and relaunch now?",
            parent=self.root,
        )
        if answer:
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
        color = STATUS_COLORS.get(status, "#64748b")
        prefix = "⏸" if status == "paused" else ("■" if status == "stopped" else "●")

        self.status_pill.configure(text=f"{prefix}  {label}", fg=color)
        self.var_local_url.set(snap.local_url)
        self.var_lan_url.set(snap.lan_url)

        if snap.error_message:
            self.var_feedback.set(snap.error_message)

        if status == "paused":
            self.btn_start.configure(text="▶  Resume", state="normal", bg=BTN_SUCCESS)
            self.btn_pause.configure(state="disabled")
            self.btn_stop.configure(state="normal")
            self.btn_restart.configure(state="normal")
            self.btn_open_web.configure(state="normal")
        elif status == "running":
            self.btn_start.configure(text="▶  Running", state="disabled", bg=BTN_SECONDARY)
            self.btn_pause.configure(state="normal")
            self.btn_stop.configure(state="normal")
            self.btn_restart.configure(state="normal")
            self.btn_open_web.configure(state="normal")
        elif status == "starting":
            self.btn_start.configure(text="Starting...", state="disabled", bg=BTN_SECONDARY)
            self.btn_pause.configure(state="disabled")
            self.btn_stop.configure(state="normal")
            self.btn_restart.configure(state="disabled")
            self.btn_open_web.configure(state="disabled")
        else:
            self.btn_start.configure(text="▶  Start Server", state="normal", bg=BTN_SUCCESS)
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
    minimized: bool = False,
    open_browser: bool = False,
) -> int:
    """Entrypoint called by CLI or frozen desktop binary to run the GUI + Tray app."""
    try:
        app = WherezyDesktopApp(
            initial_host=host,
            initial_port=port,
            initial_data_dir=data_dir,
            start_minimized=minimized,
            open_browser_override=open_browser,
        )
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 0
    return app.run()


def main() -> int:
    return run_desktop_app()
