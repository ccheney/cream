-- ============================================
-- Migration 002: Dashboard Tables
-- ============================================
-- Creates additional tables for the dashboard UI.
-- Tables: alerts, system_state, backtests, backtest_trades,
--         backtest_equity, user_preferences
--
-- Note: CHECK constraints removed - Turso doesn't support them yet.
--
-- @see docs/plans/ui/04-data-requirements.md lines 21-30

-- ============================================
-- 8. alerts
-- ============================================
-- System and trading alerts for the dashboard.

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL, -- info, warning, critical
  type TEXT NOT NULL, -- connection, order, position, risk, system, market, agent
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT, -- JSON for additional context
  acknowledged INTEGER NOT NULL DEFAULT 0, -- 0 or 1
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  environment TEXT NOT NULL, -- BACKTEST, PAPER, LIVE
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

-- Indexes for alerts
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_environment ON alerts(environment);
CREATE INDEX IF NOT EXISTS idx_alerts_unack_env ON alerts(environment, acknowledged) WHERE acknowledged = 0;

-- ============================================
-- 9. system_state
-- ============================================
-- Single-row table for current system state per environment.
-- Uses upsert pattern for updates.

CREATE TABLE IF NOT EXISTS system_state (
  environment TEXT PRIMARY KEY, -- BACKTEST, PAPER, LIVE
  status TEXT NOT NULL DEFAULT 'stopped', -- running, paused, stopped, error
  last_cycle_id TEXT,
  last_cycle_time TEXT,
  current_phase TEXT, -- observe, orient, decide, act, NULL
  phase_started_at TEXT,
  next_cycle_at TEXT,
  error_message TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Initialize system_state for all environments
INSERT OR IGNORE INTO system_state (environment, status) VALUES ('BACKTEST', 'stopped');
INSERT OR IGNORE INTO system_state (environment, status) VALUES ('PAPER', 'stopped');
INSERT OR IGNORE INTO system_state (environment, status) VALUES ('LIVE', 'stopped');

-- ============================================
-- 10. backtests
-- ============================================
-- Backtest run configurations and results.

CREATE TABLE IF NOT EXISTS backtests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  initial_capital REAL NOT NULL,
  universe TEXT, -- JSON array of symbols or universe spec
  config_json TEXT, -- Full config snapshot
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, cancelled
  progress_pct REAL DEFAULT 0,
  -- Result metrics (populated on completion)
  total_return REAL,
  cagr REAL,
  sharpe_ratio REAL,
  sortino_ratio REAL,
  calmar_ratio REAL,
  max_drawdown REAL,
  win_rate REAL,
  profit_factor REAL,
  total_trades INTEGER,
  avg_trade_pnl REAL,
  metrics_json TEXT, -- Full metrics object
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  created_by TEXT
);

-- Indexes for backtests
CREATE INDEX IF NOT EXISTS idx_backtests_status ON backtests(status);
CREATE INDEX IF NOT EXISTS idx_backtests_start_date ON backtests(start_date);
CREATE INDEX IF NOT EXISTS idx_backtests_created_at ON backtests(created_at);

-- ============================================
-- 11. backtest_trades
-- ============================================
-- Individual trades from a backtest run.

CREATE TABLE IF NOT EXISTS backtest_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL, -- BUY, SELL, SHORT, COVER
  qty REAL NOT NULL,
  price REAL NOT NULL,
  commission REAL DEFAULT 0,
  pnl REAL,
  pnl_pct REAL,
  decision_rationale TEXT,
  FOREIGN KEY (backtest_id) REFERENCES backtests(id) ON DELETE CASCADE
);

-- Indexes for backtest_trades
CREATE INDEX IF NOT EXISTS idx_backtest_trades_backtest_id ON backtest_trades(backtest_id);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_timestamp ON backtest_trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_symbol ON backtest_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_bt_ts ON backtest_trades(backtest_id, timestamp);

-- ============================================
-- 12. backtest_equity
-- ============================================
-- Equity curve snapshots for backtest visualization.

CREATE TABLE IF NOT EXISTS backtest_equity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  nav REAL NOT NULL,
  cash REAL NOT NULL,
  equity REAL NOT NULL,
  drawdown REAL,
  drawdown_pct REAL,
  day_return_pct REAL,
  cumulative_return_pct REAL,
  FOREIGN KEY (backtest_id) REFERENCES backtests(id) ON DELETE CASCADE
);

-- Indexes for backtest_equity
CREATE INDEX IF NOT EXISTS idx_backtest_equity_backtest_id ON backtest_equity(backtest_id);
CREATE INDEX IF NOT EXISTS idx_backtest_equity_timestamp ON backtest_equity(timestamp);
CREATE INDEX IF NOT EXISTS idx_backtest_equity_bt_ts ON backtest_equity(backtest_id, timestamp);

-- ============================================
-- 13. user_preferences
-- ============================================
-- User preferences as flexible JSON storage.

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  theme TEXT DEFAULT 'system', -- light, dark, system
  default_environment TEXT DEFAULT 'PAPER', -- BACKTEST, PAPER, LIVE
  sidebar_collapsed INTEGER DEFAULT 0, -- 0 or 1
  chart_settings TEXT, -- JSON
  alert_settings TEXT, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Record this migration
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (2, '002_dashboard_tables');
