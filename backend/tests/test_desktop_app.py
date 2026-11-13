"""Unit & lifecycle tests for Wherezy desktop controller, tray icons, autostart, and pause gate."""

from __future__ import annotations

import plistlib
import socket
import sys

import httpx
import pytest

from backend.app.cli import _NullStream, main as cli_main, should_launch_gui
from backend.app.core import config as app_config
from backend.app.core.runtime_state import is_server_paused, set_server_paused
from backend.app.desktop.autostart import (
    WINDOWS_RUN_SUBKEY,
    WINDOWS_VALUE_NAME,
    build_linux_desktop_entry,
    build_macos_launch_agent_plist,
    is_autostart_enabled,
    set_autostart_enabled,
)
from backend.app.desktop.config_store import (
    DEFAULT_DESKTOP_THEME,
    DesktopConfig,
    get_desktop_config_path,
    load_desktop_config,
    save_desktop_config,
)
from backend.app.desktop.icons import build_ico_file, create_tray_icon_image, resolve_asset_path
from backend.app.desktop.server_manager import WherezyServerManager


class _FakeRegKey:
    def __init__(self, store: dict[tuple[str, str], str], subkey: str) -> None:
        self._store = store
        self._subkey = subkey

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeWinReg:
    HKEY_CURRENT_USER = object()
    KEY_READ = 1
    KEY_SET_VALUE = 2
    REG_SZ = 1

    def __init__(self) -> None:
        self.values: dict[tuple[str, str], str] = {}

    def OpenKey(self, _root, subkey, _reserved=0, _access=0):
        if not any(k[0] == subkey for k in self.values):
            raise FileNotFoundError(subkey)
        return _FakeRegKey(self.values, subkey)

    def CreateKeyEx(self, _root, subkey, _reserved=0, _access=0):
        return _FakeRegKey(self.values, subkey)

    def QueryValueEx(self, key: _FakeRegKey, name: str):
        pair = (key._subkey, name)
        if pair not in self.values:
            raise FileNotFoundError(name)
        return self.values[pair], self.REG_SZ

    def SetValueEx(self, key: _FakeRegKey, name: str, _reserved: int, _reg_type: int, value: str):
        self.values[(key._subkey, name)] = value

    def DeleteValue(self, key: _FakeRegKey, name: str):
        pair = (key._subkey, name)
        if pair not in self.values:
            raise FileNotFoundError(name)
        del self.values[pair]


def _pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def test_pause_middleware_blocks_and_resumes_requests(client, anon_client):
    try:
        res_ok = client.get("/api/health")
        assert res_ok.status_code == 200

        set_server_paused(True, "Maintenance break")
        assert is_server_paused() is True

        res_api_paused = anon_client.get("/api/health")
        assert res_api_paused.status_code == 503
        assert res_api_paused.headers.get("Retry-After") == "5"
        assert res_api_paused.json()["error"]["code"] == "SERVER_PAUSED"
        assert "Maintenance break" in res_api_paused.json()["error"]["message"]

        res_html_paused = anon_client.get("/")
        assert res_html_paused.status_code == 503
        assert "Wherezy Server Paused" in res_html_paused.text
    finally:
        set_server_paused(False)

    res_resumed = client.get("/api/health")
    assert res_resumed.status_code == 200
    assert is_server_paused() is False


def test_desktop_config_roundtrip_and_bounds(tmp_path, monkeypatch):
    cfg_path = tmp_path / "wherezy_cfg" / "desktop.json"
    monkeypatch.setenv("WHEREZY_DESKTOP_CONFIG", str(cfg_path))
    assert get_desktop_config_path() == cfg_path.resolve()

    default_cfg = load_desktop_config()
    assert default_cfg.port == 8000
    assert default_cfg.minimize_to_tray_on_close is True
    assert default_cfg.theme == DEFAULT_DESKTOP_THEME

    bad_cfg = DesktopConfig(
        host="127.0.0.1",
        port=999999,
        data_dir=str(tmp_path / "inv_data"),
        auto_start_server=False,
        open_browser_on_start=True,
        minimize_to_tray_on_close=False,
        theme="  ",
    )
    save_desktop_config(bad_cfg)
    reloaded = load_desktop_config()
    assert reloaded.host == "127.0.0.1"
    assert reloaded.port == 8000
    assert reloaded.auto_start_server is False
    assert reloaded.open_browser_on_start is True
    assert reloaded.minimize_to_tray_on_close is False
    assert reloaded.theme == DEFAULT_DESKTOP_THEME


def test_autostart_windows_macos_linux(tmp_path):
    fake_reg = _FakeWinReg()
    assert not is_autostart_enabled(platform="win32", winreg_module=fake_reg)
    assert set_autostart_enabled(
        True,
        platform="win32",
        launch_cmd=[r"C:\Program Files\Wherezy\wherezy.exe", "--gui", "--minimized"],
        winreg_module=fake_reg,
    )
    assert is_autostart_enabled(platform="win32", winreg_module=fake_reg)
    reg_val = fake_reg.values[(WINDOWS_RUN_SUBKEY, WINDOWS_VALUE_NAME)]
    assert "--gui" in reg_val and "--minimized" in reg_val
    assert not set_autostart_enabled(False, platform="win32", winreg_module=fake_reg)
    assert not is_autostart_enabled(platform="win32", winreg_module=fake_reg)

    mac_home = tmp_path / "mac_home"
    assert not is_autostart_enabled(platform="darwin", home_dir=mac_home)
    assert set_autostart_enabled(
        True,
        platform="darwin",
        launch_cmd=["/Applications/wherezy", "--gui", "--minimized"],
        home_dir=mac_home,
    )
    assert is_autostart_enabled(platform="darwin", home_dir=mac_home)
    plist_file = mac_home / "Library" / "LaunchAgents" / "com.wherezy.desktop.plist"
    parsed_plist = plistlib.loads(plist_file.read_bytes())
    assert parsed_plist["RunAtLoad"] is True
    assert parsed_plist["ProgramArguments"] == ["/Applications/wherezy", "--gui", "--minimized"]
    assert not set_autostart_enabled(False, platform="darwin", home_dir=mac_home)
    assert not plist_file.exists()

    linux_cfg = tmp_path / "xdg_config"
    assert not is_autostart_enabled(platform="linux", xdg_config_home=str(linux_cfg))
    assert set_autostart_enabled(
        True,
        platform="linux",
        launch_cmd=["/usr/local/bin/wherezy", "--gui", "--minimized"],
        xdg_config_home=str(linux_cfg),
    )
    assert is_autostart_enabled(platform="linux", xdg_config_home=str(linux_cfg))
    desktop_file = linux_cfg / "autostart" / "wherezy.desktop"
    content = desktop_file.read_text(encoding="utf-8")
    assert "Type=Application" in content
    assert "--gui --minimized" in content
    assert not set_autostart_enabled(False, platform="linux", xdg_config_home=str(linux_cfg))
    assert not desktop_file.exists()

    # Helper payload checks
    raw_plist = plistlib.loads(
        build_macos_launch_agent_plist(["/opt/wherezy", "--gui"], working_dir="/opt")
    )
    assert raw_plist["WorkingDirectory"] == "/opt"
    raw_entry = build_linux_desktop_entry(["/opt/wherezy", "--gui"], icon_path="/opt/wherezy.png")
    assert "Icon=/opt/wherezy.png" in raw_entry


def test_tray_icons_and_ico_generation(tmp_path):
    assert resolve_asset_path("apple-touch-icon.png") is not None

    img_running = create_tray_icon_image(status="running", size=64)
    img_paused = create_tray_icon_image(status="paused", size=64)
    img_stopped = create_tray_icon_image(status="stopped", size=64)

    for img in (img_running, img_paused, img_stopped):
        assert img.size == (64, 64)
        assert img.mode == "RGBA"

    # Corner status dots must produce distinct pixel signatures between states
    assert img_running.tobytes() != img_paused.tobytes()
    assert img_paused.tobytes() != img_stopped.tobytes()

    out_ico = build_ico_file(tmp_path / "wherezy.ico")
    assert out_ico.is_file() and out_ico.stat().st_size > 1000


def test_cli_mode_selection_and_stdio_fallback(capsys):
    # Headless & CI flags stay strictly headless CLI
    assert should_launch_gui(["--host", "127.0.0.1", "--port", "9001"], platform="win32", environ={}) is False
    assert should_launch_gui(["--data-dir", "/data"], platform="linux", environ={"DISPLAY": ":0"}) is False
    assert should_launch_gui(["--headless"], platform="win32", environ={}) is False
    assert should_launch_gui(["--cli"], platform="darwin", environ={}) is False
    assert should_launch_gui(["--version"], platform="win32", environ={}) is False
    assert should_launch_gui(["--help"], platform="win32", environ={}) is False

    # Dev run.py (default_reload=True) stays CLI unless --gui is explicit
    assert should_launch_gui([], default_reload=True, platform="win32", environ={}) is False
    assert should_launch_gui(["--gui"], default_reload=True, platform="win32", environ={}) is True

    # Desktop bare launches open GUI + Tray when not in CI / headless Linux
    assert should_launch_gui([], platform="win32", environ={}) is True
    assert should_launch_gui([], platform="darwin", environ={}) is True
    assert should_launch_gui([], platform="linux", environ={"DISPLAY": ":0"}) is True
    assert should_launch_gui([], platform="linux", environ={}) is False
    assert should_launch_gui([], platform="win32", environ={"CI": "true"}) is False
    assert should_launch_gui(["--minimized"], platform="win32", environ={"CI": "true"}) is True

    # Fallback NullStream satisfies uvicorn / logging stream contract
    null_stream = _NullStream()
    assert null_stream.isatty() is False
    assert null_stream.write("abc") == 3
    null_stream.flush()

    with pytest.raises(SystemExit) as exc_info:
        cli_main(["--version"])
    assert exc_info.value.code == 0
    captured = capsys.readouterr()
    assert "wherezy" in captured.out


def test_server_manager_progress_transitions_start_restart_stop():
    manager = WherezyServerManager()
    port = _pick_free_port()
    snapshots = []
    manager.add_state_listener(snapshots.append)
    try:
        started = manager.start(
            host="127.0.0.1",
            port=port,
            data_dir=str(app_config.DATA_DIR),
            wait_timeout=8.0,
        )
        assert started.status == "running"
        assert started.progress == 100
        assert started.operation is None
        start_steps = [
            s.progress for s in snapshots if s.status == "starting"
        ]
        assert any(0 < p < 100 for p in start_steps), f"Expected intermediate start progress, got {start_steps}"
        assert start_steps == sorted(start_steps)

        paused = manager.pause()
        assert paused.status == "paused"
        assert paused.progress == 50

        snapshots.clear()
        restarted = manager.restart(
            host="127.0.0.1",
            port=port,
            data_dir=str(app_config.DATA_DIR),
            wait_timeout=8.0,
        )
        assert restarted.status == "running"
        assert restarted.progress == 100
        assert restarted.operation is None
        assert any(
            s.status == "stopping" and s.operation == "restarting" and 0 < s.progress < 100
            for s in snapshots
        ), f"Expected stopping phase during restart, got {snapshots}"
        assert any(
            s.status == "starting" and s.operation == "restarting" and 0 < s.progress < 100
            for s in snapshots
        ), f"Expected starting phase during restart, got {snapshots}"

        snapshots.clear()
        stopped = manager.stop(timeout=5.0)
        assert stopped.status == "stopped"
        assert stopped.progress == 0
        assert stopped.operation is None
        stop_steps = [s.progress for s in snapshots if s.status == "stopping"]
        assert any(0 < p < 100 for p in stop_steps), f"Expected intermediate stop progress, got {stop_steps}"
        assert stop_steps == sorted(stop_steps, reverse=True)
    finally:
        manager.stop(timeout=5.0)


def test_desktop_gui_progress_bar_start_restart_stop(tmp_path, monkeypatch):
    import os
    from backend.app.desktop.app import WherezyDesktopApp
    from backend.app.desktop.config_store import DesktopConfig, save_desktop_config

    if not os.environ.get("QT_QPA_PLATFORM"):
        monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")

    cfg_path = tmp_path / "desktop-config.json"
    monkeypatch.setenv("WHEREZY_DESKTOP_CONFIG", str(cfg_path))
    port = _pick_free_port()
    save_desktop_config(
        DesktopConfig(
            host="127.0.0.1",
            port=port,
            data_dir=str(app_config.DATA_DIR),
            open_browser_on_start=False,
            auto_start_server=False,
            lan_notice_shown=True,
        )
    )

    desktop = WherezyDesktopApp(
        initial_host="127.0.0.1",
        initial_port=port,
        initial_data_dir=str(app_config.DATA_DIR),
        initial_https=False,
        enable_tray=False,
        enable_ipc=False,
    )
    assert desktop.server_manager.snapshot().status == "stopped"
    assert desktop.progress_bar.value() == 0
    observed: list[tuple[str, str | None, str, int, int, int]] = []
    desktop._bridge.state_changed.connect(
        lambda snap: observed.append(
            (
                snap.status,
                snap.operation,
                desktop.status_pill.text(),
                desktop.progress_bar.value(),
                desktop.progress_bar.minimum(),
                desktop.progress_bar.maximum(),
            )
        )
    )
    try:
        started = desktop.handle_start_or_resume()
        assert started.status == "running"
        assert desktop.progress_bar.minimum() == 0
        assert desktop.progress_bar.maximum() == 100
        assert desktop.progress_bar.value() == 100
        assert any(
            st == "starting" and min_v == 0 and max_v == 100 and 0 < val < 100
            for st, _op, _lbl, val, min_v, max_v in observed
        ), f"Expected live determinate starting progress on GUI bar, got {observed}"

        paused = desktop.handle_pause()
        assert paused.status == "paused"
        assert desktop.progress_bar.value() == 50

        observed.clear()
        restarted = desktop.handle_restart()
        assert restarted.status == "running"
        assert desktop.progress_bar.value() == 100
        assert any(
            st == "stopping" and op == "restarting" and lbl == "Restarting..." and 0 < val < 100
            for st, op, lbl, val, _min_v, _max_v in observed
        ), f"Expected Restarting stopping progress, got {observed}"
        assert any(
            st == "starting" and op == "restarting" and lbl == "Restarting..." and 0 < val < 100
            for st, op, lbl, val, _min_v, _max_v in observed
        ), f"Expected Restarting starting progress, got {observed}"

        observed.clear()
        stopped = desktop.handle_stop()
        assert stopped.status == "stopped"
        assert desktop.progress_bar.value() == 0
        assert any(
            st == "stopping" and lbl == "Stopping..." and 0 < val < 100
            for st, _op, lbl, val, _min_v, _max_v in observed
        ), f"Expected Stopping progress on GUI bar, got {observed}"

        started_again = desktop.handle_start_or_resume()
        assert started_again.status == "running"
        observed.clear()
        desktop.quit_app()
        assert desktop.server_manager.snapshot().status == "stopped"
        assert any(
            st == "stopping" and 0 < val < 100
            for st, _op, _lbl, val, _min_v, _max_v in observed
        ), f"Expected Stopping progress during quit_app, got {observed}"
        assert desktop.progress_bar.value() == 0
    finally:
        desktop.server_manager.stop(timeout=5.0)
        desktop.window.close()


def test_server_manager_start_pause_resume_stop_lifecycle():
    manager = WherezyServerManager()
    port = _pick_free_port()
    try:
        snap = manager.start(
            host="127.0.0.1",
            port=port,
            data_dir=str(app_config.DATA_DIR),
            wait_timeout=8.0,
        )
        assert snap.status == "running", f"Expected running, got {snap}"

        r1 = httpx.get(f"{snap.local_url}/api/health", timeout=3.0)
        assert r1.status_code == 200

        snap_paused = manager.pause()
        assert snap_paused.status == "paused"
        r2 = httpx.get(f"{snap.local_url}/api/health", timeout=3.0)
        assert r2.status_code == 503
        assert r2.json()["error"]["code"] == "SERVER_PAUSED"

        snap_resumed = manager.resume()
        assert snap_resumed.status == "running"
        r3 = httpx.get(f"{snap.local_url}/api/health", timeout=3.0)
        assert r3.status_code == 200

        snap_stopped = manager.stop(timeout=5.0)
        assert snap_stopped.status == "stopped"
        with pytest.raises(httpx.HTTPError):
            httpx.get(f"{snap.local_url}/api/health", timeout=1.0)

        log_lines = manager.get_logs()
        logs = "\n".join(log_lines)
        assert "Server listening" in logs
        assert "Server paused" in logs
        assert "Server resumed" in logs
        assert sum(1 for line in log_lines if "Application startup complete." in line) == 1
        assert sum(1 for line in log_lines if "Waiting for application shutdown." in line) == 1

        # Verify child uvicorn loggers do not duplicate records across parent/child handlers
        manager.clear_logs()
        import logging

        logging.getLogger("uvicorn.error").info("unique-uvicorn-error-probe")
        logging.getLogger("uvicorn.access").info("unique-uvicorn-access-probe")
        probe_logs = manager.get_logs()
        assert sum(1 for line in probe_logs if "unique-uvicorn-error-probe" in line) == 1
        assert sum(1 for line in probe_logs if "unique-uvicorn-access-probe" in line) == 1
    finally:
        set_server_paused(False)
        manager.stop(timeout=5.0)


def test_main_window_ui_loads_cleanly_in_qt(monkeypatch):
    import os
    from PyQt6 import QtWidgets, uic
    from backend.app.core.config import resource_path

    if sys.platform.startswith("linux") and not (
        os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")
    ):
        monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")

    ui_file = resource_path("backend/app/desktop/ui/main_window.ui")
    assert ui_file.is_file()

    qt_app = QtWidgets.QApplication.instance() or QtWidgets.QApplication(["wherezy-test"])
    window = QtWidgets.QMainWindow()
    uic.loadUi(str(ui_file), window)

    assert isinstance(window.label_5, QtWidgets.QLabel)
    assert isinstance(window.label_6, QtWidgets.QLabel)
    assert isinstance(window.pushButton, QtWidgets.QPushButton)
    assert isinstance(window.pushButton_2, QtWidgets.QPushButton)
    assert isinstance(window.pushButton_3, QtWidgets.QPushButton)
    assert isinstance(window.pushButton_4, QtWidgets.QPushButton)
    assert isinstance(window.pushButton_5, QtWidgets.QPushButton)
    assert isinstance(window.pushButton_6, QtWidgets.QPushButton)
    assert isinstance(window.pushButton_7, QtWidgets.QPushButton)
    assert isinstance(window.pushButton_8, QtWidgets.QPushButton)
    assert isinstance(window.pushButton_9, QtWidgets.QPushButton)
    assert isinstance(window.pushButton_10, QtWidgets.QPushButton)
    assert isinstance(window.pushButton_11, QtWidgets.QPushButton)
    assert isinstance(window.pushButton_12, QtWidgets.QPushButton)
    assert isinstance(window.pushButton_13, QtWidgets.QPushButton)
    assert isinstance(window.checkBox, QtWidgets.QCheckBox)
    assert isinstance(window.checkBox_2, QtWidgets.QCheckBox)
    assert isinstance(window.checkBox_3, QtWidgets.QCheckBox)
    assert isinstance(window.checkBox_4, QtWidgets.QCheckBox)
    assert isinstance(window.checkBox_5, QtWidgets.QCheckBox)
    assert isinstance(window.lineEdit, QtWidgets.QLineEdit)
    assert isinstance(window.lineEdit_2, QtWidgets.QLineEdit)
    assert isinstance(window.plainTextEdit, QtWidgets.QPlainTextEdit)
    assert isinstance(window.progressBar, QtWidgets.QProgressBar)
    window.close()
    window.deleteLater()
    qt_app.processEvents()


def test_desktop_gui_window_and_tray_smoke(tmp_path, monkeypatch):
    import os
    import time
    from PyQt6 import QtWidgets
    from backend.app.desktop.app import WherezyDesktopApp

    if sys.platform.startswith("linux") and not (
        os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")
    ):
        monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")

    cfg_path = tmp_path / "gui_desktop.json"
    monkeypatch.setenv("WHEREZY_DESKTOP_CONFIG", str(cfg_path))
    free_port = _pick_free_port()

    desktop = WherezyDesktopApp(
        initial_host="127.0.0.1",
        initial_port=free_port,
        initial_data_dir=str(app_config.DATA_DIR),
        start_minimized=False,
        open_browser_override=False,
        enable_tray=True,
        enable_ipc=False,
    )

    try:
        assert isinstance(desktop.window, QtWidgets.QWidget)

        for _ in range(15):
            desktop.app.processEvents()
            snap = desktop.server_manager.snapshot()
            if snap.status == "running":
                break
            time.sleep(0.08)

        snap = desktop.server_manager.snapshot()
        assert snap.status == "running"
        assert "Running" in desktop.status_pill.text()
        assert desktop.status_pill.property("status") == "running"
        if desktop._tray_active:
            assert desktop._tray_icon is not None

        paused = desktop.handle_pause()
        assert paused.status == "paused"
        for _ in range(10):
            desktop.app.processEvents()
            if "Paused" in desktop.status_pill.text():
                break
            time.sleep(0.03)
        assert "Paused" in desktop.status_pill.text()
        assert desktop.status_pill.property("status") == "paused"

        resumed = desktop.handle_start_or_resume()
        assert resumed.status == "running"
        for _ in range(10):
            desktop.app.processEvents()
            if "Running" in desktop.status_pill.text():
                break
            time.sleep(0.03)
        assert "Running" in desktop.status_pill.text()
        assert desktop.status_pill.property("status") == "running"

        stopped = desktop.handle_stop()
        assert stopped.status == "stopped"
        for _ in range(10):
            desktop.app.processEvents()
            if "Stopped" in desktop.status_pill.text():
                break
            time.sleep(0.03)
        assert "Stopped" in desktop.status_pill.text()
        assert desktop.status_pill.property("status") == "stopped"
    finally:
        desktop.quit_app()
        desktop.app.processEvents()
        set_server_paused(False)


def test_single_instance_ipc_quit_and_cli_flags(tmp_path, monkeypatch):
    import threading
    from pathlib import Path
    from backend.app.desktop.app import _SingleInstanceServer, request_running_instance_quit

    local_app = tmp_path / "LocalApp"
    monkeypatch.setenv("LOCALAPPDATA", str(local_app))
    monkeypatch.setattr(sys, "platform", "win32")

    assert should_launch_gui(["--quit"], platform="win32", environ={}) is False
    assert should_launch_gui(["--enable-autostart"], platform="win32", environ={}) is False
    assert should_launch_gui(["--disable-autostart"], platform="win32", environ={}) is False

    # When no instance is running, --quit exits cleanly with 0
    assert cli_main(["--quit"]) == 0

    show_event = threading.Event()
    quit_event = threading.Event()
    srv = _SingleInstanceServer(
        on_show_requested=show_event.set,
        on_quit_requested=quit_event.set,
    )
    srv.start()
    try:
        assert srv.try_notify_existing("show") is True
        assert show_event.wait(timeout=1.5)

        def _cleanup_on_quit():
            assert quit_event.wait(timeout=2.0)
            srv.close()

        cleaner = threading.Thread(target=_cleanup_on_quit, daemon=True)
        cleaner.start()
        assert request_running_instance_quit(timeout=3.0) is True
        cleaner.join(timeout=2.0)
        assert not (local_app / "Wherezy" / "desktop-instance.json").exists()
    finally:
        srv.close()

    # Legacy APPDATA desktop.json custom data_dir is honored without moving files silently
    legacy_app = tmp_path / "RoamingApp"
    monkeypatch.setenv("APPDATA", str(legacy_app))
    custom_dir = tmp_path / "Custom Dev Data 用户"
    legacy_cfg_dir = legacy_app / "Wherezy"
    legacy_cfg_dir.mkdir(parents=True, exist_ok=True)
    (legacy_cfg_dir / "desktop.json").write_text(
        f'{{"host": "0.0.0.0", "port": 8123, "data_dir": {custom_dir.as_posix()!r}}}'.replace("'", '"'),
        encoding="utf-8",
    )
    monkeypatch.delenv("WHEREZY_DESKTOP_CONFIG", raising=False)
    loaded = load_desktop_config()
    assert loaded.host == "0.0.0.0"
    assert loaded.port == 8123
    assert Path(loaded.data_dir) == custom_dir

    # --enable-autostart / --disable-autostart CLI flags delegate cleanly to autostart.py
    called: list[bool] = []
    monkeypatch.setattr("backend.app.desktop.autostart.set_autostart_enabled", lambda flag: called.append(flag) or flag)
    assert cli_main(["--enable-autostart"]) == 0
    assert cli_main(["--disable-autostart"]) == 0
    assert called == [True, False]


def test_port_in_use_recovery_and_lan_notice(tmp_path, monkeypatch):
    import os
    import time
    from backend.app.desktop.app import WherezyDesktopApp

    if sys.platform.startswith("linux") and not (
        os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")
    ):
        monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")

    cfg_path = tmp_path / "gui_port_test.json"
    monkeypatch.setenv("WHEREZY_DESKTOP_CONFIG", str(cfg_path))
    save_desktop_config(
        DesktopConfig(
            host="127.0.0.1",
            port=_pick_free_port(),
            data_dir=str(app_config.DATA_DIR),
            auto_start_server=False,
            lan_notice_shown=False,
        )
    )

    # Occupy a port before trying to start the controller on it
    occupied = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    occupied.bind(("127.0.0.1", 0))
    occupied.listen(1)
    busy_port = int(occupied.getsockname()[1])

    desktop = None
    try:
        save_desktop_config(
            DesktopConfig(
                host="127.0.0.1",
                port=busy_port,
                data_dir=str(app_config.DATA_DIR),
                auto_start_server=False,
                lan_notice_shown=False,
            )
        )
        desktop = WherezyDesktopApp(
            enable_tray=False,
            enable_ipc=False,
        )

        # First-run LAN notice helper persists config cleanly even when banner isn't in layout
        desktop._resolve_lan_notice(enable_lan=False)
        assert load_desktop_config(cfg_path).lan_notice_shown is True
        assert load_desktop_config(cfg_path).host == "127.0.0.1"

        # Starting on occupied port reports port_in_use cleanly in status & logs
        failed = desktop.handle_start_or_resume()
        assert failed.status == "error"
        assert failed.port_in_use is True
        for _ in range(10):
            desktop.app.processEvents()
            if f"Port {busy_port} busy" in desktop.lbl_server_status.text():
                break
            time.sleep(0.02)
        assert f"Port {busy_port} busy" in desktop.lbl_server_status.text()
        assert desktop.progress_bar.value() == 0

        # One-click recovery helper finds a free port and starts server cleanly
        recovered = desktop.pick_free_port_and_start()
        assert recovered.status == "running"
        assert recovered.port != busy_port
        assert desktop.edit_port.text() == str(recovered.port)
        assert desktop.lbl_server_status.text() == recovered.local_url
        assert desktop.progress_bar.value() == 100
        assert load_desktop_config(cfg_path).port == recovered.port
    finally:
        if desktop is not None:
            desktop.quit_app()
            desktop.app.processEvents()
        occupied.close()
        set_server_paused(False)


def test_desktop_settings_copy_and_logs(tmp_path, monkeypatch):
    import os
    from backend.app.desktop.app import WherezyDesktopApp

    if sys.platform.startswith("linux") and not (
        os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")
    ):
        monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")

    cfg_path = tmp_path / "gui_settings_test.json"
    monkeypatch.setenv("WHEREZY_DESKTOP_CONFIG", str(cfg_path))
    port1 = _pick_free_port()
    port2 = _pick_free_port()
    while port2 == port1:
        port2 = _pick_free_port()

    save_desktop_config(
        DesktopConfig(
            host="127.0.0.1",
            port=port1,
            data_dir=str(app_config.DATA_DIR),
            auto_start_server=False,
            lan_notice_shown=True,
        )
    )

    desktop = WherezyDesktopApp(enable_tray=False, enable_ipc=False)
    try:
        # Copy URL updates clipboard, feedback, and terminal output
        desktop.copy_lan_url()
        assert f":{port1}" in desktop._last_feedback
        assert f":{port1}" in desktop.log_text.toPlainText()
        cb = desktop.app.clipboard()
        if cb is not None:
            assert f":{port1}" in cb.text()

        # Start server, verify logs populate and clear cleanly, then apply new port via form
        snap = desktop.handle_start_or_resume()
        assert snap.status == "running"
        desktop.app.processEvents()
        assert desktop.log_text.isReadOnly() is True
        assert desktop.btn_copy_logs is not None
        assert desktop.log_text.toPlainText().strip() != ""

        # Test copying console logs to clipboard
        desktop.copy_logs()
        if cb is not None:
            assert desktop.log_text.toPlainText() in cb.text()
        assert "copied to clipboard" in desktop._last_feedback.lower()

        desktop.clear_logs()
        assert desktop.log_text.toPlainText() == ""

        desktop.edit_port.setText(str(port2))
        desktop.chk_open_browser.setChecked(True)
        desktop.apply_settings_and_restart()
        desktop.app.processEvents()
        reloaded = load_desktop_config(cfg_path)
        assert reloaded.port == port2
        assert reloaded.open_browser_on_start is True
        assert desktop.server_manager.snapshot().port == port2

        # Stop before reset to avoid binding port 8000 if busy, and verify Reset to Default restores config
        desktop.handle_stop()
        monkeypatch.setattr("backend.app.desktop.app.set_autostart_enabled", lambda flag: bool(flag))
        desktop.reset_settings_to_default()
        desktop.app.processEvents()
        reset_cfg = load_desktop_config(cfg_path)
        assert reset_cfg.port == 8000
        assert reset_cfg.open_browser_on_start is False
        assert desktop.edit_port.text() == "8000"
        assert desktop.chk_open_browser.isChecked() is False
    finally:
        desktop.quit_app()
        desktop.app.processEvents()
        set_server_paused(False)


def test_clean_subprocess_env_strips_frozen_bundle_paths(tmp_path, monkeypatch):
    import os
    from backend.app.desktop.app import _clean_subprocess_env

    app_dir = tmp_path / "Wherezy"
    internal_dir = app_dir / "_internal"
    system_dir = tmp_path / "System32"
    internal_dir.mkdir(parents=True)
    system_dir.mkdir(parents=True)

    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(internal_dir), raising=False)
    monkeypatch.setattr(sys, "executable", str(app_dir / "Wherezy.exe"))
    monkeypatch.setenv("PATH", f"{internal_dir}{os.pathsep}{app_dir}{os.pathsep}{system_dir}")
    monkeypatch.setenv("_MEIPASS2", str(internal_dir))
    monkeypatch.setenv("_PYI_SPLASH_IPC", "123")

    cleaned = _clean_subprocess_env()
    path_parts = cleaned["PATH"].split(os.pathsep)
    assert str(system_dir) in path_parts
    assert str(internal_dir) not in path_parts
    assert str(app_dir) not in path_parts
    assert "_MEIPASS2" not in cleaned
    assert "_PYI_SPLASH_IPC" not in cleaned

