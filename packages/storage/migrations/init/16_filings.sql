-- ============================================
-- SEC Filings Tables
-- ============================================
-- SEC filings tracking and sync run history

-- filings: Track ingested SEC filings
CREATE TABLE IF NOT EXISTS filings (
  id TEXT PRIMARY KEY,
  accession_number TEXT NOT NULL UNIQUE,  -- SEC accession number (globally unique)
  symbol TEXT NOT NULL,
  filing_type TEXT NOT NULL,              -- '10-K', '10-Q', '8-K', 'DEF14A'
  filed_date TEXT NOT NULL,
  report_date TEXT,

  -- Company info from SEC
  company_name TEXT,
  cik TEXT,

  -- Processing metadata
  section_count INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'complete', 'failed'
  error_message TEXT,

  -- Timestamps
  ingested_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_filings_symbol ON filings(symbol);
CREATE INDEX IF NOT EXISTS idx_filings_filing_type ON filings(filing_type);
CREATE INDEX IF NOT EXISTS idx_filings_filed_date ON filings(filed_date DESC);
CREATE INDEX IF NOT EXISTS idx_filings_status ON filings(status);
CREATE INDEX IF NOT EXISTS idx_filings_symbol_type ON filings(symbol, filing_type);
CREATE INDEX IF NOT EXISTS idx_filings_symbol_date ON filings(symbol, filed_date DESC);

-- filing_sync_runs: Track sync job executions
CREATE TABLE IF NOT EXISTS filing_sync_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,

  -- Scope configuration
  symbols_requested TEXT NOT NULL,         -- JSON array of symbols to sync
  filing_types TEXT NOT NULL,              -- JSON array of filing types
  date_range_start TEXT,
  date_range_end TEXT,

  -- Progress tracking
  symbols_total INTEGER DEFAULT 0,
  symbols_processed INTEGER DEFAULT 0,
  filings_fetched INTEGER DEFAULT 0,
  filings_ingested INTEGER DEFAULT 0,
  chunks_created INTEGER DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed'
  error_message TEXT,

  -- Source of trigger
  trigger_source TEXT NOT NULL,            -- 'scheduled', 'manual', 'dashboard'
  environment TEXT NOT NULL,               -- 'BACKTEST', 'PAPER', 'LIVE'

  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_filing_sync_runs_started_at ON filing_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_filing_sync_runs_status ON filing_sync_runs(status);
CREATE INDEX IF NOT EXISTS idx_filing_sync_runs_environment ON filing_sync_runs(environment);
CREATE INDEX IF NOT EXISTS idx_filing_sync_runs_trigger ON filing_sync_runs(trigger_source);
