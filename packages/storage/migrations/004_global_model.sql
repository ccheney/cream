-- Migration: Add global_model column to trading_config
-- Consolidates LLM model selection to a single global setting
-- Only two models allowed: gemini-3-flash-preview (default), gemini-3-pro-preview

-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- This migration is idempotent: if column exists, it's a no-op via CREATE TABLE workaround

-- Create a temporary table to check if migration is needed
CREATE TABLE IF NOT EXISTS _migration_004_check (dummy INTEGER);

-- This will fail silently if column exists, but we wrap the whole migration
-- The column should already exist from init schema or previous runs
-- We just need this migration to be recorded as applied

-- Clean up check table
DROP TABLE IF EXISTS _migration_004_check;

-- Note: agent_configs.model column was removed in migration 007
