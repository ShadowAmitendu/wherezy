---
name: homeinventory-v2-builder
description: Orchestrates the version 2 upgrade of the HomeInventory LAN-only household inventory web app (React + MUI, FastAPI + SQLite) that already exists from the homeinventory-builder skill. Adds household user profiles with roles, activity history, tags, bulk edit, a reminders engine (expiry, warranty and service dates, use-within-N-days-after-opening, loan due dates), file attachments, shelf audit mode, trash with restore, a command palette, and the dashboard and CSV import carried over from v1. Also adds quick capture inbox, retire instead of delete (sold, donated, thrown away, broken), data health page, moving-house mode with boxes, label designer, inventory book export (Excel and printable), contacts for lending, wall display mode, large-text and high-contrast modes, per-profile accent colour and language, second-copy backup to USB or network folder, and offline read-only mode. Use this skill whenever the user mentions HomeInventory v2, multiple profiles or users, who changed or moved an item, change history, tags, bulk edit, reminders or notifications, shelf audit, attachments, inbox or quick capture, retiring or donating items, data health or duplicates, moving boxes, label design, inventory book or Excel export, lending to contacts, kitchen tablet or wall display, large text or high contrast, accent colour or language, second backup, offline mode, or upgrading the home inventory app. It splits the work into parallel sub-agents with strict file ownership, a safe database migration plan, and acceptance tests.
---

# HomeInventory v2 Builder

A build playbook for a **lead agent (orchestrator)** that can spawn **sub-agents** in parallel.
If sub-agents cannot be spawned, run the same roles sequentially in the order in section 8.

**Prerequisite:** v1 exists and passes its tests (repo built with `homeinventory-builder`).
If v1 is missing, stop and build v1 first. Read v1's `docs/`, `SKILL.md` constraints, and the
current code before changing anything.

---

## 1. What v2 adds

| # | Feature | Priority |
|---|---|---|
| 1 | **Household profiles** with roles (Admin, Member, Viewer) | P0 |
| 2 | **Activity history** (who changed or moved what, and when) | P0 |
| 3 | **Tags** on items, with tag filters | P0 |
| 4 | **Bulk edit** from the item list | P0 |
| 5 | **Reminders engine**: expiry, warranty, service, use-within-N-days, loan due dates | P0 |
| 6 | **Dashboard** (carried over from v1 P1) and **CSV import** (from v1 P2) | P1 |
| 7 | **Loans**: due-back date and overdue status on "taken out" | P1 |
| 8 | **Attachments**: manuals, warranty cards, PDFs on items | P1 |
| 9 | **Shelf audit mode**: confirm what is on a shelf, find missing or misplaced items | P1 |
| 10 | **Trash / recycle bin** with restore | P1 |
| 11 | **Command palette** (Ctrl/Cmd+K quick search and jump) | P1 |
| 12 | **Saved filters** and **duplicate warning** on create | P2 |
| 13 | **Quick capture inbox**: snap photos now, name and sort later | P1 |
| 14 | **Retire instead of delete**: Sold, Donated, Thrown away, Broken, with date and reason | P1 |
| 15 | **Data health page**: no location, no photo, long-expired, possible duplicates | P1 |
| 16 | **Moving-house mode**: boxes, box contents lists, box labels | P2 |
| 17 | **Label designer**: choose label content and layout | P1 |
| 18 | **Inventory book**: Excel export and printable book | P1 |
| 19 | **Contacts for lending**: people with phone numbers; see what each person has | P1 |
| 20 | **Wall display mode**: read-only kitchen tablet view | P2 |
| 21 | **Large-text and high-contrast modes** | P1 |
| 22 | **Per-profile accent colour and default language** | P2 |
| 23 | **Second-copy backup** to a USB drive or network folder | P1 |
| 24 | **Offline read-only mode** (PWA copy of items; needs HTTPS) | P2 |

### Hard constraints (carried over from v1, never violate)
1. **No stock or quantity tracking.** Not in tags, bulk edit, audit, reminders, boxes, labels, or
   exports either. Showing how many *items* a box or shelf holds is fine; recording *how many of
   something you own* is not. No "Qty" column anywhere.
2. **Nobody touches the backend.** Every admin action lives in the Settings UI.
3. **LAN only.** No cloud services, no external calls at runtime. Any outgoing notification
   (webhook) only goes to a **user-configured LAN address**, and is **off by default**. The
   second-copy backup only writes to a **folder mounted on the server** (USB drive or a network
   share mounted by the operating system), never to a cloud service. Offline mode only talks to the
   app's own origin.
4. **Light and simple.** Still one process, one port, one SQLite file, one data folder.
5. **MUI only** for UI; MUI X community features only (no Pro or Premium).
6. **Existing data must survive.** A failed migration must never lose v1 data.
7. **Accessible by default.** Every new screen must work in large-text and high-contrast modes and
   at 360 px width (section 5.22).

---

## 2. Safe migration plan (the lead owns this; nothing else starts until it passes)

1. **Backup first.** On app start, if the DB `user_version` is lower than the v2 version, the
   migration runner makes a full backup zip (DB via SQLite online backup, plus photos) into
   `data/backups/pre-v2-<timestamp>.zip` **before** applying any migration.
2. **Forward-only numbered migrations** (`002_profiles.sql` onward), each run in one transaction.
   On any error: roll back, keep the backup, start the app in a clear "migration failed" screen with
   the error and the backup path (no data loss, no half state).
3. **Rehearse on a copy.** Generate a test database with 2,000 items, 50 locations, 300 photos,
   4 categories (use v1's test fixtures or a seed script), run the migration, run the full v1 test
   suite and a row-count comparison. This is a gate for Phase 1.
4. **Backfill rules:**
   - Existing single PIN becomes the **first Admin profile** named "Admin" (the user can rename it
     in the first-run v2 wizard). If no PIN was set, create "Admin" with no PIN.
   - Existing `taken_by` text stays as text (do not try to map it to profiles or contacts).
   - Existing items get a synthetic first activity event "Imported from v1" (actor NULL).
   - All existing items get `status = 'active'` (migration 008). Nothing is auto-retired or
     auto-moved to the inbox.
   - Existing profiles get default display preferences (100% text, no high contrast, system theme,
     household language).
   - If v1 stored label settings, convert them to a shared label template "Standard (from v1)";
     otherwise seed the default templates in section 5.18.
5. **Restore compatibility:** a v1 backup zip restored into v2 must run the migrations after
   restore. A v2 backup restored into an older app version must be refused with a clear message.

---

## 3. Data model changes (the lead writes the migrations in Phase 0)

```sql
-- 002_profiles.sql
profiles(id, name UNIQUE, color, avatar_emoji, role CHECK IN ('admin','member','viewer'),
         pin_hash NULL, is_active BOOL, created_at, updated_at)
-- sessions are signed cookies carrying profile_id; no sessions table required.
-- settings: add household_pin_required BOOL (default false), remember_profile_days (30)

-- 003_activity.sql
activity(id, at TEXT, actor_id FK NULL, batch_id TEXT NULL,
         entity_type CHECK IN ('item','location','category','field','tag','photo','attachment',
                               'profile','settings','audit','system',
                               'contact','label','move','box'),
         entity_id INTEGER NULL, action TEXT, summary TEXT, diff_json TEXT NULL)
-- indexes: (entity_type, entity_id, at DESC), (actor_id, at DESC), (at DESC), (batch_id)

-- 004_tags.sql
tags(id, name UNIQUE COLLATE NOCASE, color, created_at)
item_tags(item_id FK, tag_id FK, PRIMARY KEY(item_id, tag_id))   -- ON DELETE CASCADE

-- 005_reminders_loans.sql
ALTER TABLE field_defs ADD COLUMN remind BOOL DEFAULT 0;
ALTER TABLE field_defs ADD COLUMN remind_lead_days INTEGER NULL;    -- NULL = global default
ALTER TABLE field_defs ADD COLUMN remind_offset_days INTEGER NULL;  -- due = date + offset
ALTER TABLE categories ADD COLUMN expiry_lead_days INTEGER NULL;
ALTER TABLE items ADD COLUMN taken_due TEXT NULL;                   -- YYYY-MM-DD, optional
ALTER TABLE items ADD COLUMN taken_by_profile_id INTEGER NULL REFERENCES profiles(id);
reminder_state(id, source_type CHECK IN ('expiry','field','loan'), item_id FK,
               field_key TEXT NULL, due_date TEXT, profile_id FK NULL,
               snoozed_until TEXT NULL, dismissed_at TEXT NULL,
               UNIQUE(source_type, item_id, field_key, due_date, profile_id))
-- settings: reminders_enabled, reminders_digest_time ("08:00"), webhook_url NULL,
--           webhook_enabled BOOL (default false), activity_retention_days (default 365)

-- 006_attachments_audit_trash.sql
attachments(id, item_id FK, file_name, stored_name, mime, bytes, uploaded_by FK NULL, created_at)
audits(id, location_id FK, started_by FK, started_at, finished_at NULL, include_sub BOOL,
       expected_json, found_json, summary_json NULL)
-- trash uses existing deleted_at columns; add deleted_by FK NULL on items, locations,
-- categories; retention setting trash_retention_days (default 30)

-- 007_saved_filters.sql   (P2)
saved_filters(id, profile_id FK NULL, name, scope CHECK IN ('items'), query_json, created_at)

-- 008_capture_retire_health.sql
ALTER TABLE items ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active','inbox','retired'));
ALTER TABLE items ADD COLUMN retired_reason TEXT NULL
      CHECK (retired_reason IN ('sold','donated','thrown_away','broken'));
ALTER TABLE items ADD COLUMN retired_on TEXT NULL;                  -- YYYY-MM-DD
ALTER TABLE items ADD COLUMN retired_note TEXT NULL;                -- max 500 chars
ALTER TABLE items ADD COLUMN retired_by INTEGER NULL REFERENCES profiles(id);
ALTER TABLE items ADD COLUMN captured_at TEXT NULL;                 -- set for inbox captures
-- index: items(status, deleted_at)
health_ignores(id, check_key CHECK IN ('no_location','no_photo','long_expired','duplicate',
                                      'stale_inbox'),
               item_id FK, other_item_id FK NULL, ignored_by FK NULL, created_at,
               UNIQUE(check_key, item_id, other_item_id))
-- inbox items: see section 5.14 for the placeholder-name and location decision (Phase 0 records
-- it in docs/V2_DECISIONS.md after reading the v1 schema).

-- 009_contacts_labels_moves.sql
contacts(id, name, phone NULL, note NULL, is_active BOOL DEFAULT 1, created_at, updated_at)
ALTER TABLE items ADD COLUMN taken_by_contact_id INTEGER NULL REFERENCES contacts(id);
-- at most one of taken_by (text), taken_by_profile_id, taken_by_contact_id is set (service rule)
label_templates(id, name, kind CHECK IN ('item','location','box'), width_mm REAL, height_mm REAL,
                page_json NULL,          -- sheet grid: cols, rows, gaps, margins, offsets, start slot
                layout TEXT,             -- 'qr_left','qr_right','qr_top','text_only','qr_only'
                fields_json TEXT,        -- ordered content elements with size and options
                style_json TEXT NULL,    -- font scale, border, alignment, QR size and error level
                is_default BOOL DEFAULT 0, owner_id FK NULL,   -- NULL = shared
                created_at, updated_at)
moves(id, name, target_date NULL, status CHECK IN ('planning','done'), created_by FK,
      created_at, finished_at NULL)
boxes(id, move_id FK, number INTEGER, label TEXT, destination TEXT NULL,
      destination_location_id FK NULL, colour TEXT NULL, notes TEXT NULL,
      status CHECK IN ('packing','packed','unpacked'), created_at,
      UNIQUE(move_id, number))
box_items(box_id FK, item_id FK, active BOOL DEFAULT 1, added_at,
          PRIMARY KEY(box_id, item_id))
-- partial unique index: CREATE UNIQUE INDEX box_items_one_active ON box_items(item_id)
--                       WHERE active = 1;      (an item sits in one active box at a time)

-- 010_prefs_backup_offline.sql
ALTER TABLE profiles ADD COLUMN accent_color TEXT NULL;             -- #RRGGBB or preset id
ALTER TABLE profiles ADD COLUMN language TEXT NULL;                 -- NULL = household default
ALTER TABLE profiles ADD COLUMN text_scale INTEGER NOT NULL DEFAULT 100
      CHECK (text_scale IN (100,125,150));
ALTER TABLE profiles ADD COLUMN high_contrast BOOL NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN theme_mode TEXT NOT NULL DEFAULT 'system'
      CHECK (theme_mode IN ('system','light','dark'));
ALTER TABLE profiles ADD COLUMN is_display BOOL NOT NULL DEFAULT 0; -- wall display profile
-- settings: household_language ("en"), household_name NULL, health_expired_days (90),
--           health_inbox_days (14), wall_refresh_seconds (60), wall_sections (json),
--           wall_night_dim_from NULL, wall_night_dim_to NULL,
--           second_copy_enabled BOOL (false), second_copy_path NULL, second_copy_keep (14),
--           second_copy_last_ok NULL, second_copy_last_error NULL, second_copy_last_file NULL,
--           offline_enabled BOOL (true; only active on HTTPS), offline_max_items (20000)
```

**Rules**
- Tag names are unique case-insensitively; renaming a tag keeps links; deleting a tag requires
  confirmation and shows how many items use it.
- Activity rows are **append-only**. Deleting an item never deletes its history.
- Reminders are **computed from data**, not stored as rules. `reminder_state` only remembers
  per-profile snooze and dismiss choices.
- **One visibility helper.** Everything that lists, searches, counts, prints, exports, audits, or
  computes reminders for items goes through `services/visibility.py: items_visible()`
  (`status = 'active' AND deleted_at IS NULL`). Inbox, Retired, Trash, and Data health opt in
  explicitly. A test seeds one active, one inbox, one retired, and one trashed item and calls every
  list, search, dashboard, reminder, label, audit, export, wall, and offline endpoint, asserting only
  the active item appears (unless the endpoint is the explicit inbox, retired, or trash view).
- The `activity.entity_type` CHECK list in 003 already includes the v2 additions (`contact`,
  `label`, `move`, `box`); the lead writes all migrations before any is applied, so no table
  rebuild is needed.

---

## 4. Roles and permissions (enforced server-side on every endpoint)

| Action | Viewer | Member | Admin |
|---|---|---|---|
| Browse, search, scan, print, view history and reminders | yes | yes | yes |
| Create / edit / move / taken-out items, photos, attachments, tags, bulk edit | no | yes | yes |
| Run an audit | no | yes | yes |
| Create / edit categories, fields, templates, locations | no | no* | yes |
| Delete (to trash) items | no | yes | yes |
| Purge trash, restore from trash | no | restore only | yes |
| Manage profiles, PINs, roles | no | no | yes |
| Settings, backup, restore, export, import | no | no | yes |
| Quick capture, sort the inbox | no | yes | yes |
| Retire items, bring retired items back | no | yes | yes |
| View data health | yes | yes | yes |
| Ignore data-health findings | no | yes | yes |
| View contacts (phone numbers hidden from Viewer) | yes | yes | yes |
| Add / edit contacts | no | yes | yes |
| Deactivate / delete contacts | no | no | yes |
| Use moving-house mode (moves, boxes, packing, unpacking) | no | yes | yes |
| Print labels | yes | yes | yes |
| Create / edit label templates | no | own templates | yes (including shared and default) |
| Inventory book (Excel and printable book) | no | no | yes |
| Change own display preferences (accent, language, text size, contrast, theme) | yes | yes | yes |
| Change another person's display preferences | no | no | yes |
| Second-copy backup settings, restore from the second copy | no | no | yes |
| Keep an offline copy on this device (when enabled) | yes | yes | yes |
| Open the wall display (`/wall`) | yes | yes | yes |

*An Admin may enable a setting "Members can edit locations" (default off, P2).

- Implement as one FastAPI dependency `require(role|permission)`; every router uses it. A test
  walks all routes and fails if a route has no permission declared.
- Profile selection: a **"Who's using?"** picker (profile cards, optional per-profile PIN).
  The choice is remembered per device (signed cookie, `remember_profile_days`).
- Optional **household PIN** (v1 behaviour) can still gate the whole app before the picker.
- This is a **household convenience, not strong security**; say so in Settings help text.
- The last remaining active Admin cannot be demoted, deactivated, or deleted.
- Profiles with history are **deactivated, never deleted**, so history keeps its names.
- **Display profiles** (`is_display = 1`) are always role Viewer with no PIN, and the server grants
  them **only** the `wall:read` permission plus `GET /profiles/me`. Every other route returns 403
  for them, even reads. The route-permission test covers this.

---

## 5. Feature specification

### 5.1 Profiles (P0)
- Settings > People: add, edit (name, colour, emoji, role, PIN), deactivate and reactivate.
- Avatar = coloured circle with emoji or initials. Top bar shows the current profile with a
  "Switch" menu.
- "Taken by" uses a borrower picker (see 5.20: people, contacts, or "someone else" free text for
  guests); the chosen id goes to `taken_by_profile_id` or `taken_by_contact_id`.
- First v2 launch shows a short wizard for the Admin: rename, set PIN, add other people (skippable),
  optionally add a "Kitchen display" profile (5.21) and pick the household language (5.23).

### 5.2 Activity history (P0)
- Every create, update, delete, restore, move, taken-out, return, photo or attachment change,
  tag change, category or field change, audit, backup, restore, and import is logged by a single
  service `activity.record(actor, entity, action, summary, diff, batch_id)` called inside the same
  database transaction as the change (so a rolled-back change leaves no history).
  v2 additions logged the same way: `captured`, `sorted` (inbox), `retired`, `unretired`,
  contact changes, label template changes, move and box changes (`packed`, `unpacked`), exports
  (options only, never contents), second-copy backup failures and recoveries (`system`).
- `diff_json` shape: `{"fieldKeyOrColumn": ["old", "new"]}`; custom fields stored by **stable key**
  and rendered with the field label at read time; long text diffs store only a "changed" marker plus
  the first 80 characters of old and new.
- **Never log** PINs, hashes, cookies, file contents, or **contact phone numbers** (log "phone
  changed" only).
- Views:
  - **Item and location timelines** (tab inside the detail dialog) with actor chip, relative time,
    and a readable sentence ("Asha moved *Paracetamol* from Kitchen > Shelf 2 to Bedroom > Drawer").
  - **Activity page**: global feed with filters (person, type, date range, category, location) and
    infinite scroll; bulk operations appear as **one expandable row** (via `batch_id`).
  - Quick **Revert** (P1) for the last move and taken-out toggle only, shown to Member/Admin; a
    revert is itself logged.
- Retention: setting `activity_retention_days` (default 365, "Keep forever" allowed); nightly prune
  job, logged as a `system` event.
- Performance: feed queries use the indexes above; page size 50; the feed must stay fast with
  100,000 rows.

### 5.3 Tags (P0)
- Free-form tags on items, shown as MUI `Chip`s with colour; created on the fly in an
  `Autocomplete freeSolo multiple` field on the item form; also manageable in Settings > Tags
  (rename, recolour, merge two tags, delete).
- Filter by tags on the item list (any of / all of toggle) and in search (`tag:` chip).
- Tags are global (not per category). Max 20 tags per item, name length 1 to 32.
- API: `GET/POST /tags`, `PUT/DELETE /tags/{id}`, `POST /tags/{id}/merge`,
  `PUT /items/{id}/tags` (replace the set). Items API returns `tags: [{id, name, color}]`;
  `GET /items?tags=1,2&tag_mode=any|all`.

### 5.4 Bulk edit (P0)
- The DataGrid gets checkbox selection ("select all on this page" and "select all N matching
  the current filter"). A sticky action bar appears with:
  **Move to...**, **Add tags**, **Remove tags**, **Set taken out / returned**, **Set expiry date**
  (only categories with expiry), **Change category** (P2, see below), **Retire...**,
  **Add to box...** (P2, only while a move is active), **Print labels**, **Print list**,
  **Delete (to trash)**.
- Every bulk action opens a **preview dialog**: "This will change 37 items" with a short sample
  (first 5 names) and any items that will be skipped and why. Confirm, then run.
- Server: `POST /items/bulk` with `{ids | filter, action, params}`, executed in **one
  transaction**, returns `{changed, skipped: [{id, reason}], batch_id}`. All-or-nothing for
  database errors; per-item skips for business rules (for example, expiry on a non-expiry
  category, or retiring an item that is currently taken out).
- **Undo** snackbar for 10 seconds for move, taken-out, tags, expiry, retire, and delete
  (implemented by replaying inverse operations from the batch's recorded diffs).
- **Change category** keeps only custom values whose field keys also exist in the target category;
  the preview must list the values that would be dropped. Mark P2 and require Admin.
- Limit: 1,000 items per bulk request; "all matching" beyond that is chunked server-side inside
  the same batch.

### 5.5 Reminders engine (P0)
A reminder is **computed**, not stored. Sources:
1. **Expiry**: items with `expiry_date`, lead days from `categories.expiry_lead_days` or the global
   `expiry_warn_days`.
2. **Date fields** flagged `remind` in the form builder: lead days per field
   (`remind_lead_days`), optional `remind_offset_days`. Examples:
   - Warranty end date, lead 30 days.
   - Service due date, lead 14 days.
   - Medicines "Opened on" with offset +28 means "use within 28 days of opening".
3. **Loans**: items taken out with `taken_due` (due-back date); overdue when past due.

Only **active** items produce reminders (inbox, retired, and trashed items never do).

Statuses: `overdue` (past due), `due_soon` (inside the lead window), `snoozed`, `dismissed`.
- Form builder: on date fields a "Remind me" switch reveals "days before" and "days after the
  date (offset)". Show a plain sentence preview ("Reminds 14 days before 12 Mar 2027").
- **Reminder centre** (bell icon with badge, plus a page): groups Overdue / Due soon / Later,
  each row with item, source, due date, and actions **Open**, **Snooze** (1 day, 1 week, custom),
  **Dismiss**. Snooze and dismiss are **per profile**.
- A dismissed reminder returns only if the due date changes.
- **Banner on app open** for overdue items (collapsible).
- **Daily digest**: a printable "This week" page; optional **webhook** (Settings): at
  `reminders_digest_time` POST a JSON digest to the configured LAN URL (works with a local ntfy,
  Home Assistant, or any LAN service). Off by default; a **Send test** button; failures are logged
  to activity as `system` events and never block the app. Overdue loan lines in the digest include
  the borrower's name and, for contacts, their phone number (the digest goes to a LAN address the
  Admin chose).
- Browser notifications only while the tab is open **and** the origin is secure; otherwise show
  the in-app banner only. Do not promise background push.
- API: `GET /reminders?status=&source=&within_days=`, `POST /reminders/snooze`,
  `POST /reminders/dismiss`, `GET /reminders/count` (for the badge), `POST /admin/webhook-test`.
- Date logic uses the server's local date for date-only values; test boundary days and DST changes.

### 5.6 Dashboard (P1, carried over)
Cards: totals, per category, currently out, overdue loans, reminders due, recently added, recent
activity (last 10), **Inbox (N to sort)**, **Data health (N things to check)**, and, for Admins,
a **second-copy backup warning** when the last copy failed or is more than 2 nights old.
Totals count active items only. All cards link to filtered lists.

### 5.7 CSV import (P1, carried over)
Admin only. Upload CSV -> choose category -> map columns to built-in and custom fields (auto-guess
by label) -> **dry run** report (valid rows, warnings, errors with row numbers, unknown dropdown
values with a "add as option" choice) -> import in one batch (one `batch_id`, undoable from the
Activity page for the next 24 hours). Escape formula-leading characters on export, and strip them
on import. Max 5,000 rows per file.

### 5.8 Loans (P1)
- Taken-out dialog gains **Due back** (date, optional) and uses the borrower picker (5.20).
- Overdue chip on lists and cards; "Currently out" view sorted by due date, with a **group by
  person** toggle; Dashboard card.
- Returning an item clears due and logs a `returned` event with how many days it was out.
- An item that is currently taken out cannot be retired or packed into a box until it is returned
  (bulk actions skip it with that reason).

### 5.9 Attachments (P1)
- Allowed: PDF, images, plain text, common Office documents; max 25 MB per file, 10 per item
  (setting). Detect type by content sniffing; store under `data/files/<item_id>/<random>`;
  serve with `Content-Disposition: attachment` except PDFs and images, which preview inline in a
  dialog. Original file name kept in the DB only.
- Item detail gets an **Attachments** tab (add, rename label, download, delete). Included in
  backups and restores. Retired items keep their attachments.

### 5.10 Shelf audit mode (P1)
A location check, not a stock count.
1. From a location: **Start audit** (choose include sub-locations).
2. The app lists the **expected** active items. Items sitting in a packed box (5.17) are listed
   separately as "In a box" and are never counted missing. The user ticks each one found, or scans
   item codes (using the v1 scan component, with the same HTTPS fallbacks), or types codes.
3. Scanning an item that belongs elsewhere shows "This item is recorded in *Kitchen > Shelf 2*.
   Move it here?" (one tap).
4. Finish -> summary: **Found**, **Missing**, **Misplaced (moved)**. Missing items get a "Not found"
   marker note with the audit date (cleared when found or moved) and can be bulk-tagged `missing`.
5. The audit is saved (`audits` table) and logged; past audits are listed on the location page.
Offline-friendly: the audit state is kept in the browser until Finish, so a Wi-Fi drop does not
lose ticks.

### 5.11 Trash (P1)
- Deleting items, locations, or categories sets `deleted_at` and `deleted_by`. **Trash** page
  (Member sees own items, Admin sees all) with restore. Auto-purge after `trash_retention_days`
  (default 30) by the nightly job, which also deletes photo and attachment files of purged items.
- Restoring an item whose location was also deleted asks where to put it.
- Trash is for mistakes and junk. The item menu shows **Retire...** above **Delete (to trash)**
  with the hint "Delete is for mistakes. Retire keeps the history."

### 5.12 Command palette (P1)
Ctrl/Cmd+K (and a search icon on mobile) opens a MUI `Dialog` with a single input searching items,
locations, categories, tags, contacts, and actions ("Add item", "Quick capture", "Open Inbox (N)",
"Open reminders", "Start audit", "Open data health"). Debounced calls to `/api/search/quick?q=`
(returns up to 8 per type; active items only). Keyboard navigable and screen-reader friendly.

### 5.13 Saved filters and duplicate warning (P2)
- Save the current item-list filter as a named view (per profile or shared), listed above the grid.
- When adding an item whose name matches an existing item in the same category (case-insensitive),
  show a non-blocking "Similar item exists" notice with a link. Reuse the name normalisation
  function from Data health (5.16) so both agree on what "same" means.

### 5.14 Quick capture inbox (P1)
For the moment when you are emptying a cupboard and just want to photograph things.
- **Capture button**: a prominent "Quick capture" action in the top bar (floating button on mobile)
  and in the command palette. It opens a full-screen capture view built on
  `<input type="file" accept="image/*" capture="environment" multiple>`, which works on a plain
  HTTP LAN (unlike live camera streaming, which needs HTTPS).
- Each photo becomes **one inbox item immediately**: `status = 'inbox'`, `captured_at = now`,
  placeholder name "Untitled 2026-11-10 14:32" (the date and time of capture), the photo attached,
  uploaded with the same client-side resize and thumbnail logic as v1.
- Capture options, all optional and sticky for the session: **"I'm at..."** location picker (every
  capture inherits it), a one-line **name** field, and an **"Add to previous item"** switch so extra
  angles of the same thing go into one item.
- **Upload queue**: captures are stored in IndexedDB with a client-generated `client_id`
  (idempotency key) and uploaded in order; a Wi-Fi drop never loses a photo, and a retry never
  creates a duplicate item. A small "3 waiting to upload" chip shows the queue.
- **Inbox page** (badge count in the nav): a card grid of inbox items, newest first. Each card has
  **Sort** (opens the normal item form pre-filled with the photo and any name or location already
  given; saving flips `status` to `'active'` and runs the normal create validation), **Next in
  inbox** after saving, and **Discard** (to trash). Bulk selection offers **Set location**,
  **Set category**, **Add tags**, **Discard**.
- Inbox items are **invisible** everywhere else (lists, search, dashboard totals, reminders,
  audits, exports, labels). They appear on the dashboard only as the "Inbox (N)" card and in
  Data health when older than `health_inbox_days` (default 14).
- Placeholder and location decision (the lead records it in `docs/V2_DECISIONS.md` in Phase 0 after
  reading the v1 schema): **preferred** is to allow `location_id` and the category to be empty for
  `status = 'inbox'` (rebuild the table inside the migration if v1 declared them NOT NULL);
  **fallback** is a hidden system category "Uncategorised" and a hidden system location "Unsorted"
  that never appear in pickers or trees. Either way validation for required fields runs at Sort
  time, not capture time.
- API: `POST /inbox` (multipart: `photos[]`, optional `name`, `location_id`, `client_id`,
  `attach_to`), `GET /inbox`, `POST /inbox/{id}/sort` (full item payload, same validation as
  `POST /items`), `POST /inbox/bulk` (`ids`, `action`, `params`), `DELETE /inbox/{id}` (to trash).
  Capture is logged as `captured`, sorting as `sorted`.

### 5.15 Retire instead of delete (P1)
Retiring is the normal way an item leaves the household; the history stays.
- **Retire dialog** (item menu, item detail, bulk action): **Reason** (required: Sold, Donated,
  Thrown away, Broken), **Date** (default today, not in the future), **Note** (optional, max 500
  characters, for example "Donated to the school fair"). No money fields.
- Effects: `status = 'retired'` with `retired_reason`, `retired_on`, `retired_note`, `retired_by`.
  The item **leaves** the main list, search, dashboard totals, reminders, audits, label printing,
  and exports (unless the export option "include retired" is on). Its **location link is kept** so
  history stays readable, but it no longer counts as being on that shelf. Photos, attachments, tags,
  and the full activity history stay.
- An item that is currently taken out must be returned first (the dialog explains; bulk skips it).
- **Retired page** (nav, under "More"): filter by reason and date range, search by name, columns
  for reason, date, note, who retired it. **Bring back** returns it to `active` (asks for a
  location if the old one is gone) and is logged as `unretired`.
- A retired item is read-only except for its retire date and note and the Bring back action; the
  detail view shows a "Retired: Donated on 3 Nov 2026" banner.
- Scanning the QR code of a retired item opens its detail page with that banner and a **Bring
  back** button, never a "not found" error.
- API: `POST /items/{id}/retire` (`reason, on, note`), `POST /items/{id}/unretire`
  (`location_id?`), `GET /items?status=retired`, bulk action `retire` in `POST /items/bulk`.
  Items list accepts `status=active|retired|inbox` (default `active`).

### 5.16 Data health page (P1)
A tidy-up list, computed on read (indexed queries, 60 second cache), nothing stored except ignores.
Checks (thresholds are settings with the defaults shown):
1. **No location**: active items with no location, or whose location was deleted.
2. **No photo**: active items with no photo.
3. **Long expired**: expiry date more than `health_expired_days` (90) days in the past.
4. **Possible duplicates**: active items with the same **normalised name** (lowercase, trimmed,
   punctuation stripped, spaces collapsed) in the same category. P2 adds near matches (edit
   distance 1 for names of 6 or more characters).
5. **Stale inbox**: inbox items older than `health_inbox_days` (14).
- UI: a summary row of counts (each a tab), then a DataGrid per check with row actions **Open**,
  **Move to...**, **Retire...**, **Ignore**, plus the standard bulk action bar. Duplicates show as
  groups: photos side by side, **Open both**, **Retire one**, **Not a duplicate**. There is
  **no merge** (merging would imply counting quantities).
- **Ignore** and **Not a duplicate** are saved in `health_ignores` (shared across the household)
  and can be undone from an "Ignored" tab.
- Viewers can see the page but not ignore or change anything.
- API: `GET /health` (counts per check), `GET /health/{check}?cursor=`, `POST /health/ignore`,
  `DELETE /health/ignore/{id}`.

### 5.17 Moving-house mode (P2)
Pack by box, print what is inside, unpack by box. One active move at a time (a setting could
relax this later).
- **Start a move** (Admin or Member): name, optional target date. Status `planning` until
  **Finish move**.
- **Boxes**: auto number ("Box 1"), a **label** ("Kitchen: fragile"), a **destination** (free text
  room name, plus an optional link to a location already in the app), a colour (to match coloured
  tape), notes. Status `packing` -> `packed` -> `unpacked`.
- **Assigning items**: bulk action **Add to box...** from the item list, adding by scanning an item
  QR on the box page, or searching on the box page. An item can sit in **one active box** (partial
  unique index). Items not yet in any box appear under **Not packed yet** with a progress bar
  ("142 of 200 items packed"; this counts items, not stock). A shortcut **Not taking this?** opens
  the Retire dialog so decluttering and packing happen in one pass.
- **While packed**: the item keeps its last known location until unpacked, but lists and the detail
  view show a box chip ("Box 4: Kitchen, fragile"). Audits list such items as "In a box".
- **Unpack mode** (scan the box label at the new place): lists the contents, the user ticks items as
  they come out (state kept in the browser like an audit), picks the **destination location**, and
  **Unpack here** moves the ticked items through the bulk move engine (one batch, undoable) and
  sets their `box_items.active = 0`. Unticked items stay in the box; the box becomes `unpacked`
  when empty or when the user marks it done.
- **Printing** (browser print CSS, no server PDF): a **box label** (via the label designer with a
  `box` template: large number, label text, destination, QR to the box page), a **contents list**
  per box (item names, an empty tick column for checking at the other end, the shelf each item came
  from, no quantities), and a **move summary** of all boxes. **Print all box labels** supports
  sheet layouts.
- API: `GET/POST /moves`, `PUT /moves/{id}`, `POST /moves/{id}/finish`, `GET/POST
  /moves/{id}/boxes`, `GET/PUT/DELETE /boxes/{id}`, `POST/DELETE /boxes/{id}/items`,
  `POST /boxes/{id}/pack`, `POST /boxes/{id}/unpack` (`item_ids, location_id`).

### 5.18 Label designer (P1)
Replaces v1's fixed label with templates the household controls.
- **Where**: Settings > Labels (manage) and the Print labels dialog ("Customize..."), which opens
  the designer for the chosen template. Printing flow: select items -> **Print labels** -> choose
  template -> live preview -> print.
- **Template kinds**: item, location, box.
- **Paper**: presets (small roll 62 x 29 mm, roll 50 x 30 mm, A4 sheet 3 x 8, A4 sheet 2 x 7, a
  Letter sheet) stored as data in `frontend/src/features/labels/presets.json`, plus **custom** width
  and height in millimetres and a sheet grid (columns, rows, gaps, margins).
- **Layout**: QR left, QR right, QR top, text only, QR only.
- **Content** (toggle, reorder, font size per element): **Name**, **Location path** (full path or
  last segment only), **Expiry date** (shown only for items that have one, formatted in the
  profile's locale), **Category**, **Short code** (the item code under the QR), a **static line**
  (for example the household name or "Property of..."), and for box labels **Box number**,
  **Box label**, **Destination**. No quantity element exists.
- **Style**: alignment, border on or off, QR size and error-correction level, font scale. Text
  auto-shrinks down to a 6 pt floor, then truncates with an ellipsis; the preview flags any label
  where text was shortened or where the QR would print smaller than 15 mm.
- **Sheet printing**: **start at position** (to reuse a partly used sheet), per-printer **x and y
  offset calibration**, and a **calibration test page** with a millimetre ruler and a grid.
- **Printing mechanics**: rendered client-side with CSS millimetre units and `@page { size: ... }`;
  QR codes drawn client-side with the library v1 already uses; no server-side PDF.
- Seeded defaults: "Standard", "Small roll", "A4 sheet 3 x 8", "Box label". Each kind has one
  default; Admin sets the default and manages shared templates; Members manage their own.
- QR payload is the item, location, or box URL built from the configured LAN base address (v1
  behaviour). A help note says labels stop working if the server's address changes.
- API: `GET/POST /label-templates`, `PUT/DELETE /label-templates/{id}`,
  `POST /label-templates/{id}/default`.

### 5.19 Inventory book (P1)
A complete record for insurance, a move, or peace of mind. Admin only.
- **Where**: Settings > Export > **Inventory book**, and the item list's Export menu.
- **Options**: scope (everything or the current filter), group by location or by category, include
  photos (printable only), include custom fields, include tags, include loans, include **retired
  items** as their own section, include phone numbers (off by default), household name and date on
  the cover (from settings).
- **Excel (.xlsx)**: generated server-side with a pinned `openpyxl` in write-only mode. Sheets:
  **All items** (common columns: id, name, category, location path, tags, expiry, status, taken
  out to, due, created, updated), one sheet **per category** with that category's custom fields as
  columns, **Locations**, **Loans**, **Retired**, **Tags**. Real date cells, header row frozen,
  autofilter, sensible column widths, sheet names sanitised and cut to 31 characters. Formula-leading
  characters escaped exactly as in the v1 export. **No quantity column.**
- **Printable book**: a client-rendered page at `/book` with a cover page, a contents index by
  group, one section per location or category with page breaks, small thumbnails, and a print
  stylesheet (A4 and Letter). The user chooses **Print > Save as PDF** in the browser; the app does
  not ship a PDF engine, which keeps it light. The export dialog says so in plain words.
- Never included: PINs, hashes, activity history, attachments' contents, cookies.
- Exports are logged as a `system` activity event with the chosen options (not the data).
- API: `GET /admin/export/book.xlsx` (query options above, streamed from a temp file),
  `GET /admin/export/book-data` (JSON for the printable page).

### 5.20 Contacts for lending (P1)
A small address list for people who borrow things, separate from household profiles.
- **Contacts page** (nav under "More") and Settings shortcut: name (required), phone (optional),
  note (optional). Search box. Each row shows the person's name and how many items they **have out
  now** (an overdue chip if any is late).
- **Contact detail**: **Has now** (items with since-date, due date, overdue chip, tap to open),
  **Returned before** (last 20 loans, read from activity), phone shown as a `tel:` link and a copy
  button, note, Edit, Deactivate. The app never dials, texts, or syncs contacts; the `tel:` link
  just hands the number to the device.
- **Borrower picker** (shared component, used in the taken-out dialog and bulk "Set taken out"):
  three tabs, **People** (profiles), **Contacts** (with "Add new contact" inline), **Someone else**
  (free text for one-off guests). Exactly one of `taken_by_profile_id`, `taken_by_contact_id`, or
  `taken_by` text is stored.
- **Currently out** view and the dashboard card can **group by person**.
- Existing v1 `taken_by` text is left alone. On the Contacts page a P2 helper **"People already
  named in loans"** lists distinct old text values with a one-tap "Make contact".
- Phone validation is loose (digits, spaces, `+ - ( )`, 5 to 20 characters); stored as text.
  **Viewers never receive phone numbers** (the server strips them), and phone numbers never appear
  in activity, logs, the wall display, or the offline copy for Viewers.
- Contacts with loan history are **deactivated, never deleted**. Admin can delete a contact that
  has no history. Deactivating a contact who still has items out shows a warning first.
- API: `GET/POST /contacts`, `PUT/DELETE(deactivate) /contacts/{id}`, `GET /contacts/{id}/loans`;
  `POST /items/{id}/taken` accepts `taken_by_contact_id`.

### 5.21 Wall display mode (P2)
A read-only screen for a kitchen tablet.
- **Setup**: Settings > People > **Add display profile** (creates, for example, "Kitchen display":
  role Viewer, no PIN, `is_display = 1`, device cookie lasting 365 days). Open `/wall` on the tablet
  once, pick that profile; the device then stays signed in as the display.
- **Server limits**: a display profile can call only `GET /wall` and `GET /profiles/me` (see
  section 4). Everything else returns 403, so a stolen display cookie exposes only what the screen
  already shows.
- **Content**: clock and date, **Overdue** reminders, **Due soon** reminders, and **Out now** (item,
  who has it, since, due date, overdue chip with text and icon, never colour alone). Optional small
  thumbnails. No phone numbers, no links, no buttons, no snooze or dismiss.
- **Behaviour**: polls `GET /wall` every `wall_refresh_seconds` (60, minimum 30); after 3 failed
  polls it shows "Last updated 14:32. Server not reachable." in a banner and keeps the last data.
  A **Go full screen** button (needs a tap), the Screen Wake Lock API where available (secure
  context only), and README guidance for plain HTTP (set the tablet to stay awake while charging
  or use a kiosk app). Optional **night dim** window (`wall_night_dim_from` to `wall_night_dim_to`)
  and a slow few-pixel layout drift to avoid screen burn-in.
- **Settings > Display**: choose sections shown, refresh interval, night dim, thumbnails on or off.
- The wall layout honours the profile's large-text and high-contrast settings (5.22).
- API: `GET /wall` returning `{overdue, due_soon, taken_out, generated_at, household_name}` for
  active items only.

### 5.22 Large-text and high-contrast modes (P1)
For family members who need bigger, clearer screens. Applies to every v1 and v2 screen.
- **Where**: the profile menu > **Display** (any role can change their own), also settable by an
  Admin for another person (Settings > People > edit), and as a **device-level quick toggle on the
  "Who's using?" screen** (kept in localStorage) so it works before anyone is chosen.
- **Text size**: 100%, 125%, or 150% (`profiles.text_scale`). Implemented in one place as a theme
  built by `buildTheme({ accent, textScale, highContrast, mode })`; sizes use `rem`. At 125% and
  150% touch targets are at least 48 px, DataGrid row height and density scale with the text,
  dialogs and forms reflow so nothing needs horizontal scrolling at 200% browser zoom or 360 px
  width, and no label is truncated without a way to read it in full.
- **High contrast** (`profiles.high_contrast`): a palette where body text meets at least 7:1 and
  UI boundaries and icons at least 3:1, visible 3 px focus rings, visible borders on cards, inputs,
  and chips, no light-grey secondary text, and **status never conveyed by colour alone** (overdue,
  due soon, retired, and missing always carry an icon and a word).
- **Theme mode**: system, light, or dark; honour `prefers-contrast` and `prefers-reduced-motion`
  by default for new profiles.
- Print stylesheets (labels, book, box lists) ignore these modes and print at their designed size.
- API: `PUT /profiles/me/prefs` (accent, language, text scale, contrast, theme mode);
  `PUT /profiles/{id}/prefs` for Admin.
- Tests: unit tests assert the generated palettes meet the contrast ratios; Playwright runs `axe`
  in four modes (default, large text, high contrast, both) on six key pages with no serious or
  critical violations.

### 5.23 Per-profile accent colour and default language (P2)
- **Accent colour**: choose from 8 contrast-checked presets or a custom hex. The theme derives the
  button text colour and, if the chosen colour fails 4.5:1 against the surface in the current mode,
  adjusts it and shows a note "Adjusted for readability". The accent never changes the avatar
  colour (`profiles.color`).
- **Language**: each profile has a default language (`profiles.language`, empty = household
  default); the Admin sets `household_language` in Settings and in the first-run wizard, and it is
  used on the "Who's using?" screen, for new profiles, and for server-generated text (the digest,
  the printable This-week page).
- **Mechanics**: all UI strings go through one `t()` function backed by **bundled** JSON message
  catalogs under `frontend/src/i18n/locales/` (no network). Reuse v1's i18n approach if it has one;
  otherwise use a small catalog loader and record the choice in `docs/V2_DECISIONS.md`. Dates,
  numbers, and plurals use `Intl`; the first day of the week follows the locale. Missing keys fall
  back to English. API errors carry stable codes and the client translates them.
- Adding a language is documented as: copy `en.json`, translate, register the locale code, run
  `npm run i18n:check` (lists missing and unused keys).

### 5.24 Second-copy backup (P1)
Protects against the server's own disk failing.
- **Settings > Backup > Second copy** (Admin): enable, **folder path** (absolute path to a mounted
  USB drive or network share), **keep last N copies** (default 14), **Test** (writes and deletes a
  small test file and reports free space), **Copy now**, and status ("Last copy: 3 Nov 02:10, OK" or
  the last error).
- **Job**: the nightly local backup stays exactly as in v1. The second-copy job runs shortly after
  it (the scheduler registers it at the nightly backup time plus 10 minutes, so no v1 file needs
  editing) and copies the newest local backup zip if it has not been copied yet.
- **Safe copying**: refuse a path inside the app's own data folder; check free space is at least
  twice the zip size; write to `<name>.part`, then rename; verify size and SHA-256; **prune only
  files that match the app's own backup name pattern** in that folder and never touch anything else
  on the drive.
- **Failures never block anything**: a missing or read-only drive is logged as a `system` activity
  event (and a recovery logged once when it works again, not every night), shows a status line in
  Settings, and shows an Admin banner on the dashboard after 2 missed nights. The job retries the
  next night and on **Copy now**.
- **Restore from second copy**: Settings > Restore lists the zips found in the second-copy folder
  next to "Upload a backup file", with the usual confirmation and the pre-restore backup.
- README notes (A5): mounting a USB drive on a Raspberry Pi (use `nofail` in `fstab` so boot never
  hangs), mounting an SMB or NFS share at the OS level, and Docker bind-mounts. The app does not
  speak SMB or any network protocol itself. Help text says backups contain photos and contact
  phone numbers, so keep the drive at home.
- API: `GET/PUT /admin/second-copy`, `POST /admin/second-copy/test`,
  `POST /admin/second-copy/run`, `GET /admin/second-copy/files`.

### 5.25 Offline read-only mode (P2)
Browse the inventory when the server is switched off or the Wi-Fi is down. Browsing only; there is
no offline writing (the audit state and the capture upload queue already keep their own local
state).
- **Needs HTTPS.** Service workers only run in a secure context. The app checks
  `window.isSecureContext && 'serviceWorker' in navigator`. On plain HTTP the toggle is disabled
  with the sentence "Offline copy needs HTTPS. See the HTTPS guide." and a link to
  `docs/V2_HTTPS.md`. The certificate must be **trusted by each device**, otherwise the browser
  refuses to register the service worker.
- **Opt-in per device**: profile menu > **Keep an offline copy on this device** (any role except
  display profiles). Admin switch `offline_enabled` (default on, effective only on HTTPS) and
  `offline_max_items` (default 20,000). Showing size and last sync time, with **Clear offline
  copy**. Logging out or switching profile **wipes** the copy, which is keyed by profile id and
  schema version. A help note says an offline copy puts household data on that device.
- **What is cached**: the app shell (precache, versioned with the build), a **snapshot** of active
  items (with tags, category, location path, custom field values, taken-out status), locations,
  categories, tags, field definitions, computed reminders, and (Member and Admin only) contacts;
  item thumbnails (runtime cache, capped around 50 MB, oldest evicted first). Not cached: full-size
  photos, attachments, activity history, settings, anything for Admin screens. Viewers never get
  phone numbers.
- **Sync**: `GET /offline/snapshot` on first enable, then `GET /offline/changes?cursor=` (changed
  rows plus tombstones for deleted, retired, or inbox-moved items) on app open and every 6 hours
  while open. The snapshot carries a schema version so a migration forces a clean re-download.
- **Offline behaviour**: a persistent banner "Offline. Showing a copy from 14:32. Read-only."; the
  data layer falls back to the local snapshot for a **whitelist** of GET routes (item list with
  search, filters and tags, item detail, location tree, categories, tags, reminders, contacts);
  every write control is hidden because `useCan()` returns false while offline; pages that need the
  server show "Not available offline". Search runs client-side against the snapshot. Reminder
  status is recomputed on the device by a TypeScript mirror of the server rules, tested against the
  shared **golden fixtures** file `backend/tests/fixtures/reminders_golden.json` (the lead creates it
  in Phase 0 from the boundary cases in the C4 notes; C4 may extend it).
- Implementation: `vite-plugin-pwa` (Workbox) or a hand-written service worker, with pinned
  versions; web app manifest so it can be installed; IndexedDB for the snapshot. The service worker
  caches only the app's own origin and never intercepts `/api` writes.
- API: `GET /offline/snapshot`, `GET /offline/changes?cursor=`.

---

## 6. API additions (the lead writes stubs and OpenAPI in Phase 0)

All under `/api`, same error format as v1. Every route declares a permission.

- **People:** `GET/POST /profiles`, `PUT/DELETE(deactivate) /profiles/{id}`,
  `POST /profiles/select` (with optional PIN), `GET /profiles/me`, `POST /profiles/logout`,
  `PUT /profiles/me/prefs`, `PUT /profiles/{id}/prefs`
- **Activity:** `GET /activity` (filters: `actor_id, entity_type, entity_id, action, from, to, q,
  batch_id, cursor`), `GET /items/{id}/activity`, `GET /locations/{id}/activity`,
  `POST /activity/{id}/revert`
- **Tags:** as in 5.3
- **Bulk:** `POST /items/bulk`, `POST /items/bulk/preview`, `POST /batches/{batch_id}/undo`
- **Reminders:** as in 5.5; `PUT /fields/{id}` accepts `remind, remind_lead_days,
  remind_offset_days`; `PUT /categories/{id}` accepts `expiry_lead_days`
- **Loans:** `POST /items/{id}/taken` accepts `taken_due, taken_by_profile_id,
  taken_by_contact_id`
- **Attachments:** `POST /items/{id}/attachments`, `GET /attachments/{id}/file`,
  `PUT /attachments/{id}`, `DELETE /attachments/{id}`
- **Audit:** `POST /audits` (start), `GET /audits/{id}`, `PUT /audits/{id}/found`,
  `POST /audits/{id}/finish`, `GET /locations/{id}/audits`
- **Trash:** `GET /trash`, `POST /trash/{type}/{id}/restore`, `DELETE /trash/{type}/{id}`,
  `POST /trash/empty`
- **Search:** `GET /search/quick`
- **Import / webhook (Admin):** `POST /admin/import-csv` (`dry_run`), `POST /admin/webhook-test`
- **Saved filters (P2):** `GET/POST /saved-filters`, `DELETE /saved-filters/{id}`
- **Inbox:** `POST /inbox`, `GET /inbox`, `POST /inbox/{id}/sort`, `POST /inbox/bulk`,
  `DELETE /inbox/{id}`
- **Retire:** `POST /items/{id}/retire`, `POST /items/{id}/unretire`, `GET /items?status=`
- **Data health:** `GET /health`, `GET /health/{check}`, `POST /health/ignore`,
  `DELETE /health/ignore/{id}`
- **Contacts:** `GET/POST /contacts`, `PUT/DELETE(deactivate) /contacts/{id}`,
  `GET /contacts/{id}/loans`
- **Moving:** `GET/POST /moves`, `PUT /moves/{id}`, `POST /moves/{id}/finish`,
  `GET/POST /moves/{id}/boxes`, `GET/PUT/DELETE /boxes/{id}`, `POST/DELETE /boxes/{id}/items`,
  `POST /boxes/{id}/pack`, `POST /boxes/{id}/unpack`
- **Labels:** `GET/POST /label-templates`, `PUT/DELETE /label-templates/{id}`,
  `POST /label-templates/{id}/default`
- **Book export (Admin):** `GET /admin/export/book.xlsx`, `GET /admin/export/book-data`
- **Wall:** `GET /wall`
- **Second copy (Admin):** `GET/PUT /admin/second-copy`, `POST /admin/second-copy/test`,
  `POST /admin/second-copy/run`, `GET /admin/second-copy/files`
- **Offline:** `GET /offline/snapshot`, `GET /offline/changes`

---

## 7. Repository ownership map (v2 additions)

```
backend/app/
  routers/  profiles.py tags.py activity.py reminders.py attachments.py audits.py trash.py search.py
            inbox.py lifecycle.py health.py contacts.py labels.py moves.py exports.py wall.py
            second_copy.py offline.py
  services/ activity.py reminders.py bulk.py permissions.py audit.py trash.py webhook.py
            visibility.py inbox.py retire.py health.py contacts.py labels.py moves.py
            book_export.py second_copy.py offline_snapshot.py
  migrations/ 002 ... 010            [lead, Phase 0]
frontend/src/features/
  people/ activity/ tags/ bulk/ reminders/ attachments/ audit/ trash/ palette/ import/
  inbox/ retire/ health/ contacts/ labels/ moves/ book/ wall/ offline/ backup/
frontend/src/theme/  frontend/src/i18n/  frontend/src/sw/
docs/ V2_MIGRATION.md V2_API.md V2_DECISIONS.md V2_REQUESTS.md V2_HTTPS.md
backend/tests/fixtures/reminders_golden.json   [lead creates, C4 may extend]
```

**Ownership rule (same as v1):** edit only your listed paths; cross-area needs go to
`docs/V2_REQUESTS.md` and you continue with a stub or mock.

**Special rule for existing v1 mutation routers** (items, locations, categories, photos, admin):
these are touched by several v2 features. To avoid merge conflicts, **only one agent (C2) edits
them, and only in Phase 2**, adding `activity.record(...)` calls and permission dependencies at
the points listed in `docs/V2_DECISIONS.md`. During Phase 1 all other agents work in their own new
files.

**Special rule for existing v1 read paths** (item list, search, dashboard, print-labels entry
point, export): C2's Phase 2 hooking pass also switches every v1 item query to
`items_visible()` and replaces v1's fixed "Print labels" action with the D7 label dialog, at the
points listed in `docs/V2_DECISIONS.md`.

---

## 8. Execution order and parallel agents

### Phase 0: Foundation (lead only, sequential)
1. Read v1 code and docs; run all v1 tests; record the baseline in `docs/V2_DECISIONS.md`. Decide
   the inbox placeholder and location approach (5.14) and record it.
2. Look up and pin any new dependency versions (for example `@dnd-kit` already present;
   `apscheduler` if not already; `python-magic` or equivalent for content sniffing; `openpyxl`;
   `vite-plugin-pwa` or Workbox; a QR library only if v1 has none). Do not guess versions.
3. Write migrations 002 to 010 and the **migration runner upgrade** (backup first, transactional,
   failure screen) per section 2. Rehearse on a 2,000-item test copy (gate).
4. Write stub routers for every endpoint in section 6 (501), final Pydantic schemas, regenerate
   `docs/openapi.json` and the frontend types.
5. Write `backend/app/services/permissions.py` (`require(...)`, including the display-profile
   rule), `services/visibility.py` (`items_visible()`), the route-permission test, and the
   visibility test from section 3.
6. Write the first version of `backend/tests/fixtures/reminders_golden.json`.
7. Create one branch or worktree per agent.
8. **Gate:** v1 tests pass on the migrated copy; OpenAPI regenerated; frontend still builds.

### Phase 1: Parallel build

| Agent | Builds | Owns |
|---|---|---|
| **C1 backend-people** | profiles, selection, PINs, roles, last-admin guard, session cookie with profile, display profiles, display preferences endpoints | `routers/profiles.py`, auth changes in `core/` |
| **C2 backend-activity** | `services/activity.py`, activity endpoints, retention job, revert logic, batch undo engine | `routers/activity.py`, `services/activity.py`, `services/bulk.py` (undo part) |
| **C3 backend-tags-bulk** | tags API, `/items/bulk` + preview (including `retire` and `add_to_box` actions), filters by tag | `routers/tags.py`, `services/bulk.py` (actions) |
| **C4 backend-reminders** | reminder computation, snooze/dismiss, count, digest job, webhook, loans due logic, golden fixtures | `routers/reminders.py`, `services/reminders.py`, `services/webhook.py` |
| **C5 backend-files** | attachments, audits, trash, quick search, CSV import | `routers/attachments.py audits.py trash.py search.py`, matching services |
| **C6 backend-capture-lifecycle** | inbox, retire and unretire, data health, contacts, loan borrower rules | `routers/inbox.py lifecycle.py health.py contacts.py`, `services/inbox.py retire.py health.py contacts.py` |
| **C7 backend-print-export** | label templates, moving-house mode, Excel inventory book and book data | `routers/labels.py moves.py exports.py`, `services/labels.py moves.py book_export.py` |
| **C8 backend-resilience** | wall data endpoint, second-copy backup job and endpoints, offline snapshot and changes | `routers/wall.py second_copy.py offline.py`, `services/second_copy.py offline_snapshot.py` |
| **D1 frontend-people-shell** | profile picker, switcher, role gating hook `useCan()`, command palette, notification bell shell, profile Display menu (text size, contrast, accent, language, theme) and device-level quick toggle | `features/people/`, `features/palette/`, `layout/` additions |
| **D2 frontend-activity** | timelines in detail dialogs, Activity page, revert, batch rows | `features/activity/` |
| **D3 frontend-tags-bulk** | tag chips and manager, DataGrid selection, action bar, preview dialog, undo snackbar | `features/tags/`, `features/bulk/` |
| **D4 frontend-reminders** | reminder centre, banner, snooze UI, form-builder "Remind me" additions, dashboard cards, loans UI, wall display page | `features/reminders/`, `features/wall/`, dashboard files |
| **D5 frontend-files-audit** | attachments tab, audit mode, trash page, CSV import wizard | `features/attachments/ audit/ trash/ import/` |
| **D6 frontend-capture-lifecycle** | capture view and upload queue, Inbox page, Retire dialog and Retired page, Data health page, Contacts pages, `BorrowerPicker` | `features/inbox/ retire/ health/ contacts/` |
| **D7 frontend-print-export** | label designer and print flow, moving-house screens and unpack mode, inventory book export UI and printable `/book` page | `features/labels/ moves/ book/` |
| **D8 frontend-access-offline** | theme builder (text scale, contrast, accent), i18n loader and `i18n:check`, offline mode (service worker, snapshot store, data-layer fallback, banner), second-copy backup settings UI | `theme/`, `i18n/`, `sw/`, `features/offline/`, `features/backup/` |

Frontend agents code against regenerated types and MSW mocks (one mock file per feature under
`frontend/src/api/mocks/v2/`).

**Shared interfaces (written by the lead in Phase 0):**
```ts
// features/people/index.ts
export function useCurrentProfile(): { profile: Profile | null; can: (perm: Permission) => boolean };
export function ProfileChip(props: { profileId?: number | null; name?: string }): JSX.Element;
export function ProfilePicker(props: { value?: number | null; onChange: (id: number | null) => void; allowGuest?: boolean }): JSX.Element;

// features/tags/index.ts
export function TagChips(props: { tags: Tag[]; max?: number }): JSX.Element;
export function TagEditor(props: { value: Tag[]; onChange: (tags: Tag[]) => void }): JSX.Element;

// features/bulk/index.ts
export function useBulkSelection(): { selected: Set<number>; mode: 'ids' | 'filter'; ... };
export function BulkActionBar(props: { selection: ...; filter: ItemFilter; onDone: () => void }): JSX.Element;

// features/contacts/index.ts
export type Borrower = { kind: 'profile' | 'contact' | 'guest'; id?: number; name: string };
export function BorrowerPicker(props: { value?: Borrower | null; onChange: (b: Borrower | null) => void }): JSX.Element;
export function ContactChip(props: { contactId?: number | null; name?: string }): JSX.Element;

// theme/index.ts
export function buildTheme(prefs: { accent?: string; textScale: 100 | 125 | 150; highContrast: boolean; mode: 'system' | 'light' | 'dark' }): Theme;

// features/offline/index.ts
export function useOffline(): { isOffline: boolean; lastSync: Date | null; enabled: boolean; supported: boolean };
```

### Phase 2: Integration (lead + C2 + two short-lived agents)
1. Merge order: Phase 0 -> C1 -> C2 -> C3 -> C4 -> C5 -> C6 -> C7 -> C8 -> D1 -> D2 -> D3 -> D4 ->
   D5 -> D6 -> D7 -> D8. Run tests after each merge.
2. **C2 hooking pass:** add `activity.record(...)` and permission dependencies to the v1
   mutation routers at the points listed in `docs/V2_DECISIONS.md`; switch v1 item queries to
   `items_visible()`; swap v1's Print labels entry point for the D7 dialog; add tests proving every
   mutating endpoint creates exactly one activity event (or one batch) and that the visibility
   test passes.
3. **I1 contract-checker:** diff the running OpenAPI against `docs/openapi.json`; regenerate types;
   zero TypeScript errors; remove production MSW.
4. **I2 e2e agent:** write and run the journeys in section 10.

### Phase 3: Hardening and delivery (parallel)
- **A5 devops (update):** README upgrade guide ("back up, update, start, migration runs
  automatically"), Docker image update, notes for scheduler time zone (`TZ` env), webhook examples
  for a LAN ntfy or Home Assistant instance, **`docs/V2_HTTPS.md`** (how to serve the app over
  HTTPS on a LAN: a local certificate authority such as mkcert or a reverse proxy with an internal
  CA, installing the CA on phones and tablets, why untrusted certificates block offline mode and
  camera scanning, and the app's own TLS option if v1 has one or the one added for v2), second-copy
  drive and share mounting notes (Raspberry Pi `fstab` with `nofail`, SMB or NFS at OS level,
  Docker bind-mounts), and kitchen tablet setup (stay-awake settings, kiosk app, wall display).
- **R1 reviewer:** read-only review for permissions bypass (especially display profiles and phone
  number stripping for Viewers), activity gaps, migration safety, visibility leaks (inbox, retired,
  trash items appearing in lists, exports, labels, or the offline snapshot), and constraint
  violations; writes `docs/V2_REVIEW.md`.
- **P1 polish:** empty states for every new page, 360 px layout pass, dark mode pass, large-text and
  high-contrast pass, copy review.

---

## 9. Spawn brief template

```
ROLE: <C3 backend-tags-bulk>
GOAL: <one sentence from section 8>
CONTEXT: Read this SKILL.md sections 1 to 6 and the part of 5 that covers your area; read
         docs/V2_DECISIONS.md, docs/V2_API.md, docs/openapi.json, and the v1 docs.
BRANCH: <branch / worktree>
YOU OWN (edit freely): <paths from section 8>
READ-ONLY: migrations, docs/, shared interfaces, everything not listed
DO NOT: change the contract, edit v1 mutation routers (C2 does that in Phase 2), add stock or
        quantity features, call external networks, add dependencies without a note in
        docs/V2_REQUESTS.md.
TESTS: write and run your own tests (`pytest -q backend/tests/<area>` or
       `npm run test -- <area>`); all must pass; do not break existing v1 tests.
ACCEPTANCE: the checklist in section 11 for your area.
REPORT BACK (max 25 lines): done, stubbed, test results, requests added, uncertainties.
```

### Per-agent focus notes
- **C1:** permission dependency used everywhere; profile cookie signed and HttpOnly; PIN rate limit
  per profile; cannot remove the last Admin; inactive profiles cannot log in but keep history;
  display profiles forced to Viewer, no PIN, 365-day cookie, and limited to `wall:read`; prefs
  endpoints validate accent (hex or preset id), language (must be an installed locale), text scale
  (100, 125, 150).
- **C2:** one function to record events; supports batches; diff builder that understands custom
  field keys; revert only for move and taken-out; retention prune; a test that a rolled-back
  transaction leaves no activity; never record phone numbers.
- **C3:** bulk executes in one transaction with per-item skip reasons; preview uses the same code
  path as execute (dry-run flag) so the preview cannot disagree with the result; tag merge keeps
  links unique; `retire` skips items that are out on loan; `add_to_box` respects the one-active-box
  rule and skips with a reason.
- **C4:** pure functions computing reminders from rows (easy to unit test); boundary tests for
  today, window edge, yesterday, leap day, offset arithmetic; digest job idempotent per day;
  webhook timeout 5 seconds, no retries storm, SSRF guard (only the configured URL, allow private
  ranges since LAN is the point, block redirects to other hosts); reminders only for active items;
  keep the golden fixtures file in sync with the rules because the offline TypeScript mirror is
  tested against it.
- **C5:** content-sniffed uploads; audit state transitions; audits skip retired and inbox items and
  list boxed items as "In a box"; trash purge removes files; CSV dry-run identical logic to the real
  import; quick search limited and indexed and active-only.
- **C6:** inbox capture is idempotent on `client_id`; sort runs the same validation as create;
  retire and unretire are single transactions with exactly one activity event; health checks are
  indexed queries with paging and a 60 second cache, and share one name-normalisation function with
  the P2 duplicate warning; contacts strip phone numbers for Viewers at the serializer level and
  never write them to activity or logs; borrower rule enforces exactly one of text, profile, or
  contact.
- **C7:** label templates validated (mm ranges, sheet grids that fit the page, known layouts and
  field ids); moves enforce one active move and one active box per item; unpack goes through the
  bulk move engine so it is one undoable batch; the Excel exporter streams in write-only mode,
  escapes formula characters, caps sheet names at 31 characters, has no quantity column, and
  excludes retired items unless asked; a test compares sheet row counts to the database.
- **C8:** `GET /wall` returns active items only and no phone numbers; the second-copy job is
  idempotent (tracks the last copied file), refuses paths inside the data folder, checks free
  space, writes `.part` then renames, verifies SHA-256, prunes only files matching the app's own
  name pattern, and never raises into the scheduler; offline changes endpoint returns tombstones
  for deleted, retired, and inbox-moved items; the snapshot respects the caller's role.
- **D1:** `useCan()` hides actions the role cannot perform, but the server is the source of truth;
  palette registers actions from each feature via a small registry; the Display menu applies changes
  instantly through `buildTheme` and saves via the prefs endpoint; the device-level quick toggle
  works before a profile is chosen.
- **D2:** readable sentences generated from events in one `describeEvent()` function with unit
  tests (including the new `captured`, `sorted`, `retired`, `unretired`, `packed`, `unpacked`
  events); infinite scroll with cursor.
- **D3:** selection survives pagination (ids mode) and "select all matching" (filter mode); preview
  dialog is mandatory for every bulk action, including Retire and Add to box.
- **D4:** "Remind me" controls inside the form builder (coordinate via the lead if the builder
  file is owned by v1 code: add a small extension point `fieldExtras` instead of editing it); the
  wall page has no links or buttons, handles failed polls, and supports night dim.
- **D5:** audit state persisted in IndexedDB or localStorage until Finish; scan component reused
  from v1; import wizard with clear error table.
- **D6:** capture view uses the file-input `capture` approach (works without HTTPS); upload queue in
  IndexedDB with `client_id` idempotency and a visible waiting count; Inbox "Next in inbox" flow;
  Retire dialog shared by item menu, detail, bulk, data health, and the box screen; health
  duplicates shown as groups with no merge action; `BorrowerPicker` exported through the shared
  interface.
- **D7:** designer preview at true millimetre scale; warnings for shortened text and small QR; print
  through `@page` rules and test with Playwright `page.pdf()` page size; box labels, contents lists,
  and the move summary print cleanly; `/book` has a cover, contents index, per-group page breaks,
  and an honest "use Print > Save as PDF" hint; unpack mode keeps tick state in the browser until
  done.
- **D8:** one `buildTheme()` used everywhere (no component hard-codes colours or font sizes);
  contrast unit tests; `t()` wrapper and `npm run i18n:check`; offline mode feature-detects secure
  context, wipes on logout or profile switch, whitelists GET routes for the snapshot fallback, hides
  write controls while offline, mirrors the reminder rules in TypeScript and tests them against the
  golden fixtures; the service worker never touches `/api` writes; second-copy settings page shows
  the Test result, free space, last status, and Copy now.

---

## 10. End-to-end journeys (Playwright)

1. **Upgrade:** open a v1 database -> start v2 -> backup created -> wizard -> items, photos, and
   locations intact (counts match).
2. **Profiles and roles:** create Member and Viewer profiles -> Viewer cannot see edit buttons and
   API calls are rejected with 403 -> Member cannot open Settings.
3. **Activity:** Member moves an item -> timeline shows "moved from ... to ..." with their name ->
   revert -> logged -> global feed shows both.
4. **Tags and bulk:** tag 5 items `kitchen` -> filter by tag -> select all matching -> bulk move ->
   preview shows 5 -> confirm -> one expandable batch row in the feed -> undo restores locations.
5. **Reminders:** set a Warranty end date field to remind 30 days before -> an item with a date in
   20 days appears under Due soon -> snooze 1 week as profile A -> still visible for profile B ->
   dismiss -> gone for A.
6. **Opened-on offset:** Medicines "Opened on" with +28 offset -> item opened 27 days ago shows
   due tomorrow.
7. **Loans:** take out with due yesterday -> Overdue chip and dashboard card -> return -> cleared.
8. **Attachments:** upload a PDF -> preview opens -> backup and restore keeps it.
9. **Audit:** start audit on a shelf with 4 items -> tick 3, scan a stray item from another shelf and
   move it here -> finish -> summary shows 1 missing, 1 misplaced; audit listed on the location.
10. **Trash:** delete an item -> appears in Trash -> restore; delete a location with a deleted
    parent -> restore asks for a destination.
11. **Palette:** Ctrl+K -> type an item name -> Enter opens it; mobile search icon works.
12. **Import:** CSV with one bad dropdown value -> dry run lists it -> import with "add option" ->
    undo from the Activity page.
13. **Mobile:** run journeys 4, 5, 14, and 22 at 390 px wide; no overflow.
14. **Quick capture:** at 390 px, capture 3 photos with an "I'm at Kitchen > Shelf 2" location (one
    while the network is switched off, then back on) -> Inbox badge shows 3, no duplicates -> none
    appear in the item list, search, dashboard totals, or reminders -> sort one (it appears in the
    list) -> bulk set category and tags on the other two -> inbox empty.
15. **Retire:** retire an item as Donated with a date and note -> it leaves the list, search,
    dashboard totals, reminders, and audit expectations -> it appears on the Retired page with its
    history -> scanning its QR shows the retired banner -> Bring back restores it. An item that is
    taken out is skipped by bulk retire with a clear reason.
16. **Data health:** seed an item with no location, one with no photo, one expired 200 days ago, a
    duplicate pair, and an old inbox item -> counts match -> ignore one finding and mark the pair
    "Not a duplicate" -> both stay ignored after reload -> bulk-move the no-location items -> the
    count drops.
17. **Moving house:** start a move, create 2 boxes, add 5 items by bulk -> items show box chips and
    the audit lists them as "In a box" -> print a box label and contents list (`page.pdf()` size and
    content checks) -> mark packed -> unpack at a location -> items moved in one batch -> undo
    restores them.
18. **Label designer:** create a 50 x 30 mm template with QR, name, location, and expiry -> preview
    shows no overflow warning for a normal item and a shortened-text warning for a very long name ->
    print preview page size is 50 x 30 mm -> an A4 sheet template with "start at position 5" skips
    the first 4 slots.
19. **Inventory book:** export Excel -> open with `openpyxl`: expected sheets, row counts equal the
    database (retired excluded by default), no quantity column, formula-leading values escaped ->
    printable `/book` renders a contents index and page breaks per location.
20. **Contacts and loans:** add a contact with a phone number -> take an item out to them with a due
    date -> the contact page shows it under Has now -> return it -> it appears under Returned
    before -> as Viewer the phone number is absent from the page and the API response.
21. **Wall display:** create a display profile -> sign in on a second browser context -> `/wall`
    shows overdue reminders and out-now items -> any other API call returns 403 -> change an item
    on the main context and the wall updates within the refresh interval (set to 30 seconds) -> stop
    the server and the "Server not reachable" banner appears with the last data kept.
22. **Display preferences:** set one profile to 150% text, high contrast, a custom accent colour, and
    a different language -> the settings persist after signing in on another device -> axe finds no
    serious or critical issues on six key pages in all four modes -> no horizontal scroll at 360 px
    with 150% text.
23. **Second copy:** set the folder to a temporary directory -> Test passes -> Copy now creates a zip
    with a matching SHA-256 -> older copies pruned to the keep count while an unrelated file in the
    folder is untouched -> make the folder read-only -> failure shown in Settings and logged once,
    local backup unaffected -> restore from the second copy lists the zip.
24. **Offline:** on an HTTPS test server (trusted test certificate): enable the offline copy -> go
    offline (`context.setOffline(true)`) and reload -> browse, search, and open item detail with the
    read-only banner and no edit controls -> go online and a changed item syncs. On plain HTTP the
    toggle is disabled with the HTTPS explanation. Logging out wipes the copy.

---

## 11. Acceptance checklist

**Migration and safety**
- [ ] Pre-migration backup always created; failed migration leaves data untouched.
- [ ] 2,000-item rehearsal passes through migrations 002 to 010; v1 test suite still green.
- [ ] A v1 backup restores into v2; a v2 backup is refused by older versions with a clear message.

**Permissions and history**
- [ ] Route-permission test passes (no undeclared routes); viewers get 403 on any write.
- [ ] Display profiles get 403 on everything except `GET /wall` and `GET /profiles/me`.
- [ ] Every mutating endpoint writes exactly one activity event or one batch; rolled-back
      transactions write none.
- [ ] No PINs, hashes, cookies, or phone numbers appear in activity, logs, or exports (phone numbers
      only in the Excel book when the Admin turns that option on, and in the LAN digest).
- [ ] Last Admin cannot be removed; deactivated profiles keep their history names.

**Features**
- [ ] Tags: create, merge, filter any/all, 20-per-item limit enforced.
- [ ] Bulk: preview equals result; undo works for move, taken-out, tags, expiry, retire, delete.
- [ ] Reminders: expiry, field, offset, and loan sources correct on boundary dates; snooze and
      dismiss are per profile; webhook is off by default and only calls the configured URL.
- [ ] Attachments: sniffed, size-limited, inline preview for PDF and images, in backups.
- [ ] Audit: found/missing/misplaced summary correct; boxed items listed separately; state survives
      a Wi-Fi drop.
- [ ] Trash: restore and auto-purge (with file cleanup) work.
- [ ] Palette, dashboard, CSV import, saved filters (P2) behave as specified.
- [ ] Inbox: capture works on plain HTTP; uploads are queued and idempotent; inbox items appear
      nowhere except the Inbox page, the dashboard card, and Data health; sorting validates like
      create.
- [ ] Retire: all four reasons with date and note; retired items excluded from lists, search,
      totals, reminders, audits, labels, and exports (unless included); history and attachments
      kept; QR scan shows the retired banner; Bring back works.
- [ ] Data health: all five checks correct; ignores persist; no merge action exists.
- [ ] Moving: one active move; one active box per item; unpack is one undoable batch; box labels
      and contents lists print without quantities.
- [ ] Label designer: templates validated; preview at true size; page size correct in print; sheet
      start position and calibration offsets work.
- [ ] Inventory book: Excel opens with expected sheets and row counts; formula characters escaped;
      printable book has cover, index, and page breaks; no quantity column.
- [ ] Contacts: borrower picker stores exactly one borrower type; group by person works; Viewers
      never see phone numbers; contacts with history can only be deactivated.
- [ ] Wall display: read-only, no links, refreshes, handles failed polls, honours text and
      contrast settings, shows no phone numbers.
- [ ] Display modes: contrast ratios met in unit tests; axe clean in four modes; 48 px touch
      targets at 125% and 150%; status never by colour alone.
- [ ] Accent and language: accent auto-adjusts for readability; missing translations fall back to
      English; `npm run i18n:check` works; dates follow the locale.
- [ ] Second copy: Test, Copy now, checksum verified, prune touches only the app's own files,
      failures never block the local backup, Admin banner after 2 missed nights, restore from the
      second copy works.
- [ ] Offline: disabled with an explanation on plain HTTP; on HTTPS the copy syncs, browsing and
      search work offline, writes are hidden, logout wipes the copy, Viewer copies hold no phone
      numbers.

**Constraints and quality**
- [ ] No stock or quantity fields anywhere (including boxes, labels, and exports).
- [ ] Zero external network requests from the built frontend.
- [ ] Still one process, one port, one data folder; cold start under 3 seconds on Raspberry Pi 4
      class hardware; activity feed fast with 100,000 rows; data health queries fast with 5,000
      items.
- [ ] `pytest`, `vitest`, `ruff`, `eslint`, `tsc --noEmit`, and Playwright all pass.
- [ ] Mobile (360 px), dark mode, large-text, and high-contrast reviewed; README upgrade guide and
      `docs/V2_HTTPS.md` written.

---

## 12. Definition of done

The lead writes `docs/V2_BUILD_REPORT.md`: features delivered, anything skipped (especially P2
items), migration rehearsal results, known limitations (for example "background push is not
available on a plain HTTP LAN" and "offline mode and live camera scanning need HTTPS with a
certificate trusted by each device"), and the exact upgrade steps. Then tell the user in plain
language: back up, update, start the app, and what the first-launch wizard will ask.

**Defaults when the user has not said otherwise:** activity retention 365 days, trash retention
30 days, reminders digest at 08:00, snooze choices 1 day and 1 week, 20 tags per item, 10
attachments per item, webhook off, bulk limit 1,000 items per request, long-expired threshold 90
days, stale inbox 14 days, wall display refresh 60 seconds (minimum 30), second-copy keep 14
copies, text scale choices 100, 125, and 150 percent, offline copy on by default only when the app
is served over HTTPS (cap 20,000 items and about 50 MB of thumbnails), household language English.
**When in doubt, choose the simpler option, keep every admin action inside the UI, and record the
decision in `docs/V2_DECISIONS.md`.**