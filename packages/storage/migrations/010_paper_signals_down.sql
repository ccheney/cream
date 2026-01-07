-- Rollback Migration 010: Paper Trading Signals

DROP INDEX IF EXISTS idx_paper_signals_pending;
DROP INDEX IF EXISTS idx_paper_signals_indicator_date;
DROP TABLE IF EXISTS indicator_paper_signals;

DELETE FROM schema_migrations WHERE version = 10;
