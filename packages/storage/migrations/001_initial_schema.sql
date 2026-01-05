-- ============================================
-- Migration 001: Initial Schema
-- ============================================
-- Creates the core production tables for the Cream trading system.
-- Tables: decisions, agent_outputs, orders, positions, position_history,
--         portfolio_snapshots, config_versions
--
-- @see docs/plans/ui/04-data-requirements.md lines 7-30

-- Track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- 1. decisions
-- ============================================
-- Stores trading decisions from the OODA loop cycle.

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL', 'HOLD', 'CLOSE', 'INCREASE', 'REDUCE', 'NO_TRADE')),
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT', 'FLAT')),
  size REAL NOT NULL,
  size_unit TEXT NOT NULL CHECK (size_unit IN ('SHARES', 'CONTRACTS', 'DOLLARS', 'PCT_EQUITY')),
  entry_price REAL,
  stop_loss REAL,
  take_profit REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'cancelled', 'expired')),
  rationale TEXT,
  environment TEXT NOT NULL CHECK (environment IN ('BACKTEST', 'PAPER', 'LIVE')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  executed_at TEXT,
  closed_at TEXT
);

-- Indexes for decisions
CREATE INDEX IF NOT EXISTS idx_decisions_cycle_id ON decisions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON decisions(symbol);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol_created ON decisions(symbol, created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_environment ON decisions(environment);

-- ============================================
-- 2. agent_outputs
-- ============================================
-- Stores individual agent votes and reasoning for each decision.

CREATE TABLE IF NOT EXISTS agent_outputs (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  agent_type TEXT NOT NULL CHECK (agent_type IN (
    'technical', 'news', 'fundamentals', 'bullish', 'bearish', 'trader', 'risk', 'critic'
  )),
  vote TEXT NOT NULL CHECK (vote IN ('APPROVE', 'REJECT', 'ABSTAIN')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reasoning_summary TEXT,
  full_reasoning TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE
);

-- Indexes for agent_outputs
CREATE INDEX IF NOT EXISTS idx_agent_outputs_decision_id ON agent_outputs(decision_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent_type ON agent_outputs(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_decision_agent ON agent_outputs(decision_id, agent_type);

-- ============================================
-- 3. orders
-- ============================================
-- Stores order submissions and their lifecycle.

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  decision_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  qty REAL NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('market', 'limit', 'stop', 'stop_limit')),
  limit_price REAL,
  stop_price REAL,
  time_in_force TEXT NOT NULL DEFAULT 'day' CHECK (time_in_force IN ('day', 'gtc', 'ioc', 'fok')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'submitted', 'accepted', 'partial_fill', 'filled', 'cancelled', 'rejected', 'expired'
  )),
  broker_order_id TEXT,
  filled_qty REAL DEFAULT 0,
  filled_avg_price REAL,
  commission REAL,
  environment TEXT NOT NULL CHECK (environment IN ('BACKTEST', 'PAPER', 'LIVE')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  filled_at TEXT,
  cancelled_at TEXT,
  FOREIGN KEY (decision_id) REFERENCES decisions(id)
);

-- Indexes for orders
CREATE INDEX IF NOT EXISTS idx_orders_decision_id ON orders(decision_id);
CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_broker_order_id ON orders(broker_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_environment ON orders(environment);

-- ============================================
-- 4. positions
-- ============================================
-- Tracks current open positions.

CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  qty REAL NOT NULL,
  avg_entry REAL NOT NULL,
  current_price REAL,
  unrealized_pnl REAL,
  realized_pnl REAL DEFAULT 0,
  market_value REAL,
  cost_basis REAL,
  thesis_id TEXT, -- Reference to HelixDB thesis
  environment TEXT NOT NULL CHECK (environment IN ('BACKTEST', 'PAPER', 'LIVE')),
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

-- Indexes for positions
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_thesis_id ON positions(thesis_id);
CREATE INDEX IF NOT EXISTS idx_positions_environment ON positions(environment);
CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_symbol_env ON positions(symbol, environment) WHERE closed_at IS NULL;

-- ============================================
-- 5. position_history
-- ============================================
-- Historical snapshots of position state for P&L tracking.

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

-- Indexes for position_history
CREATE INDEX IF NOT EXISTS idx_position_history_position_id ON position_history(position_id);
CREATE INDEX IF NOT EXISTS idx_position_history_timestamp ON position_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_position_history_position_ts ON position_history(position_id, timestamp);

-- ============================================
-- 6. portfolio_snapshots
-- ============================================
-- Point-in-time portfolio state for equity curve tracking.

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('BACKTEST', 'PAPER', 'LIVE')),
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

-- Indexes for portfolio_snapshots
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_timestamp ON portfolio_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_environment ON portfolio_snapshots(environment);

-- ============================================
-- 7. config_versions
-- ============================================
-- Version-controlled configuration with single active per environment.

CREATE TABLE IF NOT EXISTS config_versions (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('BACKTEST', 'PAPER', 'LIVE')),
  config_json TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

-- Indexes for config_versions
CREATE INDEX IF NOT EXISTS idx_config_versions_environment ON config_versions(environment);
CREATE INDEX IF NOT EXISTS idx_config_versions_active ON config_versions(active);
CREATE INDEX IF NOT EXISTS idx_config_versions_created_at ON config_versions(created_at);

-- Partial unique index: only one active config per environment
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_versions_env_active
  ON config_versions(environment) WHERE active = 1;

-- ============================================
-- Record this migration
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (1, '001_initial_schema');
