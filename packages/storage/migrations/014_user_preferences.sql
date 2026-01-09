-- ============================================
-- Migration 014: User Preferences Table
-- ============================================
-- Creates table for user dashboard preferences with persistence across restarts.
-- Preferences include theme, chart settings, notification settings, and UI state.
--
-- Note: CHECK constraints NOT used - Turso/libSQL does not support them.
-- Validation is done at the application layer using Zod schemas.
--
-- Reference: apps/dashboard-api/src/routes/preferences.ts

-- ============================================
-- 1. user_preferences
-- ============================================
-- Stores user-specific dashboard preferences.
-- JSON columns used for complex nested objects (notification_settings, feed_filters).
-- theme: 'light' | 'dark' | 'system'
-- chart_timeframe: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'
-- default_portfolio_view: 'table' | 'cards'
-- date_format: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
-- time_format: '12h' | '24h'

CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,

  -- UI Theme
  theme TEXT NOT NULL DEFAULT 'system',

  -- Chart settings
  chart_timeframe TEXT NOT NULL DEFAULT '1M',

  -- Feed filters (JSON array of strings)
  feed_filters TEXT NOT NULL DEFAULT '[]',

  -- UI state
  sidebar_collapsed INTEGER NOT NULL DEFAULT 0,

  -- Notification settings (JSON object)
  notification_settings TEXT NOT NULL DEFAULT '{"emailAlerts":true,"pushNotifications":false,"tradeConfirmations":true,"dailySummary":true,"riskAlerts":true}',

  -- Portfolio view
  default_portfolio_view TEXT NOT NULL DEFAULT 'table',

  -- Date/time formatting
  date_format TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
  time_format TEXT NOT NULL DEFAULT '12h',

  -- Currency
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for user_preferences
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id
  ON user_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_user_preferences_created_at
  ON user_preferences(created_at);

-- ============================================
-- Record this migration
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (14, 'user_preferences');
