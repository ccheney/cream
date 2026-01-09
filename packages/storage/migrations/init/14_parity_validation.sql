-- ============================================
-- Parity Validation Tables
-- ============================================
-- Tracks research-to-production parity validation for indicators,
-- factors, and config promotions.
-- @see docs/plans/00-overview.md (Lines 197-201)

-- Add parity validation columns to indicators
ALTER TABLE indicators ADD COLUMN parity_report TEXT;
ALTER TABLE indicators ADD COLUMN parity_validated_at TEXT;

-- Add parity validation columns to factors
ALTER TABLE factors ADD COLUMN parity_report TEXT;
ALTER TABLE factors ADD COLUMN parity_validated_at TEXT;

-- Parity validation history table
CREATE TABLE IF NOT EXISTS parity_validation_history (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,      -- 'indicator', 'factor', 'config'
  entity_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  passed INTEGER NOT NULL,
  recommendation TEXT NOT NULL,   -- 'APPROVE_FOR_LIVE', 'NEEDS_INVESTIGATION', 'NOT_READY'
  blocking_issues TEXT,           -- JSON array
  warnings TEXT,                  -- JSON array
  full_report TEXT NOT NULL,      -- JSON: complete ParityValidationResult
  validated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parity_history_entity ON parity_validation_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_parity_history_environment ON parity_validation_history(environment);
CREATE INDEX IF NOT EXISTS idx_parity_history_passed ON parity_validation_history(passed);
CREATE INDEX IF NOT EXISTS idx_parity_history_validated_at ON parity_validation_history(validated_at);
