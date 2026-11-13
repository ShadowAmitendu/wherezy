"""Native PyQt6 Desktop & System Tray / Menu Bar Controller for Wherezy.

The controller layout is defined in `backend/app/desktop/ui/main_window.ui` and
loaded dynamically at startup via `PyQt6.uic.loadUi()`, so you can open and
edit `main_window.ui` directly in Qt Designer (`pyside6-designer`) without a
code-generation step.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
from typing import Callable, Sequence
import uuid
import webbrowser

from PIL import Image
from PyQt6 import QtCore, QtGui, QtWidgets, uic

from backend.app.core.config import resource_path
from backend.app.core.version import APP_VERSION
from backend.app.desktop.autostart import is_autostart_enabled, set_autostart_enabled
from backend.app.desktop.config_store import (
    DesktopConfig,
    get_app_support_dir,
    get_default_desktop_data_dir,
    get_desktop_config_path,
    load_desktop_config,
    resolve_launch_command,
    save_desktop_config,
)
from backend.app.desktop.icons import (
    STATUS_LABELS,
    create_tray_icon_image,
    load_base_icon_image,
)
from backend.app.desktop.server_manager import (
    ServerSnapshot,
    WherezyServerManager,
    find_free_port,
    get_local_ip,
)

UI_RELATIVE_PATH = "backend/app/desktop/ui/main_window.ui"


def _set_windows_app_user_model_id(app_id: str = "com.wherezy.desktop") -> None:
    """Bind a clean taskbar AppUserModelID before constructing QApplication on Windows."""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
    except Exception:
        pass


def _set_macos_activation_policy(show_in_dock: bool) -> None:
    """Switch macOS between regular Dock app (window open) and menu-bar accessory (hidden)."""
    if sys.platform != "darwin":
        return
    try:
        import AppKit  # type: ignore[import-not-found]

        ns_app = AppKit.NSApplication.sharedApplication()
        policy = (
            AppKit.NSApplicationActivationPolicyRegular
            if show_in_dock
            else AppKit.NSApplicationActivationPolicyAccessory
        )
        ns_app.setActivationPolicy_(policy)
        if show_in_dock:
            ns_app.activateIgnoringOtherApps_(True)
    except Exception:
        pass


def _clean_subprocess_env() -> dict[str, str]:
    """Return os.environ stripped of PyInstaller bundle DLL paths so child apps don't lock _internal."""
    env = os.environ.copy()
    if not getattr(sys, "frozen", False):
        return env

    bundle_roots: set[str] = set()
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        bundle_roots.add(str(Path(meipass).resolve()).lower())
    exe_dir = Path(sys.executable).resolve().parent
    bundle_roots.add(str(exe_dir).lower())
    bundle_roots.add(str(exe_dir / "_internal").lower())

    path_key = next((k for k in env if k.upper() == "PATH"), "PATH")
    raw_path = env.get(path_key, "")
    if raw_path:
        cleaned_entries = []
        for entry in raw_path.split(os.pathsep):
            if not entry:
                continue
            try:
                norm = str(Path(entry).resolve()).lower()
            except OSError:
                norm = entry.strip().lower()
            if any(
                norm == root or norm.startswith(root + os.sep.lower())
                for root in bundle_roots
            ):
                continue
            cleaned_entries.append(entry)
        env[path_key] = os.pathsep.join(cleaned_entries)

    for key in list(env):
        if key.upper().startswith("_MEIPASS") or key.upper().startswith("_PYI_"):
            env.pop(key, None)
    return env


def _open_url_in_browser(url: str) -> None:
    """Open URL in the default browser without passing frozen bundle DLL paths to the browser."""
    if sys.platform == "win32" and getattr(sys, "frozen", False):
        try:
            subprocess.Popen(
                ["rundll32.exe", "url.dll,FileProtocolHandler", url],
                env=_clean_subprocess_env(),
                cwd=str(Path.home()),
                close_fds=True,
            )
            return
        except Exception:
            pass
    webbrowser.open(url)


def _open_folder_in_os(target_path: str) -> None:
    """Ensure `target_path` exists and open it in the native file manager."""
    resolved = Path(target_path).expanduser().resolve()
    resolved.mkdir(parents=True, exist_ok=True)
    if sys.platform == "win32":
        if getattr(sys, "frozen", False):
            subprocess.Popen(
                ["explorer.exe", str(resolved)],
                env=_clean_subprocess_env(),
                cwd=str(Path.home()),
                close_fds=True,
            )
        else:
            os.startfile(str(resolved))  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(resolved)])
    else:
        subprocess.Popen(["xdg-open", str(resolved)])


def _pil_to_qpixmap(image: Image.Image) -> QtGui.QPixmap:
    """Convert a Pillow Image to an independent Qt QPixmap without ImageQt side-effects."""
    rgba = image.convert("RGBA")
    raw = rgba.tobytes("raw", "RGBA")
    qimg = QtGui.QImage(
        raw,
        rgba.width,
        rgba.height,
        rgba.width * 4,
        QtGui.QImage.Format.Format_RGBA8888,
    )
    return QtGui.QPixmap.fromImage(qimg.copy())


def _build_app_qicon() -> QtGui.QIcon:
    """Construct a multi-resolution QIcon from the bundled Wherezy app icon."""
    icon = QtGui.QIcon()
    base = load_base_icon_image(size=256)
    for px in (16, 24, 32, 48, 64, 128):
        resized = base.resize((px, px), Image.Resampling.LANCZOS)
        icon.addPixmap(_pil_to_qpixmap(resized))
    return icon


def _get_instance_lock_path() -> Path:
    """Return path to `desktop-instance.json`, honoring WHEREZY_DESKTOP_CONFIG for tests."""
    override_cfg = os.getenv("WHEREZY_DESKTOP_CONFIG")
    if override_cfg:
        return Path(override_cfg).expanduser().resolve().parent / "desktop-instance.json"
    return get_app_support_dir() / "desktop-instance.json"


class _SingleInstanceServer:
    """Loopback TCP IPC server ensuring one Desktop Controller instance per user profile."""

    def __init__(
        self,
        on_show_requested: Callable[[], None],
        on_quit_requested: Callable[[], None] | None = None,
    ) -> None:
        self._on_show_requested = on_show_requested
        self._on_quit_requested = on_quit_requested
        self._token = uuid.uuid4().hex
        self._sock: socket.socket | None = None
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._lock_path = _get_instance_lock_path()

    def try_notify_existing(self, action: str = "show", timeout: float = 1.5) -> bool:
        """Signal an already-running controller instance ('show' or 'quit'), if reachable."""
        if not self._lock_path.is_file():
            return False
        try:
            payload = json.loads(self._lock_path.read_text(encoding="utf-8"))
            port = int(payload["port"])
            token = str(payload["token"])
        except Exception:
            return False

        try:
            with socket.create_connection(("127.0.0.1", port), timeout=timeout) as conn:
                conn.sendall(f"{token}:{action}\n".encode("utf-8"))
                resp = conn.recv(64).decode("utf-8", errors="ignore").strip()
                return resp == "OK"
        except OSError:
            return False

    def start(self) -> None:
        """Bind loopback socket and publish connection token to `desktop-instance.json`."""
        self._stop_event.clear()
        self._lock_path.parent.mkdir(parents=True, exist_ok=True)
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        if os.name != "nt":
            srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind(("127.0.0.1", 0))
        srv.listen(8)
        srv.settimeout(0.4)
        self._sock = srv
        port = int(srv.getsockname()[1])

        info = {"port": port, "token": self._token, "pid": os.getpid()}
        self._lock_path.write_text(json.dumps(info), encoding="utf-8")

        def _accept_loop() -> None:
            while not self._stop_event.is_set():
                try:
                    conn, _ = srv.accept()
                except socket.timeout:
                    continue
                except OSError:
                    break
                with conn:
                    try:
                        conn.settimeout(1.0)
                        data = conn.recv(256).decode("utf-8", errors="ignore").strip()
                        token_part, _, action = data.partition(":")
                        if token_part != self._token:
                            conn.sendall(b"ERR\n")
                            continue
                        if action == "quit":
                            conn.sendall(b"OK\n")
                            if self._on_quit_requested is not None:
                                self._on_quit_requested()
                        else:
                            conn.sendall(b"OK\n")
                            self._on_show_requested()
                    except Exception:
                        pass

        self._thread = threading.Thread(
            target=_accept_loop,
            name="wherezy-desktop-ipc",
            daemon=True,
        )
        self._thread.start()

    def close(self) -> None:
        """Stop IPC listener thread and clean up owned lock file."""
        self._stop_event.set()
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=1.5)
        self._thread = None

        if self._lock_path.is_file():
            try:
                payload = json.loads(self._lock_path.read_text(encoding="utf-8"))
                if payload.get("token") == self._token:
                    self._lock_path.unlink(missing_ok=True)
            except Exception:
                self._lock_path.unlink(missing_ok=True)


def request_running_instance_quit(timeout: float = 5.0) -> bool:
    """Ask any running Wherezy Desktop Controller to quit cleanly and wait for exit."""
    lock_path = _get_instance_lock_path()
    client = _SingleInstanceServer(lambda: None)
    if not client.try_notify_existing("quit", timeout=min(2.0, max(0.5, timeout))):
        return False

    deadline = time.monotonic() + max(0.2, timeout)
    while time.monotonic() < deadline:
        if not lock_path.exists():
            return True
        time.sleep(0.05)
    return not lock_path.exists()


class _SignalBridge(QtCore.QObject):
    """Marshals background server-manager and IPC events cleanly onto the Qt GUI thread."""

    state_changed = QtCore.pyqtSignal(object)
    log_appended = QtCore.pyqtSignal(str)
    show_requested = QtCore.pyqtSignal()
    quit_requested = QtCore.pyqtSignal()

    def __init__(self, controller: WherezyDesktopApp, parent: QtCore.QObject | None = None) -> None:
        super().__init__(parent)
        self._controller = controller
        self.state_changed.connect(
            self._handle_state_changed,
            QtCore.Qt.ConnectionType.AutoConnection,
        )
        self.log_appended.connect(
            self._handle_log_appended,
            QtCore.Qt.ConnectionType.AutoConnection,
        )
        self.show_requested.connect(self._handle_show_requested)
        self.quit_requested.connect(self._handle_quit_requested)

    @QtCore.pyqtSlot(object)
    def _handle_state_changed(self, snap: ServerSnapshot) -> None:
        self._controller._on_state_snapshot_on_gui(snap)

    @QtCore.pyqtSlot(str)
    def _handle_log_appended(self, line: str) -> None:
        self._controller._append_log_line_on_gui(line)

    @QtCore.pyqtSlot()
    def _handle_show_requested(self) -> None:
        self._controller.show_window()

    @QtCore.pyqtSlot()
    def _handle_quit_requested(self) -> None:
        self._controller.quit_app()


class _ClickFilter(QtCore.QObject):
    """Triggers a callback when the target widget receives a left mouse click."""

    def __init__(self, parent: QtCore.QObject, on_click: Callable[[], None]) -> None:
        super().__init__(parent)
        self._on_click = on_click

    def eventFilter(self, obj: QtCore.QObject, event: QtCore.QEvent) -> bool:
        if (
            event.type() == QtCore.QEvent.Type.MouseButtonRelease
            and isinstance(event, QtGui.QMouseEvent)
            and event.button() == QtCore.Qt.MouseButton.LeftButton
        ):
            self._on_click()
            return True
        return super().eventFilter(obj, event)


class _ControllerMainWindow(QtWidgets.QMainWindow):
    """QMainWindow subclass delegating close interception back to WherezyDesktopApp."""

    def __init__(self, on_close_intercept: Callable[[], bool]) -> None:
        super().__init__()
        self._on_close_intercept = on_close_intercept

    def closeEvent(self, event: QtGui.QCloseEvent) -> None:
        if self._on_close_intercept():
            event.ignore()
            return
        event.accept()


def _ensure_qt_application() -> QtWidgets.QApplication:
    """Return active QApplication or initialize a default Qt instance."""
    existing = QtWidgets.QApplication.instance()
    if isinstance(existing, QtWidgets.QApplication):
        return existing

    app = QtWidgets.QApplication(sys.argv if sys.argv else ["wherezy"])
    app.setApplicationName("Wherezy")
    app.setApplicationDisplayName("Wherezy Desktop")
    app.setOrganizationName("Wherezy")
    return app


class WherezyDesktopApp:
    """PyQt6 controller window + QSystemTrayIcon shell wrapping WherezyServerManager."""

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
        ui_path: Path | None = None,
    ) -> None:
        _set_windows_app_user_model_id()

        self.config: DesktopConfig = load_desktop_config()

        self._effective_host = (initial_host or self.config.host).strip() or "127.0.0.1"
        self._effective_port = int(initial_port) if initial_port is not None else self.config.port
        self._effective_data_dir = initial_data_dir or self.config.data_dir
        self._effective_https = (
            bool(initial_https) if initial_https is not None else bool(self.config.use_https)
        )
        self._effective_ssl_certfile = (
            self.config.ssl_certfile if initial_ssl_certfile is None else initial_ssl_certfile
        )
        self._effective_ssl_keyfile = (
            self.config.ssl_keyfile if initial_ssl_keyfile is None else initial_ssl_keyfile
        )

        self._start_minimized = bool(start_minimized)
        self._open_browser_override = bool(open_browser_override)
        self._enable_tray = bool(enable_tray)
        self._enable_ipc = bool(enable_ipc)
        self._shutting_down = False
        self._quitting = False
        self._pumping_events = False
        self._relaunch_on_exit = False
        self._relaunch_cmd: list[str] | None = None
        self._opened_initial_browser = False
        self._last_feedback: str = ""
        self._local_url_preview: str = ""
        self._lan_url_preview: str = ""

        self.server_manager = WherezyServerManager()
        self.app = _ensure_qt_application()
        self._icon_cache: dict[str, QtGui.QIcon] = {}
        self._app_icon = _build_app_qicon()
        self.app.setWindowIcon(self._app_icon)

        resolved_ui = Path(ui_path) if ui_path is not None else resource_path(UI_RELATIVE_PATH)
        if not resolved_ui.is_file():
            raise FileNotFoundError(
                f"Qt Designer UI file not found: {resolved_ui}"
            )

        self.window = _ControllerMainWindow(self._handle_window_close_event)
        self.root = self.window  # Friendly alias alongside `.window`
        uic.loadUi(str(resolved_ui), self.window)
        self.window.setWindowIcon(self._app_icon)

        self._bind_ui_widgets()
        self._populate_initial_form_state()
        self._wire_signals()

        self._bridge = _SignalBridge(self, self.window)

        self.server_manager.add_state_listener(self._on_server_state_callback)
        self.server_manager.add_log_listener(self._on_server_log_callback)

        for existing_line in self.server_manager.get_logs():
            self.log_text.appendPlainText(existing_line)

        self._tray_active: bool = False
        self._tray_icon: QtWidgets.QSystemTrayIcon | None = None
        self._tray_menu: QtWidgets.QMenu | None = None
        self._tray_actions: dict[str, QtGui.QAction] = {}
        self._setup_tray_if_available()
        self._tray_active = bool(self._tray_icon is not None)

        self._ipc: _SingleInstanceServer | None = None
        if self._enable_ipc:
            self._ipc = _SingleInstanceServer(
                on_show_requested=lambda: (
                    None if self._shutting_down else self._bridge.show_requested.emit()
                ),
                on_quit_requested=lambda: (
                    None if self._shutting_down else self._bridge.quit_requested.emit()
                ),
            )
            self._ipc.start()

        self._update_lan_notice_visibility()
        self._on_state_snapshot_on_gui(self.server_manager.snapshot())

        if self.config.auto_start_server or self._start_minimized:
            self._start_server_from_settings(auto_open_browser=True)

        if self._start_minimized and self._tray_icon is not None:
            self.hide_to_tray()
        elif self._start_minimized:
            self.window.showMinimized()

    def _bind_ui_widgets(self) -> None:
        """Bind child widgets loaded from `main_window.ui` to typed attributes on self."""
        w = self.window
        self.status_pill: QtWidgets.QLabel = w.label_5
        self.lbl_running_state: QtWidgets.QLabel = w.label_5
        self.lbl_server_status: QtWidgets.QLabel = w.label_6

        self.btn_start: QtWidgets.QPushButton = w.pushButton
        self.btn_stop: QtWidgets.QPushButton = w.pushButton_2
        self.btn_restart: QtWidgets.QPushButton = w.pushButton_3
        self.btn_open_browser: QtWidgets.QPushButton = w.pushButton_4
        self.btn_copy_lan: QtWidgets.QPushButton = w.pushButton_5
        self.btn_open_data: QtWidgets.QPushButton = w.pushButton_6

        self.btn_reset_settings: QtWidgets.QPushButton = w.pushButton_13
        self.chk_open_browser: QtWidgets.QCheckBox = w.checkBox_2
        self.chk_autostart_server: QtWidgets.QCheckBox = w.checkBox_4
        self.chk_autostart: QtWidgets.QCheckBox = w.checkBox
        self.chk_close_to_tray: QtWidgets.QCheckBox = w.checkBox_3
        self.chk_use_https: QtWidgets.QCheckBox = w.checkBox_5
        self.btn_save_settings: QtWidgets.QPushButton = w.pushButton_8
        self.edit_data_dir: QtWidgets.QLineEdit = w.lineEdit
        self.btn_browse_data: QtWidgets.QPushButton = w.pushButton_9
        self.edit_port: QtWidgets.QLineEdit = w.lineEdit_2
        self.btn_save_apply: QtWidgets.QPushButton = w.pushButton_10

        self.log_text: QtWidgets.QPlainTextEdit = w.plainTextEdit
        self.btn_clear_logs: QtWidgets.QPushButton = w.pushButton_7
        self.progress_bar: QtWidgets.QProgressBar = w.progressBar

        self.btn_hide_tray: QtWidgets.QPushButton = w.pushButton_11
        self.btn_quit: QtWidgets.QPushButton = w.pushButton_12

        # Optional widgets from alternate/customized UI layouts
        self.lbl_logo: QtWidgets.QLabel | None = getattr(w, "lbl_logo", None)
        self.lbl_title: QtWidgets.QLabel | None = getattr(w, "lbl_title", None)
        self.lbl_subtitle: QtWidgets.QLabel | None = getattr(w, "lbl_subtitle", None)
        self.btn_pause: QtWidgets.QPushButton | None = getattr(w, "btn_pause", None)
        self.lan_notice_frame: QtWidgets.QFrame | None = getattr(w, "lan_notice_frame", None)
        self.btn_lan_enable_https: QtWidgets.QPushButton | None = getattr(
            w, "btn_lan_enable_https", None
        )
        self.btn_lan_enable_http: QtWidgets.QPushButton | None = getattr(
            w, "btn_lan_enable_http", None
        )
        self.btn_lan_local_only: QtWidgets.QPushButton | None = getattr(
            w, "btn_lan_local_only", None
        )
        self.lbl_local_link: QtWidgets.QLabel | None = getattr(w, "lbl_local_link", None)
        self.lbl_lan_link: QtWidgets.QLabel | None = getattr(w, "lbl_lan_link", None)
        self.lbl_feedback: QtWidgets.QLabel | None = getattr(w, "lbl_feedback", None)
        self.port_error_frame: QtWidgets.QFrame | None = getattr(w, "port_error_frame", None)
        self.lbl_port_error: QtWidgets.QLabel | None = getattr(w, "lbl_port_error", None)
        self.btn_pick_free_port: QtWidgets.QPushButton | None = getattr(
            w, "btn_pick_free_port", None
        )
        self.combo_host: QtWidgets.QComboBox | None = getattr(w, "combo_host", None)
        self.lbl_tls_fingerprint: QtWidgets.QLabel | None = getattr(
            w, "lbl_tls_fingerprint", None
        )
        self.lbl_footer_hint: QtWidgets.QLabel | None = getattr(w, "lbl_footer_hint", None)

    def _current_host(self) -> str:
        if self.combo_host is not None:
            text = (self.combo_host.currentText() or "").strip()
            if text:
                return text
        return (self._effective_host or self.config.host or "127.0.0.1").strip() or "127.0.0.1"

    def _set_feedback(self, message: str, *, log: bool = True) -> None:
        self._last_feedback = message
        if self.lbl_feedback is not None:
            self.lbl_feedback.setText(message)
        if log and message and not self._shutting_down:
            self.server_manager.log_event(message)

    def _apply_form_values(
        self,
        *,
        host: str,
        port: int,
        data_dir: str,
        autostart_os: bool,
        auto_start_server: bool,
        open_browser: bool,
        minimize_to_tray: bool,
        use_https: bool,
    ) -> None:
        if self.combo_host is not None:
            with QtCore.QSignalBlocker(self.combo_host):
                if self.combo_host.findText(host) < 0:
                    self.combo_host.addItem(host)
                self.combo_host.setCurrentText(host)

        self.edit_port.setText(str(port))
        self.edit_data_dir.setText(data_dir)

        for checkbox, checked in (
            (self.chk_autostart, autostart_os),
            (self.chk_autostart_server, auto_start_server),
            (self.chk_open_browser, open_browser),
            (self.chk_close_to_tray, minimize_to_tray),
            (self.chk_use_https, use_https),
        ):
            with QtCore.QSignalBlocker(checkbox):
                checkbox.setChecked(bool(checked))

    def _populate_initial_form_state(self) -> None:
        """Populate Qt Designer widgets with runtime config, OS strings, and header logo."""
        if self.window.windowTitle() in {"", "MainWindow"}:
            self.window.setWindowTitle(f"Wherezy v{APP_VERSION}")
        if self.lbl_subtitle is not None:
            self.lbl_subtitle.setText(f"Desktop & Tray Server Controller  •  v{APP_VERSION}")
        if self.lbl_logo is not None:
            logo_px = _pil_to_qpixmap(load_base_icon_image(size=64)).scaled(
                32,
                32,
                QtCore.Qt.AspectRatioMode.KeepAspectRatio,
                QtCore.Qt.TransformationMode.SmoothTransformation,
            )
            self.lbl_logo.setPixmap(logo_px)

        if sys.platform == "darwin":
            self.btn_hide_tray.setText("Hide to Menu Bar")
            if self.lbl_footer_hint is not None:
                self.lbl_footer_hint.setText(
                    "Closing this window leaves Wherezy running in the Menu Bar."
                )
        else:
            if self.lbl_footer_hint is not None:
                self.lbl_footer_hint.setText(
                    "Closing this window leaves Wherezy running in the System Tray."
                )

        self._apply_form_values(
            host=self._effective_host,
            port=self._effective_port,
            data_dir=self._effective_data_dir,
            autostart_os=is_autostart_enabled(),
            auto_start_server=self.config.auto_start_server,
            open_browser=self.config.open_browser_on_start,
            minimize_to_tray=self.config.minimize_to_tray_on_close,
            use_https=self._effective_https,
        )

        self.log_text.setReadOnly(True)
        self.log_text.setMaximumBlockCount(1000)
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        if self.port_error_frame is not None:
            self.port_error_frame.setVisible(False)
        if self.lbl_feedback is not None:
            self.lbl_feedback.setText("")
        if self.lbl_tls_fingerprint is not None:
            self.lbl_tls_fingerprint.setText("")

    def _wire_signals(self) -> None:
        """Connect `.ui` widget signals to controller slots."""
        if self.btn_lan_enable_https is not None:
            self.btn_lan_enable_https.clicked.connect(
                lambda: self._resolve_lan_notice(enable_lan=True, enable_https=True)
            )
        if self.btn_lan_enable_http is not None:
            self.btn_lan_enable_http.clicked.connect(
                lambda: self._resolve_lan_notice(enable_lan=True, enable_https=False)
            )
        if self.btn_lan_local_only is not None:
            self.btn_lan_local_only.clicked.connect(
                lambda: self._resolve_lan_notice(enable_lan=False)
            )

        self.btn_start.clicked.connect(self.handle_start_or_resume)
        if self.btn_pause is not None:
            self.btn_pause.clicked.connect(self.handle_pause)
        self.btn_stop.clicked.connect(self.handle_stop)
        self.btn_restart.clicked.connect(self.handle_restart)

        self.btn_open_browser.clicked.connect(lambda: self.open_web_ui(use_lan=False))
        self.btn_copy_lan.clicked.connect(self.copy_lan_url)
        self.btn_open_data.clicked.connect(self.open_data_folder)
        if self.btn_pick_free_port is not None:
            self.btn_pick_free_port.clicked.connect(self.pick_free_port_and_start)

        if self.lbl_local_link is not None:
            self.lbl_local_link.installEventFilter(
                _ClickFilter(self.lbl_local_link, lambda: self.open_web_ui(use_lan=False))
            )
        if self.lbl_lan_link is not None:
            self.lbl_lan_link.installEventFilter(
                _ClickFilter(self.lbl_lan_link, lambda: self.open_web_ui(use_lan=True))
            )

        self.btn_reset_settings.clicked.connect(self.reset_settings_to_default)
        self.btn_browse_data.clicked.connect(self.browse_data_dir)
        self.chk_autostart.toggled.connect(lambda _checked: self.toggle_autostart())
        self.chk_use_https.toggled.connect(lambda _checked: self.toggle_https())
        self.btn_save_settings.clicked.connect(self.apply_settings_and_restart)
        self.btn_save_apply.clicked.connect(self.apply_settings_and_restart)
        self.btn_clear_logs.clicked.connect(self.clear_logs)

        self.btn_hide_tray.clicked.connect(self.hide_to_tray)
        self.btn_quit.clicked.connect(self.quit_app)

    def _tray_qicon(self, status: str) -> QtGui.QIcon:
        """Return a cached multi-resolution status-badged QIcon for system tray / menu bar."""
        key = status if status in STATUS_LABELS else "stopped"
        if key not in self._icon_cache:
            icon = QtGui.QIcon()
            for px in (16, 24, 32, 48, 64):
                pil_img = create_tray_icon_image(status=key, size=px)
                icon.addPixmap(_pil_to_qpixmap(pil_img))
            self._icon_cache[key] = icon
        return self._icon_cache[key]

    def _setup_tray_if_available(self) -> None:
        """Initialize native Qt QSystemTrayIcon and menu when tray support is enabled."""
        if not self._enable_tray or not QtWidgets.QSystemTrayIcon.isSystemTrayAvailable():
            return

        self.app.setQuitOnLastWindowClosed(False)
        tray = QtWidgets.QSystemTrayIcon(self._tray_qicon("stopped"), self.window)
        tray.setToolTip("Wherezy — Stopped")

        menu = QtWidgets.QMenu(self.window)
        act_status = QtGui.QAction("Wherezy Server: Stopped", menu)
        act_status.setEnabled(False)
        menu.addAction(act_status)
        menu.addSeparator()

        act_show = menu.addAction("Show Controller")
        act_show.triggered.connect(self.show_window)
        menu.addSeparator()

        act_open_local = menu.addAction("Open Web UI")
        act_open_local.triggered.connect(lambda: self.open_web_ui(use_lan=False))
        act_open_lan = menu.addAction("Open LAN URL")
        act_open_lan.triggered.connect(lambda: self.open_web_ui(use_lan=True))
        act_copy_lan = menu.addAction("Copy LAN URL")
        act_copy_lan.triggered.connect(self.copy_lan_url)
        menu.addSeparator()

        act_start = menu.addAction("Start / Resume Server")
        act_start.triggered.connect(self.handle_start_or_resume)
        act_pause = menu.addAction("Pause Server")
        act_pause.triggered.connect(self.handle_pause)
        act_stop = menu.addAction("Stop Server")
        act_stop.triggered.connect(self.handle_stop)
        act_restart = menu.addAction("Restart Server")
        act_restart.triggered.connect(self.handle_restart)
        menu.addSeparator()

        act_quit = menu.addAction("Quit Wherezy")
        act_quit.triggered.connect(self.quit_app)

        tray.setContextMenu(menu)
        tray.activated.connect(self._on_tray_activated)
        tray.show()

        self._tray_icon = tray
        self._tray_menu = menu
        self._tray_actions = {
            "status": act_status,
            "show": act_show,
            "open_local": act_open_local,
            "open_lan": act_open_lan,
            "copy_lan": act_copy_lan,
            "start": act_start,
            "pause": act_pause,
            "stop": act_stop,
            "restart": act_restart,
            "quit": act_quit,
        }

    def _on_tray_activated(self, reason: QtWidgets.QSystemTrayIcon.ActivationReason) -> None:
        """Open controller window when clicking tray icon on Windows/Linux or double-clicking."""
        if reason == QtWidgets.QSystemTrayIcon.ActivationReason.DoubleClick:
            self.show_window()
        elif (
            sys.platform != "darwin"
            and reason == QtWidgets.QSystemTrayIcon.ActivationReason.Trigger
        ):
            self.show_window()

    def _on_server_state_callback(self, snap: ServerSnapshot) -> None:
        if not self._shutting_down:
            self._bridge.state_changed.emit(snap)

    def _on_server_log_callback(self, line: str) -> None:
        if not self._shutting_down:
            self._bridge.log_appended.emit(line)

    def _append_log_line_on_gui(self, line: str) -> None:
        if self._shutting_down:
            return
        self.log_text.appendPlainText(line)
        sb = self.log_text.verticalScrollBar()
        if sb is not None:
            sb.setValue(sb.maximum())

    def _pump_gui_events_if_visible(self) -> None:
        """Flush Qt paint updates so progress transitions animate synchronously."""
        if self._pumping_events or not self.window.isVisible():
            return
        if QtCore.QThread.currentThread() is not self.app.thread():
            return
        self._pumping_events = True
        try:
            self.status_pill.repaint()
            self.lbl_server_status.repaint()
            self.progress_bar.repaint()
            self.app.processEvents(
                QtCore.QEventLoop.ProcessEventsFlag.ExcludeUserInputEvents
            )
        finally:
            self._pumping_events = False

    def _on_state_snapshot_on_gui(self, snap: ServerSnapshot) -> None:
        if self._shutting_down:
            return

        is_restarting = snap.operation == "restarting" and snap.status in {
            "starting",
            "stopping",
        }
        status_text = (
            "Restarting..."
            if is_restarting
            else STATUS_LABELS.get(snap.status, snap.status.title())
        )
        self.status_pill.setText(status_text)
        self.status_pill.setProperty("status", snap.status)

        self._local_url_preview = snap.local_url
        self._lan_url_preview = snap.lan_url
        if self.lbl_local_link is not None:
            self.lbl_local_link.setText(snap.local_url)
        if self.lbl_lan_link is not None:
            self.lbl_lan_link.setText(snap.lan_url)
        if snap.status in {"stopped", "error"}:
            self._sync_endpoint_preview_labels()

        local_display = self._local_url_preview or snap.local_url
        lan_display = self._lan_url_preview or snap.lan_url
        if snap.port_in_use:
            server_status_text = f"Port {snap.port} busy"
        elif snap.status == "error":
            server_status_text = "Error (see log)"
        elif snap.status == "running":
            server_status_text = snap.local_url
        elif snap.status == "paused":
            server_status_text = f"Paused ({snap.local_url})"
        elif snap.status == "stopping":
            server_status_text = "Stopping..." if is_restarting else "Shutting down..."
        elif snap.status == "starting":
            server_status_text = f"Starting (:{snap.port})"
        else:
            server_status_text = f"Offline (:{snap.port})"

        tooltip_lines = [f"Local: {local_display}", f"LAN: {lan_display}"]
        if snap.use_https and snap.cert_fingerprint:
            tooltip_lines.append(f"TLS SHA-256: {snap.cert_fingerprint}")
        if snap.error_message:
            tooltip_lines.append(snap.error_message)
        self.lbl_server_status.setText(server_status_text)
        self.lbl_server_status.setToolTip("\n".join(tooltip_lines))

        if snap.status == "running":
            progress_value = 100
        elif snap.status in {"stopped", "error"}:
            progress_value = 0
        elif snap.status == "paused" and snap.progress == 0:
            progress_value = 50
        else:
            progress_value = max(0, min(100, int(snap.progress)))

        if self.progress_bar.minimum() != 0 or self.progress_bar.maximum() != 100:
            self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(progress_value)

        is_running = snap.status == "running"
        is_paused = snap.status == "paused"
        is_starting = snap.status == "starting"
        is_stopping = snap.status == "stopping"
        is_busy = is_starting or is_stopping or self._quitting
        can_start = snap.status in {"stopped", "paused", "error"} and not self._quitting

        self.btn_start.setText("Resume Server" if is_paused else "Start Server")
        self.btn_start.setEnabled(can_start)
        if self.btn_pause is not None:
            self.btn_pause.setEnabled(is_running and not self._quitting)
        self.btn_stop.setEnabled(
            (is_running or is_paused or is_starting)
            and not is_stopping
            and not self._quitting
        )
        self.btn_restart.setEnabled((is_running or is_paused) and not is_busy)
        self.btn_open_browser.setEnabled((is_running or is_paused) and not is_busy)
        self.btn_copy_lan.setEnabled(not self._quitting)
        self.btn_save_settings.setEnabled(not is_busy)
        self.btn_save_apply.setEnabled(not is_busy)
        self.btn_reset_settings.setEnabled(not is_busy)

        if self.port_error_frame is not None and self.lbl_port_error is not None:
            if snap.port_in_use:
                self.lbl_port_error.setText(
                    snap.error_message
                    or f"Port {snap.port} is already in use. Pick a free port to start."
                )
                self.port_error_frame.setVisible(True)
            else:
                self.port_error_frame.setVisible(False)
                if snap.error_message:
                    self._set_feedback(snap.error_message, log=False)
        elif snap.error_message and not snap.port_in_use:
            self._set_feedback(snap.error_message, log=False)

        if self.lbl_tls_fingerprint is not None:
            if snap.use_https and snap.cert_fingerprint:
                self.lbl_tls_fingerprint.setText(f"TLS SHA-256: {snap.cert_fingerprint}")
            elif self.chk_use_https.isChecked():
                self.lbl_tls_fingerprint.setText(
                    "HTTPS (self-signed TLS) enabled — phone browsers will show a first-visit warning."
                )
            else:
                self.lbl_tls_fingerprint.setText("")

        self._update_tray_from_snapshot(snap)
        if is_starting or is_stopping or (self._quitting and snap.status == "stopped"):
            self._pump_gui_events_if_visible()

    def _update_tray_from_snapshot(self, snap: ServerSnapshot) -> None:
        if self._tray_icon is None:
            return
        is_restarting = snap.operation == "restarting" and snap.status in {
            "starting",
            "stopping",
        }
        label = (
            "Restarting..."
            if is_restarting
            else STATUS_LABELS.get(snap.status, snap.status.title())
        )
        self._tray_icon.setIcon(self._tray_qicon(snap.status))
        self._tray_icon.setToolTip(f"Wherezy — {label} ({snap.local_url})")

        if "status" in self._tray_actions:
            self._tray_actions["status"].setText(f"Wherezy Server: {label}")
        if "start" in self._tray_actions:
            self._tray_actions["start"].setText(
                "Resume Server" if snap.status == "paused" else "Start Server"
            )
            self._tray_actions["start"].setEnabled(
                snap.status in {"stopped", "paused", "error"} and not self._quitting
            )
        if "pause" in self._tray_actions:
            self._tray_actions["pause"].setEnabled(
                snap.status == "running" and not self._quitting
            )
        if "stop" in self._tray_actions:
            self._tray_actions["stop"].setEnabled(
                snap.status in {"running", "paused", "starting"} and not self._quitting
            )
        if "restart" in self._tray_actions:
            self._tray_actions["restart"].setEnabled(
                snap.status in {"running", "paused"} and not self._quitting
            )
        if "open_local" in self._tray_actions:
            self._tray_actions["open_local"].setEnabled(
                snap.status in {"running", "paused"} and not self._quitting
            )
        if "open_lan" in self._tray_actions:
            self._tray_actions["open_lan"].setEnabled(
                snap.status in {"running", "paused"} and not self._quitting
            )

    def _update_lan_notice_visibility(self) -> None:
        if self.lan_notice_frame is None:
            return
        current_host = self._current_host()
        should_show = (not self.config.lan_notice_shown) and (
            current_host in {"127.0.0.1", "localhost"}
        )
        self.lan_notice_frame.setVisible(should_show)

    def _collect_form_settings(self) -> tuple[str, int, str, bool]:
        host = self._current_host()
        raw_port = self.edit_port.text().strip()
        try:
            port = int(raw_port)
        except ValueError as exc:
            raise ValueError("Port must be an integer between 1 and 65535.") from exc
        if not 1 <= port <= 65535:
            raise ValueError("Port must be between 1 and 65535.")

        data_dir = self.edit_data_dir.text().strip() or self.config.data_dir
        resolved_data = str(Path(data_dir).expanduser().resolve())
        use_https = bool(self.chk_use_https.isChecked())
        return host, port, resolved_data, use_https

    def _start_server_from_settings(self, *, auto_open_browser: bool = False) -> ServerSnapshot:
        try:
            host, port, data_dir, use_https = self._collect_form_settings()
        except ValueError as exc:
            self._set_feedback(str(exc))
            return self.server_manager.snapshot()

        snap = self.server_manager.start(
            host=host,
            port=port,
            data_dir=data_dir,
            use_https=use_https,
            ssl_certfile=self._effective_ssl_certfile,
            ssl_keyfile=self._effective_ssl_keyfile,
        )
        self._on_state_snapshot_on_gui(snap)
        if snap.status == "running":
            self._set_feedback(f"Server running at {snap.local_url}", log=False)
            if (
                auto_open_browser
                and not self._opened_initial_browser
                and (self._open_browser_override or self.config.open_browser_on_start)
            ):
                self._opened_initial_browser = True
                _open_url_in_browser(snap.local_url)
        return snap

    def handle_start_or_resume(self) -> ServerSnapshot:
        """Start the embedded server if stopped, or resume if currently paused."""
        current = self.server_manager.snapshot()
        if current.status == "paused":
            snap = self.server_manager.resume()
            self._on_state_snapshot_on_gui(snap)
            self._set_feedback(f"Server resumed at {snap.local_url}", log=False)
            return snap
        return self._start_server_from_settings(auto_open_browser=False)

    def handle_pause(self) -> ServerSnapshot:
        """Pause serving web requests (returns HTTP 503) while staying alive."""
        snap = self.server_manager.pause()
        self._on_state_snapshot_on_gui(snap)
        self._set_feedback("Server paused (HTTP 503 Maintenance mode active).", log=False)
        return snap

    def handle_stop(self) -> ServerSnapshot:
        """Stop the embedded Uvicorn server cleanly."""
        snap = self.server_manager.stop()
        self._on_state_snapshot_on_gui(snap)
        self._set_feedback("Server stopped.", log=False)
        return snap

    def handle_restart(self) -> ServerSnapshot:
        """Restart the embedded server using current host/port/data/TLS form settings."""
        try:
            host, port, data_dir, use_https = self._collect_form_settings()
        except ValueError as exc:
            self._set_feedback(str(exc))
            return self.server_manager.snapshot()

        snap = self.server_manager.restart(
            host=host,
            port=port,
            data_dir=data_dir,
            use_https=use_https,
            ssl_certfile=self._effective_ssl_certfile,
            ssl_keyfile=self._effective_ssl_keyfile,
        )
        self._on_state_snapshot_on_gui(snap)
        if snap.status == "running":
            self._set_feedback(f"Server restarted at {snap.local_url}", log=False)
        return snap

    def pick_free_port_and_start(self) -> ServerSnapshot:
        """Automatically select an available TCP port, save it, and start the server."""
        host = self._current_host()
        try:
            current_port = int(self.edit_port.text().strip())
        except ValueError:
            current_port = self.config.port

        free_port = find_free_port(host, preferred_start=current_port + 1)
        self.edit_port.setText(str(free_port))
        self.config.port = free_port
        self._effective_port = free_port
        save_desktop_config(self.config)
        self._set_feedback(f"Switched to free port {free_port}. Starting server...")
        return self._start_server_from_settings(auto_open_browser=False)

    def _resolve_lan_notice(
        self, enable_lan: bool, enable_https: bool | None = None
    ) -> None:
        """Persist first-run LAN & firewall choice and apply immediately if enabled."""
        self.config.lan_notice_shown = True
        if self.lan_notice_frame is not None:
            self.lan_notice_frame.setVisible(False)

        if enable_lan:
            if self.combo_host is not None:
                with QtCore.QSignalBlocker(self.combo_host):
                    if self.combo_host.findText("0.0.0.0") < 0:
                        self.combo_host.addItem("0.0.0.0")
                    self.combo_host.setCurrentText("0.0.0.0")
            self.config.host = "0.0.0.0"
            self._effective_host = "0.0.0.0"

            if enable_https is not None:
                with QtCore.QSignalBlocker(self.chk_use_https):
                    self.chk_use_https.setChecked(bool(enable_https))
                self.config.use_https = bool(enable_https)
                self._effective_https = bool(enable_https)

            save_desktop_config(self.config)
            cur = self.server_manager.snapshot()
            if cur.status in {"running", "paused", "starting"}:
                self.handle_restart()
            else:
                mode_label = "LAN + HTTPS" if self.config.use_https else "LAN (HTTP)"
                self._set_feedback(f"Saved {mode_label} mode (0.0.0.0).")
                self._sync_endpoint_preview_labels()
        else:
            save_desktop_config(self.config)
            self._set_feedback("Keeping localhost-only binding (127.0.0.1).")

    def _sync_endpoint_preview_labels(self) -> None:
        """Update endpoint previews cleanly even while server is stopped after settings edits."""
        cur = self.server_manager.snapshot()
        if cur.status in {"running", "paused", "starting"}:
            return
        try:
            host, port, _data_dir, use_https = self._collect_form_settings()
        except ValueError:
            return
        scheme = "https" if use_https else "http"
        display_local = "127.0.0.1" if host in {"0.0.0.0", "::", ""} else host
        local_url = f"{scheme}://{display_local}:{port}"
        lan_url = f"{scheme}://{get_local_ip()}:{port}" if host in {"0.0.0.0", "::", ""} else local_url
        self._local_url_preview = local_url
        self._lan_url_preview = lan_url
        if self.lbl_local_link is not None:
            self.lbl_local_link.setText(local_url)
        if self.lbl_lan_link is not None:
            self.lbl_lan_link.setText(lan_url)
        self.lbl_server_status.setToolTip(f"Local: {local_url}\nLAN: {lan_url}")

    def toggle_https(self) -> None:
        """Toggle self-signed HTTPS (TLS) in config and restart server if running."""
        enabled = bool(self.chk_use_https.isChecked())
        self.config.use_https = enabled
        self._effective_https = enabled
        save_desktop_config(self.config)

        snap = self.server_manager.snapshot()
        if snap.status in {"running", "paused", "starting"}:
            self.handle_restart()
        else:
            self._sync_endpoint_preview_labels()
            self._on_state_snapshot_on_gui(snap)
            self._set_feedback(
                "HTTPS (TLS) enabled — server will serve https:// on next start."
                if enabled
                else "HTTPS (TLS) disabled — server will serve http:// on next start."
            )

    def toggle_autostart(self) -> None:
        """Register or unregister login autostart cleanly on the host OS."""
        requested = bool(self.chk_autostart.isChecked())
        try:
            actual = set_autostart_enabled(requested)
        except Exception as exc:
            actual = is_autostart_enabled()
            self._set_feedback(f"Could not update startup setting: {exc}")
        with QtCore.QSignalBlocker(self.chk_autostart):
            self.chk_autostart.setChecked(actual)
        if actual == requested:
            self._set_feedback(
                "Login autostart enabled." if actual else "Login autostart disabled."
            )

    def browse_data_dir(self) -> None:
        """Prompt user to pick a custom data folder for Wherezy SQLite + uploads."""
        current = self.edit_data_dir.text().strip() or self.config.data_dir
        selected = QtWidgets.QFileDialog.getExistingDirectory(
            self.window,
            "Select Wherezy Data Directory",
            current,
        )
        if selected:
            self.edit_data_dir.setText(str(Path(selected).resolve()))

    def _prompt_relaunch_for_data_dir(self, prompt_text: str, decline_msg: str) -> None:
        """Ask user whether to relaunch immediately when the DB data folder changed."""
        answer = QtWidgets.QMessageBox.question(
            self.window,
            "Relaunch Required",
            prompt_text,
            QtWidgets.QMessageBox.StandardButton.Yes
            | QtWidgets.QMessageBox.StandardButton.No,
        )
        if answer == QtWidgets.QMessageBox.StandardButton.Yes:
            self._relaunch_on_exit = True
            self._relaunch_cmd = resolve_launch_command(minimized=False)
            self.quit_app()
        else:
            self._set_feedback(decline_msg)

    def apply_settings_and_restart(self) -> None:
        """Persist Host/Port/Data/Startup settings and apply or relaunch as needed."""
        try:
            host, port, data_dir, use_https = self._collect_form_settings()
        except ValueError as exc:
            self._set_feedback(str(exc))
            return

        needs_relaunch = self.server_manager.needs_process_restart_for_data_dir(data_dir)
        self.config.host = host
        self.config.port = port
        self.config.data_dir = data_dir
        self.config.use_https = use_https
        self.config.auto_start_server = bool(self.chk_autostart_server.isChecked())
        self.config.open_browser_on_start = bool(self.chk_open_browser.isChecked())
        self.config.minimize_to_tray_on_close = bool(self.chk_close_to_tray.isChecked())
        if host not in {"127.0.0.1", "localhost"}:
            self.config.lan_notice_shown = True
        save_desktop_config(self.config)

        self._effective_host = host
        self._effective_port = port
        self._effective_data_dir = data_dir
        self._effective_https = use_https
        self._update_lan_notice_visibility()

        if needs_relaunch:
            self._prompt_relaunch_for_data_dir(
                "Changing the Data Directory after database initialization requires "
                "relaunching Wherezy.\n\nRelaunch now with the new folder?",
                "Saved new Data Dir; relaunch Wherezy to load the new database.",
            )
            return

        snap = self.server_manager.snapshot()
        endpoint_changed = (
            host != snap.host or port != snap.port or use_https != snap.use_https
        )
        if snap.status in {"running", "paused", "starting"} and endpoint_changed:
            self.handle_restart()
        else:
            self._sync_endpoint_preview_labels()
            self._set_feedback("Settings saved.")

    def reset_settings_to_default(self) -> None:
        """Reset desktop settings and login autostart back to factory defaults."""
        defaults = DesktopConfig(data_dir=str(get_default_desktop_data_dir())).normalized()
        needs_relaunch = self.server_manager.needs_process_restart_for_data_dir(
            defaults.data_dir
        )

        try:
            actual_autostart = set_autostart_enabled(False)
        except Exception as exc:
            actual_autostart = is_autostart_enabled()
            self._set_feedback(f"Could not disable login autostart: {exc}")

        self._apply_form_values(
            host=defaults.host,
            port=defaults.port,
            data_dir=defaults.data_dir,
            autostart_os=actual_autostart,
            auto_start_server=defaults.auto_start_server,
            open_browser=defaults.open_browser_on_start,
            minimize_to_tray=defaults.minimize_to_tray_on_close,
            use_https=defaults.use_https,
        )

        self.config = defaults
        save_desktop_config(self.config)
        self._effective_host = defaults.host
        self._effective_port = defaults.port
        self._effective_data_dir = defaults.data_dir
        self._effective_https = defaults.use_https
        self._effective_ssl_certfile = defaults.ssl_certfile
        self._effective_ssl_keyfile = defaults.ssl_keyfile
        self._update_lan_notice_visibility()

        if needs_relaunch:
            self._prompt_relaunch_for_data_dir(
                "Resetting the Data Directory to default after database initialization "
                "requires relaunching Wherezy.\n\nRelaunch now with the default folder?",
                "Reset settings to defaults; relaunch Wherezy to load the default database.",
            )
            return

        snap = self.server_manager.snapshot()
        endpoint_changed = (
            defaults.host != snap.host
            or defaults.port != snap.port
            or defaults.use_https != snap.use_https
        )
        if snap.status in {"running", "paused", "starting"} and endpoint_changed:
            self._set_feedback("Settings reset to defaults. Restarting server...")
            self.handle_restart()
        else:
            self._sync_endpoint_preview_labels()
            self._on_state_snapshot_on_gui(snap)
            self._set_feedback("Settings reset to defaults.")

    def open_web_ui(self, use_lan: bool = False) -> None:
        """Open Local or LAN Wherezy web URL in the system default browser."""
        snap = self.server_manager.snapshot()
        url = snap.lan_url if use_lan else snap.local_url
        _open_url_in_browser(url)

    def copy_lan_url(self) -> None:
        """Copy the server endpoint URL to the OS clipboard."""
        self._sync_endpoint_preview_labels()
        url = (
            (self.lbl_lan_link.text().strip() if self.lbl_lan_link is not None else "")
            or self._lan_url_preview
            or self.server_manager.snapshot().lan_url
        )
        clipboard = self.app.clipboard()
        if clipboard is not None:
            clipboard.setText(url)
        self._set_feedback(f"Copied URL: {url}")

    def open_data_folder(self) -> None:
        """Open the active Wherezy data folder in Explorer / Finder / file manager."""
        target = self.edit_data_dir.text().strip() or self.config.data_dir
        try:
            _open_folder_in_os(target)
        except Exception as exc:
            self._set_feedback(f"Could not open folder: {exc}")

    def clear_logs(self) -> None:
        """Clear both backend ring-buffer logs and the visible log panel."""
        self.server_manager.clear_logs()
        self.log_text.clear()

    def show_window(self) -> None:
        """Restore and focus the Desktop Controller window."""
        if self._shutting_down:
            return
        _set_macos_activation_policy(show_in_dock=True)
        self.window.showNormal()
        self.window.raise_()
        self.window.activateWindow()

    def hide_to_tray(self) -> None:
        """Minimize/hide the Desktop Controller window to the system tray / menu bar."""
        self.window.hide()
        _set_macos_activation_policy(show_in_dock=False)

    def _handle_window_close_event(self) -> bool:
        """Intercept OS window close: hide to tray if configured, otherwise quit cleanly."""
        if not self._shutting_down and (
            self._tray_icon is not None and self.chk_close_to_tray.isChecked()
        ):
            self.hide_to_tray()
            return True
        self.quit_app()
        return False

    def quit_app(self) -> None:
        """Stop embedded server, tear down IPC and tray icon, and exit Qt event loop."""
        if self._quitting or self._shutting_down:
            return
        self._quitting = True
        self.btn_quit.setEnabled(False)
        self._on_state_snapshot_on_gui(self.server_manager.snapshot())

        try:
            self.server_manager.stop(timeout=5.0)
        except Exception:
            pass

        self._shutting_down = True

        if self._ipc is not None:
            try:
                self._ipc.close()
            except Exception:
                pass
            self._ipc = None

        if self._tray_icon is not None:
            try:
                self._tray_icon.hide()
                self._tray_icon.deleteLater()
            except Exception:
                pass
            self._tray_icon = None

        try:
            self.window.close()
            self.window.deleteLater()
        except Exception:
            pass

        relaunch_cmd = self._relaunch_cmd if self._relaunch_on_exit else None
        if relaunch_cmd:
            try:
                subprocess.Popen(relaunch_cmd)
            except Exception:
                pass

        self.app.quit()

    def run(self) -> int:
        """Show controller (unless started minimized to tray) and run the Qt event loop."""
        if self._start_minimized and self._tray_icon is not None:
            self.hide_to_tray()
        else:
            self.show_window()
        return int(self.app.exec())


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
    """Single-instance launcher entrypoint for Wherezy Desktop Controller."""
    ipc_probe = _SingleInstanceServer(lambda: None)
    if ipc_probe.try_notify_existing("show"):
        return 0

    controller = WherezyDesktopApp(
        initial_host=host,
        initial_port=port,
        initial_data_dir=data_dir,
        initial_https=use_https,
        initial_ssl_certfile=ssl_certfile,
        initial_ssl_keyfile=ssl_keyfile,
        start_minimized=minimized,
        open_browser_override=open_browser,
        enable_tray=True,
        enable_ipc=True,
    )
    return controller.run()


def main(argv: Sequence[str] | None = None) -> int:
    """Direct entrypoint (`wherezy-desktop`) forwarding CLI flags to run_desktop_app."""
    from backend.app.cli import build_parser

    args = build_parser(default_reload=False).parse_args(list(argv) if argv is not None else None)
    return run_desktop_app(
        host=getattr(args, "host", None),
        port=getattr(args, "port", None),
        data_dir=getattr(args, "data_dir", None),
        use_https=getattr(args, "https", None),
        ssl_certfile=getattr(args, "ssl_certfile", None),
        ssl_keyfile=getattr(args, "ssl_keyfile", None),
        minimized=bool(getattr(args, "minimized", False)),
        open_browser=bool(getattr(args, "open_browser", False)),
    )


if __name__ == "__main__":
    raise SystemExit(main())
