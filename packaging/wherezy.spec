# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec file for building a standalone single-file Wherezy binary."""

from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

ROOT_DIR = Path(SPECPATH).parent.resolve()
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
MIGRATIONS_DIR = ROOT_DIR / "backend" / "app" / "migrations"
TEMPLATES_DIR = ROOT_DIR / "backend" / "app" / "seed_templates"

if not (FRONTEND_DIST / "index.html").is_file():
    raise FileNotFoundError(
        f"Built frontend not found at {FRONTEND_DIST}. Run 'npm --prefix frontend run build' first."
    )

datas = (
    [
        (str(FRONTEND_DIST), "frontend/dist"),
        (str(MIGRATIONS_DIR), "backend/app/migrations"),
        (str(TEMPLATES_DIR), "backend/app/seed_templates"),
        (str(ROOT_DIR / "packaging" / "wherezy.ico"), "packaging"),
        (str(ROOT_DIR / "packaging" / "wherezy.icns"), "packaging"),
    ]
    + collect_data_files("ttkbootstrap.assets")
    + copy_metadata("ttkbootstrap")
)

import sys as _spec_sys

_platform_hiddenimports = []
if _spec_sys.platform == "win32":
    _platform_hiddenimports = ["pystray._win32", "winreg"]
elif _spec_sys.platform == "darwin":
    _platform_hiddenimports = [
        "pystray._darwin",
        "AppKit",
        "Foundation",
        "objc",
        "PyObjCTools.MachSignals",
    ]
else:
    _platform_hiddenimports = ["pystray._xorg", "pystray._gtk", "pystray._appindicator"]

hiddenimports = sorted(
    set(
        collect_submodules("backend.app")
        + collect_submodules("ttkbootstrap")
        + _platform_hiddenimports
        + [
            "uvicorn.logging",
            "uvicorn.loops",
            "uvicorn.loops.auto",
            "uvicorn.loops.asyncio",
            "uvicorn.protocols",
            "uvicorn.protocols.http",
            "uvicorn.protocols.http.auto",
            "uvicorn.protocols.http.h11_impl",
            "uvicorn.protocols.http.httptools_impl",
            "uvicorn.protocols.websockets",
            "uvicorn.protocols.websockets.auto",
            "uvicorn.lifespan",
            "uvicorn.lifespan.on",
            "uvicorn.lifespan.off",
            "fastapi",
            "starlette",
            "starlette.middleware.cors",
            "starlette.staticfiles",
            "pydantic",
            "pydantic_core",
            "anyio",
            "anyio._backends._asyncio",
            "h11",
            "sqlalchemy",
            "sqlalchemy.dialects.sqlite",
            "sqlite3",
            "bcrypt",
            "itsdangerous",
            "multipart",
            "python_multipart",
            "PIL",
            "PIL.Image",
            "PIL.ImageDraw",
            "PIL.ImageTk",
            "PIL._tkinter_finder",
            "pystray",
            "tkinter",
            "tkinter.ttk",
            "tkinter.scrolledtext",
            "tkinter.filedialog",
            "tkinter.messagebox",
            "openpyxl",
            "google.genai",
            "httpx",
            "httpcore",
            "certifi",
        ]
    )
)

a = Analysis(
    [str(ROOT_DIR / "packaging" / "entrypoint.py")],
    pathex=[str(ROOT_DIR)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "pytest",
        "_pytest",
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

import sys as _sys

_icon_path = None
if _sys.platform == "win32":
    _icon_path = str(ROOT_DIR / "packaging" / "wherezy.ico")
elif _sys.platform == "darwin":
    _icon_path = str(ROOT_DIR / "packaging" / "wherezy.icns")

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="wherezy",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    icon=_icon_path,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
