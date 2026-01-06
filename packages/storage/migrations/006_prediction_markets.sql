-- Prediction Markets Schema
-- Stores market snapshots and computed signals for historical analysis

-- Market snapshots for backtesting and historical analysis
-- Note: CHECK constraints not supported in Turso yet, validation done at app layer
-- Valid platforms: KALSHI, POLYMARKET
-- Valid market_types: FED_RATE, ECONOMIC_DATA, RECESSION, GEOPOLITICAL, REGULATORY, ELECTION, OTHER
CREATE TABLE IF NOT EXISTS prediction_market_snapshots (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  market_ticker TEXT NOT NULL,
  market_type TEXT NOT NULL,
  market_question TEXT,
  snapshot_time TEXT NOT NULL,
  data JSON NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_snapshots_platform ON prediction_market_snapshots(platform);
CREATE INDEX IF NOT EXISTS idx_pm_snapshots_ticker ON prediction_market_snapshots(market_ticker);
CREATE INDEX IF NOT EXISTS idx_pm_snapshots_type ON prediction_market_snapshots(market_type);
CREATE INDEX IF NOT EXISTS idx_pm_snapshots_time ON prediction_market_snapshots(snapshot_time);

-- Computed signals for performance analysis
-- Valid signal_types: fed_cut_probability, fed_hike_probability, recession_12m,
--   macro_uncertainty, policy_event_risk, cpi_surprise, gdp_surprise,
--   shutdown_probability, tariff_escalation
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

-- Arbitrage alerts for cross-platform divergence tracking
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
CREATE INDEX IF NOT EXISTS idx_pm_arbitrage_unresolved ON prediction_market_arbitrage(resolved_at)
  WHERE resolved_at IS NULL;

-- Track schema version in migrations table
INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (6, 'prediction_markets');
