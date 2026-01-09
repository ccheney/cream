-- ============================================
-- Indicator Synthesis Tables
-- ============================================
-- indicators, indicator_trials, indicator_ic_history

CREATE TABLE IF NOT EXISTS indicators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,          -- momentum, trend, volatility, volume, sentiment
  status TEXT NOT NULL DEFAULT 'staging',  -- staging, paper, production, retired
  hypothesis TEXT NOT NULL,
  economic_rationale TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  code_hash TEXT,
  ast_signature TEXT,
  validation_report TEXT,
  paper_trading_start TEXT,
  paper_trading_end TEXT,
  paper_trading_report TEXT,
  promoted_at TEXT,
  pr_url TEXT,
  merged_at TEXT,
  retired_at TEXT,
  retirement_reason TEXT,
  similar_to TEXT REFERENCES indicators(id),
  replaces TEXT REFERENCES indicators(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_indicators_status ON indicators(status);
CREATE INDEX IF NOT EXISTS idx_indicators_category ON indicators(category);
CREATE INDEX IF NOT EXISTS idx_indicators_code_hash ON indicators(code_hash);
CREATE INDEX IF NOT EXISTS idx_indicators_active ON indicators(status) WHERE status IN ('paper', 'production');

CREATE TABLE IF NOT EXISTS indicator_trials (
  id TEXT PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  trial_number INTEGER NOT NULL,
  hypothesis TEXT NOT NULL,
  parameters TEXT NOT NULL,
  sharpe_ratio REAL,
  information_coefficient REAL,
  max_drawdown REAL,
  calmar_ratio REAL,
  sortino_ratio REAL,
  selected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(indicator_id, trial_number)
);

CREATE INDEX IF NOT EXISTS idx_trials_indicator ON indicator_trials(indicator_id);

CREATE TABLE IF NOT EXISTS indicator_ic_history (
  id TEXT PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  ic_value REAL NOT NULL,
  ic_std REAL NOT NULL,
  decisions_used_in INTEGER NOT NULL DEFAULT 0,
  decisions_correct INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(indicator_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ic_history_indicator_date ON indicator_ic_history(indicator_id, date);
