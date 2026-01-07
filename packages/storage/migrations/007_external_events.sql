-- External Events Schema
-- Stores extracted events from news, transcripts, and macro releases
-- Processed by the @cream/external-context pipeline

-- External events table for storing extracted context
-- Valid source_types: news, press_release, transcript, macro
-- Valid event_types: earnings, guidance, merger_acquisition, product_launch, regulatory,
--   macro_release, analyst_rating, insider_trade, dividend, stock_split, layoffs,
--   executive_change, legal, other
CREATE TABLE IF NOT EXISTS external_events (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_time TEXT NOT NULL,
  processed_at TEXT NOT NULL,

  -- Extraction results (from Claude)
  sentiment TEXT NOT NULL,
  confidence REAL NOT NULL,
  importance INTEGER NOT NULL,
  summary TEXT NOT NULL,
  key_insights JSON NOT NULL,
  entities JSON NOT NULL,
  data_points JSON NOT NULL,

  -- Computed scores
  sentiment_score REAL NOT NULL,
  importance_score REAL NOT NULL,
  surprise_score REAL NOT NULL,

  -- Related instruments (tickers)
  related_instruments JSON NOT NULL,

  -- Original content for reference
  original_content TEXT NOT NULL,

  -- Metadata
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_external_events_event_time ON external_events(event_time);
CREATE INDEX IF NOT EXISTS idx_external_events_source_type ON external_events(source_type);
CREATE INDEX IF NOT EXISTS idx_external_events_event_type ON external_events(event_type);
CREATE INDEX IF NOT EXISTS idx_external_events_processed_at ON external_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_external_events_sentiment ON external_events(sentiment);
CREATE INDEX IF NOT EXISTS idx_external_events_importance ON external_events(importance_score);

-- Track schema version in migrations table
INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (7, 'external_events');
