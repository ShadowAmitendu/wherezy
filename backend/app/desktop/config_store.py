"""Persistent desktop controller settings and cross-platform launch path helpers."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
import sys

from backend.app.core.config import get_user_data_base_dir, is_frozen

APP_DIR_NAME = "Wherezy"
DEFAULT_DESKTOP_THEME = "bootstrap-dark"


def get_app_support_dir(platform: str | None = None) -> Path:
    """Return the per-user OS application support/config directory for Wherezy."""
    plat = platform or sys.platform
    if plat == "win32":
        local_appdata = os.getenv("LOCALAPPDATA")
        base = Path(local_appdata).expanduser() if local_appdata else Path.home() / "AppData" / "Local"
        return base / APP_DIR_NAME
    if plat == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_DIR_NAME
    xdg_config = os.getenv("XDG_CONFIG_HOME")
    base = Path(xdg_config).expanduser() if xdg_config else Path.home() / ".config"
    return base / "wherezy"


def get_legacy_windows_support_dir() -> Path | None:
    """Return legacy %APPDATA%\\Wherezy path on Windows if distinct from %LOCALAPPDATA%."""
    if sys.platform != "win32":
        return None
    appdata = os.getenv("APPDATA")
    if not appdata:
        return None
    legacy = Path(appdata).expanduser() / APP_DIR_NAME
    try:
        if legacy.resolve() == get_app_support_dir("win32").resolve():
            return None
    except OSError:
        if str(legacy) == str(get_app_support_dir("win32")):
            return None
    return legacy


def get_desktop_config_path() -> Path:
    """Resolve the desktop JSON config path, honoring WHEREZY_DESKTOP_CONFIG."""
    override = os.getenv("WHEREZY_DESKTOP_CONFIG")
    if override:
        return Path(override).expanduser().resolve()
    return get_app_support_dir() / "desktop.json"


def get_default_desktop_data_dir(platform: str | None = None) -> Path:
    """Return a safe, persistent per-user default data folder for desktop GUI sessions."""
    env_data = os.getenv("WHEREZY_DATA_DIR") or os.getenv("DATA_DIR")
    if env_data:
        return Path(env_data).expanduser().resolve()

    if not is_frozen():
        repo_root = Path(__file__).resolve().parents[3]
        repo_data = repo_root / "data"
        if (repo_root / "pyproject.toml").exists() and repo_data.exists():
            return repo_data

    return get_user_data_base_dir(platform) / "data"


@dataclass
class DesktopConfig:
    """Persisted desktop controller settings."""

    host: str = "127.0.0.1"
    port: int = 8000
    data_dir: str = ""
    auto_start_server: bool = True
    open_browser_on_start: bool = False
    minimize_to_tray_on_close: bool = True
    theme: str = DEFAULT_DESKTOP_THEME
    lan_notice_shown: bool = False
    use_https: bool = False
    ssl_certfile: str = ""
    ssl_keyfile: str = ""

    def normalized(self) -> "DesktopConfig":
        """Validate and normalize field bounds before save or launch."""
        host = (self.host or "127.0.0.1").strip() or "127.0.0.1"
        try:
            port = int(self.port)
        except (TypeError, ValueError):
            port = 8000
        if not (1 <= port <= 65535):
            port = 8000
        data_dir = (self.data_dir or "").strip() or str(get_default_desktop_data_dir())
        theme = (self.theme or "").strip() or DEFAULT_DESKTOP_THEME
        ssl_certfile = (self.ssl_certfile or "").strip()
        ssl_keyfile = (self.ssl_keyfile or "").strip()
        return DesktopConfig(
            host=host,
            port=port,
            data_dir=str(Path(data_dir).expanduser()),
            auto_start_server=bool(self.auto_start_server),
            open_browser_on_start=bool(self.open_browser_on_start),
            minimize_to_tray_on_close=bool(self.minimize_to_tray_on_close),
            theme=theme,
            lan_notice_shown=bool(self.lan_notice_shown),
            use_https=bool(self.use_https),
            ssl_certfile=str(Path(ssl_certfile).expanduser()) if ssl_certfile else "",
            ssl_keyfile=str(Path(ssl_keyfile).expanduser()) if ssl_keyfile else "",
        )


def load_desktop_config(path: Path | None = None) -> DesktopConfig:
    """Load desktop settings from disk, falling back to safe defaults."""
    target = path or get_desktop_config_path()
    source = target
    if not source.exists() and path is None and not os.getenv("WHEREZY_DESKTOP_CONFIG"):
        legacy_dir = get_legacy_windows_support_dir()
        if legacy_dir is not None and (legacy_dir / "desktop.json").is_file():
            source = legacy_dir / "desktop.json"

    defaults = DesktopConfig(data_dir=str(get_default_desktop_data_dir())).normalized()
    if not source.exists():
        return defaults

    try:
        raw = json.loads(source.read_text(encoding="utf-8"))
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
        lan_notice_shown=bool(raw.get("lan_notice_shown", defaults.lan_notice_shown)),
        use_https=bool(raw.get("use_https", defaults.use_https)),
        ssl_certfile=str(raw.get("ssl_certfile") or defaults.ssl_certfile),
        ssl_keyfile=str(raw.get("ssl_keyfile") or defaults.ssl_keyfile),
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
    use_https: bool | None = None,
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
    if use_https is True:
        flags.append("--https")
    elif use_https is False:
        flags.append("--no-https")

    if is_frozen():
        return [str(Path(sys.executable).resolve()), *flags]

    exe_path = Path(sys.executable).resolve()
    if plat == "win32" and exe_path.name.lower() == "python.exe":
        pythonw = exe_path.with_name("pythonw.exe")
        if pythonw.exists():
            exe_path = pythonw
    return [str(exe_path), "-m", "backend.app.cli", *flags]
