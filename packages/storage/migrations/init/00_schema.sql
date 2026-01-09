-- ============================================
-- Schema Migrations Tracking
-- ============================================
-- Must be first - tracks which migrations have been applied.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
