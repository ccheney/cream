-- Migration: Indicator Engine v2 Tables
-- Creates batch indicator storage tables for the v2 indicator engine
-- @see docs/plans/33-indicator-engine-v2.md

-- ============================================
-- Fundamental Indicators (nightly batch from FMP)
-- ============================================
CREATE TABLE IF NOT EXISTS fundamental_indicators (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,  -- YYYY-MM-DD

  -- Value factors
  pe_ratio_ttm REAL,
  pe_ratio_forward REAL,
  pb_ratio REAL,
  ev_ebitda REAL,
  earnings_yield REAL,
  dividend_yield REAL,
  cape_10yr REAL,

  -- Quality factors
  gross_profitability REAL,
  roe REAL,
  roa REAL,
  asset_growth REAL,
  accruals_ratio REAL,
  cash_flow_quality REAL,
  beneish_m_score REAL,

  -- Size/market context
  market_cap REAL,
  sector TEXT,
  industry TEXT,

  -- Metadata
  source TEXT NOT NULL DEFAULT 'FMP',
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_fundamental_symbol_date ON fundamental_indicators(symbol, date);
CREATE INDEX IF NOT EXISTS idx_fundamental_symbol ON fundamental_indicators(symbol);

-- ============================================
-- Short Interest Indicators (bi-weekly batch from FINRA)
-- ============================================
CREATE TABLE IF NOT EXISTS short_interest_indicators (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  settlement_date TEXT NOT NULL,  -- FINRA settlement date

  short_interest REAL NOT NULL,        -- Total short shares
  short_interest_ratio REAL,           -- Short / Avg Daily Volume
  days_to_cover REAL,
  short_pct_float REAL,
  short_interest_change REAL,          -- vs previous period

  -- Metadata
  source TEXT NOT NULL DEFAULT 'FINRA',
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(symbol, settlement_date)
);

CREATE INDEX IF NOT EXISTS idx_short_interest_symbol ON short_interest_indicators(symbol, settlement_date);
CREATE INDEX IF NOT EXISTS idx_short_interest_settlement ON short_interest_indicators(settlement_date);

-- ============================================
-- Sentiment Indicators (nightly aggregation)
-- ============================================
CREATE TABLE IF NOT EXISTS sentiment_indicators (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,

  sentiment_score REAL,            -- -1 to 1
  sentiment_strength REAL,         -- 0 to 1
  news_volume INTEGER,             -- Article count
  sentiment_momentum REAL,         -- 7-day vs 30-day
  event_risk_flag INTEGER DEFAULT 0,  -- Boolean as integer

  -- Breakdown by source
  news_sentiment REAL,
  social_sentiment REAL,
  analyst_sentiment REAL,

  -- Metadata
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_sentiment_symbol_date ON sentiment_indicators(symbol, date);
CREATE INDEX IF NOT EXISTS idx_sentiment_symbol ON sentiment_indicators(symbol);

-- ============================================
-- Options-derived Snapshot Cache (refreshed hourly)
-- ============================================
CREATE TABLE IF NOT EXISTS options_indicators_cache (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,

  implied_volatility REAL,
  iv_percentile_30d REAL,
  iv_skew REAL,
  put_call_ratio REAL,
  vrp REAL,
  term_structure_slope REAL,

  -- Greeks aggregates (for portfolio positions)
  net_delta REAL,
  net_gamma REAL,
  net_theta REAL,
  net_vega REAL,

  expires_at TEXT NOT NULL,  -- Cache expiration

  UNIQUE(symbol)
);

CREATE INDEX IF NOT EXISTS idx_options_cache_symbol ON options_indicators_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_options_cache_expires ON options_indicators_cache(expires_at);

-- ============================================
-- Corporate Actions Indicators (daily update)
-- ============================================
CREATE TABLE IF NOT EXISTS corporate_actions_indicators (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,

  trailing_dividend_yield REAL,
  ex_dividend_days INTEGER,        -- Days until next ex-date
  upcoming_earnings_days INTEGER,  -- Days until next earnings
  recent_split INTEGER DEFAULT 0,  -- Boolean as integer
  split_ratio TEXT,                -- e.g., "4:1"

  UNIQUE(symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_corp_actions_symbol ON corporate_actions_indicators(symbol, date);
CREATE INDEX IF NOT EXISTS idx_corp_actions_symbol_only ON corporate_actions_indicators(symbol);

-- ============================================
-- Indicator Sync Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS indicator_sync_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,          -- 'fundamentals', 'short_interest', 'sentiment', 'corporate_actions'
  started_at TEXT NOT NULL,
  completed_at TEXT,
  symbols_processed INTEGER DEFAULT 0,
  symbols_failed INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed'
  error_message TEXT,
  environment TEXT NOT NULL        -- 'BACKTEST', 'PAPER', 'LIVE'
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_type ON indicator_sync_runs(run_type);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON indicator_sync_runs(status);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON indicator_sync_runs(started_at);
