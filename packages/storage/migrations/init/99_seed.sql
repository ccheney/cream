-- ============================================
-- Seed Data
-- ============================================
-- Initial data required for system operation

-- Initialize system_state for each environment
INSERT OR IGNORE INTO system_state (environment, status) VALUES ('BACKTEST', 'stopped');
INSERT OR IGNORE INTO system_state (environment, status) VALUES ('PAPER', 'stopped');
INSERT OR IGNORE INTO system_state (environment, status) VALUES ('LIVE', 'stopped');

-- Record this migration
INSERT INTO schema_migrations (version, name) VALUES (1, 'init');
