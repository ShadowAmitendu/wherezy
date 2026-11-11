# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller --onedir spec file for building installable Wherezy desktop bundles."""

import importlib.util
from pathlib import Path
import sys as _spec_sys

from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

ROOT_DIR = Path(SPECPATH).resolve()
if str(ROOT_DIR) not in _spec_sys.path:
    _spec_sys.path.insert(0, str(ROOT_DIR))

_ver_spec = importlib.util.spec_from_file_location(
    "wherezy_version_info",
    str(ROOT_DIR / "packaging" / "version_info.py"),
)
_ver_mod = importlib.util.module_from_spec(_ver_spec)
assert _ver_spec is not None and _ver_spec.loader is not None
_ver_spec.loader.exec_module(_ver_mod)
build_win32_version_info = _ver_mod.build_win32_version_info
read_app_version = _ver_mod.read_app_version

APP_VERSION = read_app_version(ROOT_DIR)
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
        (str(ROOT_DIR / "LICENSE"), "."),
    ]
    + collect_data_files("ttkbootstrap.assets")
    + copy_metadata("ttkbootstrap")
)

_platform_hiddenimports = []
if _spec_sys.platform == "win32":
    _platform_hiddenimports = ["pystray._win32", "winreg", "ctypes"]
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
        + collect_submodules("cryptography")
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
            "uvicorn.protocols.websockets.websockets_impl",
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
            "websockets",
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
    [str(ROOT_DIR / "desktop_main.py")],
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

_icon_path = None
_win32_version = None
if _spec_sys.platform == "win32":
    _icon_path = str(ROOT_DIR / "packaging" / "wherezy.ico")
    _win32_version = build_win32_version_info(APP_VERSION)
elif _spec_sys.platform == "darwin":
    _icon_path = str(ROOT_DIR / "packaging" / "wherezy.icns")

_exe_name = "Wherezy" if _spec_sys.platform in {"win32", "darwin"} else "wherezy"

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name=_exe_name,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    icon=_icon_path,
    version=_win32_version,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="Wherezy",
)

if _spec_sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="Wherezy.app",
        icon=_icon_path,
        bundle_identifier="com.wherezy.desktop",
        version=APP_VERSION,
        info_plist={
            "CFBundleName": "Wherezy",
            "CFBundleDisplayName": "Wherezy",
            "CFBundleIdentifier": "com.wherezy.desktop",
            "CFBundleVersion": APP_VERSION,
            "CFBundleShortVersionString": APP_VERSION,
            "CFBundlePackageType": "APPL",
            "NSPrincipalClass": "NSApplication",
            "NSHighResolutionCapable": True,
            "NSRequiresAquaSystemAppearance": False,
            "LSMinimumSystemVersion": "12.0",
            "LSUIElement": True,
        },
    )
