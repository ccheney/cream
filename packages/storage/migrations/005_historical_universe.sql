-- ============================================
-- Migration 005: Historical Universe Tables
-- ============================================
-- Creates tables for point-in-time universe selection.
-- Prevents survivorship bias in backtesting by tracking historical
-- index compositions and ticker changes.
--
-- Note: CHECK constraints removed - Turso doesn't support them yet.
--
-- @see docs/plans/12-backtest.md - Survivorship Bias Prevention
--
-- Impact of survivorship bias: 1-4% annual return inflation
-- Point-in-time data ensures backtests only use stocks that existed
-- and were tradeable at each historical date.

-- ============================================
-- 19. index_constituents
-- ============================================
-- Historical index constituent membership.
-- Tracks when stocks were added/removed from indices.

CREATE TABLE IF NOT EXISTS index_constituents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  index_id TEXT NOT NULL, -- SP500, NASDAQ100, DOWJONES, RUSSELL2000, RUSSELL3000, SP400, SP600
  symbol TEXT NOT NULL,
  date_added TEXT NOT NULL, -- ISO8601 date when added to index
  date_removed TEXT, -- ISO8601 date when removed (NULL if current)
  reason_added TEXT, -- e.g., 'IPO', 'market_cap', 'reconstitution'
  reason_removed TEXT, -- e.g., 'merger', 'delisted', 'market_cap', 'reconstitution'
  -- Metadata
  sector TEXT,
  industry TEXT,
  market_cap_at_add REAL,
  provider TEXT NOT NULL DEFAULT 'fmp',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Primary index for point-in-time queries
CREATE INDEX IF NOT EXISTS idx_index_constituents_pit
  ON index_constituents(index_id, date_added, date_removed);

-- For looking up a specific symbol's history
CREATE INDEX IF NOT EXISTS idx_index_constituents_symbol
  ON index_constituents(symbol, index_id);

-- For current constituents (date_removed IS NULL)
CREATE INDEX IF NOT EXISTS idx_index_constituents_current
  ON index_constituents(index_id, date_removed)
  WHERE date_removed IS NULL;

-- Unique constraint: symbol can only be in an index once per period
CREATE UNIQUE INDEX IF NOT EXISTS idx_index_constituents_unique
  ON index_constituents(index_id, symbol, date_added);

-- ============================================
-- 20. ticker_changes
-- ============================================
-- Historical ticker symbol changes (renames, mergers).
-- Used to map old tickers to current tickers for backtesting.

CREATE TABLE IF NOT EXISTS ticker_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_symbol TEXT NOT NULL,
  new_symbol TEXT NOT NULL,
  change_date TEXT NOT NULL, -- ISO8601 date
  change_type TEXT NOT NULL, -- rename, merger, spinoff, acquisition, restructure
  -- For mergers/acquisitions, the ratio if applicable
  conversion_ratio REAL,
  -- Additional context
  reason TEXT,
  acquiring_company TEXT, -- For mergers/acquisitions
  provider TEXT NOT NULL DEFAULT 'fmp',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- For mapping old tickers to new
CREATE INDEX IF NOT EXISTS idx_ticker_changes_old
  ON ticker_changes(old_symbol, change_date);

-- For finding historical tickers of a current symbol
CREATE INDEX IF NOT EXISTS idx_ticker_changes_new
  ON ticker_changes(new_symbol, change_date);

-- For date range queries
CREATE INDEX IF NOT EXISTS idx_ticker_changes_date
  ON ticker_changes(change_date);

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticker_changes_unique
  ON ticker_changes(old_symbol, new_symbol, change_date);

-- ============================================
-- 21. universe_snapshots
-- ============================================
-- Point-in-time universe snapshots for backtest reproducibility.
-- Stores resolved universe at specific dates for fast lookups.

CREATE TABLE IF NOT EXISTS universe_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL, -- ISO8601 date
  index_id TEXT NOT NULL,
  tickers TEXT NOT NULL, -- JSON array of symbols valid on that date
  ticker_count INTEGER NOT NULL,
  -- Metadata for validation
  source_version TEXT, -- Version of FMP data used
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT -- Optional expiry for cache invalidation
);

-- Primary lookup for point-in-time resolution
CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_snapshots_pit
  ON universe_snapshots(index_id, snapshot_date);

-- For date range queries
CREATE INDEX IF NOT EXISTS idx_universe_snapshots_date
  ON universe_snapshots(snapshot_date);

-- ============================================
-- Record this migration
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (5, '005_historical_universe');
