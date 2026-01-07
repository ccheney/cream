-- Migration 008: Indicator Synthesis Schema
--
-- Implements the Dynamic Indicator Synthesis system data model.
-- Tracks the complete lifecycle of synthesized indicators from generation
-- through validation, paper trading, production, and retirement.
--
-- Reference: docs/plans/19-dynamic-indicator-synthesis.md (lines 58-137)
-- DSR Paper: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551

-- ============================================
-- Indicator Registry
-- ============================================
-- Main table tracking all synthesized indicators and their lifecycle status.
-- Supports multiple categories and tracks validation/production history.

CREATE TABLE IF NOT EXISTS indicators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL, -- Valid: 'momentum', 'trend', 'volatility', 'volume', 'custom'
  status TEXT NOT NULL DEFAULT 'staging', -- Valid: 'staging', 'paper', 'production', 'retired'

  -- Generation metadata
  hypothesis TEXT NOT NULL,
  economic_rationale TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  generated_by TEXT NOT NULL, -- cycle_id that triggered generation

  -- Code and implementation
  code_hash TEXT, -- SHA256 of generated code for deduplication
  ast_signature TEXT, -- Normalized AST for similarity detection

  -- Validation results (JSON blobs)
  validation_report TEXT, -- JSON: DSR, PBO, IC, walk-forward results
  paper_trading_start TEXT,
  paper_trading_end TEXT,
  paper_trading_report TEXT, -- JSON: realized vs backtested metrics

  -- Production tracking
  promoted_at TEXT,
  pr_url TEXT,
  merged_at TEXT,

  -- Retirement
  retired_at TEXT,
  retirement_reason TEXT,

  -- Relationships
  similar_to TEXT REFERENCES indicators(id), -- indicator_id if derived from existing
  replaces TEXT REFERENCES indicators(id), -- indicator_id if replacing

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Indicator Trials (for DSR Calculation)
-- ============================================
-- Tracks all trials during indicator development for Deflated Sharpe Ratio
-- calculation per Bailey & Lopez de Prado (2014). The DSR adjusts the Sharpe
-- ratio for multiple testing bias by accounting for the number of trials.

CREATE TABLE IF NOT EXISTS indicator_trials (
  id TEXT PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  trial_number INTEGER NOT NULL,

  -- Trial parameters
  hypothesis TEXT NOT NULL,
  parameters TEXT NOT NULL, -- JSON: parameter settings for this trial

  -- Results
  sharpe_ratio REAL,
  information_coefficient REAL,
  max_drawdown REAL,
  calmar_ratio REAL,
  sortino_ratio REAL,

  -- Selection (0 = not selected, 1 = selected)
  selected INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(indicator_id, trial_number)
);

-- ============================================
-- Rolling IC History
-- ============================================
-- Tracks the Information Coefficient of production indicators over time.
-- Used for monitoring indicator decay and triggering retirement.

CREATE TABLE IF NOT EXISTS indicator_ic_history (
  id TEXT PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  date TEXT NOT NULL,

  -- Daily IC values
  ic_value REAL NOT NULL,
  ic_std REAL NOT NULL,

  -- Contribution to decisions
  decisions_used_in INTEGER NOT NULL DEFAULT 0,
  decisions_correct INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(indicator_id, date)
);

-- ============================================
-- Indexes
-- ============================================
-- Status and category for filtering indicators by lifecycle stage
CREATE INDEX IF NOT EXISTS idx_indicators_status ON indicators(status);
CREATE INDEX IF NOT EXISTS idx_indicators_category ON indicators(category);

-- Code hash for deduplication checks
CREATE INDEX IF NOT EXISTS idx_indicators_code_hash ON indicators(code_hash);

-- IC history for time-series queries per indicator
CREATE INDEX IF NOT EXISTS idx_ic_history_indicator_date ON indicator_ic_history(indicator_id, date);

-- Trials by indicator for DSR calculation
CREATE INDEX IF NOT EXISTS idx_trials_indicator ON indicator_trials(indicator_id);

-- Active indicators for decision-making
CREATE INDEX IF NOT EXISTS idx_indicators_active ON indicators(status) WHERE status IN ('paper', 'production');

-- ============================================
-- Schema Migration Tracking
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (8, 'indicator_synthesis');
