-- ============================================
-- Cycles Table Migration
-- ============================================
-- Full persistence for OODA trading cycles

-- cycles: Complete cycle history with results
CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY,                          -- Unique cycle ID
  environment TEXT NOT NULL,                     -- BACKTEST, PAPER, LIVE
  status TEXT NOT NULL DEFAULT 'running',        -- running, completed, failed

  -- Timing
  started_at TEXT NOT NULL,                      -- Cycle start time
  completed_at TEXT,                             -- Cycle completion time
  duration_ms INTEGER,                           -- Total duration in milliseconds

  -- Phase tracking
  current_phase TEXT,                            -- observe, orient, decide, act, complete
  phase_started_at TEXT,                         -- When current phase started

  -- Progress
  total_symbols INTEGER DEFAULT 0,               -- Total symbols in universe
  completed_symbols INTEGER DEFAULT 0,           -- Symbols processed
  progress_pct REAL DEFAULT 0,                   -- 0-100 progress percentage

  -- Results (populated on completion)
  approved INTEGER,                              -- 1 if consensus approved, 0 if not
  iterations INTEGER,                            -- Number of consensus iterations
  decisions_count INTEGER DEFAULT 0,             -- Number of decisions made
  orders_count INTEGER DEFAULT 0,                -- Number of orders placed

  -- Decision summary (JSON array of {symbol, action, direction, confidence})
  decisions_json TEXT,

  -- Order summary (JSON array of {orderId, symbol, side, quantity, status})
  orders_json TEXT,

  -- Error info (if failed)
  error_message TEXT,
  error_stack TEXT,

  -- Config tracking
  config_version TEXT,                           -- Which config version was used

  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cycles_environment ON cycles(environment);
CREATE INDEX IF NOT EXISTS idx_cycles_status ON cycles(status);
CREATE INDEX IF NOT EXISTS idx_cycles_started_at ON cycles(started_at);
CREATE INDEX IF NOT EXISTS idx_cycles_env_status ON cycles(environment, status);
CREATE INDEX IF NOT EXISTS idx_cycles_env_started ON cycles(environment, started_at DESC);

-- cycle_events: Detailed event log for each cycle (for debugging/replay)
CREATE TABLE IF NOT EXISTS cycle_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT NOT NULL,                        -- References cycles.id
  event_type TEXT NOT NULL,                      -- phase_change, agent_start, agent_complete, decision, order, error
  phase TEXT,                                    -- Current phase when event occurred

  -- Event details
  agent_type TEXT,                               -- For agent events
  symbol TEXT,                                   -- Related symbol if any
  message TEXT,                                  -- Human-readable message
  data_json TEXT,                                -- Full event data as JSON

  -- Timing
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  duration_ms INTEGER,                           -- Duration for timed events

  FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);

-- Indexes for cycle_events
CREATE INDEX IF NOT EXISTS idx_cycle_events_cycle_id ON cycle_events(cycle_id);
CREATE INDEX IF NOT EXISTS idx_cycle_events_type ON cycle_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cycle_events_timestamp ON cycle_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_cycle_events_agent ON cycle_events(cycle_id, agent_type);
