-- Migration 009 Down: Factor Zoo Schema Rollback
--
-- Safely removes all Factor Zoo tables and indexes.

-- Drop indexes first (some databases require this)
DROP INDEX IF EXISTS idx_research_runs_factor;
DROP INDEX IF EXISTS idx_research_runs_hypothesis;
DROP INDEX IF EXISTS idx_research_runs_trigger;
DROP INDEX IF EXISTS idx_research_runs_phase;
DROP INDEX IF EXISTS idx_factor_corr_factor2;
DROP INDEX IF EXISTS idx_factor_corr_factor1;
DROP INDEX IF EXISTS idx_factor_perf_date;
DROP INDEX IF EXISTS idx_factor_perf_factor_date;
DROP INDEX IF EXISTS idx_factors_weight;
DROP INDEX IF EXISTS idx_factors_active;
DROP INDEX IF EXISTS idx_factors_hypothesis;
DROP INDEX IF EXISTS idx_factors_status;
DROP INDEX IF EXISTS idx_hypotheses_parent;
DROP INDEX IF EXISTS idx_hypotheses_status;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS research_runs;
DROP TABLE IF EXISTS factor_correlations;
DROP TABLE IF EXISTS factor_performance;
DROP TABLE IF EXISTS factors;
DROP TABLE IF EXISTS hypotheses;

-- Remove migration record
DELETE FROM schema_migrations WHERE version = 9;
