-- ============================================
-- Migration 013: Alert Settings Table
-- ============================================
-- Creates table for persistent alert notification settings per user.
-- Replaces the in-memory storage in dashboard-api/src/routes/alerts.ts
--
-- Note: CHECK constraints NOT used - Turso/libSQL does not support them.
-- Settings are validated at the application layer using Zod schemas.
--
-- Reference: apps/dashboard-api/src/routes/alerts.ts

-- ============================================
-- 1. alert_settings
-- ============================================
-- Stores user-specific alert notification preferences.

CREATE TABLE IF NOT EXISTS alert_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,       -- Foreign key to user table
  enable_push INTEGER NOT NULL DEFAULT 1,      -- boolean: 0 or 1
  enable_email INTEGER NOT NULL DEFAULT 1,     -- boolean: 0 or 1
  email_address TEXT,                          -- Custom email (null = use account email)
  critical_only INTEGER NOT NULL DEFAULT 0,    -- boolean: 0 or 1
  quiet_hours_start TEXT,                      -- HH:MM format (null = no quiet hours)
  quiet_hours_end TEXT,                        -- HH:MM format (null = no quiet hours)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Indexes for alert_settings
CREATE INDEX IF NOT EXISTS idx_alert_settings_user_id ON alert_settings(user_id);

-- ============================================
-- Record this migration
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (13, 'alert_settings');
