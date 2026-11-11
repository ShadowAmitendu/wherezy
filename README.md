# Wherezy 📦

A lightweight, local-network (LAN-only) household inventory management web application.

- **Frontend**: React 19, TypeScript, Vite, Material UI (MUI v7), `@mui/x-data-grid`, `@dnd-kit`, `react-hook-form` + `zod`
- **Backend**: Python 3.12+, FastAPI, SQLite (WAL mode + foreign keys), SQLAlchemy 2.x, Pillow
- **Data storage**: Local SQLite database and image files in `./data/`
- **100% Offline & LAN-Only**: Zero telemetry, zero cloud calls, self-contained font bundling (`@fontsource/geist`, `@fontsource/inter`, `@fontsource/jetbrains-mono`).

---

## Key Features

1. **Category Custom Form Builder**:
   - Build custom form schemas per category with drag-and-drop field reordering.
   - Field types: `text`, `longtext`, `number` (with optional units like `V`, `W`, `kg`), `date`, `dropdown`, `multiselect`, and `checkbox`.
   - Safe evolution: labels and hints can be edited without losing data; archived fields retain existing records.
   - Starter templates ready to use: **Medicines**, **Lights**, **Tools**, and **Documents**.

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
   - One-click `.zip` backup and restore containing `inventory.db` and the full `photos/` folder.
   - Pre-restore safety snapshot automatically created before restoring.
   - Full CSV and JSON export/import.

8. **Household PIN Protection (Optional)**:
   - Optional 4-6 digit household PIN stored with Argon2 hashing and rate-limited brute-force protection.

---

## Quickstart

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
pip install -r requirements.txt
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

## Mobile Camera Scanning & HTTPS Note

Modern mobile browsers (Safari on iOS, Chrome on Android) require a **Secure Context** (`https://` or `localhost`) to grant permission to live video cameras.

If you access Wherezy over LAN plain HTTP (`http://192.168.x.x:8000`):
1. **Photo Capture Fallback**: Tap **"Take Photo of Code"** on the Scan screen. Your phone camera will open, take a picture, and decode the QR/barcode instantly.
2. **Direct QR Link**: Scanning the QR code with your phone's native camera app opens `http://<ip>:8000/#/i/<id>`, taking you directly to the item!
3. **Optional HTTPS**: You can run Wherezy behind a reverse proxy (such as Caddy, Nginx, or Traefik) with a local TLS certificate if you want live streaming camera access over Wi-Fi.

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
- **Upgrades**: Pull new code, run `pip install -r requirements.txt`, and rebuild the frontend with `npm run build`. Schema migrations execute automatically on server startup.
