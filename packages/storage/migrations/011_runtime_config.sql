-- ============================================
-- Migration 011: Runtime Configuration Tables
-- ============================================
-- Creates tables for runtime configuration management with promotion workflow.
-- Tables: trading_config, agent_configs, universe_configs
--
-- Note: CHECK constraints NOT used - Turso/libSQL does not support them.
-- Use partial unique indexes for constraints. Validation at application layer.
--
-- Reference: docs/plans/22-self-service-dashboard.md (Phase 1)

-- ============================================
-- 1. trading_config
-- ============================================
-- Stores trading configuration with promotion workflow.
-- status: 'draft' | 'testing' | 'active' | 'archived'
-- environment: 'BACKTEST' | 'PAPER' | 'LIVE'

CREATE TABLE IF NOT EXISTS trading_config (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
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
  trading_cycle_interval_ms INTEGER DEFAULT 3600000,      -- 1 hour
  prediction_markets_interval_ms INTEGER DEFAULT 900000,  -- 15 minutes

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, testing, active, archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  promoted_from TEXT,  -- ID of paper config this was promoted from

  FOREIGN KEY (promoted_from) REFERENCES trading_config(id)
);

-- Indexes for trading_config
CREATE INDEX IF NOT EXISTS idx_trading_config_environment
  ON trading_config(environment);

CREATE INDEX IF NOT EXISTS idx_trading_config_status
  ON trading_config(status);

CREATE INDEX IF NOT EXISTS idx_trading_config_env_status
  ON trading_config(environment, status);

CREATE INDEX IF NOT EXISTS idx_trading_config_created_at
  ON trading_config(created_at);

-- Partial unique index: Only one active config per environment
CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_config_env_active
  ON trading_config(environment) WHERE status = 'active';

-- ============================================
-- 2. agent_configs
-- ============================================
-- Per-agent model, temperature, and prompt overrides.
-- agent_type: 'technical' | 'news' | 'fundamentals' | 'bullish' | 'bearish' | 'trader' | 'risk' | 'critic'

CREATE TABLE IF NOT EXISTS agent_configs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,  -- BACKTEST, PAPER, LIVE
  agent_type TEXT NOT NULL,   -- technical, news, fundamentals, bullish, bearish, trader, risk, critic
  model TEXT NOT NULL,
  temperature REAL NOT NULL,
  max_tokens INTEGER NOT NULL,
  system_prompt_override TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,  -- 0 or 1
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for agent_configs
CREATE INDEX IF NOT EXISTS idx_agent_configs_environment
  ON agent_configs(environment);

CREATE INDEX IF NOT EXISTS idx_agent_configs_agent_type
  ON agent_configs(agent_type);

-- Unique constraint: One config per agent per environment
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_env_agent
  ON agent_configs(environment, agent_type);

-- ============================================
-- 3. universe_configs
-- ============================================
-- Trading universe configuration with sources and filters.
-- source: 'static' | 'index' | 'screener'
-- status: 'draft' | 'testing' | 'active' | 'archived'

CREATE TABLE IF NOT EXISTS universe_configs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,  -- BACKTEST, PAPER, LIVE
  source TEXT NOT NULL,       -- static, index, screener

  -- Static symbols (JSON array)
  static_symbols TEXT,        -- e.g., '["AAPL", "GOOGL", "MSFT"]'

  -- Index source configuration
  index_source TEXT,          -- e.g., 'SP500', 'NDX100', 'DJIA'

  -- Screener filters
  min_volume INTEGER,         -- Minimum daily volume
  min_market_cap INTEGER,     -- Minimum market cap in dollars
  optionable_only INTEGER NOT NULL DEFAULT 0,  -- 0 or 1

  -- Include/exclude lists (JSON arrays)
  include_list TEXT,          -- Always include these symbols
  exclude_list TEXT,          -- Never trade these symbols

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, testing, active, archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for universe_configs
CREATE INDEX IF NOT EXISTS idx_universe_configs_environment
  ON universe_configs(environment);

CREATE INDEX IF NOT EXISTS idx_universe_configs_status
  ON universe_configs(status);

CREATE INDEX IF NOT EXISTS idx_universe_configs_env_status
  ON universe_configs(environment, status);

-- Partial unique index: Only one active universe config per environment
CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_configs_env_active
  ON universe_configs(environment) WHERE status = 'active';

-- ============================================
-- Record this migration
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (11, 'runtime_config');
