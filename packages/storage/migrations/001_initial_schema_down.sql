-- ============================================
-- Rollback Migration 001: Initial Schema
-- ============================================
-- Drops the core production tables in reverse dependency order.

-- Drop indexes first (optional but explicit)
DROP INDEX IF EXISTS idx_config_versions_env_active;
DROP INDEX IF EXISTS idx_config_versions_created_at;
DROP INDEX IF EXISTS idx_config_versions_active;
DROP INDEX IF EXISTS idx_config_versions_environment;

DROP INDEX IF EXISTS idx_portfolio_snapshots_environment;
DROP INDEX IF EXISTS idx_portfolio_snapshots_timestamp;

DROP INDEX IF EXISTS idx_position_history_position_ts;
DROP INDEX IF EXISTS idx_position_history_timestamp;
DROP INDEX IF EXISTS idx_position_history_position_id;

DROP INDEX IF EXISTS idx_positions_symbol_env;
DROP INDEX IF EXISTS idx_positions_environment;
DROP INDEX IF EXISTS idx_positions_thesis_id;
DROP INDEX IF EXISTS idx_positions_symbol;

DROP INDEX IF EXISTS idx_orders_environment;
DROP INDEX IF EXISTS idx_orders_created_at;
DROP INDEX IF EXISTS idx_orders_broker_order_id;
DROP INDEX IF EXISTS idx_orders_status;
DROP INDEX IF EXISTS idx_orders_symbol;
DROP INDEX IF EXISTS idx_orders_decision_id;

DROP INDEX IF EXISTS idx_agent_outputs_decision_agent;
DROP INDEX IF EXISTS idx_agent_outputs_agent_type;
DROP INDEX IF EXISTS idx_agent_outputs_decision_id;

DROP INDEX IF EXISTS idx_decisions_environment;
DROP INDEX IF EXISTS idx_decisions_symbol_created;
DROP INDEX IF EXISTS idx_decisions_created_at;
DROP INDEX IF EXISTS idx_decisions_status;
DROP INDEX IF EXISTS idx_decisions_symbol;
DROP INDEX IF EXISTS idx_decisions_cycle_id;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS config_versions;
DROP TABLE IF EXISTS portfolio_snapshots;
DROP TABLE IF EXISTS position_history;
DROP TABLE IF EXISTS positions;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS agent_outputs;
DROP TABLE IF EXISTS decisions;

-- Remove migration record
DELETE FROM schema_migrations WHERE version = 1;
