-- ============================================
-- Migration 003 DOWN: Remove Market Data Tables
-- ============================================

DROP INDEX IF EXISTS idx_regime_labels_market;
DROP INDEX IF EXISTS idx_regime_labels_regime;
DROP INDEX IF EXISTS idx_regime_labels_symbol_ts;
DROP INDEX IF EXISTS idx_regime_labels_symbol_ts_tf;
DROP TABLE IF EXISTS regime_labels;

DROP INDEX IF EXISTS idx_features_indicator;
DROP INDEX IF EXISTS idx_features_timestamp;
DROP INDEX IF EXISTS idx_features_symbol_indicator_ts;
DROP INDEX IF EXISTS idx_features_symbol_ts_indicator;
DROP TABLE IF EXISTS features;

DROP INDEX IF EXISTS idx_universe_cache_hash;
DROP INDEX IF EXISTS idx_universe_cache_expires;
DROP INDEX IF EXISTS idx_universe_cache_source;
DROP TABLE IF EXISTS universe_cache;

DROP INDEX IF EXISTS idx_corporate_actions_unique;
DROP INDEX IF EXISTS idx_corporate_actions_type;
DROP INDEX IF EXISTS idx_corporate_actions_ex_date;
DROP INDEX IF EXISTS idx_corporate_actions_symbol_date;
DROP TABLE IF EXISTS corporate_actions;

DROP INDEX IF EXISTS idx_candles_timeframe;
DROP INDEX IF EXISTS idx_candles_symbol;
DROP INDEX IF EXISTS idx_candles_timestamp;
DROP INDEX IF EXISTS idx_candles_symbol_timeframe_ts;
DROP TABLE IF EXISTS candles;

DELETE FROM schema_migrations WHERE version = 3;
