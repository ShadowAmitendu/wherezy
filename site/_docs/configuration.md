---
layout: default
title: CLI, Env & Docker Reference
nav_order: 8
summary: Every command-line flag, environment variable, default OS folder, Docker Compose setup, and OpenAPI endpoint reference.
---

# CLI, Environment & Docker Reference

[&larr; Back to Overview]({{ '/' | relative_url }})

Wherezy runs identically as a Windows/macOS desktop app, a headless `pipx` CLI (`wherezy`), or a multi-stage Docker container (`ghcr.io` / local Compose).

---

## 1. Command-Line Flags (`wherezy` / `Wherezy.exe`)

Invoke via `wherezy [flags]` (`pipx install .`), `python -m backend.app.cli [flags]`, or `Wherezy.exe [flags]`.

| Flag | Default | Description |
| :--- | :--- | :--- |
| `--host HOST` | `0.0.0.0` (CLI) / `127.0.0.1` (Desktop) | Network interface to bind (`127.0.0.1` for localhost-only, `0.0.0.0` for LAN) |
| `--port PORT` | `8000` | TCP port to listen on |
| `--data-dir PATH` | OS default | Directory containing `inventory.db`, `photos/`, `files/`, and `backups/` |
| `--https` / `--ssl` | Off (`WHEREZY_HTTPS`) | Serve HTTPS using auto-generated local SAN certificate or custom PEM pair |
| `--no-https` / `--http` | — | Explicitly disable HTTPS and serve plain HTTP |
| `--ssl-certfile PATH` | `""` | Custom PEM TLS certificate path (implies `--https`; pair with `--ssl-keyfile`) |
| `--ssl-keyfile PATH` | `""` | Custom PEM TLS private key path |
| `--gui` / `--tray` | Auto on Win/macOS | Launch the Desktop & System Tray Controller window |
| `--minimized` | Off | Launch the Desktop Controller minimized to the tray / menu bar |
| `--headless` / `--cli` | Off | Run the server directly in your terminal without launching the Desktop GUI |
| `--open` | Off | Open the Wherezy web UI automatically after startup |
| `--reload` / `--no-reload` | Off (built binary) | Enable or disable Uvicorn auto-reload during backend development |
| `--quit` | — | Ask a running Desktop Controller instance to quit gracefully and exit |
| `--enable-autostart` | — | Register Wherezy OS login autostart (`--minimized`) for the current user |
| `--disable-autostart` | — | Remove Wherezy OS login autostart for the current user |
| `--version` | — | Print `wherezy <version>` and exit |
| `-h`, `--help` | — | Show CLI help and exit |

> **CLI vs. GUI auto-detection:** Passing network, TLS, reload, or storage flags (`--host`, `--port`, `--data-dir`, `--https`, `--ssl-certfile`, etc.) or `--headless`/`--cli` starts the terminal server directly. Double-clicking the desktop app or passing `--gui` / `--tray` / `--minimized` starts the Desktop Controller.

---

## 2. Environment Variables

### Server, Storage & TLS

| Variable | Fallback / Default | Purpose |
| :--- | :--- | :--- |
| `WHEREZY_DATA_DIR` / `DATA_DIR` | Per-OS data dir | Override folder for SQLite DB, photos, attachments, and backups |
| `WHEREZY_HOST` / `HOST` | `0.0.0.0` (CLI) | Default server bind host |
| `WHEREZY_PORT` / `PORT` | `8000` | Default server listening port |
| `WHEREZY_HTTPS` | `0` | Set to `1`, `true`, or `yes` to enable HTTPS in CLI/Docker |
| `WHEREZY_SSL_CERTFILE` | `""` | Path to PEM certificate file |
| `WHEREZY_SSL_KEYFILE` | `""` | Path to PEM private key file |
| `WHEREZY_CERT_DIR` | `<OS user base>/certs` | Override storage directory for auto-generated self-signed certs |
| `WHEREZY_SECRET_KEY` / `SECRET_KEY` | Dev fallback string | Secret used to sign `hi_session` cookies — **change this in Docker/LAN production** |
| `WHEREZY_LOGS_DIR` | Per-OS logs dir | Override where rotating `wherezy.log` files are written |
| `WHEREZY_LOG_TO_FILE` | `1` when frozen | Set to `1` to force rotating file logging even in terminal launches |
| `WHEREZY_DESKTOP_CONFIG` | `<app support>/desktop.json` | Override path to persisted Desktop Controller JSON settings |

### AI Provider Overrides

| Variable | Purpose |
| :--- | :--- |
| `WHEREZY_AI_PROVIDER` | Force active AI provider mode (`gemini` or `local`) |
| `GEMINI_API_KEY` | Supply Gemini API key via environment instead of saving encrypted in SQLite |
| `WHEREZY_GEMINI_MODEL` | Override Gemini model name |
| `WHEREZY_LOCAL_LLM_URL` / `LOCAL_LLM_BASE_URL` | Base URL for OpenAI-compatible local LLM server (e.g. `http://localhost:11434/v1`) |
| `WHEREZY_LOCAL_LLM_MODEL` / `LOCAL_LLM_MODEL` | Default local LLM model identifier |
| `WHEREZY_LOCAL_LLM_STT_MODEL` / `LOCAL_LLM_STT_MODEL` | Optional local speech-to-text model (e.g. Whisper model ID) |

---

## 3. Default OS Data, Config & Log Locations

Installed Wherezy builds **never** store inventory databases or settings inside the program folder (`%LOCALAPPDATA%\Programs\Wherezy` or `/Applications/Wherezy.app`), so upgrades never overwrite your home catalog and uninstallers can leave your data intact.

| Platform | Persistent Inventory Data | Desktop Config (`desktop.json`) & Certs | Logs (`wherezy.log`) |
| :--- | :--- | :--- | :--- |
| **Windows** | `%LOCALAPPDATA%\Wherezy\data\` | `%LOCALAPPDATA%\Wherezy\` (`desktop.json`, `certs\`) | `%LOCALAPPDATA%\Wherezy\logs\` |
| **macOS** | `~/Library/Application Support/Wherezy/data/` | `~/Library/Application Support/Wherezy/` | `~/Library/Application Support/Wherezy/logs/` |
| **Linux / pipx** | `~/.wherezy/data/` (or `WHEREZY_DATA_DIR`) | `~/.config/wherezy/` (`XDG_CONFIG_HOME`) | `~/.local/state/wherezy/logs/` (`XDG_STATE_HOME`) |
| **Source Checkout** | `./data/` in repo root | Per-OS app support dir above | Per-OS logs dir above |

Inside your **Data Folder**:
- `inventory.db` &mdash; SQLite database
- `photos/item/` & `photos/location/` &mdash; EXIF-stripped 2000 px JPEGs + 400 px thumbnails
- `files/` &mdash; item manuals, receipts, and PDF attachments
- `backups/` &mdash; manual backup archives and automatic `pre-upgrade-*.zip` safety snapshots

---

## 4. Docker & Docker Compose Deployment

The repository includes a multi-stage `Dockerfile` (Node 22 builds `frontend/dist`, Python 3.12-slim runs FastAPI + Uvicorn) and `docker-compose.yml`.

```bash
git clone https://github.com/shadowamitendu/wherezy.git
cd wherezy
SECRET_KEY="$(openssl rand -hex 32)" docker compose up -d
```

Key `docker-compose.yml` defaults:
- **Port mapping:** `${WHEREZY_PORT:-8000}:8000` (`HOST=0.0.0.0`, `PORT=8000`)
- **Persistent volume:** `wherezy_data:/data` (`DATA_DIR=/data`)
- **Security & AI env vars:** `SECRET_KEY` (override the default placeholder in production!) and optional `GEMINI_API_KEY`
- **Healthcheck:** Polls `http://127.0.0.1:8000/api/health` every 30s (`start_period: 15s`)

Verify container health:

```bash
docker compose ps
docker compose logs -f wherezy
```

> **HTTPS behind Docker:** For live mobile camera scanning against a Docker host, place Caddy, Nginx Proxy Manager, or Tailscale Serve in front of port `8000` with `X-Forwarded-Proto: https`, or mount PEM cert/key files into the container and pass `WHEREZY_HTTPS=1`, `WHEREZY_SSL_CERTFILE`, and `WHEREZY_SSL_KEYFILE`.

---

## 5. REST API & Interactive Swagger Docs

When Wherezy is running, browse the full interactive OpenAPI documentation directly at `/docs` on your server (for example `http://127.0.0.1:8000/docs` or `https://127.0.0.1:8000/docs`). A static snapshot is also checked into the repository at `docs/openapi.json`.

---

## Next Steps

- [Profiles, Roles & HTTPS]({{ '/security-and-profiles/' | relative_url }}) &mdash; TLS certificates, reverse proxy headers, and permissions
- [Downloads & Upgrades]({{ '/downloads/' | relative_url }}) &mdash; desktop installers and upgrade backups
- [Troubleshooting & FAQ]({{ '/troubleshooting/' | relative_url }}) &mdash; fix port conflicts or restore backups
