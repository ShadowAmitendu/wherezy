#!/usr/bin/env python3
"""Build a standalone single-file Wherezy executable using Vite + PyInstaller.

Usage:
    python scripts/build_binary.py [--skip-frontend] [--clean] [--install-pyinstaller]
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
FRONTEND_DIST = FRONTEND_DIR / "dist"
SPEC_FILE = ROOT_DIR / "wherezy.spec"
DIST_DIR = ROOT_DIR / "dist"
BUILD_WORK_DIR = ROOT_DIR / "build" / "pyinstaller"


def _npm_executable() -> str:
    return "npm.cmd" if os.name == "nt" else "npm"


def _run(cmd: list[str], cwd: Path | None = None) -> None:
    print(f"[build] Running: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)


def build_frontend() -> None:
    npm = _npm_executable()
    if not (FRONTEND_DIR / "node_modules").is_dir():
        _run([npm, "--prefix", str(FRONTEND_DIR), "ci"], cwd=ROOT_DIR)
    _run([npm, "--prefix", str(FRONTEND_DIR), "run", "build"], cwd=ROOT_DIR)


def ensure_pyinstaller(install_if_missing: bool) -> None:
    try:
        import PyInstaller  # noqa: F401
        return
    except ImportError:
        if not install_if_missing:
            raise SystemExit(
                "PyInstaller is not installed in this Python environment.\n"
                f"Run: {sys.executable} -m pip install pyinstaller\n"
                "Or re-run this script with --install-pyinstaller."
            )
        _run([sys.executable, "-m", "pip", "install", "pyinstaller"], cwd=ROOT_DIR)


def sync_static_dist() -> Path:
    """Copy built frontend/dist into backend/app/static_dist for wheel/pipx packaging."""
    target = ROOT_DIR / "backend" / "app" / "static_dist"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(FRONTEND_DIST, target)
    print(f"[build] Synced frontend assets -> {target}")
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description="Build standalone Wherezy executable.")
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Skip running Vite frontend build and reuse existing frontend/dist.",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Clean PyInstaller cache before building.",
    )
    parser.add_argument(
        "--install-pyinstaller",
        action="store_true",
        help="Automatically pip install pyinstaller if missing in current Python env.",
    )
    parser.add_argument(
        "--sync-wheel-assets",
        action="store_true",
        help="Also copy frontend/dist into backend/app/static_dist for Python wheel builds.",
    )
    args = parser.parse_args()

    if not args.skip_frontend:
        build_frontend()

    if not (FRONTEND_DIST / "index.html").is_file():
        raise SystemExit(f"Frontend build missing: {FRONTEND_DIST / 'index.html'}")

    if args.sync_wheel_assets:
        sync_static_dist()

    ensure_pyinstaller(args.install_pyinstaller)

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--distpath",
        str(DIST_DIR),
        "--workpath",
        str(BUILD_WORK_DIR),
    ]
    if args.clean:
        cmd.append("--clean")
    cmd.append(str(SPEC_FILE))

    _run(cmd, cwd=ROOT_DIR)

    if sys.platform == "win32":
        output_bin = DIST_DIR / "Wherezy" / "Wherezy.exe"
    elif sys.platform == "darwin":
        app_bin = DIST_DIR / "Wherezy.app" / "Contents" / "MacOS" / "Wherezy"
        output_bin = app_bin if app_bin.is_file() else (DIST_DIR / "Wherezy" / "Wherezy")
    else:
        output_bin = DIST_DIR / "Wherezy" / "wherezy"

    if not output_bin.is_file():
        raise SystemExit(f"Expected binary not produced at {output_bin}")

    bundle_dir = output_bin.parent.parent if sys.platform == "darwin" and "Wherezy.app" in output_bin.parts else output_bin.parent
    total_bytes = sum(p.stat().st_size for p in bundle_dir.rglob("*") if p.is_file())
    size_mb = total_bytes / (1024 * 1024)
    print("")
    print("=" * 60)
    print(f"Build succeeded: {output_bin} (bundle total {size_mb:.1f} MB)")
    print("Run from the bundle directory or package into an installer:")
    print(f"  {output_bin} --open")
    print(f"  {output_bin} --headless --port 8080 --data-dir ./wherezy-data")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
