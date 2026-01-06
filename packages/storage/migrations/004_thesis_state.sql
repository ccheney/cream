-- ============================================
-- Migration 004: Thesis State Management
-- ============================================
-- Creates table for thesis lifecycle tracking across OODA cycles.
-- Theses track position lifecycle from WATCHING through CLOSED.
--
-- Note: CHECK constraints removed - Turso doesn't support them yet.
--
-- @see docs/plans/05-agents.md - Thesis State Management section

-- ============================================
-- thesis_state
-- ============================================
-- Tracks thesis lifecycle for each instrument.
-- State machine: WATCHING -> ENTERED -> ADDING/MANAGING -> EXITING -> CLOSED

CREATE TABLE IF NOT EXISTS thesis_state (
  thesis_id TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL,
  state TEXT NOT NULL, -- WATCHING, ENTERED, ADDING, MANAGING, EXITING, CLOSED
  entry_price REAL,
  entry_date TEXT,  -- ISO 8601 format
  current_stop REAL,
  current_target REAL,
  conviction REAL, -- 0 to 1 or NULL
  -- Thesis content
  entry_thesis TEXT,           -- Original bullish/bearish thesis text
  invalidation_conditions TEXT, -- What would invalidate the thesis
  -- Position tracking
  add_count INTEGER NOT NULL DEFAULT 0,  -- Times added to position
  max_position_reached INTEGER NOT NULL DEFAULT 0, -- 0 or 1
  peak_unrealized_pnl REAL,
  -- Closure info
  close_reason TEXT, -- STOP_HIT, TARGET_HIT, INVALIDATED, MANUAL, TIME_DECAY, CORRELATION, or NULL
  exit_price REAL,
  realized_pnl REAL,
  realized_pnl_pct REAL,
  -- Metadata
  environment TEXT NOT NULL, -- BACKTEST, PAPER, LIVE
  notes TEXT,  -- JSON for agent reasoning history
  -- Timestamps
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

-- Indexes for thesis_state
CREATE INDEX IF NOT EXISTS idx_thesis_state_instrument ON thesis_state(instrument_id);
CREATE INDEX IF NOT EXISTS idx_thesis_state_state ON thesis_state(state);
CREATE INDEX IF NOT EXISTS idx_thesis_state_environment ON thesis_state(environment);
CREATE INDEX IF NOT EXISTS idx_thesis_state_created_at ON thesis_state(created_at);
CREATE INDEX IF NOT EXISTS idx_thesis_state_closed_at ON thesis_state(closed_at);

-- Active theses per environment (not closed)
CREATE INDEX IF NOT EXISTS idx_thesis_state_active ON thesis_state(environment, state) WHERE state != 'CLOSED';

-- Instrument lookup for active theses
CREATE INDEX IF NOT EXISTS idx_thesis_state_instrument_active ON thesis_state(instrument_id, environment) WHERE state != 'CLOSED';

-- ============================================
-- thesis_state_history
-- ============================================
-- Audit log of thesis state transitions for analysis.

CREATE TABLE IF NOT EXISTS thesis_state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thesis_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  trigger_reason TEXT,  -- What triggered the transition
  cycle_id TEXT,        -- OODA cycle that made the change
  price_at_transition REAL,
  conviction_at_transition REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (thesis_id) REFERENCES thesis_state(thesis_id) ON DELETE CASCADE
);

-- Indexes for thesis_state_history
CREATE INDEX IF NOT EXISTS idx_thesis_history_thesis_id ON thesis_state_history(thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_history_created_at ON thesis_state_history(created_at);
CREATE INDEX IF NOT EXISTS idx_thesis_history_thesis_created ON thesis_state_history(thesis_id, created_at);

-- ============================================
-- Record this migration
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (4, '004_thesis_state');
