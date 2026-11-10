---
name: homeinventory-builder
description: Orchestrates building HomeInventory, a local-network (LAN-only) household inventory web app with no stock tracking, using React + MUI on the front end and FastAPI + SQLite on the back end. Use this skill whenever the user mentions HomeInventory, a home or household inventory app, user-defined custom form fields per category, storage-location management, QR or barcode labels for items and shelves, printing the items on a shelf, expiry tracking, or starter templates such as Medicines, Lights, Tools and Documents. It tells a lead agent how to split the work into parallel sub-agents with strict file ownership, contracts, acceptance tests, and an integration order. Use it even if the user only says "build the inventory app" or "spawn agents to build it".
---

# HomeInventory Builder

A build playbook for a **lead agent (orchestrator)** that can spawn **sub-agents** in parallel.
If you cannot spawn sub-agents, run the same roles one after another in the order given in
"Execution Order". Everything else is identical.

---

## 1. Product in one paragraph

HomeInventory is a small, lightweight web app that runs on one machine at home (Windows 11 PC,
Raspberry Pi, mini server, or Docker host). Every other device (macOS, Windows 11, Linux, Android,
iOS) opens it in a browser over the home Wi-Fi. Users organise things into **categories** (Meds,
Lights, Tools, ...), and each category has a **custom form** that the user builds inside the app.
Items live in **storage locations** (Room > Cupboard > Shelf > Box). Both items and locations can
have **photos**. The app can create **QR codes and barcodes**, **scan** them, and **print** the list
of items stored on a shelf or place. Items can have an **expiry date**. It ships with **starter
templates** (Medicines, Lights, Tools, Documents).

### Hard constraints (never violate)

1. **No stock or quantity tracking.** No counts, no reorder levels. An item is a thing that exists in
   one place and is either "in place" or "taken out".
2. **Nobody touches the backend.** There is no CLI workflow for the end user. Everything an admin
   needs (PIN, backup, restore, export, server address, expiry window, label sizes) is a screen
   under Settings.
3. **LAN only.** No cloud calls, no CDN fonts or scripts at runtime, no telemetry. The app must work
   with the internet unplugged. Bundle all assets (fonts included) at build time.
4. **Light and simple.** One process, one port, one SQLite file, one data folder. No Redis, no
   Postgres, no message queues, no Celery.
5. **Material UI (MUI) for all UI.** Responsive from phone to desktop.

### Languages used

Python (backend), TypeScript (frontend), SQL (SQLite), JSON (custom fields, backups). Minor: HTML/CSS
(print stylesheets), Dockerfile/YAML or a service file (optional deployment).

---

## 2. Tech stack (pin the latest stable versions at build time)

At the start of Phase 0 the lead looks up the current stable version of each package and pins it
in `requirements.txt` / `package.json`. Do not guess versions from memory.

**Backend**
- Python 3.12+, FastAPI, Uvicorn, Pydantic v2
- SQLAlchemy 2.x (or SQLModel) on SQLite, WAL mode, `PRAGMA foreign_keys=ON`
- Schema migrations via a simple `PRAGMA user_version` runner (numbered `.sql` files); Alembic is
  overkill here
- Pillow (thumbnails, EXIF orientation, EXIF stripping), `pillow-heif` (optional, iPhone HEIC)
- `passlib[argon2]` or `bcrypt` (PIN hash), `itsdangerous` (signed session cookie)
- `python-multipart` (uploads), APScheduler or a tiny asyncio loop (nightly backup)
- pytest, httpx (API tests), ruff

**Frontend**
- React 18+ and TypeScript, Vite
- MUI (`@mui/material`, `@mui/icons-material`), `@mui/x-data-grid` (community, MIT),
  `@mui/x-date-pickers` (community, MIT) with `dayjs`. **Do not use Pro or Premium MUI X
  features.**
- `react-router`, `@tanstack/react-query`, `react-hook-form` (+ `zod` resolver)
- `qrcode` (QR generation), `jsbarcode` (Code 128), `@zxing/browser` or `html5-qrcode` (scanning)
- `@dnd-kit/core` + `@dnd-kit/sortable` (reorder fields)
- Vitest + React Testing Library, Playwright (end-to-end), `openapi-typescript` (types from the
  API), MSW (mock API while the backend is not ready)

**Fonts / theme:** Inter for text and JetBrains Mono for numbers and codes, bundled with
`@fontsource/*`. Light and dark themes, MUI `createTheme`, one accent colour, rounded corners.

---

## 3. Repository layout (the ownership map)

```
homeinventory/
├── backend/
│   ├── app/
│   │   ├── main.py                 # app factory, mounts /api and the built frontend
│   │   ├── core/                   # config, db, security, migrations runner     [A1]
│   │   ├── migrations/             # 001_init.sql, 002_...                       [A1]
│   │   ├── models/ schemas/        # ORM + Pydantic (split by domain, see owners)
│   │   ├── routers/
│   │   │   ├── auth.py settings.py health.py        [A1]
│   │   │   ├── categories.py fields.py templates.py [A2]
│   │   │   ├── items.py locations.py dashboard.py   [A3]
│   │   │   ├── photos.py codes.py admin.py          [A4]
│   │   ├── services/               # business logic, one module per router
│   │   └── seed_templates/         # medicines.json lights.json tools.json documents.json [A2]
│   └── tests/
├── frontend/
│   └── src/
│       ├── api/                    # generated types + fetch client + MSW handlers [B1]
│       ├── theme/ layout/ routes/ auth/                                         [B1]
│       ├── features/forms/         # builder + renderer                         [B2]
│       ├── features/items/                                                      [B3]
│       ├── features/locations/ features/photos/ features/print/                 [B4]
│       ├── features/labels/ features/scan/ features/dashboard/ features/settings/ [B5]
│       └── components/shared/      # small shared pieces, owned by B1
├── data/                           # gitignored: inventory.db, photos/, backups/
├── docs/                           # API_CONTRACT.md, DATA_MODEL.md, DECISIONS.md
├── deploy/                         # Dockerfile, docker-compose.yml, service files  [A5]
└── e2e/                            # Playwright specs                              [A5]
```

**Ownership rule:** an agent edits only the paths listed for it. If it needs a change elsewhere it
writes a short request to `docs/REQUESTS.md` (who, what, why) and continues with a stub or mock.
The lead resolves requests between phases.

---

## 4. Data model (contract, created by the lead in Phase 0)

All timestamps are ISO-8601 UTC. IDs are integers. Soft delete uses `deleted_at`.

```sql
categories(id, name UNIQUE, icon, color, track_expiry BOOL, sort_order, created_at, updated_at, deleted_at)

field_defs(id, category_id FK, key TEXT,            -- stable key like "f_a1b2c3", never reused
           label, type, required BOOL, options_json, unit, hint,
           sort_order, show_in_list BOOL, archived BOOL,
           UNIQUE(category_id, key))
-- type in: text | longtext | number | date | dropdown | multiselect | checkbox

locations(id, parent_id FK NULL, name, kind, notes, sort_order,
          created_at, updated_at, deleted_at)         -- kind is free text: Room, Cupboard, Shelf, Box...

items(id, category_id FK, name, location_id FK NULL,
      taken_out BOOL, taken_by TEXT NULL, taken_at TEXT NULL,
      expiry_date TEXT NULL,                          -- YYYY-MM-DD, built-in, indexed
      notes, values_json TEXT,                        -- {"f_a1b2c3": "Tablet", "f_z9": 500}
      created_at, updated_at, deleted_at)

photos(id, owner_type CHECK IN ('item','location'), owner_id, file_name, thumb_name,
       width, height, bytes, is_cover BOOL, sort_order, created_at)

settings(key PRIMARY KEY, value_json)
-- keys: pin_hash, base_url, expiry_warn_days (30), label_preset, print_defaults,
--       theme, backup_keep (7), photo_limit_per_owner (10)
```

Indexes: `items(category_id)`, `items(location_id)`, `items(expiry_date)`, `items(taken_out)`,
`photos(owner_type, owner_id)`, `locations(parent_id)`.

**Rules**
- `values_json` is keyed by the **stable field key**, never by label, so renaming a field is safe.
- Deleting a field **archives** it (hidden in forms, data kept). A hard purge is a separate
  explicit action.
- Deleting a category that still has items is **blocked** with a clear message (offer "move items
  to another category" or "archive"). Deleting a location that still has items or children is
  blocked (offer "move contents to ...").
- Server-side validation of `values_json` against the category's active `field_defs` on every
  create and update: unknown keys rejected, required fields enforced, types coerced or rejected,
  dropdown values must be in `options_json`.
- Changing a field's `type` is only allowed between compatible types (text <-> longtext,
  dropdown <-> text). Otherwise: archive and create a new field.
- Locations form a tree; moving a location under its own descendant is rejected (cycle check).

---

## 5. API contract (summary; the lead writes the full OpenAPI in Phase 0)

All under `/api`. JSON in and out. Cookie session. Errors use
`{"error": {"code": "...", "message": "...", "fields": {...}}}`.

**Auth and settings** (A1)
- `GET /health`, `GET /auth/status` (is a PIN set, am I logged in)
- `POST /auth/setup` (first run, sets PIN or skips), `POST /auth/login`, `POST /auth/logout`,
  `POST /auth/change-pin`
- `GET/PUT /settings` (public ones like `expiry_warn_days`, `base_url`, `label_preset`)

**Categories, fields, templates** (A2)
- `GET/POST /categories`, `GET/PUT/DELETE /categories/{id}`
- `GET/POST /categories/{id}/fields`, `PUT/DELETE /fields/{id}`, `POST /categories/{id}/fields/reorder`
- `GET /templates` (list: medicines, lights, tools, documents, blank),
  `POST /templates/{slug}/apply` (creates a category and its fields, returns the category)

**Items and locations** (A3)
- `GET /items` with `q, category_id, location_id, include_sub, taken_out, expiry_status
  (expired|soon|ok|none), expiry_before, sort, order, page, page_size, f.<fieldKey>=...`
  (`q` matches name, notes, location name and custom values via `json_each`)
- `POST /items`, `GET/PUT/DELETE /items/{id}`, `POST /items/{id}/duplicate`,
  `POST /items/{id}/move` (`location_id`), `POST /items/{id}/taken` (`taken_out, taken_by`)
- `POST /items/bulk-move` (ids, location_id)
- `GET /locations/tree`, `POST /locations`, `GET/PUT/DELETE /locations/{id}`,
  `POST /locations/{id}/move`, `GET /locations/{id}/items?include_sub=true`
- `GET /dashboard` (counts per category, taken-out count, expired + soon list, recent items)
- `GET /expiring?within_days=` (flat list for the Expiry screen)

**Media, codes, admin** (A4)
- `POST /photos` (multipart: `owner_type, owner_id, file`), `GET /photos/{id}/file`,
  `GET /photos/{id}/thumb`, `PUT /photos/{id}/cover`, `POST /photos/reorder`, `DELETE /photos/{id}`
- `GET /codes/resolve?code=` -> `{type: "item"|"location", id}` (accepts `I123`, `L45`, or a
  full URL)
- `POST /admin/backup` (streams a zip: consistent DB copy + photos), `GET /admin/backups`,
  `POST /admin/restore` (zip upload; validates; auto-backup first), `GET /admin/storage`
- `GET /admin/export?format=csv|json&category_id=`, `POST /admin/import-csv?dry_run=true|false`
  (P2)

**Serving:** FastAPI mounts `frontend/dist` at `/` with SPA fallback. Same origin, so no CORS in
production. In development Vite proxies `/api` to Uvicorn.

---

## 6. Feature specification

Priority: **P0** = must ship, **P1** = should ship, **P2** = stretch.

### 6.1 Categories and the custom form builder (P0)
- Category: name, icon (MUI icon picker, ~40 curated icons), colour, `track_expiry` toggle.
- Builder screen per category: list of fields with drag-to-reorder, **Add field** dialog (label,
  type, required, options for dropdown and multiselect, unit, hint, "show in list" toggle),
  edit, archive. A **live preview** pane renders the form exactly as the add-item screen will.
- Built-in fields on every item (not removable): **Name, Location, Taken out, Notes, Photos**;
  plus **Expiry date** when the category has `track_expiry`.
- Up to 4 "show in list" fields appear as columns in that category's table.
- Renderer component map: `text -> TextField`, `longtext -> TextField multiline`,
  `number -> TextField type=number (+ unit adornment)`, `date -> DatePicker`,
  `dropdown -> Select/Autocomplete`, `multiselect -> Autocomplete multiple`,
  `checkbox -> Switch`. Adding a new type = one component + one map line.

### 6.2 Items (P0)
- Full CRUD, duplicate, soft delete with a 10-second **Undo** snackbar.
- List: MUI X DataGrid (community) with search box, filter chips (category, location, taken out,
  expiry status), sort, server-side pagination; plus a **card view** with cover photo thumbnails.
  The view choice is remembered per device.
- Detail view: large dialog with photo gallery, all fields, location breadcrumb, expiry badge,
  taken-out toggle, QR and barcode preview, "Print label" and "Move" actions.
- Taken out: one-tap toggle, optional "taken by", timestamp, and a "Currently out" filter.

### 6.3 Storage locations (P0)
- Tree view (expand/collapse) + breadcrumb navigation, kinds suggested (Room, Cupboard, Shelf,
  Drawer, Box, Bag) but free text.
- Add, rename, move (re-parent), delete with the block rules above.
- Location detail: photos, notes, items directly here, switch "include sub-locations".
- Quick actions: add item here, bulk-move selected items, print list, print label.

### 6.4 Photos for items and locations (P0)
- Reusable `<PhotoManager ownerType ownerId />` used by both. Add from gallery or **camera**
  (`<input type="file" accept="image/*" capture="environment">`), multi-select, reorder, set cover,
  delete, tap to zoom.
- Server: accept jpeg, png, webp, heic (if `pillow-heif` is present); reject others by content
  sniffing, not by extension. Max 15 MB per upload, default 10 photos per owner (setting).
  Store a resized original (long edge <= 2000 px, JPEG quality ~85) and a 400 px thumbnail under
  `data/photos/{owner_type}/{owner_id}/`. **Fix EXIF orientation, then strip all EXIF
  (especially GPS).** Random file names, never user-supplied names.
- Deleting an item or location (hard purge) removes its photo files.

### 6.5 QR codes and barcodes (P0)
- Every item and location has a short code: items `I{id}`, locations `L{id}`.
- **QR** encodes a URL: `{base_url}/#/i/{id}` or `{base_url}/#/l/{id}` so the phone's native camera
  can open the app directly. `base_url` is a Settings field, defaulting to
  `window.location.origin`, with a "use this address" button and a note recommending a router
  DHCP reservation so the address never changes.
- **Barcode** is Code 128 of the short code (`I123`), for USB or Bluetooth scanners that type like
  a keyboard.
- **Label sheet generator** (print page): choose items or a whole location, choose a preset
  (Small 40x20 mm, Medium 60x40 mm, A4 grid 3x8), label content = QR + name + code + location
  path. Printing uses the browser's print dialog (`@media print`, `@page` size), so no server
  PDF engine is required.
- **Scan screen** (`/scan`):
  1. *Camera mode* using `@zxing/browser` or `html5-qrcode`.
  2. **Important:** browsers allow live camera only on secure origins (HTTPS or localhost). Plain
     `http://192.168.x.x` does not qualify. If `window.isSecureContext` is false, hide live camera
     and show the fallbacks:
     - "Take a photo of the code" (`input capture`) decoded client-side,
     - a focused text field that accepts typed codes and **USB/Bluetooth scanner** input (Enter
       submits),
     - a short help card explaining how to enable local HTTPS (see `deploy/HTTPS.md`).
  3. On a successful scan, call `/codes/resolve` and navigate to the item or location.

### 6.6 Print the items on a shelf or place (P0)
- Route `/print/location/:id`, opened from the location detail. A print-optimised page:
  header (location name, breadcrumb, QR, date printed), then a table of items.
- Options (remembered): include sub-locations (grouped by sub-location with sub-headings),
  columns to include (name, category, selected custom fields, expiry, taken-out status, cover
  photo thumbnail), sort order, **audit checkbox column** (an empty box to tick when checking the
  shelf), font size.
- Pure CSS print rules: hide app chrome, repeat table header on each page, avoid splitting rows,
  A4 default with a Letter option. Also a "Save as PDF" hint (the browser print dialog does this).
- Also available from search results: "Print this list" for any filtered result set.

### 6.7 Expiry (P0)
- Built-in `expiry_date` (date, optional) on items in categories with `track_expiry`.
- Status computed on the server using the setting `expiry_warn_days` (default 30):
  `expired` (before today), `soon` (within the window), `ok`, `none`.
- UI: coloured chip on list rows and cards (red / amber / green), a **dashboard card** "Expiring
  soon" + "Expired", and an **Expiry screen** listing everything sorted by date with filters.
- Date arithmetic uses the server's local date; never compare timestamps with time zones for
  date-only values.
- P1: optional browser notification / in-app banner on open. No email or push (LAN only).

### 6.8 Starter templates (P0)
Templates are JSON files in `backend/app/seed_templates/`. Applying one **copies** its category and
fields into the database; afterwards the user can edit everything freely.
Field `key`s are generated on apply, not stored in the template.

**Medicines** (`track_expiry: true`, icon medication, colour red)
| Label | Type | Notes |
|---|---|---|
| Generic name | text | |
| Brand | text | |
| Form | dropdown | Tablet, Capsule, Syrup, Drops, Cream/Ointment, Injection, Inhaler, Other |
| Strength | text | hint "e.g. 500 mg" |
| Prescription needed | checkbox | |
| Used for | longtext | |
| Opened on | date | |
| Prescribed by | text | |

**Lights** (`track_expiry: false`, icon lightbulb, colour amber)
| Label | Type | Notes |
|---|---|---|
| Light type | dropdown | Bulb, Tube light, LED strip, Lamp, Fixture, Torch, Other |
| Wattage | number | unit W |
| Brightness | number | unit lm |
| Base / socket | dropdown | E27, E14, B22, GU10, G13, Built-in, Other |
| Colour temperature | dropdown | Warm white, Neutral white, Cool white, RGB |
| Smart / dimmable | multiselect | Smart, Dimmable |
| Room used in | text | |

**Tools** (`track_expiry: false`, icon construction, colour blue)
| Label | Type | Notes |
|---|---|---|
| Tool type | text | |
| Brand | text | |
| Size / spec | text | |
| Power source | dropdown | Manual, Corded, Battery, Petrol, Other |
| Condition | dropdown | New, Good, Worn, Needs repair |
| Lent to | text | |
| Purchased on | date | |

**Documents** (`track_expiry: true`, "Valid till" shown as the expiry label, icon description,
colour green)
| Label | Type | Notes |
|---|---|---|
| Document type | dropdown | ID, Certificate, Warranty, Bill/Receipt, Insurance, Agreement, Medical, Other |
| Document number | text | |
| Issued by | text | |
| Issue date | date | |
| Original or copy | dropdown | Original, Photocopy, Digital only |
| Digital copy location | text | |

Plus a **Blank** template (no fields). The "New category" screen offers "Start from template".
Category has an optional `expiry_label` ("Expiry date" by default, "Valid till" for Documents).

### 6.9 Dashboard (P1)
Cards: total items, items per category, currently taken out, expiring soon, expired, recently
added. Everything clickable (drills into the filtered list).

### 6.10 Settings (P0)
- **Security:** set, change or remove the household PIN (rate-limited login: 5 failures per
  minute per IP, then a short lockout).
- **Server address** for QR codes (`base_url`) with auto-detect button.
- **Expiry window** (days).
- **Labels:** default preset and custom size.
- **Backup:** "Download backup now" (zip), list of automatic nightly backups (keep last N, default
  7, stored in `data/backups/`), **Restore** (upload zip, confirm with PIN, auto-backup first),
  storage usage (DB size, photos size).
- **Export:** CSV / JSON per category or all. **Import CSV** (P2) with column mapping and a dry run.
- Theme (system / light / dark).

### 6.11 Everything else
- Responsive: bottom navigation on phones, side drawer on desktop.
- Empty states with a clear next action ("Create your first category from a template").
- Loading skeletons, error snackbars, optimistic updates for the taken-out toggle.
- Accessibility: labels on every input, keyboard navigable dialogs, sufficient contrast.

---

## 7. Execution order and parallel agents

### Phase 0: Foundation (lead only, sequential, small)
The lead does this itself before spawning anyone, because every agent depends on it.
1. Create the repo layout from section 3 with empty packages.
2. Pin dependency versions (look them up), create `requirements.txt`, `package.json`, lint and
   format configs, `.gitignore` (ignore `data/`), `Makefile` or npm scripts
   (`dev`, `build`, `test`, `lint`).
3. Write `docs/DATA_MODEL.md` and `backend/app/migrations/001_init.sql` from section 4.
4. Write **stub routers** for every endpoint in section 5, returning `501`, with the final
   Pydantic request/response schemas. Run the server and export `docs/openapi.json`.
5. Generate frontend types: `npx openapi-typescript docs/openapi.json -o frontend/src/api/schema.d.ts`.
6. Write `docs/API_CONTRACT.md` (error format, pagination shape, examples) and `docs/DECISIONS.md`.
7. Create a git branch per agent (or git worktrees) from this commit.
8. **Gate:** `pytest` runs (even with zero tests), `npm run build` succeeds, OpenAPI is committed.

### Phase 1: Parallel build (spawn all at once)

| Agent | Owns | Depends on |
|---|---|---|
| **A1 backend-core** | `core/`, `migrations/`, `auth`, `settings`, `health`, static serving, test fixtures | Phase 0 |
| **A2 backend-forms** | `categories`, `fields`, `templates`, `seed_templates/` | A1 fixtures (use stubs until merged) |
| **A3 backend-items** | `items`, `locations`, `dashboard`, search, expiry logic | A1 fixtures |
| **A4 backend-media** | `photos`, `codes`, `admin` (backup, restore, export, import) | A1 fixtures |
| **B1 frontend-shell** | `api/`, `theme/`, `layout/`, `routes/`, `auth/`, `components/shared/` | OpenAPI types |
| **B2 frontend-forms** | `features/forms/` (builder, renderer, category screens, template picker) | B1 shell (use MSW until merged) |
| **B3 frontend-items** | `features/items/` (list, cards, detail dialog, item form) | B1, B2 renderer interface |
| **B4 frontend-places** | `features/locations/`, `features/photos/`, `features/print/` | B1 |
| **B5 frontend-extras** | `features/labels/`, `scan/`, `dashboard/`, `settings/` | B1 |

Frontend agents code against the generated types and **MSW mock handlers** (each agent adds mocks
under `frontend/src/api/mocks/<feature>.ts`), so nobody waits for the backend.

**Shared interface for B2 and B3** (agree on this up front, written by the lead in Phase 0):
```ts
// features/forms/index.ts  (B2 exports, B3 imports)
export function DynamicFields(props: {
  fields: FieldDef[];                 // active (non-archived) fields, sorted
  control: Control<any>;              // react-hook-form
  namePrefix?: string;                // default "values"
}): JSX.Element;
export function buildZodSchema(fields: FieldDef[]): ZodSchema;
```
**Shared interface for B4 and B3:**
```ts
// features/photos/index.ts  (B4 exports)
export function PhotoManager(props: { ownerType: 'item'|'location'; ownerId: number; readOnly?: boolean }): JSX.Element;
export function CoverThumb(props: { photoId?: number | null; size?: number }): JSX.Element;
```

### Phase 2: Integration (lead + two short-lived agents)
1. Merge order: A1 -> A2 -> A3 -> A4 -> B1 -> B2 -> B4 -> B3 -> B5. Run tests after each merge.
2. Remove MSW from the production build (keep it for tests and Storybook-style dev only).
3. **I1 contract-checker agent:** diff the running OpenAPI against `docs/openapi.json`, fix any drift,
   regenerate types, make the frontend compile with zero type errors.
4. **I2 e2e agent (A5 starts here):** write and run the Playwright journeys in section 9.

### Phase 3: Hardening and delivery (parallel)
- **A5 devops:** `deploy/Dockerfile` (multi-stage: build frontend, then slim Python image),
  `docker-compose.yml` (volume `./data:/data`, `restart: unless-stopped`), systemd unit file,
  Windows service notes (NSSM or Task Scheduler), firewall notes (allow the port on the Private
  profile), `deploy/HTTPS.md` (Caddy internal CA or mkcert, installing the CA on phones), `README.md`.
- **R1 reviewer:** read-only review for security, data loss, and constraint violations (section 1).
  Outputs `docs/REVIEW.md` with severity-ranked findings; fixes go back to the owner.
- **P1 polish:** empty states, copy, accessibility pass, mobile layout pass at 360 px width.

---

## 8. Spawn brief template (copy for each sub-agent)

The lead fills this in and passes it as the agent's task. Keep it self-contained: the agent has no
memory of this conversation.

```
ROLE: <A2 backend-forms>
GOAL: <one sentence from section 7>
CONTEXT: Read SKILL.md sections 1, 4, 5, and the part of 6 that covers your area.
         Read docs/API_CONTRACT.md and docs/openapi.json.
BRANCH: <agent branch / worktree path>
YOU OWN (edit freely): <paths from section 3>
READ-ONLY: docs/, backend/app/migrations/001_init.sql, everything not listed above
DO NOT: change the contract, add dependencies without writing a note in docs/REQUESTS.md,
        touch other agents' files, add stock/quantity features, call external networks.
BUILD: <the endpoints / components, with the acceptance list below>
TESTS: write and run your own tests; `pytest -q backend/tests/<area>` or
       `npm run test -- <area>` must pass.
ACCEPTANCE: <checklist from section 10 for this role>
REPORT BACK (max 25 lines): what is done, what is stubbed, test results, any entries added to
docs/REQUESTS.md, anything you were unsure about.
```

### Per-agent focus notes

**A1 backend-core:** DB engine with WAL and foreign keys; migration runner using `user_version`;
config from env with safe defaults (`DATA_DIR`, `PORT`, host `0.0.0.0`); session cookie (HttpOnly,
SameSite=Lax); PIN hashing and rate limiting; settings CRUD; static file mount with SPA fallback;
test fixtures (temp DB, authenticated client) that every other backend agent reuses.

**A2 backend-forms:** field validation helpers (`validate_values(category, values)` exported for A3);
archive vs purge; reorder endpoint; template loader that generates fresh field keys; four JSON
templates exactly as in 6.8; tests for every field type, required, dropdown option enforcement,
incompatible type change rejection.

**A3 backend-items:** items CRUD using A2's `validate_values`; search with `LIKE` over name, notes,
location name plus `json_each` over `values_json`; custom field filters `f.<key>`; subtree location
queries using a recursive CTE; cycle check on location move; expiry status SQL expression shared
between list, dashboard, and expiring endpoints; soft delete and undo (restore endpoint
`POST /items/{id}/restore`); pagination with stable ordering.

**A4 backend-media:** upload pipeline (sniff, orient, strip EXIF, resize, thumb); safe paths; photo
cleanup on purge; `codes/resolve`; backup using SQLite's online backup API into a temp file then zip
with photos; restore with validation (zip structure, `PRAGMA integrity_check`, schema version
`<=` current) and automatic pre-restore backup; nightly scheduler; CSV export (one column per
active field, human labels); CSV import dry run (P2).

**B1 frontend-shell:** theme with light/dark and bundled fonts; responsive layout (drawer + bottom
nav); route table for all screens (placeholders for others); fetch client with error mapping and
401 redirect to login; React Query setup; first-run PIN setup screen; shared components
(`ConfirmDialog`, `UndoSnackbar`, `EmptyState`, `ExpiryChip`, `LocationBreadcrumb`, `PageHeader`).

**B2 frontend-forms:** category list/create/edit; template picker; builder screen (dnd-kit
reorder, add/edit dialog, live preview); `DynamicFields` and `buildZodSchema`; field-type
components; unit tests for each type and for required validation.

**B3 frontend-items:** DataGrid list with server-side paging and filters, card view, detail dialog,
add/edit form using `DynamicFields`, taken-out toggle, undo delete, duplicate, move dialog
(location picker), expiry chip usage.

**B4 frontend-places:** location tree and detail, add/rename/move/delete flows, bulk move, location
picker component (exported for B3), `PhotoManager` and `CoverThumb`, the `/print/location/:id`
page with options and print CSS.

**B5 frontend-extras:** QR + barcode components, label sheet page with presets, scan screen with
secure-context detection and fallbacks, dashboard cards, Expiry screen, Settings (all sections in
6.10).

---

## 9. End-to-end journeys (Playwright, run in Phase 2)

1. **First run:** open app -> set PIN -> land on empty dashboard -> see "start from a template".
2. **Template to item:** apply *Medicines* -> add item with expiry in 10 days -> appears in list
   with an amber chip and on the dashboard "Expiring soon".
3. **Custom form:** create category "Batteries" -> add fields (dropdown Size, number Voltage with
   unit V, checkbox Rechargeable) -> add an item -> values persist after reload -> rename a field
   label -> existing value still shown -> archive a field -> data kept, field hidden.
4. **Locations:** create Room > Cupboard > Shelf -> add 3 items to the shelf -> move one to another
   shelf -> try to delete a shelf with items (blocked with a message) -> bulk move the rest.
5. **Photos:** upload 2 photos to an item and 1 to a location from a test image (with EXIF GPS) ->
   thumbnails show -> set cover -> downloaded file contains no GPS EXIF.
6. **Print:** open print page for the cupboard with sub-locations -> grouped output -> emulate
   print media and assert app chrome is hidden and the table is present.
7. **Codes:** open an item -> QR shows URL `.../#/i/<id>` -> `/api/codes/resolve?code=I<id>`
   returns the item -> scanning screen text input with `I<id>` + Enter opens the item.
8. **Backup and restore:** download backup -> delete an item -> restore -> item is back with photos.
9. **Taken out:** toggle an item out with "taken by" -> appears under "Currently out" -> return it.
10. **Mobile:** repeat journey 2 at a 390 px viewport; nothing overflows.

---

## 10. Acceptance checklist (the lead verifies before declaring done)

**Functional**
- [ ] Every P0 feature in section 6 works end to end through the UI.
- [ ] No quantity or stock fields exist anywhere (DB, API, UI, templates).
- [ ] All four templates apply correctly and are editable afterwards.
- [ ] Photos work for both items and locations, with orientation fixed and EXIF removed.
- [ ] QR opens the right item or location; barcode value resolves via `/codes/resolve`.
- [ ] Print page for a shelf is clean on A4, repeats headers, and can include sub-locations.
- [ ] Expiry statuses are right on boundary days (today, `warn_days` days ahead, yesterday).

**Robustness**
- [ ] Server-side validation rejects bad `values_json` (unknown key, wrong type, missing required).
- [ ] Deleting or restoring data cannot orphan photos or leave dangling foreign keys.
- [ ] Restore refuses a corrupt or too-new backup and always makes a pre-restore backup.
- [ ] Uploads reject non-images and oversized files with a friendly message.
- [ ] Login rate limit works; the app is fully usable with no PIN set if the user skipped it.

**Local-only and light**
- [ ] The built app makes zero requests to external hosts (check the browser network tab).
- [ ] One command or one container starts everything; data lives only in `data/`.
- [ ] Cold start under 3 seconds on a Raspberry Pi 4 class device; list of 2,000 items is
      responsive with server-side paging.
- [ ] Frontend bundle is code-split by route; initial JS is reasonable for phones.

**Quality**
- [ ] `pytest`, `vitest`, `ruff`, `eslint`, `tsc --noEmit`, and Playwright all pass.
- [ ] Mobile (360 px) and desktop layouts reviewed; dark mode reviewed.
- [ ] README covers install, first run, backup/restore, HTTPS for camera scanning, and upgrade.

---

## 11. Security and privacy notes for every agent

- Treat all uploaded files and CSV imports as untrusted: sniff types, limit sizes, never execute,
  never build file paths from user input, escape CSV formula-leading characters (`=`, `+`, `-`, `@`)
  on export.
- Parameterised SQL only (no string-built queries, including inside `json_extract` paths: validate
  field keys against `^f_[a-z0-9]{6,}$`).
- Session cookie is HttpOnly; no secrets in URLs; PIN is hashed with Argon2 or bcrypt.
- Do not log PINs, cookies, or full file paths.
- The app listens on the LAN; the README must say it is meant for a trusted home network and should
  not be exposed to the internet without a proper reverse proxy and stronger auth.

---

## 12. Definition of done and final report

The lead finishes by writing `docs/BUILD_REPORT.md` containing: what was built per section 6,
which P1 and P2 items were skipped, test results, known limitations (for example "live camera
scanning needs HTTPS"), and the exact commands to run the app. Then tell the user, in plain
language, how to start it and how to open it from a phone.

**Defaults to follow when the user has not said otherwise:** port 8000, data folder `./data`,
expiry window 30 days, 10 photos per owner, keep 7 backups, light/dark follows the system.
**When in doubt, choose the simpler option, keep the end user's workflow inside the UI, and record
the decision in `docs/DECISIONS.md`.**
