-- ============================================
-- External Events Table
-- ============================================
-- external_events

CREATE TABLE IF NOT EXISTS external_events (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,       -- news, earnings, sec_filing, fed
  event_type TEXT NOT NULL,
  event_time TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  sentiment TEXT NOT NULL,         -- positive, negative, neutral
  confidence REAL NOT NULL,
  importance INTEGER NOT NULL,     -- 1-5
  summary TEXT NOT NULL,
  key_insights JSON NOT NULL,
  entities JSON NOT NULL,
  data_points JSON NOT NULL,
  sentiment_score REAL NOT NULL,
  importance_score REAL NOT NULL,
  surprise_score REAL NOT NULL,
  related_instruments JSON NOT NULL,
  original_content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_external_events_event_time ON external_events(event_time);
CREATE INDEX IF NOT EXISTS idx_external_events_source_type ON external_events(source_type);
CREATE INDEX IF NOT EXISTS idx_external_events_event_type ON external_events(event_type);
CREATE INDEX IF NOT EXISTS idx_external_events_processed_at ON external_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_external_events_sentiment ON external_events(sentiment);
CREATE INDEX IF NOT EXISTS idx_external_events_importance ON external_events(importance_score);
