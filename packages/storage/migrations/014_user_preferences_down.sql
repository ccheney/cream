-- Rollback Migration 014: User Preferences Table

-- Drop user_preferences indexes and table
DROP INDEX IF EXISTS idx_user_preferences_created_at;
DROP INDEX IF EXISTS idx_user_preferences_user_id;
DROP TABLE IF EXISTS user_preferences;

DELETE FROM schema_migrations WHERE version = 14;
