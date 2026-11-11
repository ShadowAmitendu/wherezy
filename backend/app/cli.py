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

_REPO_CANDIDATE = Path(__file__).resolve().parent.parent.parent
if (_REPO_CANDIDATE / "backend" / "app").is_dir() and str(_REPO_CANDIDATE) not in sys.path:
    sys.path.insert(0, str(_REPO_CANDIDATE))

from backend.app.core.logging_setup import configure_logging_and_stdio
from backend.app.core.version import APP_VERSION


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
    """Ensure valid UTF-8 stdio streams and rotating file logs in GUI/frozen launches."""
    configure_logging_and_stdio(raw_args, fallback_stream_factory=_NullStream)


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

    if _has_flag(
        args_list,
        ("-h", "--help", "--version", "--quit", "--enable-autostart", "--disable-autostart"),
    ):
        return False
    if _has_flag(args_list, ("--gui", "--tray", "--minimized")):
        return True
    if _has_flag(args_list, ("--headless", "--cli")):
        return False
    if _has_flag(
        args_list,
        (
            "--host",
            "--port",
            "--data-dir",
            "--reload",
            "--no-reload",
            "--https",
            "--ssl",
            "--no-https",
            "--http",
            "--ssl-certfile",
            "--ssl-keyfile",
        ),
    ):
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

    certfile = (getattr(args, "ssl_certfile", None) or "").strip()
    keyfile = (getattr(args, "ssl_keyfile", None) or "").strip()
    if certfile:
        os.environ["WHEREZY_SSL_CERTFILE"] = certfile
    if keyfile:
        os.environ["WHEREZY_SSL_KEYFILE"] = keyfile
    use_https = bool(getattr(args, "https", False) or certfile or keyfile)
    os.environ["WHEREZY_HTTPS"] = "1" if use_https else "0"


def build_parser(default_reload: bool = False) -> argparse.ArgumentParser:
    default_host = os.getenv("WHEREZY_HOST") or os.getenv("HOST") or "0.0.0.0"
    default_port = int(os.getenv("WHEREZY_PORT") or os.getenv("PORT") or "8000")
    default_https = os.getenv("WHEREZY_HTTPS", "").strip().lower() in {"1", "true", "yes"}
    default_certfile = os.getenv("WHEREZY_SSL_CERTFILE") or ""
    default_keyfile = os.getenv("WHEREZY_SSL_KEYFILE") or ""

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
        "--https",
        "--ssl",
        dest="https",
        action="store_true",
        default=default_https,
        help="Serve traffic over HTTPS using a local self-signed or custom TLS cert.",
    )
    parser.add_argument(
        "--no-https",
        "--http",
        dest="https",
        action="store_false",
        help="Disable HTTPS and serve plain HTTP.",
    )
    parser.add_argument(
        "--ssl-certfile",
        default=default_certfile,
        help="Path to a PEM TLS certificate file (used with --ssl-keyfile).",
    )
    parser.add_argument(
        "--ssl-keyfile",
        default=default_keyfile,
        help="Path to a PEM TLS private key file (used with --ssl-certfile).",
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
        "--quit",
        action="store_true",
        help="Ask a running Wherezy desktop instance to quit gracefully and exit.",
    )
    parser.add_argument(
        "--enable-autostart",
        action="store_true",
        help="Enable Start with OS/login autostart for the current user and exit.",
    )
    parser.add_argument(
        "--disable-autostart",
        action="store_true",
        help="Disable Start with OS/login autostart for the current user and exit.",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"wherezy {APP_VERSION}",
    )
    return parser


def launch_desktop_from_args(args: argparse.Namespace, raw_args: Sequence[str]) -> int:
    """Invoke the desktop GUI controller using explicit CLI overrides only."""
    from backend.app.desktop.app import run_desktop_app

    cli_cert = (args.ssl_certfile or "").strip() if _has_flag(raw_args, ("--ssl-certfile",)) else None
    cli_key = (args.ssl_keyfile or "").strip() if _has_flag(raw_args, ("--ssl-keyfile",)) else None
    cli_https: bool | None = None
    if _has_flag(raw_args, ("--https", "--ssl", "--no-https", "--http")):
        cli_https = bool(args.https)
    elif cli_cert or cli_key:
        cli_https = True

    return run_desktop_app(
        host=args.host if _has_flag(raw_args, ("--host",)) else None,
        port=args.port if _has_flag(raw_args, ("--port",)) else None,
        data_dir=args.data_dir,
        use_https=cli_https,
        ssl_certfile=cli_cert,
        ssl_keyfile=cli_key,
        minimized=bool(args.minimized),
        open_browser=bool(args.open),
    )


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

    if getattr(args, "quit", False):
        from backend.app.desktop.app import request_running_instance_quit

        request_running_instance_quit(timeout=5.0)
        return 0

    if getattr(args, "enable_autostart", False):
        from backend.app.desktop.autostart import set_autostart_enabled

        set_autostart_enabled(True)
        return 0

    if getattr(args, "disable_autostart", False):
        from backend.app.desktop.autostart import set_autostart_enabled

        set_autostart_enabled(False)
        return 0

    explicit_gui = bool(args.gui or args.tray or args.minimized)
    if should_launch_gui(raw_args, default_reload=default_reload):
        try:
            return launch_desktop_from_args(args, raw_args)
        except Exception as exc:
            if explicit_gui:
                raise
            print(f"Desktop GUI unavailable ({exc}); falling back to headless CLI mode.")

    apply_cli_env(args)

    from backend.app.core import config as app_config
    from backend.app.core.tls import get_cert_sha256_fingerprint, resolve_tls_files

    cert_arg = (args.ssl_certfile or "").strip()
    key_arg = (args.ssl_keyfile or "").strip()
    use_https = bool(args.https or cert_arg or key_arg)
    try:
        cert_path, key_path = resolve_tls_files(
            https_enabled=use_https,
            certfile=cert_arg,
            keyfile=key_arg,
            bind_host=args.host,
        )
    except Exception as exc:
        print(f"Error configuring HTTPS/TLS certificates: {exc}", file=sys.stderr)
        return 1

    frozen = app_config.is_frozen()
    use_reload = bool(args.reload) and not frozen
    local_ip = get_local_ip()
    browser_host = "localhost" if args.host in ("0.0.0.0", "::", "") else args.host
    scheme = "https" if cert_path else "http"
    local_url = f"{scheme}://{browser_host}:{args.port}"

    print("")
    print("=" * 60)
    print(f"   Wherezy v{APP_VERSION} Server Starting")
    print("=" * 60)
    print(f"   Local access : {local_url}")
    if args.host in ("0.0.0.0", "::"):
        print(f"   LAN access   : {scheme}://{local_ip}:{args.port}")
    print(f"   Data dir     : {app_config.DATA_DIR}")
    if cert_path:
        print(f"   TLS cert     : {cert_path}")
        print(f"   TLS SHA-256  : {get_cert_sha256_fingerprint(Path(cert_path))}")
    if (app_config.FRONTEND_DIST / "index.html").is_file():
        print(f"   Web UI       : bundled ({app_config.FRONTEND_DIST})")
    else:
        print("   Web UI       : not built (API-only mode)")
    print(f"   API docs     : {scheme}://localhost:{args.port}/docs")
    print("=" * 60)
    print("   Press Ctrl+C to stop the server.\n")

    if args.open:
        threading.Timer(1.5, lambda: webbrowser.open(local_url)).start()

    import uvicorn

    ssl_kwargs: dict[str, str] = {}
    if cert_path and key_path:
        ssl_kwargs["ssl_certfile"] = cert_path
        ssl_kwargs["ssl_keyfile"] = key_path

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
            **ssl_kwargs,
        )
    else:
        from backend.app.main import app

        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            reload=False,
            log_level="info",
            **ssl_kwargs,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
