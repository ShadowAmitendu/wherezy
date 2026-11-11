"""Version parsing and PyInstaller Win32 VSVersionInfo helpers driven from APP_VERSION."""

from __future__ import annotations

from pathlib import Path
import re


def read_app_version(repo_root: Path | None = None) -> str:
    """Read APP_VERSION directly from backend/app/core/version.py (single source of truth)."""
    root = repo_root or Path(__file__).resolve().parent.parent
    version_file = root / "backend" / "app" / "core" / "version.py"
    text = version_file.read_text(encoding="utf-8")
    match = re.search(r'^APP_VERSION\s*=\s*["\']([^"\']+)["\']', text, re.MULTILINE)
    if not match:
        raise RuntimeError(f"Could not parse APP_VERSION from {version_file}")
    return match.group(1).strip()


def parse_version_tuple(app_version: str) -> tuple[int, int, int, int]:
    """Convert semantic version string like '2.2.1' or '2.3.0-rc1' into 4 integers."""
    nums = [int(part) for part in re.findall(r"\d+", app_version)[:4]]
    while len(nums) < 4:
        nums.append(0)
    return (nums[0], nums[1], nums[2], nums[3])


def build_win32_version_info(app_version: str):
    """Build a PyInstaller VSVersionInfo object for Windows executable metadata."""
    from PyInstaller.utils.win32.versioninfo import (  # type: ignore[import-not-found]
        FixedFileInfo,
        StringFileInfo,
        StringStruct,
        StringTable,
        VarFileInfo,
        VarStruct,
        VSVersionInfo,
    )

    ver_tuple = parse_version_tuple(app_version)
    ver_str_4 = ".".join(str(x) for x in ver_tuple)
    return VSVersionInfo(
        ffi=FixedFileInfo(
            filevers=ver_tuple,
            prodvers=ver_tuple,
            mask=0x3F,
            flags=0x0,
            OS=0x40004,
            fileType=0x1,
            subtype=0x0,
            date=(0, 0),
        ),
        kids=[
            StringFileInfo(
                [
                    StringTable(
                        "040904B0",
                        [
                            StringStruct("CompanyName", "Wherezy"),
                            StringStruct(
                                "FileDescription",
                                "Wherezy Home Inventory Server & Desktop Controller",
                            ),
                            StringStruct("FileVersion", ver_str_4),
                            StringStruct("InternalName", "Wherezy"),
                            StringStruct(
                                "LegalCopyright",
                                "Copyright (C) 2026 Wherezy Contributors (MIT License)",
                            ),
                            StringStruct("OriginalFilename", "Wherezy.exe"),
                            StringStruct("ProductName", "Wherezy"),
                            StringStruct("ProductVersion", app_version),
                        ],
                    )
                ]
            ),
            VarFileInfo([VarStruct("Translation", [1033, 1200])]),
        ],
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Print Wherezy version from single source of truth.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--version", action="store_true", help="Print APP_VERSION string.")
    group.add_argument("--numeric-version", action="store_true", help="Print X.Y.Z.W numeric version.")
    args = parser.parse_args()
    ver = read_app_version()
    if args.numeric_version:
        print(".".join(str(x) for x in parse_version_tuple(ver)))
    else:
        print(ver)
