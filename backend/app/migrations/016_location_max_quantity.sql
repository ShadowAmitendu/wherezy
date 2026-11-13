-- 016_location_max_quantity.sql
-- Add max_quantity capacity limit to locations
ALTER TABLE locations ADD COLUMN max_quantity INTEGER DEFAULT NULL;
