-- ============================================
-- Dashboard Tables
-- ============================================
-- alerts, system_state, backtests, backtest_trades, backtest_equity

-- alerts: System and trading alerts
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL,          -- info, warning, error, critical
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  environment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_environment ON alerts(environment);
CREATE INDEX IF NOT EXISTS idx_alerts_unack_env ON alerts(environment, acknowledged) WHERE acknowledged = 0;

-- system_state: Current system state per environment
CREATE TABLE IF NOT EXISTS system_state (
  environment TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'stopped',
  last_cycle_id TEXT,
  last_cycle_time TEXT,
  current_phase TEXT,
  phase_started_at TEXT,
  next_cycle_at TEXT,
  error_message TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- backtests: Backtest configurations and results
CREATE TABLE IF NOT EXISTS backtests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  initial_capital REAL NOT NULL,
  universe TEXT,
  config_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  progress_pct REAL DEFAULT 0,
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
  metrics_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_backtests_status ON backtests(status);
CREATE INDEX IF NOT EXISTS idx_backtests_start_date ON backtests(start_date);
CREATE INDEX IF NOT EXISTS idx_backtests_created_at ON backtests(created_at);

-- backtest_trades: Individual trades from backtests
CREATE TABLE IF NOT EXISTS backtest_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  qty REAL NOT NULL,
  price REAL NOT NULL,
  commission REAL DEFAULT 0,
  pnl REAL,
  pnl_pct REAL,
  decision_rationale TEXT,
  FOREIGN KEY (backtest_id) REFERENCES backtests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backtest_trades_backtest_id ON backtest_trades(backtest_id);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_timestamp ON backtest_trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_symbol ON backtest_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_bt_ts ON backtest_trades(backtest_id, timestamp);

-- backtest_equity: Equity curve for visualization
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

CREATE INDEX IF NOT EXISTS idx_backtest_equity_backtest_id ON backtest_equity(backtest_id);
CREATE INDEX IF NOT EXISTS idx_backtest_equity_timestamp ON backtest_equity(timestamp);
CREATE INDEX IF NOT EXISTS idx_backtest_equity_bt_ts ON backtest_equity(backtest_id, timestamp);
