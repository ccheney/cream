-- Rollback Migration 011: Runtime Configuration Tables

-- Drop universe_configs indexes and table
DROP INDEX IF EXISTS idx_universe_configs_env_active;
DROP INDEX IF EXISTS idx_universe_configs_env_status;
DROP INDEX IF EXISTS idx_universe_configs_status;
DROP INDEX IF EXISTS idx_universe_configs_environment;
DROP TABLE IF EXISTS universe_configs;

-- Drop agent_configs indexes and table
DROP INDEX IF EXISTS idx_agent_configs_env_agent;
DROP INDEX IF EXISTS idx_agent_configs_agent_type;
DROP INDEX IF EXISTS idx_agent_configs_environment;
DROP TABLE IF EXISTS agent_configs;

-- Drop trading_config indexes and table
DROP INDEX IF EXISTS idx_trading_config_env_active;
DROP INDEX IF EXISTS idx_trading_config_created_at;
DROP INDEX IF EXISTS idx_trading_config_env_status;
DROP INDEX IF EXISTS idx_trading_config_status;
DROP INDEX IF EXISTS idx_trading_config_environment;
DROP TABLE IF EXISTS trading_config;

DELETE FROM schema_migrations WHERE version = 11;
