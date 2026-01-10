-- ============================================
-- Filings Table Migration
-- ============================================
-- SEC filings tracking and sync run history

-- filings: Track ingested SEC filings
CREATE TABLE IF NOT EXISTS filings (
  id TEXT PRIMARY KEY,                          -- Unique filing ID (UUID)
  accession_number TEXT NOT NULL UNIQUE,        -- SEC accession number (globally unique)
  symbol TEXT NOT NULL,                         -- Company ticker symbol
  filing_type TEXT NOT NULL,                    -- '10-K', '10-Q', '8-K', 'DEF14A'
  filed_date TEXT NOT NULL,                     -- Date filed with SEC
  report_date TEXT,                             -- Period end date for the report

  -- Company info from SEC
  company_name TEXT,                            -- Full company name
  cik TEXT,                                     -- Central Index Key

  -- Processing metadata
  section_count INTEGER DEFAULT 0,              -- Number of sections extracted
  chunk_count INTEGER DEFAULT 0,                -- Number of chunks created in HelixDB

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending',       -- 'pending', 'processing', 'complete', 'failed'
  error_message TEXT,                           -- Error details if failed

  -- Timestamps
  ingested_at TEXT NOT NULL,                    -- When ingestion started
  completed_at TEXT,                            -- When ingestion completed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_filings_symbol ON filings(symbol);
CREATE INDEX IF NOT EXISTS idx_filings_filing_type ON filings(filing_type);
CREATE INDEX IF NOT EXISTS idx_filings_filed_date ON filings(filed_date DESC);
CREATE INDEX IF NOT EXISTS idx_filings_status ON filings(status);
CREATE INDEX IF NOT EXISTS idx_filings_symbol_type ON filings(symbol, filing_type);
CREATE INDEX IF NOT EXISTS idx_filings_symbol_date ON filings(symbol, filed_date DESC);

-- filing_sync_runs: Track sync job executions
CREATE TABLE IF NOT EXISTS filing_sync_runs (
  id TEXT PRIMARY KEY,                          -- Unique run ID (UUID)
  started_at TEXT NOT NULL,                     -- When sync started
  completed_at TEXT,                            -- When sync completed

  -- Scope configuration
  symbols_requested TEXT NOT NULL,              -- JSON array of symbols to sync
  filing_types TEXT NOT NULL,                   -- JSON array of filing types
  date_range_start TEXT,                        -- Optional start date filter
  date_range_end TEXT,                          -- Optional end date filter

  -- Progress tracking
  symbols_total INTEGER DEFAULT 0,              -- Total symbols to process
  symbols_processed INTEGER DEFAULT 0,          -- Symbols completed
  filings_fetched INTEGER DEFAULT 0,            -- Filings retrieved from SEC
  filings_ingested INTEGER DEFAULT 0,           -- Filings successfully ingested
  chunks_created INTEGER DEFAULT 0,             -- Total chunks created in HelixDB

  -- Status
  status TEXT NOT NULL DEFAULT 'running',       -- 'running', 'completed', 'failed'
  error_message TEXT,                           -- Error details if failed

  -- Source of trigger
  trigger_source TEXT NOT NULL,                 -- 'scheduled', 'manual', 'dashboard'
  environment TEXT NOT NULL,                    -- 'BACKTEST', 'PAPER', 'LIVE'

  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for sync runs
CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON filing_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON filing_sync_runs(status);
CREATE INDEX IF NOT EXISTS idx_sync_runs_environment ON filing_sync_runs(environment);
CREATE INDEX IF NOT EXISTS idx_sync_runs_trigger ON filing_sync_runs(trigger_source);
