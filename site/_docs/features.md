---
layout: default
title: User Guide & Workflows
nav_order: 2
summary: Walkthrough of locations, custom category schemas, items, lending, expiry alerts, Quick Capture Inbox, and backups.
---

# User Guide & Core Workflows

[&larr; Back to Overview]({{ '/' | relative_url }})

Wherezy organizes your home around four connected ideas: **Locations**, **Categories**, **Items**, and **Audit/Maintenance**.

---

## 1. Locations & Storage Hierarchy (`/locations`)

Every household space forms a tree:
- **Rooms** act as top-level areas (and can also hold items directly for storage-only rooms).
- **Sub-locations** represent cupboards, racks, shelves, drawers, toolboxes, or numbered plastic bins inside each room (for example: `Store Room > Metal Rack > Shelf 3 > Box B2`).
- **Safety Guards:**
  - Moving a location checks for parent-child cycles so a shelf cannot accidentally be placed inside itself.
  - Deleting a non-empty location is guarded until its items or child containers are moved elsewhere.
- **Box Packing & Batch Moves (`/moves`):** Pack items into moving/storage boxes and transfer whole batches between rooms cleanly with recorded move history.

---

## 2. Categories & Custom Form Builder (`/categories`)

Instead of forcing every item into rigid spreadsheets, each category defines its own custom attributes alongside core item fields:

- **Supported Custom Field Types:**
  - `text` — Short text (e.g., *Brand*, *Model No.*, *Serial*)
  - `longtext` — Detailed notes, care instructions, or contents list
  - `number` — Numeric values with optional unit labels (`V`, `W`, `kg`, `ml`, `cm`)
  - `date` — Purchase date, warranty end, or service date
  - `dropdown` — Single-select predefined choices
  - `multiselect` — Multiple badges/options per item
  - `checkbox` — True/false flags (e.g., *Original Box Kept*, *Prescription Required*)
- **Safe Schema Evolution:** Drag-and-drop reorder fields, update labels or helper hints at any time without breaking existing items, or archive unused fields while preserving historical data.
- **27 Ready Starter Templates:** Browse the full list on [Category Templates]({{ '/categories/' | relative_url }}).

---

## 3. Items, Lending & Expiry Tracking (`/items`, `/expiry`, `/contacts`)

Wherezy focuses on **physical belongings in real places** (where exact items live, who borrowed them, and when consumables expire):

- **Item Details:** Name, category, custom category fields, exact storage location, tags, multiple photos (with cover photo selection and automatic EXIF GPS stripping + 256px thumbnail generation), and file/PDF attachments (manuals, warranties, prescriptions).
- **Taken-Out Tracking:** Mark any item (like a drill, soldering iron, spare key, or document folder) as **Taken Out**, choose a borrower from **Contacts** (`/contacts`) or type a name, and inspect everything currently out on the **Dashboard** (`/`) or **Items** filter.
- **Expiry & Renewal Tracking (`/expiry`, `/reminders`):**
  - Track medicines, first-aid supplies, dry pantry staples, water purifier cartridges, passports, and vehicle documents.
  - Configure your warning window (default `30` days) and check *Valid*, *Expiring Soon*, and *Expired* groups or scheduled reminders (`/reminders`).
- **Bulk Add & Table Views:** Add multiple items in a grid dialog, or toggle table view with sorting/filtering across custom columns.

---

## 4. Quick Capture Inbox (`/inbox`)

In a hurry while unpacking groceries or cleaning a drawer? Snap a photo or jot a quick note straight into the **Quick Capture Inbox** (`/inbox`):
- Items sit in Inbox triage without cluttering your clean organized inventory.
- Assign a category and location manually when ready — or let AI triage suggest the category, fields, and bin automatically.

---

## 5. Data Health, Trash, Undo & Activity History (`/health`, `/trash`, `/activity`)

- **Data Health (`/health`):** Surfaces actionable cleanup queues without scanning manually:
  - Items missing a location (`no_location`)
  - Items without a photo (`no_photo`)
  - Long-expired items (`long_expired`)
  - Potential duplicates (`duplicates`)
  - Stale Inbox captures waiting for triage (`stale_inbox`)
- **10-Second Undo Snackbars:** Deleting items, changing taken-out state, or moving items pops up a live 10-second Undo bar so accidental clicks revert immediately.
- **Soft-Delete Trash (`/trash`) & Activity Revert (`/activity`):** Soft-deleted items stay recoverable in Trash until restored or purged by an admin/co-admin, and recent activity entries support direct rollback.

---

## 6. Wallboard Kiosk View (`/wall` & `/lock`)

Mount an old tablet or kitchen screen using a **`display`** (kiosk) profile:
- Uses `/lock` profile switcher and `/wall` high-level overview showing live storage counts, taken-out reminders, and expiry alerts without exposing admin settings or destructive write actions.

---

## 7. Backups, Export & Import (`/settings`)

- **Full `.zip` Backup & Restore:** Open **Settings &rsaquo; Database & Storage** to download a complete `.zip` containing `inventory.db`, `photos/`, and `files/`. Restoring a zip automatically captures a pre-restore safety snapshot first.
- **Automatic Pre-Upgrade Backups:** Whenever a newer version applies SQLite migrations (`_wherezy_schema_meta`), Wherezy automatically saves an online SQLite + media archive in `<data_dir>/backups/pre-upgrade-v<from>-to-v<to>-<timestamp>.zip`.
- **Multi-Format Export & Import:** Export or bulk-import items via **CSV**, **JSON**, or **Excel (`.xlsx`)**.
