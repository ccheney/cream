-- Migration: Drop positions table
--
-- The positions table is deprecated. Alpaca is now the sole source of truth
-- for positions. This migration removes the positions table and related objects.
--
-- To apply: psql -f 0001_drop_positions_table.sql
-- Or run: CREAM_ENV=PAPER bun run db:push

-- Drop the positions table and all related indexes/constraints
DROP TABLE IF EXISTS positions CASCADE;

-- Drop the position-related enums (if not used elsewhere)
-- Note: These might still be needed by orders table, check before uncommenting
-- DROP TYPE IF EXISTS position_side CASCADE;
-- DROP TYPE IF EXISTS position_status CASCADE;
