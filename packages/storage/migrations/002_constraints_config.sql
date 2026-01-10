-- ============================================
-- Add constraints_config table
-- ============================================
-- Risk limits configuration table was added to init/10_runtime_config.sql
-- but may not exist if DB was created before that file was updated.

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

-- Record this migration in schema_migrations
INSERT INTO schema_migrations (version, name) VALUES (2, 'constraints_config');
