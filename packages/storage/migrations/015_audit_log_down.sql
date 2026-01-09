-- ============================================
-- Migration 015: Audit Log (Down)
-- ============================================

DROP INDEX IF EXISTS idx_audit_log_environment;
DROP INDEX IF EXISTS idx_audit_log_action;
DROP INDEX IF EXISTS idx_audit_log_timestamp;
DROP INDEX IF EXISTS idx_audit_log_user_id;
DROP TABLE IF EXISTS audit_log;

DELETE FROM schema_migrations WHERE version = 15;
