-- 009_contacts_labels_moves.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NULL,
    note TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

ALTER TABLE items ADD COLUMN taken_by_contact_id INTEGER NULL REFERENCES contacts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS label_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('item', 'location', 'box')),
    width_mm REAL NOT NULL,
    height_mm REAL NOT NULL,
    page_json TEXT NULL,
    layout TEXT NOT NULL DEFAULT 'qr_left',
    fields_json TEXT NOT NULL DEFAULT '[]',
    style_json TEXT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    owner_id INTEGER NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_date TEXT NULL,
    status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'done')),
    created_by INTEGER NULL REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    finished_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS boxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    move_id INTEGER NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    label TEXT NOT NULL,
    destination TEXT NULL,
    destination_location_id INTEGER NULL REFERENCES locations(id) ON DELETE SET NULL,
    colour TEXT NULL,
    notes TEXT NULL,
    status TEXT NOT NULL DEFAULT 'packing' CHECK (status IN ('packing', 'packed', 'unpacked')),
    created_at TEXT NOT NULL,
    UNIQUE(move_id, number)
);

CREATE TABLE IF NOT EXISTS box_items (
    box_id INTEGER NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    active INTEGER NOT NULL DEFAULT 1,
    added_at TEXT NOT NULL,
    PRIMARY KEY(box_id, item_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_box_items_one_active ON box_items(item_id) WHERE active = 1;
