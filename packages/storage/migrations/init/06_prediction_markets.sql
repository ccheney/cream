-- ============================================
-- Prediction Markets Tables
-- ============================================
-- prediction_market_snapshots, prediction_market_signals, prediction_market_arbitrage

CREATE TABLE IF NOT EXISTS prediction_market_snapshots (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,          -- kalshi, polymarket
  market_ticker TEXT NOT NULL,
  market_type TEXT NOT NULL,       -- rate, election, economic
  market_question TEXT,
  snapshot_time TEXT NOT NULL,
  data JSON NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_snapshots_platform ON prediction_market_snapshots(platform);
CREATE INDEX IF NOT EXISTS idx_pm_snapshots_ticker ON prediction_market_snapshots(market_ticker);
CREATE INDEX IF NOT EXISTS idx_pm_snapshots_type ON prediction_market_snapshots(market_type);
CREATE INDEX IF NOT EXISTS idx_pm_snapshots_time ON prediction_market_snapshots(snapshot_time);

CREATE TABLE IF NOT EXISTS prediction_market_signals (
  id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL,
  signal_value REAL NOT NULL,
  confidence REAL,
  computed_at TEXT NOT NULL,
  inputs JSON NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_signals_type ON prediction_market_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_pm_signals_time ON prediction_market_signals(computed_at);

CREATE TABLE IF NOT EXISTS prediction_market_arbitrage (
  id TEXT PRIMARY KEY,
  kalshi_ticker TEXT NOT NULL,
  polymarket_token TEXT NOT NULL,
  kalshi_price REAL NOT NULL,
  polymarket_price REAL NOT NULL,
  divergence_pct REAL NOT NULL,
  market_type TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_price REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_arbitrage_divergence ON prediction_market_arbitrage(divergence_pct);
CREATE INDEX IF NOT EXISTS idx_pm_arbitrage_detected ON prediction_market_arbitrage(detected_at);
CREATE INDEX IF NOT EXISTS idx_pm_arbitrage_unresolved ON prediction_market_arbitrage(resolved_at) WHERE resolved_at IS NULL;
