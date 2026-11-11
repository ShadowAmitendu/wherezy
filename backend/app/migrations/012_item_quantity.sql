-- 012_item_quantity.sql
-- Add quantity and taken_out_quantity columns to items for multi-unit stock and partial checkout support.
ALTER TABLE items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN taken_out_quantity INTEGER NOT NULL DEFAULT 0;

UPDATE items
SET taken_out_quantity = CASE WHEN taken_out = 1 THEN 1 ELSE 0 END;
