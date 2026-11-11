"""Cross-platform CLI entrypoint for Wherezy (source checkout, pipx, and frozen binary)."""

from __future__ import annotations

import argparse
import multiprocessing
import os
import socket
import sys
import threading
import webbrowser
from pathlib import Path
from typing import Sequence

APP_VERSION = "2.0.0"


class _NullStream:
    """Fallback text stream used in console-less GUI launches on Windows/macOS."""

    encoding = "utf-8"
    errors = "replace"

    def write(self, data: str) -> int:
        return len(data)

    def writelines(self, lines) -> None:
        return None

    def flush(self) -> None:
        return None

    def isatty(self) -> bool:
        return False


def _has_flag(argv: Sequence[str], flags: Sequence[str]) -> bool:
    for arg in argv:
        for flag in flags:
            if arg == flag or arg.startswith(f"{flag}="):
                return True
    return False


def _configure_stdio(raw_args: Sequence[str] | None = None) -> None:
    """Ensure valid UTF-8 stdio streams even inside Windows GUI (`console=False`) binaries."""
    args_list = list(raw_args) if raw_args is not None else sys.argv[1:]
    wants_console_output = _has_flag(
        args_list,
        ("-h", "--help", "--version", "--headless", "--cli", "--host", "--port", "--data-dir"),
    )

    if sys.platform == "win32" and wants_console_output:
        if sys.stdout is None or sys.stderr is None:
            try:
                import ctypes

                if ctypes.windll.kernel32.AttachConsole(-1):
                    if sys.stdout is None:
                        sys.stdout = open("CONOUT$", "w", encoding="utf-8", errors="replace", buffering=1)
                    if sys.stderr is None:
                        sys.stderr = open("CONOUT$", "w", encoding="utf-8", errors="replace", buffering=1)
            except Exception:
                pass

    if sys.stdout is None:
        sys.stdout = _NullStream()
    if sys.stderr is None:
        sys.stderr = _NullStream()

    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def should_launch_gui(
    argv: Sequence[str],
    *,
    default_reload: bool = False,
    platform: str | None = None,
    environ: dict[str, str] | os._Environ[str] | None = None,
) -> bool:
    """Decide whether to start the desktop GUI/tray controller or headless CLI server."""
    args_list = list(argv)
    env = environ if environ is not None else os.environ
    plat = platform or sys.platform

    if _has_flag(args_list, ("-h", "--help", "--version")):
        return False
    if _has_flag(args_list, ("--gui", "--tray", "--minimized")):
        return True
    if _has_flag(args_list, ("--headless", "--cli")):
        return False
    if _has_flag(args_list, ("--host", "--port", "--data-dir", "--reload", "--no-reload")):
        return False
    if default_reload:
        return False

    if env.get("CI") or env.get("GITHUB_ACTIONS"):
        return False

    if plat in {"win32", "darwin"}:
        return True
    return bool(env.get("DISPLAY") or env.get("WAYLAND_DISPLAY"))


def get_local_ip() -> str:
    """Best-effort LAN IP detection for convenience banner output."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("10.255.255.255", 1))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def apply_cli_env(args: argparse.Namespace) -> None:
    """Propagate CLI options into process environment before importing app config."""
    if getattr(args, "data_dir", None):
        resolved = str(Path(args.data_dir).expanduser().resolve())
        os.environ["DATA_DIR"] = resolved
        os.environ["WHEREZY_DATA_DIR"] = resolved

    if getattr(args, "host", None):
        os.environ["HOST"] = args.host
        os.environ["WHEREZY_HOST"] = args.host

    if getattr(args, "port", None) is not None:
        port_str = str(args.port)
        os.environ["PORT"] = port_str
        os.environ["WHEREZY_PORT"] = port_str


def build_parser(default_reload: bool = False) -> argparse.ArgumentParser:
    default_host = os.getenv("WHEREZY_HOST") or os.getenv("HOST") or "0.0.0.0"
    default_port = int(os.getenv("WHEREZY_PORT") or os.getenv("PORT") or "8000")

    parser = argparse.ArgumentParser(
        prog="wherezy",
        description="Start the Wherezy home inventory server or desktop controller.",
    )
    parser.add_argument(
        "--host",
        default=default_host,
        help=f"Host interface to bind (default: {default_host})",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=default_port,
        help=f"Port to listen on (default: {default_port})",
    )
    parser.add_argument(
        "--data-dir",
        default=None,
        help="Directory for SQLite database and uploaded images.",
    )
    parser.add_argument(
        "--reload",
        dest="reload",
        action="store_true",
        default=default_reload,
        help="Enable Uvicorn auto-reload (development only).",
    )
    parser.add_argument(
        "--no-reload",
        dest="reload",
        action="store_false",
        help="Disable Uvicorn auto-reload.",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Open the web UI in the default browser after startup.",
    )
    parser.add_argument(
        "--gui",
        action="store_true",
        help="Launch the Wherezy desktop GUI controller with system tray / menu bar icon.",
    )
    parser.add_argument(
        "--tray",
        action="store_true",
        help="Alias for --gui (launch desktop controller and tray/menu bar icon).",
    )
    parser.add_argument(
        "--minimized",
        action="store_true",
        help="Start the desktop GUI controller minimized in the tray / menu bar.",
    )
    parser.add_argument(
        "--headless",
        "--cli",
        dest="headless",
        action="store_true",
        help="Run headless server directly in terminal without desktop GUI.",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"wherezy {APP_VERSION}",
    )
    return parser


def _ensure_source_import_path() -> None:
    """When invoked as a script from a source checkout, make repo root importable."""
    repo_candidate = Path(__file__).resolve().parent.parent.parent
    if (repo_candidate / "backend" / "app").is_dir() and str(repo_candidate) not in sys.path:
        sys.path.insert(0, str(repo_candidate))


def main(argv: Sequence[str] | None = None, *, default_reload: bool = False) -> int:
    multiprocessing.freeze_support()
    raw_args = list(sys.argv[1:] if argv is None else argv)
    _configure_stdio(raw_args)
    _ensure_source_import_path()

    parser = build_parser(default_reload=default_reload)
    args = parser.parse_args(raw_args)

    explicit_gui = bool(args.gui or args.tray or args.minimized)
    if should_launch_gui(raw_args, default_reload=default_reload):
        try:
            from backend.app.desktop.app import run_desktop_app

            return run_desktop_app(
                host=args.host if _has_flag(raw_args, ("--host",)) else None,
                port=args.port if _has_flag(raw_args, ("--port",)) else None,
                data_dir=args.data_dir,
                minimized=bool(args.minimized),
                open_browser=bool(args.open),
            )
        except Exception as exc:
            if explicit_gui:
                raise
            print(f"Desktop GUI unavailable ({exc}); falling back to headless CLI mode.")

    apply_cli_env(args)

    from backend.app.core import config as app_config

    frozen = app_config.is_frozen()
    use_reload = bool(args.reload) and not frozen
    local_ip = get_local_ip()
    browser_host = "localhost" if args.host in ("0.0.0.0", "::", "") else args.host
    local_url = f"http://{browser_host}:{args.port}"

    print("")
    print("=" * 60)
    print(f"   Wherezy v{APP_VERSION} Server Starting")
    print("=" * 60)
    print(f"   Local access : {local_url}")
    if args.host in ("0.0.0.0", "::"):
        print(f"   LAN access   : http://{local_ip}:{args.port}")
    print(f"   Data dir     : {app_config.DATA_DIR}")
    if (app_config.FRONTEND_DIST / "index.html").is_file():
        print(f"   Web UI       : bundled ({app_config.FRONTEND_DIST})")
    else:
        print("   Web UI       : not built (API-only mode)")
    print(f"   API docs     : http://localhost:{args.port}/docs")
    print("=" * 60)
    print("   Press Ctrl+C to stop the server.\n")

    if args.open:
        threading.Timer(1.5, lambda: webbrowser.open(local_url)).start()

    import uvicorn

    if use_reload:
        repo_root = app_config.resolve_repo_root()
        reload_dirs = [str(repo_root / "backend")] if repo_root else None
        uvicorn.run(
            "backend.app.main:app",
            host=args.host,
            port=args.port,
            reload=True,
            reload_dirs=reload_dirs,
            log_level="info",
        )
    else:
        from backend.app.main import app

        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            reload=False,
            log_level="info",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
