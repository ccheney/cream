-- ============================================
-- Rollback: Drop all tables
-- ============================================
-- Tables dropped in reverse dependency order.

-- Filings
DROP TABLE IF EXISTS filing_sync_runs;
DROP TABLE IF EXISTS filings;

-- Indicator Engine v2
DROP TABLE IF EXISTS indicator_sync_runs;
DROP TABLE IF EXISTS corporate_actions_indicators;
DROP TABLE IF EXISTS options_indicators_cache;
DROP TABLE IF EXISTS sentiment_indicators;
DROP TABLE IF EXISTS short_interest_indicators;
DROP TABLE IF EXISTS fundamental_indicators;

-- Cycles
DROP TABLE IF EXISTS cycle_events;
DROP TABLE IF EXISTS cycles;

-- Audit & User Settings
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS alert_settings;

-- Authentication (better-auth)
DROP TABLE IF EXISTS two_factor;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS user;

-- Runtime Configuration
DROP TABLE IF EXISTS constraints_config;
DROP TABLE IF EXISTS universe_configs;
DROP TABLE IF EXISTS agent_configs;
DROP TABLE IF EXISTS trading_config;

-- Factor Zoo
DROP TABLE IF EXISTS paper_signals;
DROP TABLE IF EXISTS factor_weights;
DROP TABLE IF EXISTS research_runs;
DROP TABLE IF EXISTS factor_correlations;
DROP TABLE IF EXISTS factor_performance;
DROP TABLE IF EXISTS factors;
DROP TABLE IF EXISTS hypotheses;

-- Indicator Synthesis
DROP TABLE IF EXISTS indicator_ic_history;
DROP TABLE IF EXISTS indicator_trials;
DROP TABLE IF EXISTS indicators;

-- External Events
DROP TABLE IF EXISTS external_events;

-- Prediction Markets
DROP TABLE IF EXISTS prediction_market_arbitrage;
DROP TABLE IF EXISTS prediction_market_signals;
DROP TABLE IF EXISTS prediction_market_snapshots;

-- Historical Universe
DROP TABLE IF EXISTS universe_snapshots;
DROP TABLE IF EXISTS ticker_changes;
DROP TABLE IF EXISTS index_constituents;

-- Thesis State
DROP TABLE IF EXISTS thesis_state_history;
DROP TABLE IF EXISTS thesis_state;

-- Market Data
DROP TABLE IF EXISTS regime_labels;
DROP TABLE IF EXISTS features;
DROP TABLE IF EXISTS universe_cache;
DROP TABLE IF EXISTS corporate_actions;
DROP TABLE IF EXISTS candles;

-- Dashboard
DROP TABLE IF EXISTS backtest_equity;
DROP TABLE IF EXISTS backtest_trades;
DROP TABLE IF EXISTS backtests;
DROP TABLE IF EXISTS system_state;
DROP TABLE IF EXISTS alerts;

-- Core Trading
DROP TABLE IF EXISTS config_versions;
DROP TABLE IF EXISTS portfolio_snapshots;
DROP TABLE IF EXISTS position_history;
DROP TABLE IF EXISTS positions;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS agent_outputs;
DROP TABLE IF EXISTS decisions;

-- Migration tracking (remove record before dropping table)
DELETE FROM schema_migrations WHERE version = 1;
DROP TABLE IF EXISTS schema_migrations;
