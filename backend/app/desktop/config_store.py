"""Persistent desktop controller settings and cross-platform launch path helpers."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
import sys


APP_DIR_NAME = "Wherezy"
DEFAULT_DESKTOP_THEME = "bootstrap-dark"


def is_frozen() -> bool:
    """Return True when running inside a PyInstaller bundle."""
    return bool(getattr(sys, "frozen", False))


def get_app_support_dir(platform: str | None = None) -> Path:
    """Return the per-user OS application support/config directory for Wherezy."""
    plat = platform or sys.platform
    if plat == "win32":
        appdata = os.getenv("APPDATA") or os.getenv("LOCALAPPDATA")
        base = Path(appdata) if appdata else Path.home() / "AppData" / "Roaming"
        return base / APP_DIR_NAME
    if plat == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_DIR_NAME
    xdg_config = os.getenv("XDG_CONFIG_HOME")
    base = Path(xdg_config) if xdg_config else Path.home() / ".config"
    return base / "wherezy"


def get_desktop_config_path() -> Path:
    """Resolve the desktop JSON config path, honoring WHEREZY_DESKTOP_CONFIG."""
    override = os.getenv("WHEREZY_DESKTOP_CONFIG")
    if override:
        return Path(override).expanduser().resolve()
    return get_app_support_dir() / "desktop.json"


def get_default_desktop_data_dir(platform: str | None = None) -> Path:
    """Return a safe, persistent default data folder for desktop GUI sessions."""
    env_data = os.getenv("WHEREZY_DATA_DIR") or os.getenv("DATA_DIR")
    if env_data:
        return Path(env_data).expanduser().resolve()

    if is_frozen():
        portable_data = Path(sys.executable).resolve().parent / "data"
        if portable_data.exists():
            return portable_data
    else:
        repo_root = Path(__file__).resolve().parents[3]
        repo_data = repo_root / "data"
        if (repo_root / "pyproject.toml").exists() and repo_data.exists():
            return repo_data

    plat = platform or sys.platform
    if plat in {"win32", "darwin"}:
        return get_app_support_dir(plat) / "data"
    xdg_data = os.getenv("XDG_DATA_HOME")
    base = Path(xdg_data) if xdg_data else Path.home() / ".local" / "share"
    return base / "wherezy" / "data"


@dataclass
class DesktopConfig:
    """Persisted desktop controller settings."""

    host: str = "0.0.0.0"
    port: int = 8000
    data_dir: str = ""
    auto_start_server: bool = True
    open_browser_on_start: bool = False
    minimize_to_tray_on_close: bool = True
    theme: str = DEFAULT_DESKTOP_THEME

    def normalized(self) -> "DesktopConfig":
        """Validate and normalize field bounds before save or launch."""
        host = (self.host or "0.0.0.0").strip() or "0.0.0.0"
        try:
            port = int(self.port)
        except (TypeError, ValueError):
            port = 8000
        if not (1 <= port <= 65535):
            port = 8000
        data_dir = (self.data_dir or "").strip() or str(get_default_desktop_data_dir())
        theme = (self.theme or "").strip() or DEFAULT_DESKTOP_THEME
        return DesktopConfig(
            host=host,
            port=port,
            data_dir=str(Path(data_dir).expanduser()),
            auto_start_server=bool(self.auto_start_server),
            open_browser_on_start=bool(self.open_browser_on_start),
            minimize_to_tray_on_close=bool(self.minimize_to_tray_on_close),
            theme=theme,
        )


def load_desktop_config(path: Path | None = None) -> DesktopConfig:
    """Load desktop settings from disk, falling back to safe defaults."""
    target = path or get_desktop_config_path()
    defaults = DesktopConfig(data_dir=str(get_default_desktop_data_dir())).normalized()
    if not target.exists():
        return defaults

    try:
        raw = json.loads(target.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return defaults
    except (OSError, ValueError):
        return defaults

    return DesktopConfig(
        host=str(raw.get("host", defaults.host)),
        port=raw.get("port", defaults.port),
        data_dir=str(raw.get("data_dir") or defaults.data_dir),
        auto_start_server=raw.get("auto_start_server", defaults.auto_start_server),
        open_browser_on_start=raw.get("open_browser_on_start", defaults.open_browser_on_start),
        minimize_to_tray_on_close=raw.get(
            "minimize_to_tray_on_close", defaults.minimize_to_tray_on_close
        ),
        theme=str(raw.get("theme") or defaults.theme),
    ).normalized()


def save_desktop_config(config: DesktopConfig, path: Path | None = None) -> Path:
    """Persist desktop configuration atomically to disk."""
    target = path or get_desktop_config_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    normalized = config.normalized()
    target.write_text(json.dumps(asdict(normalized), indent=2), encoding="utf-8")
    return target


def resolve_launch_command(
    *,
    minimized: bool = False,
    data_dir: str | None = None,
    host: str | None = None,
    port: int | None = None,
    platform: str | None = None,
) -> list[str]:
    """Build the executable command list used by OS autostart or relaunch."""
    plat = platform or sys.platform
    flags = ["--gui"]
    if minimized:
        flags.append("--minimized")
    if host:
        flags.extend(["--host", str(host)])
    if port is not None:
        flags.extend(["--port", str(port)])
    if data_dir:
        flags.extend(["--data-dir", str(data_dir)])

    if is_frozen():
        return [str(Path(sys.executable).resolve()), *flags]

    exe_path = Path(sys.executable).resolve()
    if plat == "win32" and exe_path.name.lower() == "python.exe":
        pythonw = exe_path.with_name("pythonw.exe")
        if pythonw.exists():
            exe_path = pythonw
    return [str(exe_path), "-m", "backend.app.cli", *flags]
