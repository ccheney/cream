-- ============================================
-- User Settings Tables
-- ============================================
-- alert_settings, user_preferences

CREATE TABLE IF NOT EXISTS alert_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  enable_push INTEGER NOT NULL DEFAULT 1,
  enable_email INTEGER NOT NULL DEFAULT 1,
  email_address TEXT,
  critical_only INTEGER NOT NULL DEFAULT 0,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alert_settings_user_id ON alert_settings(user_id);

CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,

  -- UI Theme
  theme TEXT NOT NULL DEFAULT 'system',  -- light, dark, system

  -- Chart settings
  chart_timeframe TEXT NOT NULL DEFAULT '1M',  -- 1D, 1W, 1M, 3M, 6M, 1Y, ALL

  -- Feed filters (JSON array of strings)
  feed_filters TEXT NOT NULL DEFAULT '[]',

  -- UI state
  sidebar_collapsed INTEGER NOT NULL DEFAULT 0,

  -- Notification settings (JSON object)
  notification_settings TEXT NOT NULL DEFAULT '{"emailAlerts":true,"pushNotifications":false,"tradeConfirmations":true,"dailySummary":true,"riskAlerts":true}',

  -- Portfolio view
  default_portfolio_view TEXT NOT NULL DEFAULT 'table',  -- table, cards

  -- Date/time formatting
  date_format TEXT NOT NULL DEFAULT 'MM/DD/YYYY',  -- MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD
  time_format TEXT NOT NULL DEFAULT '12h',         -- 12h, 24h

  -- Currency
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_created_at ON user_preferences(created_at);
