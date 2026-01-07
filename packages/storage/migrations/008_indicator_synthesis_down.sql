-- Rollback Migration 008: Indicator Synthesis Schema
--
-- Drops all indicator synthesis tables and indexes.

-- Drop indexes first
DROP INDEX IF EXISTS idx_indicators_active;
DROP INDEX IF EXISTS idx_trials_indicator;
DROP INDEX IF EXISTS idx_ic_history_indicator_date;
DROP INDEX IF EXISTS idx_indicators_code_hash;
DROP INDEX IF EXISTS idx_indicators_category;
DROP INDEX IF EXISTS idx_indicators_status;

-- Drop tables (order matters due to foreign keys)
DROP TABLE IF EXISTS indicator_ic_history;
DROP TABLE IF EXISTS indicator_trials;
DROP TABLE IF EXISTS indicators;

-- Remove migration record
DELETE FROM schema_migrations WHERE version = 8;
