-- Migration: Add missing columns to decisions table
-- The repository expects these columns but they were missing from init schema

-- Add stop_price (repository uses this instead of stop_loss)
ALTER TABLE decisions ADD COLUMN stop_price REAL;

-- Add target_price (repository uses this instead of take_profit)
ALTER TABLE decisions ADD COLUMN target_price REAL;

-- Add strategy metadata columns
ALTER TABLE decisions ADD COLUMN strategy_family TEXT;
ALTER TABLE decisions ADD COLUMN time_horizon TEXT;

-- Add analysis factors (JSON arrays)
ALTER TABLE decisions ADD COLUMN bullish_factors TEXT;
ALTER TABLE decisions ADD COLUMN bearish_factors TEXT;

-- Add scoring columns
ALTER TABLE decisions ADD COLUMN confidence_score REAL;
ALTER TABLE decisions ADD COLUMN risk_score REAL;

-- Add metadata JSON column
ALTER TABLE decisions ADD COLUMN metadata TEXT;
