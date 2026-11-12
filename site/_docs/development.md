---
layout: default
title: Architecture & Development
nav_order: 11
summary: System architecture, project directory map, local development servers, automated tests, and contributing.
---

# Architecture & Local Development

[&larr; Back to Overview]({{ '/' | relative_url }})

Wherezy is designed as a single self-contained web application with a native desktop controller wrapper — zero external databases, zero cloud dependencies, and zero runtime telemetry.

---

## 1. High-Level Architecture

```text
+-------------------------------------------------------------------+
|  User Interfaces                                                  |
|  * Browser / Phone PWA (React 19, TypeScript, MUI v9, HashRouter) |
|  * Native Desktop Window & Tray (TTK Bootstrap + pystray)         |
+---------------------------------+---------------------------------+
                                  | HTTP / HTTPS (Uvicorn + FastAPI)
                                  v
+-------------------------------------------------------------------+
|  Backend Core (backend/app/)                                      |
|  * REST API + OpenAPI (/api/*, /docs)                             |
|  * Auth (bcrypt PINs, hi_session cookies, RBAC, Display kiosk)    |
|  * Photo pipeline (EXIF strip, 2000 px original, 400 px thumb)    |
|  * Optional AI Router -> Local LLM (Ollama/LM Studio) or Gemini   |
|  * SQLite Schema Migrations (_wherezy_schema_meta + pre-backup)   |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|  Per-User Persistent Storage (<Data Dir>)                         |
|  * inventory.db (SQLite WAL mode + foreign keys)                  |
|  * photos/item/ & photos/location/                                |
|  * files/ (manuals, receipts, PDF attachments)                    |
|  * backups/ (.zip snapshots & pre-upgrade archives)               |
+-------------------------------------------------------------------+
```

- **Unified Static Serving:** In installed bundles and Docker containers, FastAPI serves the compiled `frontend/dist/` React SPA directly alongside `/api/*` and `/photos/*`, so the entire app runs from a single port (`8000` by default).
- **Offline Fonts & Assets:** Web fonts (`@fontsource/geist`, `@fontsource/inter`, `@fontsource/jetbrains-mono`) are bundled directly into `frontend/dist/`, so icons and typography render cleanly on air-gapped networks.

---

## 2. Repository Structure

| Path | Purpose |
| :--- | :--- |
| `backend/app/` | FastAPI application, routers, SQLAlchemy models, migrations, security, TLS cert manager, CLI |
| `backend/app/desktop/` | TTK Bootstrap desktop controller window, system tray / menu bar (`pystray`), OS autostart, single-instance IPC |
| `backend/tests/` | Automated `pytest` suite covering API workflows, permissions, backups, packaging paths, and TLS/HTTPS |
| `frontend/src/` | React 19 + TypeScript + Material UI v9 web app (`HashRouter` routes) |
| `desktop_main.py` | Frozen bundle entrypoint (`multiprocessing.freeze_support()` + `cli.main()`) |
| `wherezy.spec` | PyInstaller `--onedir` spec bundling `frontend/dist`, migrations, templates, and icons |
| `installer/wherezy.iss` | Inno Setup 6 per-user Windows installer (`PrivilegesRequired=lowest`) |
| `scripts/` | Build automation (`build_windows.ps1`, `build_macos.sh`, `build_binary.py`) |
| `site/` | Jekyll documentation & downloads showcase deployed via GitHub Pages |
| `docs/openapi.json` | Exported OpenAPI specification snapshot |

---

## 3. Running From Source (Dev Mode)

### Prerequisites
- **Python 3.12+**
- **Node.js 18+** (Node 22 LTS used in CI)

### Install Dependencies

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r backend/requirements.txt

cd frontend
npm install
cd ..
```

### Run Backend + Vite Hot-Reload Dev Server

Run FastAPI with auto-reload in terminal 1, and Vite in terminal 2 (Vite proxies `/api` and `/photos` requests to port `8000` automatically):

```bash
# Terminal 1 (Backend API)
uvicorn backend.app.main:app --reload --port 8000

# Terminal 2 (Frontend with hot reload)
cd frontend
npm run dev
```

Or build the static frontend (`npm --prefix frontend run build`) and launch directly through Python:

```bash
python run.py --open
python -m backend.app.desktop.app   # Desktop Tray Controller from source
```

---

## 4. Running Automated Tests

```bash
# Backend test suite (pytest)
pytest backend/tests

# Frontend unit/component tests (Vitest)
npm --prefix frontend run test

# Frontend lint & production TypeScript + Vite build
npm --prefix frontend run lint
npm --prefix frontend run build
```

---

## 5. Building Installers & Contributing

- Full Windows (Inno Setup) and macOS (`.app` + `.dmg`) build steps live in **[BUILDING.md](https://github.com/ShadowAmitendu/wherezy/blob/main/BUILDING.md)**.
- Found a bug, UI glitch, or unclear doc page? Open an issue or pull request at **[github.com/ShadowAmitendu/wherezy](https://github.com/ShadowAmitendu/wherezy/issues)**.
