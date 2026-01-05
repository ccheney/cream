-- ============================================
-- Rollback Migration 002: Dashboard Tables
-- ============================================
-- Drops the dashboard tables in reverse dependency order.

-- Drop indexes first (optional but explicit)
DROP INDEX IF EXISTS idx_backtest_equity_bt_ts;
DROP INDEX IF EXISTS idx_backtest_equity_timestamp;
DROP INDEX IF EXISTS idx_backtest_equity_backtest_id;

DROP INDEX IF EXISTS idx_backtest_trades_bt_ts;
DROP INDEX IF EXISTS idx_backtest_trades_symbol;
DROP INDEX IF EXISTS idx_backtest_trades_timestamp;
DROP INDEX IF EXISTS idx_backtest_trades_backtest_id;

DROP INDEX IF EXISTS idx_backtests_created_at;
DROP INDEX IF EXISTS idx_backtests_start_date;
DROP INDEX IF EXISTS idx_backtests_status;

DROP INDEX IF EXISTS idx_alerts_unack_env;
DROP INDEX IF EXISTS idx_alerts_environment;
DROP INDEX IF EXISTS idx_alerts_created_at;
DROP INDEX IF EXISTS idx_alerts_acknowledged;
DROP INDEX IF EXISTS idx_alerts_type;
DROP INDEX IF EXISTS idx_alerts_severity;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS backtest_equity;
DROP TABLE IF EXISTS backtest_trades;
DROP TABLE IF EXISTS backtests;
DROP TABLE IF EXISTS system_state;
DROP TABLE IF EXISTS alerts;

-- Remove migration record
DELETE FROM schema_migrations WHERE version = 2;
