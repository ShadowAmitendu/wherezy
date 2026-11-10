# Architecture Decisions & Decisions Log

## 1. Storage & Database
- **Engine**: SQLite 3 with Write-Ahead Logging (`PRAGMA journal_mode=WAL`) and `PRAGMA foreign_keys=ON`.
- **Migrations**: Lightweight migration runner using SQLite's `PRAGMA user_version` executing numbered SQL files in `backend/app/migrations/`.
- **Single Process / Local LAN**: Backend runs as a single FastAPI process on port 8000 serving both API (`/api`) and static production frontend bundle (`frontend/dist`) with SPA fallback routing.

## 2. Authentication & Sessions
- **Household PIN**: Optional simple household PIN (4-8 digits). When unset, the app operates without authentication barriers.
- **PIN Hashing**: Uses `bcrypt` with salt.
- **Rate Limiting**: Sliding window tracking failed login attempts per client IP (limit 5 failures per minute) returning HTTP 429.
- **Session Tokens**: Signed session cookies via `itsdangerous.URLSafeTimedSerializer` with `HttpOnly`, `SameSite=Lax`.

## 3. Custom Fields & Form Validation
- **Stable Field Keys**: Generated random keys matching `^f_[a-z0-9]{8}$` (e.g. `f_a1b2c3d4`). Changing a field's label or options does not corrupt existing data.
- **Values Storage**: `items.values_json` maps `field_key -> value`.
- **Field Archival**: Deleting a field sets `archived = 1`. Archived fields are hidden in item forms and category lists but historical data is retained.
- **Server Validation**: On item create/update, `values_json` is validated against the category's active fields: required fields enforced, types validated/coerced, dropdown values checked against allowed options, unrecognized keys stripped or rejected.

## 4. Deletion Protection & Tree Integrity
- **Category Deletion**: Blocked with 409 Conflict if any non-deleted items belong to the category.
- **Location Deletion**: Blocked with 409 Conflict if any non-deleted items or child locations exist.
- **Location Hierarchy**: Parent-child relationships checked with a recursive cycle detector to prevent reparenting a location under its own descendant.

## 5. Media Pipeline
- **Photos**: Uploads checked via Pillow image header inspection.
- **Orientation & Privacy**: EXIF orientation applied, and all EXIF metadata (especially GPS geolocation) stripped.
- **Resizing**: Resized to max 2000px long edge (JPEG ~85%), plus a 400px thumbnail generated under `data/photos/{owner_type}/{owner_id}/`.
- **Hard Purge**: Purging an item or location cleans up all associated photo files from the filesystem.

## 6. Codes & Printing
- **Code Identifiers**: `I{id}` for items, `L{id}` for locations.
- **QR Code**: Encodes `{base_url}/#/i/{id}` or `{base_url}/#/l/{id}`.
- **Barcode**: Code 128 representation of `I{id}` or `L{id}`.
- **Print Pages**: CSS print stylesheets (`@media print`) format A4/Letter pages directly in browser, repeating table headers without requiring server-side PDF engines.

## 7. Backups
- **Format**: ZIP archive containing `inventory.db` (safely captured using SQLite Online Backup API) and `photos/` folder.
- **Pre-restore Safety**: Any restore operation triggers an automatic backup before replacing database and photo files.
