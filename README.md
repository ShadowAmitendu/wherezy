# Wherezy 📦

> **Showcase & Downloads:** [shadowamitendu.github.io/wherezy](https://shadowamitendu.github.io/wherezy/) · [Latest Releases (Windows / Linux / macOS / Python `.whl`)](https://github.com/ShadowAmitendu/wherezy/releases/latest)

A lightweight, local-network (LAN-first) household inventory management web application with optional private AI workflows (Local LLM via Ollama/LM Studio or Google Gemini API).

- **Frontend**: React 19, TypeScript, Vite, Material UI (MUI v9), `@mui/x-data-grid`, `@dnd-kit`, `gsap`, `react-hook-form` + `zod`
- **Backend**: Python 3.12+, FastAPI, SQLite (WAL mode + foreign keys), SQLAlchemy 2.x, Pillow, `httpx`, `google-genai`
- **Data storage**: Local SQLite database, encrypted AI credentials, attachments, photos, and `.zip` backups in `./data/`
- **100% Local & LAN-First**: Zero telemetry, self-contained font bundling (`@fontsource/geist`, `@fontsource/inter`, `@fontsource/jetbrains-mono`), and works fully offline (even AI workflows when paired with a local Ollama or LM Studio server).

---

## Key Features

1. **Category Custom Form Builder**:
   - Build custom form schemas per category with drag-and-drop field reordering.
   - Field types: `text`, `longtext`, `number` (with optional units like `V`, `W`, `kg`), `date`, `dropdown`, `multiselect`, and `checkbox`.
   - Safe evolution: labels and hints can be edited without losing data; archived fields retain existing records.
   - 27 ready-to-use starter templates including **Medicines**, **First Aid**, **Festival & Celebration Supplies**, **Puja Mandir & Samagri**, **Lights**, **Tools**, **Hardware & Plumbing**, **Documents**, **Inverter, Appliances & Water Systems**, **Electronics**, **Cables & Chargers**, **Batteries**, **Pantry & Dry Goods**, **Kitchen & Cookware**, **Cleaning & Laundry**, **Clothing**, **Sarees, Ethnic & Heritage Wear**, **Bedding & Linens**, **Jewelry, Silver & Heirlooms**, **Monsoon & Seasonal Protection**, **Keys & Locks**, **Books**, **Automotive**, **Garden**, **Pets**, **Travel & Camping**, and **Games & Crafts**.

2. **Storage Location Hierarchy**:
   - Nestable storage locations (e.g. *Garage > Storage Rack > Shelf 2 > Parts Bin A*).
   - Cycle prevention and move collision guards.
   - Batch/bulk move items between storage locations.
   - Guarded deletion: prevents accidental deletion of locations with stored items or child containers.

3. **Item Management (No Stock/Quantity Counts)**:
   - Tracks unique physical household belongings in their exact places.
   - **Taken-Out Tracking**: Toggle items between *"In place"* and *"Currently Taken Out"* with borrower name and timestamp.
   - **Expiry Tracking**: Configurable warning window (default 30 days) with visual status chips (*Valid*, *Expiring Soon*, *Expired*).

4. **Photos & Media**:
   - Attach photos to both items and locations.
   - Automatic EXIF orientation normalization, metadata/GPS stripping for privacy, and 256px web thumbnail generation.
   - Star/set cover photo for list and table views.

5. **QR Codes, Barcodes & Scanning**:
   - Direct item (`I<id>`) and location (`L<id>`) QR codes and Code 128 barcodes.
   - Printable label sheets with Avery / standard sticker presets (3x8, 4x10, continuous roll).
   - **Scanning modes**:
     - **Live Camera Scanner** (HTML5 QR/barcode video stream, requires HTTPS or localhost).
     - **Photo Capture Fallback** (Snap a picture with your phone camera over plain HTTP).
     - **Hardware Scanner / Manual Input** (Instant focus for USB/Bluetooth barcode readers or typed codes).

6. **Printable Shelf Audit Sheets**:
   - Printable location inventories formatted for A4/Letter paper with high-contrast audit checkboxes, item thumbnails, and QR codes for physical clipboard shelf audits.

7. **Data Protection & Backup**:
   - One-click `.zip` backup and restore containing `inventory.db` and the full `photos/` and `files/` folders.
   - Pre-restore safety snapshot automatically created before restoring.
   - Full CSV, JSON, and Excel (`.xlsx`) workbook export, plus CSV/JSON bulk import.

8. **Household Profiles, RBAC & PIN Security**:
   - Multi-user household picker (`admin`, `co_admin`, `member`, `viewer`, and kiosk/wallboard `display` mode) with rate-limited bcrypt PIN authentication and activity logs.

9. **Multimodal AI Workflows (Local LLM or Cloud API Key)**:
   - Configure **Local LLM / OpenAI-compatible** servers (Ollama, LM Studio, `llama.cpp`, vLLM) with optional Whisper STT, **or** **Google Gemini API** (Fernet-encrypted keys at rest).
   - Generate category schemas from voice or prompts, auto-fill item forms from photos/voice, sort Quick Capture Inbox items, extract multi-item bulk batches, and build nested location trees.

10. **Desktop Installer, Tray & Menu Bar Controller**:
    - Install cleanly with zero admin elevation on Windows (`Wherezy-Setup-2.2.2.exe`) or macOS (`Wherezy-2.2.2-macOS.dmg`). No Python or Node.js required on the user's machine.
    - Opens the native **Wherezy Server Controller** (`ttkbootstrap`) with **Windows Taskbar + System Tray** and **macOS Menu Bar** icons showing live color-coded server status dots (*Running*, *Paused*, *Stopped*).
    - Safe `127.0.0.1` local-only default with a first-run Network & Firewall notice (**Keep 127.0.0.1 Only**, **LAN + HTTPS (Camera Ready)**, or **LAN Only (HTTP)**), one-click **Start / Pause / Stop / Restart**, **Pick a Free Port & Start** conflict recovery, optional **Enable HTTPS (TLS)** toggle, **Start with OS**, and rotating log viewer (`%LOCALAPPDATA%\Wherezy\logs\`).

11. **GitHub Pages Jekyll Showcase (`site/`)**:
    - Pure minimal Markdown documentation & download site powered by GitHub Pages Jekyll (`theme: jekyll-theme-architect` in `site/_config.yml`) with a `_docs` page collection linked in the sidebar and automated CI builds in `.github/workflows/pages.yml`.

---

## Deploy Anywhere (Installer, App Bundle, `pipx`, or Docker)

See [BUILDING.md](BUILDING.md) for full packaging instructions, CI workflows, code signing notes, and the Windows VM QA checklist.

### Option 1: Installable Desktop App (Windows Installer & macOS DMG)
1. **Download prebuilt installers** from [GitHub Releases](https://github.com/ShadowAmitendu/wherezy/releases/latest) (`Wherezy-Setup-2.2.2.exe` for Windows, `Wherezy-2.2.2-macOS.dmg` for macOS, `wherezy-2.2.2-linux-x86_64.tar.gz` for Linux), or build locally:
   ```powershell
   # Windows (creates dist/Wherezy/Wherezy.exe + dist/installer/Wherezy-Setup-2.2.2.exe):
   powershell -ExecutionPolicy Bypass -File .\scripts\build_windows.ps1 -Clean
   ```
   ```bash
   # macOS (creates dist/Wherezy.app + dist/installer/Wherezy-2.2.2-macOS.dmg):
   CLEAN=1 bash scripts/build_macos.sh
   ```
2. Launch Wherezy from the Start Menu, Applications folder, or Desktop shortcut, or run headless / CLI options:
   ```bash
   # Launch GUI controller minimized to tray/menu bar over HTTPS:
   Wherezy.exe --gui --minimized --https

   # Ask a running desktop instance to exit cleanly (used during upgrades/uninstalls):
   Wherezy.exe --quit

   # Run headless HTTPS server for scripts, SSH, or NAS hosts:
   Wherezy.exe --headless --host 0.0.0.0 --port 8080 --https --data-dir /srv/wherezy-data
   ```
   User config, data, logs, and local TLS certs stay outside the install directory (`%LOCALAPPDATA%\Wherezy\` on Windows, `~/Library/Application Support/Wherezy/` on macOS, `~/.config/wherezy/` & `~/.local/share/wherezy/` on Linux), surviving upgrades and optional keep-data uninstalls cleanly. Existing custom `data_dir` setups remain honored, and `schema_meta` migrations automatically create a pre-migration backup of `inventory.db`.

### Option 2: Python CLI Package (`pip` / `pipx`)
```bash
python scripts/build_binary.py --sync-wheel-assets --skip-frontend  # after frontend build
pipx install .
wherezy --host 0.0.0.0 --port 8000 --open   # headless server
wherezy-desktop                              # desktop tray / menu bar controller
```

### Option 3: Docker Container (Linux / NAS / Any Architecture)
```bash
docker compose up -d --build
```
Data persists in the `wherezy_data` Docker volume mounted at `/data`.

---

## Quickstart (From Source)

### 1. Prerequisites
- Python 3.12+ (Python 3.14 compatible)
- Node.js 18+ & npm

### 2. Backend Setup
```bash
# Create and activate virtual environment
python -m venv .venv

# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install backend dependencies
pip install -r backend/requirements.txt
```

### 3. Frontend Build
```bash
cd frontend
npm install
npm run build
cd ..
```
*The production frontend assets are built into `frontend/dist/` and served directly by FastAPI.*

### 4. Run the Server
```bash
# Simple one-command launch:
python run.py

# Or with options:
python run.py --port 8000 --open
```

Open your browser to:
- **Local machine**: [http://localhost:8000](http://localhost:8000)
- **Mobile phone or tablet on Home Wi-Fi**: `http://<YOUR-PC-LAN-IP>:8000` (e.g. `http://192.168.1.120:8000`)

---

## Mobile Camera Scanning & Built-in Optional HTTPS

Modern mobile browsers (Safari on iOS, Chrome on Android) require a **Secure Context** (`https://` or `localhost`) to grant permission to live video cameras and audio recording.

1. **Built-in Optional HTTPS / TLS**: Toggle **Enable HTTPS (TLS)** in the Desktop Controller settings (or select **LAN + HTTPS (Camera Ready)** in the first-run notice, or pass `--https` to CLI/headless mode). Wherezy automatically generates and maintains an 800-day local SAN certificate covering `localhost` and your active LAN IPv4 under `%LOCALAPPDATA%\Wherezy\certs\` (or use custom PEM files via `--ssl-certfile` / `--ssl-keyfile`).
2. **Photo Capture Fallback (Plain HTTP)**: Over plain `http://<ip>:8000`, tap **"Take Photo of Code"** on the Scan screen to decode QR/barcodes from a snapped photo, or scan printed item QR labels with your phone's native camera app to jump directly to `/#/i/<id>`.

---

## Development Mode

For rapid frontend hot-reloading:

1. Start backend in terminal 1:
   ```bash
   .venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --port 8000
   ```

2. Start Vite dev server in terminal 2:
   ```bash
   cd frontend
   npm run dev
   ```
   *Vite proxies `/api` and `/photos` requests to `http://localhost:8000` automatically.*

---

## Testing

Run the automated backend test suite:
```bash
.venv\Scripts\python.exe -m pytest backend/tests
```

Run frontend build check:
```bash
npm --prefix frontend run build
```

---

## Backup & Upgrade Guide

- **Database and photos** live inside the `data/` directory (`data/inventory.db` and `data/photos/`).
- **Backup**: Go to **Settings > Database & Storage** and click **"Download Backup (.zip)"**.
- **Restore**: Upload any previous backup zip to restore all items, categories, custom fields, and photos.
- **Upgrades**: Pull new code, run `pip install -r backend/requirements.txt`, and rebuild the frontend with `npm run build`. Schema migrations execute automatically on server startup.
