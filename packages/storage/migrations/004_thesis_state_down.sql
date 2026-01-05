-- ============================================
-- Rollback Migration 004: Thesis State Management
-- ============================================

DROP TABLE IF EXISTS thesis_state_history;
DROP TABLE IF EXISTS thesis_state;

DELETE FROM schema_migrations WHERE version = 4;
