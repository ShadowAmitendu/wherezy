-- Initial schema migration for HomeInventory
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL DEFAULT 'category',
    color TEXT NOT NULL DEFAULT '#1976d2',
    track_expiry INTEGER NOT NULL DEFAULT 0,
    expiry_label TEXT DEFAULT 'Expiry date',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS field_defs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'longtext', 'number', 'date', 'dropdown', 'multiselect', 'checkbox')),
    required INTEGER NOT NULL DEFAULT 0,
    options_json TEXT NULL,
    unit TEXT NULL,
    hint TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    show_in_list INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    UNIQUE(category_id, key)
);

CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NULL REFERENCES locations(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'Room',
    notes TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    location_id INTEGER NULL REFERENCES locations(id) ON DELETE RESTRICT,
    taken_out INTEGER NOT NULL DEFAULT 0,
    taken_by TEXT NULL,
    taken_at TEXT NULL,
    expiry_date TEXT NULL,
    notes TEXT NULL,
    values_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('item', 'location')),
    owner_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    thumb_name TEXT NOT NULL,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    is_cover INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_location_id ON items(location_id);
CREATE INDEX IF NOT EXISTS idx_items_expiry_date ON items(expiry_date);
CREATE INDEX IF NOT EXISTS idx_items_taken_out ON items(taken_out);
CREATE INDEX IF NOT EXISTS idx_photos_owner ON photos(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_locations_parent_id ON locations(parent_id);
