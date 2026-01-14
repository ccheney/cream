-- ============================================
-- Streaming Events Index
-- ============================================
-- Optimizes queries for reconstructing agent streaming state from cycle events

CREATE INDEX IF NOT EXISTS idx_cycle_events_agent_event
ON cycle_events(cycle_id, agent_type, event_type);
