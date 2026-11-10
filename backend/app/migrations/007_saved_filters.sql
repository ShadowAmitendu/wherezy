-- 007_saved_filters.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS saved_filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('items')),
    query_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_filters_profile ON saved_filters(profile_id);
