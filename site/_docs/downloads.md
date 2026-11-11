---
layout: default
title: Downloads
nav_order: 3
summary: Standalone executables for Windows, Linux, and macOS, plus Python wheel and Docker.
---

# Download Wherezy Packages

[&larr; Back to Overview]({{ '/' | relative_url }})

All prebuilt binaries bundle the FastAPI backend, SQLite migrations, category templates, React web UI (with offline fonts), and the Desktop Tray/Menu Bar Controller into a single artifact.

## Release Artifacts (`v2.1.0`)

| Target | Download Link | Notes |
| :--- | :--- | :--- |
| **Windows (`x86_64`)** | [wherezy-windows-x86_64.exe](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-windows-x86_64.exe) | Windowed Desktop Controller + System Tray & CLI |
| **Linux (`x86_64`)** | [wherezy-linux-x86_64](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-linux-x86_64) | Standalone binary for Ubuntu/Debian desktops & servers |
| **macOS (`arm64`)** | [wherezy-macos-arm64](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-macos-arm64) | Apple Silicon standalone binary + Menu Bar support |
| **Python Wheel** | [wherezy-2.1.0-py3-none-any.whl](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-2.1.0-py3-none-any.whl) | Cross-platform wheel for `pip` / `pipx` |
| **Checksums** | [SHA256SUMS.txt](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/SHA256SUMS.txt) | SHA-256 verification file |

> Browse all versions on [GitHub Releases](https://github.com/ShadowAmitendu/wherezy/releases/latest).

## Install via Python (`pipx` / `pip`)

```bash
pipx install https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-2.1.0-py3-none-any.whl
wherezy-desktop      # GUI + Tray/Menu Bar controller
wherezy --open       # Headless server + browser launch
```

## Run with Docker

```bash
git clone https://github.com/ShadowAmitendu/wherezy.git
cd wherezy
docker compose up -d --build
```

Docker persists all SQLite, photo, attachment, and backup files in the `/data` volume (`CMD ["--data-dir", "/data"]`).

## macOS First-Launch Quarantine Tip

```bash
chmod +x wherezy-macos-arm64
xattr -d com.apple.quarantine wherezy-macos-arm64
./wherezy-macos-arm64
```
