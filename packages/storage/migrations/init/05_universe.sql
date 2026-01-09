-- ============================================
-- Historical Universe Tables
-- ============================================
-- index_constituents, ticker_changes, universe_snapshots

CREATE TABLE IF NOT EXISTS index_constituents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  index_id TEXT NOT NULL,          -- SP500, NDX100, DJIA
  symbol TEXT NOT NULL,
  date_added TEXT NOT NULL,
  date_removed TEXT,
  reason_added TEXT,
  reason_removed TEXT,
  sector TEXT,
  industry TEXT,
  market_cap_at_add REAL,
  provider TEXT NOT NULL DEFAULT 'fmp',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_index_constituents_pit ON index_constituents(index_id, date_added, date_removed);
CREATE INDEX IF NOT EXISTS idx_index_constituents_symbol ON index_constituents(symbol, index_id);
CREATE INDEX IF NOT EXISTS idx_index_constituents_current ON index_constituents(index_id, date_removed) WHERE date_removed IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_index_constituents_unique ON index_constituents(index_id, symbol, date_added);

CREATE TABLE IF NOT EXISTS ticker_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_symbol TEXT NOT NULL,
  new_symbol TEXT NOT NULL,
  change_date TEXT NOT NULL,
  change_type TEXT NOT NULL,       -- rename, merger, spinoff, delisted
  conversion_ratio REAL,
  reason TEXT,
  acquiring_company TEXT,
  provider TEXT NOT NULL DEFAULT 'fmp',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticker_changes_old ON ticker_changes(old_symbol, change_date);
CREATE INDEX IF NOT EXISTS idx_ticker_changes_new ON ticker_changes(new_symbol, change_date);
CREATE INDEX IF NOT EXISTS idx_ticker_changes_date ON ticker_changes(change_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticker_changes_unique ON ticker_changes(old_symbol, new_symbol, change_date);

CREATE TABLE IF NOT EXISTS universe_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  index_id TEXT NOT NULL,
  tickers TEXT NOT NULL,
  ticker_count INTEGER NOT NULL,
  source_version TEXT,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_snapshots_pit ON universe_snapshots(index_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_universe_snapshots_date ON universe_snapshots(snapshot_date);
