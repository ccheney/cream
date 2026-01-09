-- Migration: Add target regimes to factors
-- Allows tracking which market regimes a factor is designed for

-- Add target_regimes column to factor_zoo
-- JSON array of regime strings: ["bull", "bear", "sideways", "volatile", "all"]
ALTER TABLE factor_zoo ADD COLUMN target_regimes TEXT;
