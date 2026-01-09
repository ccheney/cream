-- ============================================
-- Factor Zoo Tables
-- ============================================
-- hypotheses, factors, factor_performance, factor_correlations,
-- research_runs, factor_weights, paper_signals

CREATE TABLE IF NOT EXISTS hypotheses (
  hypothesis_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  economic_rationale TEXT NOT NULL,
  market_mechanism TEXT NOT NULL,
  target_regime TEXT,
  falsification_criteria TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',  -- proposed, testing, validated, rejected
  iteration INTEGER NOT NULL DEFAULT 1,
  parent_hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON hypotheses(status);

CREATE TABLE IF NOT EXISTS factors (
  factor_id TEXT PRIMARY KEY,
  hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'research',  -- research, stage1, stage2, paper, active, decaying, retired
  version INTEGER NOT NULL DEFAULT 1,
  author TEXT NOT NULL DEFAULT 'claude-code',
  python_module TEXT,
  typescript_module TEXT,
  symbolic_length INTEGER,
  parameter_count INTEGER,
  feature_count INTEGER,
  originality_score REAL,
  hypothesis_alignment REAL,
  stage1_sharpe REAL,
  stage1_ic REAL,
  stage1_max_drawdown REAL,
  stage1_completed_at TEXT,
  stage2_pbo REAL,
  stage2_dsr_pvalue REAL,
  stage2_wfe REAL,
  stage2_completed_at TEXT,
  paper_validation_passed INTEGER DEFAULT 0,
  paper_start_date TEXT,
  paper_end_date TEXT,
  paper_realized_sharpe REAL,
  paper_realized_ic REAL,
  current_weight REAL DEFAULT 0.0,
  last_ic REAL,
  decay_rate REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  promoted_at TEXT,
  retired_at TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_factors_status ON factors(status);
CREATE INDEX IF NOT EXISTS idx_factors_hypothesis ON factors(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_factors_active ON factors(status) WHERE status IN ('active', 'decaying');

CREATE TABLE IF NOT EXISTS factor_performance (
  id TEXT PRIMARY KEY,
  factor_id TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  ic REAL NOT NULL,
  icir REAL,
  sharpe REAL,
  weight REAL NOT NULL DEFAULT 0.0,
  signal_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(factor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_factor_perf_factor_date ON factor_performance(factor_id, date);

CREATE TABLE IF NOT EXISTS factor_correlations (
  factor_id_1 TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  factor_id_2 TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  correlation REAL NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(factor_id_1, factor_id_2)
);

CREATE TABLE IF NOT EXISTS research_runs (
  run_id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,      -- scheduled, decay_detected, regime_change, manual, refinement
  trigger_reason TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'idea',  -- idea, implementation, stage1, stage2, translation, equivalence, paper, promotion, completed, failed
  current_iteration INTEGER NOT NULL DEFAULT 1,
  hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
  factor_id TEXT REFERENCES factors(factor_id),
  pr_url TEXT,
  error_message TEXT,
  tokens_used INTEGER DEFAULT 0,
  compute_hours REAL DEFAULT 0.0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_runs_phase ON research_runs(phase);
CREATE INDEX IF NOT EXISTS idx_research_runs_trigger ON research_runs(trigger_type);
CREATE INDEX IF NOT EXISTS idx_research_runs_hypothesis ON research_runs(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_research_runs_factor ON research_runs(factor_id);

CREATE TABLE IF NOT EXISTS factor_weights (
  factor_id TEXT PRIMARY KEY REFERENCES factors(factor_id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 0.0,
  last_ic REAL,
  last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paper_signals (
  id TEXT PRIMARY KEY,
  factor_id TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  signal_date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  signal_value REAL NOT NULL,
  direction TEXT NOT NULL,         -- long, short
  entry_price REAL,
  exit_price REAL,
  actual_return REAL,
  predicted_return REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(factor_id, signal_date, symbol)
);

CREATE INDEX IF NOT EXISTS idx_paper_signals_factor ON paper_signals(factor_id);
CREATE INDEX IF NOT EXISTS idx_paper_signals_date ON paper_signals(signal_date);
CREATE INDEX IF NOT EXISTS idx_paper_signals_factor_date ON paper_signals(factor_id, signal_date);
