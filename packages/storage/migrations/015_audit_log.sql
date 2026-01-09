-- ============================================
-- Migration 015: Audit Log
-- ============================================
-- Creates audit_log table for LIVE environment action tracking.
-- Required for security compliance - tracks all authenticated
-- API actions in LIVE environment.
--
-- @see apps/dashboard-api/src/auth/session.ts

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  environment TEXT NOT NULL DEFAULT 'LIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_environment ON audit_log(environment);

-- ============================================
-- Record this migration
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (15, '015_audit_log');
