-- Drop Factor Zoo tables and related enums
-- Factor Zoo was never fully integrated and is being removed

-- Drop tables first (in correct order for foreign key constraints)
DROP TABLE IF EXISTS "paper_signals" CASCADE;
DROP TABLE IF EXISTS "factor_weights" CASCADE;
DROP TABLE IF EXISTS "research_runs" CASCADE;
DROP TABLE IF EXISTS "factor_correlations" CASCADE;
DROP TABLE IF EXISTS "factor_performance" CASCADE;
DROP TABLE IF EXISTS "factors" CASCADE;
DROP TABLE IF EXISTS "hypotheses" CASCADE;

-- Drop enums (may already be removed by CASCADE, so use IF EXISTS)
DROP TYPE IF EXISTS "factor_status";
DROP TYPE IF EXISTS "hypothesis_status";
DROP TYPE IF EXISTS "research_trigger_type";
DROP TYPE IF EXISTS "research_phase";
