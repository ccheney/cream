-- ============================================
-- Migration 013 DOWN: Alert Settings Table
-- ============================================
-- Removes the alert_settings table.

DROP INDEX IF EXISTS idx_alert_settings_user_id;
DROP TABLE IF EXISTS alert_settings;

DELETE FROM schema_migrations WHERE version = 13;
