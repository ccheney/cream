-- ============================================
-- Thesis State Tables
-- ============================================
-- thesis_state, thesis_state_history

CREATE TABLE IF NOT EXISTS thesis_state (
  thesis_id TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL,
  state TEXT NOT NULL,             -- WATCHING, STAGED, OPEN, SCALING, EXITING, CLOSED
  entry_price REAL,
  entry_date TEXT,
  current_stop REAL,
  current_target REAL,
  conviction REAL,
  entry_thesis TEXT,
  invalidation_conditions TEXT,
  add_count INTEGER NOT NULL DEFAULT 0,
  max_position_reached INTEGER NOT NULL DEFAULT 0,
  peak_unrealized_pnl REAL,
  close_reason TEXT,
  exit_price REAL,
  realized_pnl REAL,
  realized_pnl_pct REAL,
  environment TEXT NOT NULL,
  notes TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_thesis_state_instrument ON thesis_state(instrument_id);
CREATE INDEX IF NOT EXISTS idx_thesis_state_state ON thesis_state(state);
CREATE INDEX IF NOT EXISTS idx_thesis_state_environment ON thesis_state(environment);
CREATE INDEX IF NOT EXISTS idx_thesis_state_created_at ON thesis_state(created_at);
CREATE INDEX IF NOT EXISTS idx_thesis_state_closed_at ON thesis_state(closed_at);
CREATE INDEX IF NOT EXISTS idx_thesis_state_active ON thesis_state(environment, state) WHERE state != 'CLOSED';
CREATE INDEX IF NOT EXISTS idx_thesis_state_instrument_active ON thesis_state(instrument_id, environment) WHERE state != 'CLOSED';

CREATE TABLE IF NOT EXISTS thesis_state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thesis_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  trigger_reason TEXT,
  cycle_id TEXT,
  price_at_transition REAL,
  conviction_at_transition REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (thesis_id) REFERENCES thesis_state(thesis_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_thesis_history_thesis_id ON thesis_state_history(thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_history_created_at ON thesis_state_history(created_at);
CREATE INDEX IF NOT EXISTS idx_thesis_history_thesis_created ON thesis_state_history(thesis_id, created_at);
