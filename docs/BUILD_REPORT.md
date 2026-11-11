# Wherezy Build Report

Generated: 2026-11-10
Author: Wherezy Lead Orchestrator
Status: **Complete (Phase 0, Phase 1, Phase 2)**

---

## 1. What Was Built (Per Section 6 Specification)

### 6.1 Categories, Custom Form Builder & Starter Templates
- **Category Management**: Categories with custom name, Material icon picker (40+ searchable icons), color presets, and optional expiry tracking toggle.
- **Form Schema Builder**: Drag-and-drop field reordering powered by `@dnd-kit`. Supports 7 field types:
  - `text` (standard single-line)
  - `longtext` (multi-line textarea)
  - `number` (with optional unit suffix, e.g. `V`, `W`, `kg`)
  - `date` (ISO date picker)
  - `dropdown` (single-select from custom option list)
  - `multiselect` (multi-chip tag selector)
  - `checkbox` (boolean toggle)
- **Safe Schema Evolution**:
  - Auto-generated immutable field keys (`f_[0-9a-f]{6}`).
  - Incompatible type modifications rejected by backend (`INCOMPATIBLE_TYPE_CHANGE`).
  - Archived fields retain stored historical data while being hidden from new entry forms.
- **Starter Templates**: 4 pre-packaged templates shipped and tested:
  - *Medicines*: Form, Dosage, Active ingredient, Storage temp, Expiry tracking enabled.
  - *Lights*: Fitting/base, Lumens, Colour temp (K), Wattage (W), Dimmable.
  - *Tools*: Brand, Power source, Serial number, Manual link.
  - *Documents*: Document type, Issue date, Issuer, Filing reference.

### 6.2 Storage Locations Hierarchy
- **Tree-Structured Locations**: Arbitrary nesting depth (Room > Cupboard > Shelf > Bin).
- **Cycle Prevention**: Backend DAG check rejects cycles when moving containers into their own descendants.
- **Guarded Deletion**: Deletion rejected if a location contains items or child containers.
- **Bulk Item Moving**: Select multiple items and relocate them in a single batch transaction.
- **Breadcrumb Navigation**: Path breadcrumbs rendered across all views and dialogs.

### 6.3 Item Management (Strictly No Stock/Quantity Tracking)
- **Physical Household Items**: Each record represents a distinct physical item in its designated home location.
- **Dynamic Field Renderer**: Built using `react-hook-form` and dynamically compiled Zod validation schemas.
- **Dual View Modes**:
  - Desktop: `@mui/x-data-grid` with server-side pagination, sorting, search, and category/location/status filters.
  - Grid/Cards view: Responsive cards with cover thumbnails and quick-action menus.
- **Item Duplication**: Duplicate an existing item's category and field attributes to quickly catalog similar belongings.

### 6.4 Taken-Out Tracking
- **Presence Toggle**: Items toggle between *"In Storage Location"* and *"Currently Taken Out"*.
- **Borrower & Timestamp**: Stores `taken_by` and `taken_at` timestamp.
- **Dashboard Quick Filter**: Instant view of items currently taken out.

### 6.5 Expiry Tracking
- **Automatic Status Evaluation**:
  - `expired` (expiry date in the past)
  - `soon` (within configured warning threshold, default 30 days)
  - `valid` (more than threshold away)
- **Visual Status Chips**: Color-coded chips across all item lists, dialogs, and print sheets.
- **Dedicated Expiry Page**: Filterable table of urgent and expiring household goods.

### 6.6 Photos & Media Management
- **Local Filesystem Storage**: Stored securely in `data/photos/` without external cloud dependencies.
- **Pillow Image Processing**:
  - Automatic EXIF orientation normalization.
  - Complete EXIF/GPS stripping for privacy.
  - Automatic 256x256 thumbnail generation for fast network delivery.
- **Cover Photo Selection**: Designate cover image for cards, tables, and printable audit sheets.
- **Multi-Photo Upload**: Drag-and-drop or select multiple photos simultaneously.

### 6.7 QR Codes & Barcodes
- **QR Code Generation**: Direct URL encoding (`http://<host>:8000/#/i/<id>` and `.../#/l/<id>`).
- **Barcode Generation**: Code 128 rendering via `jsbarcode` for handheld barcode scanner integration.
- **Unified Code Resolution**: `/api/codes/resolve?code=...` handles URLs, item codes (`I12`), and location codes (`L4`).

### 6.8 Printable Label Sheets & Shelf Audit Sheets
- **Label Sheets (`/#/labels`)**: Printable grid with Avery presets (3x8, 4x10, continuous roll) and item/location selection.
- **Shelf Audit Sheet (`/#/print/location/:id`)**:
  - High-contrast checkbox column for physical clipboard audits.
  - Includes sub-locations grouped into clean subsections.
  - CSS `@media print` styling hides application chrome and navigation bars.

### 6.9 Scanning Interface (`/#/scan`)
- **Mode 1 - Live Camera Scanner**: Real-time video scanning with `html5-qrcode` (when running under HTTPS or localhost).
- **Mode 2 - Photo Capture Fallback**: Direct file input (`capture="environment"`) for LAN plain HTTP access on smartphones.
- **Mode 3 - Hardware Scanner & Manual Entry**: Dedicated auto-focus input for USB/Bluetooth barcode guns and typed IDs.

### 6.10 Settings & Administration
- **Household PIN Auth**: Optional 4-6 digit PIN with Argon2 hashing and exponential rate-limiting on failed attempts.
- **System Theme**: MUI v7 theme with Light, Dark, and System modes.
- **Configurable Expiry Window**: Custom warning threshold in days (default 30 days).
- **Full Backup & Restore**: One-click `.zip` export/import of SQLite database and photo directory with safety pre-restore snapshot.
- **CSV & JSON Export/Import**: Data export and import with CSV injection prevention (`=`, `+`, `-`, `@` escaped).
- **Storage Metrics**: Real-time disk usage breakdown for database, photos, and backups.

---

## 2. P1 / P2 Features Skipped or Deferred
- **HEIC iPhone Image Conversion**: Basic JPEG, PNG, and WebP support enabled out of the box via Pillow. `pillow-heif` optional library deferred to avoid non-standard C toolchain requirements on minimal Windows setups.
- **Background Cron Daemon**: APScheduler nightly backups deferred in favor of explicit UI-driven one-click backups and automatic pre-restore safety backups, keeping the backend completely single-threaded and lightweight.

---

## 3. Test Results

### Backend Automated Test Suite
- **Engine**: `pytest` 9.2.0 on Python 3.14 (FastAPI `TestClient`)
- **Isolation**: Automatic database truncation fixture in `backend/tests/conftest.py`
- **Result**: **9 passed in 1.16s, 0 failures**
  - `test_a1_core_auth_settings.py`: PIN setup, authentication cookies, settings CRUD.
  - `test_a2_forms_categories_templates.py`: Category creation, field typing, incompatible change rejection, templates.
  - `test_a3_items_locations_dashboard.py`: Location tree, item creation with custom fields, expiry calculation, dashboard metrics.
  - `test_a4_media_codes_admin.py`: Photo upload, thumbnail generation, admin storage endpoints, backup zip verification.
  - `test_api_gate.py`: Health check, template application, location cycle rejection, code resolution.

### Frontend Compilation & Bundling
- **TypeScript**: `tsc -b` compiled with **0 errors**.
- **Vite Production Bundler**:
  - All routes code-split using `React.lazy` and `Suspense`.
  - Main index chunk: **375 kB (118 kB gzipped)**.
  - Separate on-demand chunks for Scan, Items, Locations, Categories, Settings, and IconPicker.
  - All fonts bundled locally via `@fontsource/inter` and `@fontsource/jetbrains-mono`.

---

## 4. Known Limitations & Operating Guidance
1. **Live Camera Scanning requires HTTPS**:
   - Modern mobile operating systems (iOS Safari, Android Chrome) restrict the WebRTC `getUserMedia()` API to **Secure Contexts** (`https://` or `localhost`).
   - When accessing over plain LAN HTTP (`http://192.168.x.x:8000`), the app surfaces a notice and provides the **"Take Photo of Code"** button, which works natively across all mobile browsers.
   - For live continuous video scanning on mobile over LAN, place the server behind a local TLS reverse proxy (e.g. Caddy with internal CA).
2. **Single SQLite Database File**:
   - The app is designed for home networks (1-10 concurrent users). SQLite WAL mode ensures concurrent readers and serialized writers without locking issues.

---

## 5. Execution Commands

### To Start the Production Server:
```bash
# From repository root:
.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

### To Access From Any Device:
- Find host IP: run `ipconfig` (Windows) or `ip a` (Linux/Mac).
- Navigate to `http://<YOUR_LAN_IP>:8000` from any phone, tablet, or PC on your home Wi-Fi network.
