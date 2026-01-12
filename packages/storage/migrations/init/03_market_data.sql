-- ============================================
-- Market Data Tables
-- ============================================
-- candles, corporate_actions, universe_cache, features, regime_labels

-- candles: OHLCV data
CREATE TABLE IF NOT EXISTS candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,         -- 1m, 5m, 15m, 1h, 1d
  timestamp TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL DEFAULT 0,
  vwap REAL,
  trade_count INTEGER,
  adjusted INTEGER NOT NULL DEFAULT 0,
  split_adjusted INTEGER NOT NULL DEFAULT 0,
  dividend_adjusted INTEGER NOT NULL DEFAULT 0,
  quality_flags TEXT,
  provider TEXT NOT NULL DEFAULT 'alpaca',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_symbol_timeframe_ts ON candles(symbol, timeframe, timestamp);
CREATE INDEX IF NOT EXISTS idx_candles_timestamp ON candles(timestamp);
CREATE INDEX IF NOT EXISTS idx_candles_symbol ON candles(symbol);
CREATE INDEX IF NOT EXISTS idx_candles_timeframe ON candles(timeframe);

-- corporate_actions: Splits, dividends, mergers
CREATE TABLE IF NOT EXISTS corporate_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  action_type TEXT NOT NULL,       -- split, dividend, merger, spinoff
  ex_date TEXT NOT NULL,
  record_date TEXT,
  pay_date TEXT,
  ratio REAL,
  amount REAL,
  details TEXT,
  provider TEXT NOT NULL DEFAULT 'alpaca',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_corporate_actions_symbol_date ON corporate_actions(symbol, ex_date);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_ex_date ON corporate_actions(ex_date);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_type ON corporate_actions(action_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_corporate_actions_unique ON corporate_actions(symbol, action_type, ex_date);

-- universe_cache: Cached universe resolution
CREATE TABLE IF NOT EXISTS universe_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  tickers TEXT NOT NULL,
  ticker_count INTEGER NOT NULL,
  metadata TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  provider TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_cache_source ON universe_cache(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_universe_cache_expires ON universe_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_universe_cache_hash ON universe_cache(source_hash);

-- features: Computed indicators
CREATE TABLE IF NOT EXISTS features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  indicator_name TEXT NOT NULL,
  raw_value REAL NOT NULL,
  normalized_value REAL,
  parameters TEXT,
  quality_score REAL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_features_symbol_ts_indicator ON features(symbol, timestamp, timeframe, indicator_name);
CREATE INDEX IF NOT EXISTS idx_features_symbol_indicator_ts ON features(symbol, indicator_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_features_timestamp ON features(timestamp);
CREATE INDEX IF NOT EXISTS idx_features_indicator ON features(indicator_name);

-- regime_labels: Market regime classifications
CREATE TABLE IF NOT EXISTS regime_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  regime TEXT NOT NULL,            -- trending_up, trending_down, ranging, volatile
  confidence REAL NOT NULL,
  trend_strength REAL,
  volatility_percentile REAL,
  correlation_to_market REAL,
  model_name TEXT NOT NULL DEFAULT 'hmm_regime',
  model_version TEXT,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_regime_labels_symbol_ts_tf ON regime_labels(symbol, timestamp, timeframe);
CREATE INDEX IF NOT EXISTS idx_regime_labels_symbol_ts ON regime_labels(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_regime_labels_regime ON regime_labels(regime);
CREATE INDEX IF NOT EXISTS idx_regime_labels_market ON regime_labels(symbol, timestamp) WHERE symbol = '_MARKET';
