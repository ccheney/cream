-- Migration: Drop deprecated model column from agent_configs
-- Model selection is now global via trading_config.global_model
-- This removes the backward compatibility shim

-- SQLite doesn't support DROP COLUMN directly, so we rebuild the table
-- Step 1: Create new table without model column
CREATE TABLE agent_configs_new (
  id TEXT PRIMARY KEY NOT NULL,
  environment TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  system_prompt_override TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Step 2: Copy data (excluding model column)
INSERT INTO agent_configs_new (id, environment, agent_type, system_prompt_override, enabled, created_at, updated_at)
SELECT id, environment, agent_type, system_prompt_override, enabled, created_at, updated_at
FROM agent_configs;

-- Step 3: Drop old table
DROP TABLE agent_configs;

-- Step 4: Rename new table
ALTER TABLE agent_configs_new RENAME TO agent_configs;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_agent_configs_environment ON agent_configs(environment);
CREATE INDEX IF NOT EXISTS idx_agent_configs_agent_type ON agent_configs(agent_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_env_agent ON agent_configs(environment, agent_type);
