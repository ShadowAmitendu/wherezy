---
layout: default
title: Downloads
nav_order: 3
summary: Standalone executables for Windows, Linux, and macOS, plus Python wheel and Docker.
---

# Download Wherezy Packages

[&larr; Back to Overview]({{ '/' | relative_url }})

All prebuilt packages bundle Python, the FastAPI backend, SQLite migrations, category templates, React web UI (with offline fonts), and the TTK Bootstrap Desktop Tray / Menu Bar Controller — no Python or Node.js required on your computer.

## Release Artifacts (`v2.2.2`)

| Target | Download Link | Notes |
| :--- | :--- | :--- |
| **Windows (`x86_64` Installer)** | [Wherezy-Setup-2.2.2.exe](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/Wherezy-Setup-2.2.2.exe) | Per-user installer (`%LOCALAPPDATA%\Programs\Wherezy`), no admin required, optional Desktop & Start with Windows shortcuts |
| **macOS (`.dmg`)** | [Wherezy-2.2.2-macOS.dmg](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/Wherezy-2.2.2-macOS.dmg) | Universal/Apple Silicon `Wherezy.app` bundle + Menu Bar Controller (`LSUIElement`) |
| **Linux (`x86_64` Bundle)** | [wherezy-2.2.2-linux-x86_64.tar.gz](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-2.2.2-linux-x86_64.tar.gz) | Extract folder & run `./Wherezy/wherezy` for Ubuntu/Debian desktops & servers |
| **Python Wheel** | [wherezy-2.2.2-py3-none-any.whl](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-2.2.2-py3-none-any.whl) | Cross-platform wheel for `pip` / `pipx` |
| **Checksums** | [SHA256SUMS.txt](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/SHA256SUMS.txt) | SHA-256 verification file |

> Browse all versions on [GitHub Releases](https://github.com/ShadowAmitendu/wherezy/releases/latest).

## Windows Installer Notes

- **Zero Admin Required**: Installs under `%LOCALAPPDATA%\Programs\Wherezy` and stores your database, config, logs, and local TLS certs safely under `%LOCALAPPDATA%\Wherezy\`.
- **Clean Upgrades & Uninstall**: Upgrading stops a running instance gracefully (`Wherezy.exe --quit`), updates the app without creating duplicate shortcuts, automatically backs up the SQLite database before schema migrations, and preserves user data. Uninstalling asks before touching `%LOCALAPPDATA%\Wherezy\` (default keeps data).
- **Unsigned Builds (SmartScreen)**: Until a paid code-signing certificate is configured, Windows Defender SmartScreen may show *"Windows protected your PC"* on first download — click **More info &rarr; Run anyway** (and verify checksums against `SHA256SUMS.txt`).

## Install via Python (`pipx` / `pip`)

```bash
pipx install https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-2.2.2-py3-none-any.whl
wherezy-desktop          # GUI + Tray/Menu Bar controller
wherezy --open --https   # Headless HTTPS server + browser launch
```

## Run on Linux (`tar.gz`)

```bash
tar -xzf wherezy-2.2.2-linux-x86_64.tar.gz
./Wherezy/wherezy --headless --host 0.0.0.0 --port 8000 --https
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
# After dragging Wherezy.app from Wherezy-2.2.2-macOS.dmg into /Applications:
xattr -dr com.apple.quarantine /Applications/Wherezy.app
open /Applications/Wherezy.app
```
