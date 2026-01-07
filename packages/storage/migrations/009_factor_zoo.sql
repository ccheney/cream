-- Migration 009: Factor Zoo Schema
--
-- Implements the Factor Zoo database schema for managing alpha factors throughout
-- their lifecycle following the AlphaForge pattern (AAAI 2025).
--
-- Reference: docs/plans/20-research-to-production-pipeline.md
-- AlphaForge Paper: https://arxiv.org/html/2406.18394v1

-- ============================================
-- Hypotheses Table
-- ============================================
-- Economic hypotheses that drive factor generation.
-- Factors are implementations of hypotheses that can be validated.

CREATE TABLE IF NOT EXISTS hypotheses (
  hypothesis_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  economic_rationale TEXT NOT NULL,
  market_mechanism TEXT NOT NULL,
  target_regime TEXT, -- 'bull', 'bear', 'sideways', 'volatile', 'all'
  falsification_criteria TEXT, -- JSON: conditions that would invalidate the hypothesis
  status TEXT NOT NULL DEFAULT 'proposed', -- Valid: 'proposed', 'implementing', 'validating', 'validated', 'rejected'
  iteration INTEGER NOT NULL DEFAULT 1,
  parent_hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Factors Table
-- ============================================
-- Alpha factors with complete lifecycle tracking.
-- Extends the concept from indicators with research-specific metadata.

CREATE TABLE IF NOT EXISTS factors (
  factor_id TEXT PRIMARY KEY,
  hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'research', -- Valid: 'research', 'validating', 'active', 'decaying', 'retired'
  version INTEGER NOT NULL DEFAULT 1,
  author TEXT NOT NULL DEFAULT 'claude-code',

  -- Implementation
  python_module TEXT, -- Path to Python implementation
  typescript_module TEXT, -- Path to TypeScript implementation

  -- Complexity metrics (AlphaForge regularization)
  symbolic_length INTEGER, -- AST node count
  parameter_count INTEGER,
  feature_count INTEGER,

  -- Quality metrics
  originality_score REAL, -- 0-1, how different from existing factors
  hypothesis_alignment REAL, -- 0-1, how well it matches the hypothesis

  -- Stage 1 validation (backtesting)
  stage1_sharpe REAL,
  stage1_ic REAL,
  stage1_max_drawdown REAL,
  stage1_completed_at TEXT,

  -- Stage 2 validation (statistical rigor)
  stage2_pbo REAL, -- Probability of Backtest Overfitting
  stage2_dsr_pvalue REAL, -- Deflated Sharpe Ratio p-value
  stage2_wfe REAL, -- Walk-Forward Efficiency
  stage2_completed_at TEXT,

  -- Paper trading validation
  paper_validation_passed INTEGER DEFAULT 0, -- Boolean
  paper_start_date TEXT,
  paper_end_date TEXT,
  paper_realized_sharpe REAL,
  paper_realized_ic REAL,

  -- Production state
  current_weight REAL DEFAULT 0.0, -- Dynamic weight in mega-alpha
  last_ic REAL, -- Most recent IC value
  decay_rate REAL, -- Measured decay rate (negative is good)

  -- Lifecycle timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  promoted_at TEXT, -- When moved to active
  retired_at TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Factor Performance Table
-- ============================================
-- Daily performance tracking for active factors.
-- Used for weight adjustment and decay monitoring.

CREATE TABLE IF NOT EXISTS factor_performance (
  id TEXT PRIMARY KEY,
  factor_id TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  ic REAL NOT NULL, -- Information Coefficient
  icir REAL, -- IC Information Ratio (rolling)
  sharpe REAL, -- Daily Sharpe contribution
  weight REAL NOT NULL DEFAULT 0.0, -- Weight used on this day
  signal_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(factor_id, date)
);

-- ============================================
-- Factor Correlations Table
-- ============================================
-- Pairwise correlations between factors for orthogonality tracking.

CREATE TABLE IF NOT EXISTS factor_correlations (
  factor_id_1 TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  factor_id_2 TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  correlation REAL NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY(factor_id_1, factor_id_2)
  -- Note: factor_id_1 < factor_id_2 canonical ordering enforced at application layer
);

-- ============================================
-- Research Runs Table
-- ============================================
-- Tracks complete research pipeline runs from trigger to completion.

CREATE TABLE IF NOT EXISTS research_runs (
  run_id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL, -- Valid: 'scheduled', 'decay_detected', 'regime_change', 'manual', 'refinement'
  trigger_reason TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'idea', -- Valid: 'idea', 'implementation', 'stage1', 'stage2', 'translation', 'equivalence', 'paper', 'promotion', 'completed', 'failed'
  current_iteration INTEGER NOT NULL DEFAULT 1,

  -- Related entities
  hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
  factor_id TEXT REFERENCES factors(factor_id),

  -- Output
  pr_url TEXT, -- GitHub PR URL if code was generated
  error_message TEXT, -- Error if failed

  -- Resource tracking
  tokens_used INTEGER DEFAULT 0,
  compute_hours REAL DEFAULT 0.0,

  -- Timestamps
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- ============================================
-- Indexes
-- ============================================

-- Hypotheses
CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON hypotheses(status);
CREATE INDEX IF NOT EXISTS idx_hypotheses_parent ON hypotheses(parent_hypothesis_id);

-- Factors
CREATE INDEX IF NOT EXISTS idx_factors_status ON factors(status);
CREATE INDEX IF NOT EXISTS idx_factors_hypothesis ON factors(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_factors_active ON factors(status) WHERE status IN ('active', 'decaying');
CREATE INDEX IF NOT EXISTS idx_factors_weight ON factors(current_weight) WHERE status = 'active';

-- Factor Performance
CREATE INDEX IF NOT EXISTS idx_factor_perf_factor_date ON factor_performance(factor_id, date);
CREATE INDEX IF NOT EXISTS idx_factor_perf_date ON factor_performance(date);

-- Factor Correlations
CREATE INDEX IF NOT EXISTS idx_factor_corr_factor1 ON factor_correlations(factor_id_1);
CREATE INDEX IF NOT EXISTS idx_factor_corr_factor2 ON factor_correlations(factor_id_2);

-- Research Runs
CREATE INDEX IF NOT EXISTS idx_research_runs_phase ON research_runs(phase);
CREATE INDEX IF NOT EXISTS idx_research_runs_trigger ON research_runs(trigger_type);
CREATE INDEX IF NOT EXISTS idx_research_runs_hypothesis ON research_runs(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_research_runs_factor ON research_runs(factor_id);

-- ============================================
-- Schema Migration Tracking
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (9, 'factor_zoo');
