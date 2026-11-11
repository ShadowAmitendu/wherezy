"""Cross-platform Start-with-OS integration for Windows, macOS, and Linux."""

from __future__ import annotations

import os
from pathlib import Path
import plistlib
import shlex
import subprocess
import sys

from backend.app.desktop.config_store import resolve_launch_command

WINDOWS_RUN_SUBKEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
WINDOWS_VALUE_NAME = "Wherezy"
MACOS_AGENT_LABEL = "com.wherezy.desktop"
LINUX_DESKTOP_FILENAME = "wherezy.desktop"


def build_windows_run_command(launch_cmd: list[str]) -> str:
    """Format a Windows Run-key command line string with proper quoting."""
    return subprocess.list2cmdline(launch_cmd)


def build_macos_launch_agent_plist(
    launch_cmd: list[str],
    *,
    working_dir: str | None = None,
    label: str = MACOS_AGENT_LABEL,
) -> bytes:
    """Generate an Apple LaunchAgent plist XML payload with RunAtLoad=True."""
    payload: dict[str, object] = {
        "Label": label,
        "ProgramArguments": launch_cmd,
        "RunAtLoad": True,
        "KeepAlive": False,
        "ProcessType": "Interactive",
    }
    if working_dir:
        payload["WorkingDirectory"] = working_dir
    return plistlib.dumps(payload, fmt=plistlib.FMT_XML, sort_keys=False)


def build_linux_desktop_entry(
    launch_cmd: list[str],
    *,
    icon_path: str | None = None,
) -> str:
    """Generate an XDG autostart .desktop file."""
    exec_line = shlex.join(launch_cmd)
    lines = [
        "[Desktop Entry]",
        "Type=Application",
        "Version=1.0",
        "Name=Wherezy",
        "Comment=Wherezy Home Inventory Server Controller",
        f"Exec={exec_line}",
        "Terminal=false",
        "Hidden=false",
        "X-GNOME-Autostart-enabled=true",
    ]
    if icon_path:
        lines.append(f"Icon={icon_path}")
    return "\n".join(lines) + "\n"


def get_macos_launch_agent_path(home_dir: Path | None = None) -> Path:
    base = home_dir or Path.home()
    return base / "Library" / "LaunchAgents" / f"{MACOS_AGENT_LABEL}.plist"


def get_linux_autostart_path(home_dir: Path | None = None, xdg_config_home: str | None = None) -> Path:
    if xdg_config_home:
        config_root = Path(xdg_config_home).expanduser()
    else:
        env_xdg = os.getenv("XDG_CONFIG_HOME")
        config_root = Path(env_xdg).expanduser() if env_xdg else (home_dir or Path.home()) / ".config"
    return config_root / "autostart" / LINUX_DESKTOP_FILENAME


def _default_winreg_module():
    import winreg  # type: ignore[import-not-found]

    return winreg


def is_autostart_enabled(
    *,
    platform: str | None = None,
    winreg_module=None,
    home_dir: Path | None = None,
    xdg_config_home: str | None = None,
) -> bool:
    """Return True if Wherezy is configured to launch automatically on OS login."""
    plat = platform or sys.platform

    if plat == "win32":
        reg = winreg_module or _default_winreg_module()
        try:
            with reg.OpenKey(reg.HKEY_CURRENT_USER, WINDOWS_RUN_SUBKEY, 0, reg.KEY_READ) as key:
                value, _ = reg.QueryValueEx(key, WINDOWS_VALUE_NAME)
                return bool(str(value).strip())
        except OSError:
            return False

    if plat == "darwin":
        return get_macos_launch_agent_path(home_dir).exists()

    return get_linux_autostart_path(home_dir, xdg_config_home).exists()


def set_autostart_enabled(
    enabled: bool,
    *,
    platform: str | None = None,
    launch_cmd: list[str] | None = None,
    winreg_module=None,
    home_dir: Path | None = None,
    xdg_config_home: str | None = None,
    icon_path: str | None = None,
) -> bool:
    """Enable or disable automatic startup on login for the current user."""
    plat = platform or sys.platform
    cmd = launch_cmd or resolve_launch_command(minimized=True, platform=plat)

    if plat == "win32":
        reg = winreg_module or _default_winreg_module()
        if enabled:
            command_str = build_windows_run_command(cmd)
            with reg.CreateKeyEx(
                reg.HKEY_CURRENT_USER,
                WINDOWS_RUN_SUBKEY,
                0,
                reg.KEY_SET_VALUE,
            ) as key:
                reg.SetValueEx(key, WINDOWS_VALUE_NAME, 0, reg.REG_SZ, command_str)
            return True

        try:
            with reg.OpenKey(
                reg.HKEY_CURRENT_USER,
                WINDOWS_RUN_SUBKEY,
                0,
                reg.KEY_SET_VALUE,
            ) as key:
                reg.DeleteValue(key, WINDOWS_VALUE_NAME)
        except OSError:
            pass
        return False

    if plat == "darwin":
        plist_path = get_macos_launch_agent_path(home_dir)
        if enabled:
            plist_path.parent.mkdir(parents=True, exist_ok=True)
            working_dir = str(Path(cmd[0]).parent) if cmd else None
            plist_path.write_bytes(build_macos_launch_agent_plist(cmd, working_dir=working_dir))
            return True
        if plist_path.exists():
            plist_path.unlink()
        return False

    desktop_path = get_linux_autostart_path(home_dir, xdg_config_home)
    if enabled:
        desktop_path.parent.mkdir(parents=True, exist_ok=True)
        desktop_path.write_text(
            build_linux_desktop_entry(cmd, icon_path=icon_path),
            encoding="utf-8",
        )
        return True
    if desktop_path.exists():
        desktop_path.unlink()
    return False
