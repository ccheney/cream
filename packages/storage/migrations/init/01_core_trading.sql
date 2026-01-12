-- ============================================
-- Core Trading Tables
-- ============================================
-- decisions, agent_outputs, orders, positions, position_history,
-- portfolio_snapshots, config_versions

-- decisions: Trading decisions from OODA loop
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,            -- BUY, SELL, HOLD, CLOSE, INCREASE, REDUCE, NO_TRADE
  direction TEXT NOT NULL,         -- LONG, SHORT, FLAT
  size REAL NOT NULL,
  size_unit TEXT NOT NULL,         -- SHARES, CONTRACTS, DOLLARS, PCT_EQUITY
  entry_price REAL,
  stop_loss REAL,
  take_profit REAL,
  stop_price REAL,                 -- Repository-compatible stop price
  target_price REAL,               -- Repository-compatible target price
  strategy_family TEXT,            -- Strategy metadata
  time_horizon TEXT,               -- Time horizon metadata
  bullish_factors TEXT,            -- JSON array of bullish factors
  bearish_factors TEXT,            -- JSON array of bearish factors
  confidence_score REAL,           -- Confidence score 0-1
  risk_score REAL,                 -- Risk score 0-1
  metadata TEXT,                   -- Additional JSON metadata
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected, executed, cancelled, expired
  rationale TEXT,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  executed_at TEXT,
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_decisions_cycle_id ON decisions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON decisions(symbol);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol_created ON decisions(symbol, created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_environment ON decisions(environment);

-- agent_outputs: Agent votes and reasoning
CREATE TABLE IF NOT EXISTS agent_outputs (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,        -- technical, news, fundamentals, bullish, bearish, trader, risk, critic
  vote TEXT NOT NULL,              -- APPROVE, REJECT, ABSTAIN
  confidence REAL NOT NULL,        -- 0 to 1
  reasoning_summary TEXT,
  full_reasoning TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_outputs_decision_id ON agent_outputs(decision_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent_type ON agent_outputs(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_decision_agent ON agent_outputs(decision_id, agent_type);

-- orders: Order submissions and lifecycle
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  decision_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,              -- buy, sell
  qty REAL NOT NULL,
  order_type TEXT NOT NULL,        -- market, limit, stop, stop_limit
  limit_price REAL,
  stop_price REAL,
  time_in_force TEXT NOT NULL DEFAULT 'day',  -- day, gtc, ioc, fok
  status TEXT NOT NULL DEFAULT 'pending',     -- pending, submitted, accepted, partial_fill, filled, cancelled, rejected, expired
  broker_order_id TEXT,
  filled_qty REAL DEFAULT 0,
  filled_avg_price REAL,
  commission REAL,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  filled_at TEXT,
  cancelled_at TEXT,
  FOREIGN KEY (decision_id) REFERENCES decisions(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_decision_id ON orders(decision_id);
CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_broker_order_id ON orders(broker_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_environment ON orders(environment);

-- positions: Current open positions
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,              -- long, short
  qty REAL NOT NULL,
  avg_entry REAL NOT NULL,
  current_price REAL,
  unrealized_pnl REAL,
  unrealized_pnl_pct REAL,
  realized_pnl REAL DEFAULT 0,
  market_value REAL,
  cost_basis REAL,
  thesis_id TEXT,
  decision_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',  -- open, closed, pending
  metadata TEXT,                   -- JSON for additional context
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_thesis_id ON positions(thesis_id);
CREATE INDEX IF NOT EXISTS idx_positions_decision_id ON positions(decision_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_environment ON positions(environment);
CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_symbol_env ON positions(symbol, environment) WHERE closed_at IS NULL;

-- position_history: Historical snapshots for P&L tracking
CREATE TABLE IF NOT EXISTS position_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  price REAL NOT NULL,
  qty REAL NOT NULL,
  unrealized_pnl REAL,
  market_value REAL,
  FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_position_history_position_id ON position_history(position_id);
CREATE INDEX IF NOT EXISTS idx_position_history_timestamp ON position_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_position_history_position_ts ON position_history(position_id, timestamp);

-- portfolio_snapshots: Point-in-time portfolio state
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  nav REAL NOT NULL,
  cash REAL NOT NULL,
  equity REAL NOT NULL,
  gross_exposure REAL NOT NULL,
  net_exposure REAL NOT NULL,
  long_exposure REAL,
  short_exposure REAL,
  open_positions INTEGER,
  day_pnl REAL,
  day_return_pct REAL,
  total_return_pct REAL,
  max_drawdown REAL,
  UNIQUE(timestamp, environment)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_timestamp ON portfolio_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_environment ON portfolio_snapshots(environment);

-- config_versions: Version-controlled configuration
CREATE TABLE IF NOT EXISTS config_versions (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  config_json TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_config_versions_environment ON config_versions(environment);
CREATE INDEX IF NOT EXISTS idx_config_versions_active ON config_versions(active);
CREATE INDEX IF NOT EXISTS idx_config_versions_created_at ON config_versions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_versions_env_active ON config_versions(environment) WHERE active = 1;

-- cycles: Complete OODA cycle history with results
CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,                     -- BACKTEST, PAPER, LIVE
  status TEXT NOT NULL DEFAULT 'running',        -- running, completed, failed

  -- Timing
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,

  -- Phase tracking
  current_phase TEXT,                            -- observe, orient, decide, act, complete
  phase_started_at TEXT,

  -- Progress
  total_symbols INTEGER DEFAULT 0,
  completed_symbols INTEGER DEFAULT 0,
  progress_pct REAL DEFAULT 0,

  -- Results (populated on completion)
  approved INTEGER,                              -- 1 if consensus approved, 0 if not
  iterations INTEGER,
  decisions_count INTEGER DEFAULT 0,
  orders_count INTEGER DEFAULT 0,

  -- Decision summary (JSON array of {symbol, action, direction, confidence})
  decisions_json TEXT,

  -- Order summary (JSON array of {orderId, symbol, side, quantity, status})
  orders_json TEXT,

  -- Error info (if failed)
  error_message TEXT,
  error_stack TEXT,

  -- Config tracking
  config_version TEXT,

  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cycles_environment ON cycles(environment);
CREATE INDEX IF NOT EXISTS idx_cycles_status ON cycles(status);
CREATE INDEX IF NOT EXISTS idx_cycles_started_at ON cycles(started_at);
CREATE INDEX IF NOT EXISTS idx_cycles_env_status ON cycles(environment, status);
CREATE INDEX IF NOT EXISTS idx_cycles_env_started ON cycles(environment, started_at DESC);

-- cycle_events: Detailed event log for each cycle (for debugging/replay)
CREATE TABLE IF NOT EXISTS cycle_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT NOT NULL,
  event_type TEXT NOT NULL,                      -- phase_change, agent_start, agent_complete, decision, order, error
  phase TEXT,

  -- Event details
  agent_type TEXT,
  symbol TEXT,
  message TEXT,
  data_json TEXT,

  -- Timing
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  duration_ms INTEGER,

  FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cycle_events_cycle_id ON cycle_events(cycle_id);
CREATE INDEX IF NOT EXISTS idx_cycle_events_type ON cycle_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cycle_events_timestamp ON cycle_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_cycle_events_agent ON cycle_events(cycle_id, agent_type);
