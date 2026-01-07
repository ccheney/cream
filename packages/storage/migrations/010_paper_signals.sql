-- Migration 010: Paper Trading Signals
--
-- Stores paper trading signals and outcomes for indicator evaluation.
-- Used to compare realized performance against backtested expectations
-- before promoting indicators to production.
--
-- Reference: docs/plans/19-dynamic-indicator-synthesis.md (lines 955-1000)

-- ============================================
-- Paper Trading Signals Table
-- ============================================
-- Records daily signals and eventual forward returns for validation.
-- The outcome is filled in once the horizon period (typically 5 days) passes.

CREATE TABLE IF NOT EXISTS indicator_paper_signals (
  id TEXT PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  signal REAL NOT NULL,
  outcome REAL, -- NULL until forward return is known
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(indicator_id, date, symbol)
);

-- ============================================
-- Indexes
-- ============================================
-- For querying signals by indicator and date range
CREATE INDEX IF NOT EXISTS idx_paper_signals_indicator_date
  ON indicator_paper_signals(indicator_id, date);

-- For finding pending outcomes (where outcome is NULL)
CREATE INDEX IF NOT EXISTS idx_paper_signals_pending
  ON indicator_paper_signals(indicator_id, outcome)
  WHERE outcome IS NULL;

-- ============================================
-- Schema Migration Tracking
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (10, 'paper_signals');
