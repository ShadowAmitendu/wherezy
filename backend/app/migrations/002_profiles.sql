-- 002_profiles.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#1976d2',
    avatar_emoji TEXT NOT NULL DEFAULT '👤',
    role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
    pin_hash TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Backfill initial Admin profile
INSERT OR IGNORE INTO profiles (name, color, avatar_emoji, role, pin_hash, is_active, created_at, updated_at)
VALUES ('Admin', '#1976d2', '👑', 'admin', NULL, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
