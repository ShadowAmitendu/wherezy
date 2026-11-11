-- 013_location_storage_mode.sql
-- Track whether a Room / top-level place is designated as a standalone storage-only space.
ALTER TABLE locations ADD COLUMN storage_only INTEGER NOT NULL DEFAULT 0;
