-- ============================================
-- Migration 005: Historical Universe Tables (DOWN)
-- ============================================
-- Rollback: Remove point-in-time universe tables

DROP TABLE IF EXISTS universe_snapshots;
DROP TABLE IF EXISTS ticker_changes;
DROP TABLE IF EXISTS index_constituents;

DELETE FROM schema_migrations WHERE version = 5;
