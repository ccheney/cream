-- Overnight macro watch entries accumulated hourly
-- Used by the MacroWatch workflow to track overnight developments
-- @see docs/plans/42-overnight-macro-watch.md

CREATE TABLE macro_watch_entries (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  session TEXT NOT NULL,          -- 'OVERNIGHT', 'PRE_MARKET', 'AFTER_HOURS'
  category TEXT NOT NULL,         -- 'NEWS', 'PREDICTION', 'ECONOMIC', 'MOVER', 'EARNINGS'
  headline TEXT NOT NULL,
  symbols TEXT NOT NULL,          -- JSON array of affected tickers
  source TEXT NOT NULL,           -- Data provider
  metadata TEXT,                  -- JSON object for additional data
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_macro_watch_timestamp ON macro_watch_entries(timestamp);
CREATE INDEX idx_macro_watch_date ON macro_watch_entries(date(timestamp));
CREATE INDEX idx_macro_watch_category ON macro_watch_entries(category);
CREATE INDEX idx_macro_watch_session ON macro_watch_entries(session);

-- Morning newspapers compiled near market open
-- Aggregates overnight MacroWatchEntries into concise digest
CREATE TABLE morning_newspapers (
  id TEXT PRIMARY KEY,
  date TEXT UNIQUE NOT NULL,      -- YYYY-MM-DD
  compiled_at TEXT NOT NULL,
  sections TEXT NOT NULL,         -- JSON object with macro, universe, predictionMarkets, economicCalendar
  raw_entry_ids TEXT NOT NULL,    -- JSON array of source MacroWatchEntry IDs
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_morning_newspapers_date ON morning_newspapers(date);
