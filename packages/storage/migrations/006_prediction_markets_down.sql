-- Rollback Prediction Markets Schema

DROP TABLE IF EXISTS prediction_market_arbitrage;
DROP TABLE IF EXISTS prediction_market_signals;
DROP TABLE IF EXISTS prediction_market_snapshots;

DELETE FROM schema_migrations WHERE version = 6;
