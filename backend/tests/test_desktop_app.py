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

        logs = "\n".join(manager.get_logs())
        assert "Server listening" in logs
        assert "Server paused" in logs
        assert "Server resumed" in logs
    finally:
        set_server_paused(False)
        manager.stop(timeout=5.0)


def test_desktop_gui_window_and_tray_smoke(tmp_path, monkeypatch):
    import os
    import tkinter as tk
    import ttkbootstrap as tb
    from backend.app.desktop.app import WherezyDesktopApp

    if sys.platform.startswith("linux") and not (
        os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")
    ):
        pytest.skip("GUI Tk test requires an active display on Linux")

    cfg_path = tmp_path / "gui_desktop.json"
    monkeypatch.setenv("WHEREZY_DESKTOP_CONFIG", str(cfg_path))
    free_port = _pick_free_port()

    try:
        desktop = WherezyDesktopApp(
            initial_host="127.0.0.1",
            initial_port=free_port,
            initial_data_dir=str(app_config.DATA_DIR),
            start_minimized=False,
            open_browser_override=False,
            enable_tray=True,
            enable_ipc=False,
        )
    except tk.TclError as exc:
        pytest.skip(f"Tk display unavailable: {exc}")

    try:
        assert isinstance(desktop.root, tb.Window)
        assert desktop.root.style.theme.name == DEFAULT_DESKTOP_THEME

        # Process initial scheduled startup callback
        for _ in range(15):
            desktop.root.update()
            snap = desktop.server_manager.snapshot()
            if snap.status == "running":
                break
            import time

            time.sleep(0.08)

        snap = desktop.server_manager.snapshot()
        assert snap.status == "running"
        assert desktop.status_pill.cget("style") == "@success.TLabel"
        if desktop._tray_active:
            assert desktop._tray_icon is not None

        # Verify theme switcher updates ttkbootstrap style and persists to disk
        assert desktop.change_theme("bootstrap-light") == "bootstrap-light"
        desktop.root.update()
        assert desktop.root.style.theme.name == "bootstrap-light"
        assert load_desktop_config(cfg_path).theme == "bootstrap-light"

        paused = desktop.handle_pause()
        assert paused.status == "paused"
        for _ in range(10):
            desktop.root.update()
            if "Paused" in desktop.status_pill.cget("text"):
                break
            import time

            time.sleep(0.03)
        assert "Paused" in desktop.status_pill.cget("text")
        assert desktop.status_pill.cget("style") == "@warning.TLabel"

        resumed = desktop.handle_start_or_resume()
        assert resumed.status == "running"
        for _ in range(10):
            desktop.root.update()
            if "Running" in desktop.status_pill.cget("text"):
                break
            import time

            time.sleep(0.03)
        assert "Running" in desktop.status_pill.cget("text")
        assert desktop.status_pill.cget("style") == "@success.TLabel"

        stopped = desktop.handle_stop()
        assert stopped.status == "stopped"
        for _ in range(10):
            desktop.root.update()
            if "Stopped" in desktop.status_pill.cget("text"):
                break
            import time

            time.sleep(0.03)
        assert "Stopped" in desktop.status_pill.cget("text")
        assert desktop.status_pill.cget("style") == "@secondary.TLabel"
    finally:
        desktop.quit_app()
        set_server_paused(False)
