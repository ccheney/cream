-- Rollback external events schema

DROP INDEX IF EXISTS idx_external_events_importance;
DROP INDEX IF EXISTS idx_external_events_sentiment;
DROP INDEX IF EXISTS idx_external_events_processed_at;
DROP INDEX IF EXISTS idx_external_events_event_type;
DROP INDEX IF EXISTS idx_external_events_source_type;
DROP INDEX IF EXISTS idx_external_events_event_time;
DROP TABLE IF EXISTS external_events;

DELETE FROM schema_migrations WHERE version = 7;
