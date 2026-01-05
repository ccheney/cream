-- ============================================
-- Migration 003: Market Data Tables
-- ============================================
-- Creates tables for market data storage and feature computation.
-- Tables: candles, corporate_actions, universe_cache, features, regime_labels
--
-- @see docs/plans/02-data-layer.md

-- ============================================
-- 14. candles
-- ============================================
-- OHLCV candle data with quality flags.
-- Primary storage for price data used in indicator computation.

CREATE TABLE IF NOT EXISTS candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w')),
  timestamp TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL DEFAULT 0,
  vwap REAL,
  trade_count INTEGER,
  -- Quality flags
  adjusted INTEGER NOT NULL DEFAULT 0 CHECK (adjusted IN (0, 1)),
  split_adjusted INTEGER NOT NULL DEFAULT 0 CHECK (split_adjusted IN (0, 1)),
  dividend_adjusted INTEGER NOT NULL DEFAULT 0 CHECK (dividend_adjusted IN (0, 1)),
  quality_flags TEXT, -- JSON array of quality issues (gaps, stale, suspicious)
  provider TEXT NOT NULL DEFAULT 'polygon',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Primary composite index for time-range queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_symbol_timeframe_ts
  ON candles(symbol, timeframe, timestamp);

-- For date range scans
CREATE INDEX IF NOT EXISTS idx_candles_timestamp ON candles(timestamp);

-- For symbol lookups
CREATE INDEX IF NOT EXISTS idx_candles_symbol ON candles(symbol);

-- For timeframe filtering
CREATE INDEX IF NOT EXISTS idx_candles_timeframe ON candles(timeframe);

-- ============================================
-- 15. corporate_actions
-- ============================================
-- Stock splits, dividends, mergers for price adjustment.

CREATE TABLE IF NOT EXISTS corporate_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'split', 'reverse_split', 'dividend', 'special_dividend',
    'spinoff', 'merger', 'acquisition', 'delisting', 'name_change'
  )),
  ex_date TEXT NOT NULL,
  record_date TEXT,
  pay_date TEXT,
  -- For splits: split_ratio (e.g., 4.0 for 4:1 split)
  ratio REAL,
  -- For dividends: amount per share
  amount REAL,
  -- Additional details as JSON
  details TEXT,
  provider TEXT NOT NULL DEFAULT 'polygon',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Primary index for symbol + date queries
CREATE INDEX IF NOT EXISTS idx_corporate_actions_symbol_date
  ON corporate_actions(symbol, ex_date);

-- For scanning by ex_date
CREATE INDEX IF NOT EXISTS idx_corporate_actions_ex_date ON corporate_actions(ex_date);

-- For type filtering
CREATE INDEX IF NOT EXISTS idx_corporate_actions_type ON corporate_actions(action_type);

-- Unique constraint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_corporate_actions_unique
  ON corporate_actions(symbol, action_type, ex_date);

-- ============================================
-- 16. universe_cache
-- ============================================
-- Cached universe resolution results with TTL.
-- Stores index constituents, ETF holdings, screener results.

CREATE TABLE IF NOT EXISTS universe_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'index', 'etf', 'screener', 'static', 'custom'
  )),
  source_id TEXT NOT NULL, -- e.g., 'SP500', 'QQQ', 'custom-tech'
  source_hash TEXT NOT NULL, -- Hash of source config for cache invalidation
  tickers TEXT NOT NULL, -- JSON array of symbols
  ticker_count INTEGER NOT NULL,
  metadata TEXT, -- JSON with source-specific metadata
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  provider TEXT
);

-- Primary lookup by source
CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_cache_source
  ON universe_cache(source_type, source_id);

-- For cache expiration checks
CREATE INDEX IF NOT EXISTS idx_universe_cache_expires ON universe_cache(expires_at);

-- For hash-based lookups
CREATE INDEX IF NOT EXISTS idx_universe_cache_hash ON universe_cache(source_hash);

-- ============================================
-- 17. features
-- ============================================
-- Computed indicator values with raw and normalized forms.
-- Used by ML models and regime classification.

CREATE TABLE IF NOT EXISTS features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w')),
  indicator_name TEXT NOT NULL,
  -- Values
  raw_value REAL NOT NULL,
  normalized_value REAL, -- Z-score or percentile normalized
  -- Parameters used for computation (for reproducibility)
  parameters TEXT, -- JSON
  -- Quality
  quality_score REAL CHECK (quality_score >= 0 AND quality_score <= 1),
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Primary composite index for lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_features_symbol_ts_indicator
  ON features(symbol, timestamp, timeframe, indicator_name);

-- For time-series retrieval
CREATE INDEX IF NOT EXISTS idx_features_symbol_indicator_ts
  ON features(symbol, indicator_name, timestamp);

-- For batch computation queries
CREATE INDEX IF NOT EXISTS idx_features_timestamp ON features(timestamp);

-- For indicator-specific queries
CREATE INDEX IF NOT EXISTS idx_features_indicator ON features(indicator_name);

-- ============================================
-- 18. regime_labels
-- ============================================
-- Market regime classification results.
-- Labels: bull_trend, bear_trend, range_bound, high_volatility, low_volatility, crisis

CREATE TABLE IF NOT EXISTS regime_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL, -- '_MARKET' for market-wide regime
  timestamp TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d', '1w')),
  regime TEXT NOT NULL CHECK (regime IN (
    'bull_trend', 'bear_trend', 'range_bound',
    'high_volatility', 'low_volatility', 'crisis'
  )),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  -- Additional regime metrics
  trend_strength REAL,
  volatility_percentile REAL,
  correlation_to_market REAL,
  -- Source model info
  model_name TEXT NOT NULL DEFAULT 'hmm_regime',
  model_version TEXT,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Primary composite index
CREATE UNIQUE INDEX IF NOT EXISTS idx_regime_labels_symbol_ts_tf
  ON regime_labels(symbol, timestamp, timeframe);

-- For time-series queries
CREATE INDEX IF NOT EXISTS idx_regime_labels_symbol_ts
  ON regime_labels(symbol, timestamp);

-- For regime filtering
CREATE INDEX IF NOT EXISTS idx_regime_labels_regime ON regime_labels(regime);

-- For market-wide regime queries
CREATE INDEX IF NOT EXISTS idx_regime_labels_market
  ON regime_labels(symbol, timestamp) WHERE symbol = '_MARKET';

-- ============================================
-- Record this migration
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (3, '003_market_data_tables');
