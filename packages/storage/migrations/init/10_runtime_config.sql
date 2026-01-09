-- ============================================
-- Runtime Configuration Tables
-- ============================================
-- trading_config, agent_configs, universe_configs, constraints_config

CREATE TABLE IF NOT EXISTS trading_config (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  version INTEGER NOT NULL,

  -- Consensus settings
  max_consensus_iterations INTEGER DEFAULT 3,
  agent_timeout_ms INTEGER DEFAULT 30000,
  total_consensus_timeout_ms INTEGER DEFAULT 300000,

  -- Conviction thresholds
  conviction_delta_hold REAL DEFAULT 0.2,
  conviction_delta_action REAL DEFAULT 0.3,

  -- Position sizing
  high_conviction_pct REAL DEFAULT 0.7,
  medium_conviction_pct REAL DEFAULT 0.5,
  low_conviction_pct REAL DEFAULT 0.25,

  -- Risk/reward
  min_risk_reward_ratio REAL DEFAULT 1.5,
  kelly_fraction REAL DEFAULT 0.5,

  -- Schedule (milliseconds)
  trading_cycle_interval_ms INTEGER DEFAULT 3600000,
  prediction_markets_interval_ms INTEGER DEFAULT 900000,

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, testing, active, archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  promoted_from TEXT,

  FOREIGN KEY (promoted_from) REFERENCES trading_config(id)
);

CREATE INDEX IF NOT EXISTS idx_trading_config_environment ON trading_config(environment);
CREATE INDEX IF NOT EXISTS idx_trading_config_status ON trading_config(status);
CREATE INDEX IF NOT EXISTS idx_trading_config_env_status ON trading_config(environment, status);
CREATE INDEX IF NOT EXISTS idx_trading_config_created_at ON trading_config(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_config_env_active ON trading_config(environment) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS agent_configs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  agent_type TEXT NOT NULL,        -- technical, news, fundamentals, bullish, bearish, trader, risk, critic
  model TEXT NOT NULL,
  temperature REAL NOT NULL,
  max_tokens INTEGER NOT NULL,
  system_prompt_override TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_configs_environment ON agent_configs(environment);
CREATE INDEX IF NOT EXISTS idx_agent_configs_agent_type ON agent_configs(agent_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_env_agent ON agent_configs(environment, agent_type);

CREATE TABLE IF NOT EXISTS universe_configs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE
  source TEXT NOT NULL,            -- static, index, screener

  -- Static symbols (JSON array)
  static_symbols TEXT,

  -- Index source configuration
  index_source TEXT,               -- SP500, NDX100, DJIA

  -- Screener filters
  min_volume INTEGER,
  min_market_cap INTEGER,
  optionable_only INTEGER NOT NULL DEFAULT 0,

  -- Include/exclude lists (JSON arrays)
  include_list TEXT,
  exclude_list TEXT,

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, testing, active, archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_universe_configs_environment ON universe_configs(environment);
CREATE INDEX IF NOT EXISTS idx_universe_configs_status ON universe_configs(status);
CREATE INDEX IF NOT EXISTS idx_universe_configs_env_status ON universe_configs(environment, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_configs_env_active ON universe_configs(environment) WHERE status = 'active';

-- Constraints configuration (risk limits)
CREATE TABLE IF NOT EXISTS constraints_config (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,       -- BACKTEST, PAPER, LIVE

  -- Per-instrument limits
  max_shares INTEGER NOT NULL DEFAULT 1000,
  max_contracts INTEGER NOT NULL DEFAULT 10,
  max_notional REAL NOT NULL DEFAULT 50000,
  max_pct_equity REAL NOT NULL DEFAULT 0.1,

  -- Portfolio limits
  max_gross_exposure REAL NOT NULL DEFAULT 2.0,
  max_net_exposure REAL NOT NULL DEFAULT 1.0,
  max_concentration REAL NOT NULL DEFAULT 0.25,
  max_correlation REAL NOT NULL DEFAULT 0.7,
  max_drawdown REAL NOT NULL DEFAULT 0.15,

  -- Options greeks limits
  max_delta REAL NOT NULL DEFAULT 100,
  max_gamma REAL NOT NULL DEFAULT 50,
  max_vega REAL NOT NULL DEFAULT 1000,
  max_theta REAL NOT NULL DEFAULT 500,

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, testing, active, archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_constraints_config_environment ON constraints_config(environment);
CREATE INDEX IF NOT EXISTS idx_constraints_config_status ON constraints_config(status);
CREATE INDEX IF NOT EXISTS idx_constraints_config_env_status ON constraints_config(environment, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_constraints_config_env_active ON constraints_config(environment) WHERE status = 'active';
