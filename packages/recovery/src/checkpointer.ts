/**
 * Checkpoint save/load logic for crash recovery.
 *
 * Handles persisting and retrieving checkpoints from the database,
 * as well as cycle lifecycle events.
 */

import type { TursoClient } from "@cream/storage";
import type {
  Checkpoint,
  CheckpointRow,
  CycleEvent,
  CycleEventRow,
  CycleEventType,
  CyclePhase,
  PhaseState,
  RecoveryConfig,
} from "./types.js";
import { DEFAULT_RECOVERY_CONFIG } from "./types.js";

/**
 * SQL statements for checkpoint operations.
 */
const SQL = {
  createCheckpointsTable: `
    CREATE TABLE IF NOT EXISTS cycle_checkpoints (
      cycle_id TEXT PRIMARY KEY,
      phase TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `,
  createEventsTable: `
    CREATE TABLE IF NOT EXISTS cycle_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metadata TEXT,
      UNIQUE(cycle_id, event_type)
    )
  `,
  createEventsIndex: `
    CREATE INDEX IF NOT EXISTS idx_cycle_events_cycle_id ON cycle_events(cycle_id)
  `,
  saveCheckpoint: `
    INSERT OR REPLACE INTO cycle_checkpoints (cycle_id, phase, state, created_at)
    VALUES (?, ?, ?, ?)
  `,
  loadCheckpoint: `
    SELECT cycle_id, phase, state, created_at
    FROM cycle_checkpoints
    WHERE cycle_id = ?
  `,
  loadLatestCheckpoint: `
    SELECT cycle_id, phase, state, created_at
    FROM cycle_checkpoints
    ORDER BY created_at DESC
    LIMIT 1
  `,
  deleteCheckpoint: `
    DELETE FROM cycle_checkpoints WHERE cycle_id = ?
  `,
  deleteOldCheckpoints: `
    DELETE FROM cycle_checkpoints WHERE created_at < ?
  `,
  recordEvent: `
    INSERT OR REPLACE INTO cycle_events (cycle_id, event_type, timestamp, metadata)
    VALUES (?, ?, ?, ?)
  `,
  getEvent: `
    SELECT cycle_id, event_type, timestamp, metadata
    FROM cycle_events
    WHERE cycle_id = ? AND event_type = ?
  `,
  getCycleEvents: `
    SELECT cycle_id, event_type, timestamp, metadata
    FROM cycle_events
    WHERE cycle_id = ?
    ORDER BY timestamp ASC
  `,
  getIncompleteCycles: `
    SELECT e.cycle_id
    FROM cycle_events e
    WHERE e.event_type = 'cycle_started'
    AND NOT EXISTS (
      SELECT 1 FROM cycle_events e2
      WHERE e2.cycle_id = e.cycle_id
      AND e2.event_type = 'cycle_completed'
    )
    ORDER BY e.timestamp DESC
  `,
  deleteOldEvents: `
    DELETE FROM cycle_events WHERE timestamp < ?
  `,
};

/**
 * Checkpointer handles saving and loading cycle checkpoints.
 */
export class Checkpointer {
  private readonly db: TursoClient;
  private readonly config: RecoveryConfig;
  private initialized = false;

  constructor(db: TursoClient, config: Partial<RecoveryConfig> = {}) {
    this.db = db;
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
  }

  /**
   * Initialize the checkpointer, creating necessary tables.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.db.execute(SQL.createCheckpointsTable);
    await this.db.execute(SQL.createEventsTable);
    await this.db.execute(SQL.createEventsIndex);
    this.initialized = true;
  }

  /**
   * Save a checkpoint for a cycle phase.
   */
  async saveCheckpoint(
    cycleId: string,
    phase: CyclePhase,
    state: PhaseState
  ): Promise<void> {
    await this.ensureInitialized();
    const now = new Date().toISOString();

    await this.db.execute(SQL.saveCheckpoint, [
      cycleId,
      phase,
      JSON.stringify(state),
      now,
    ]);
  }

  /**
   * Load a checkpoint by cycle ID.
   */
  async loadCheckpoint(cycleId: string): Promise<Checkpoint | null> {
    await this.ensureInitialized();

    const rows = await this.db.execute<CheckpointRow>(SQL.loadCheckpoint, [
      cycleId,
    ]);

    if (rows.length === 0) {
      return null;
    }

    return this.rowToCheckpoint(rows[0]);
  }

  /**
   * Load the most recent checkpoint.
   */
  async loadLatestCheckpoint(): Promise<Checkpoint | null> {
    await this.ensureInitialized();

    const rows = await this.db.execute<CheckpointRow>(SQL.loadLatestCheckpoint);

    if (rows.length === 0) {
      return null;
    }

    return this.rowToCheckpoint(rows[0]);
  }

  /**
   * Delete a checkpoint.
   */
  async deleteCheckpoint(cycleId: string): Promise<void> {
    await this.ensureInitialized();
    await this.db.execute(SQL.deleteCheckpoint, [cycleId]);
  }

  /**
   * Record a cycle lifecycle event.
   */
  async recordCycleEvent(
    cycleId: string,
    eventType: CycleEventType,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.ensureInitialized();
    const now = new Date().toISOString();

    await this.db.execute(SQL.recordEvent, [
      cycleId,
      eventType,
      now,
      metadata ? JSON.stringify(metadata) : null,
    ]);
  }

  /**
   * Mark a cycle as started.
   */
  async markCycleStarted(
    cycleId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.recordCycleEvent(cycleId, "cycle_started", metadata);
  }

  /**
   * Mark a cycle as completed.
   */
  async markCycleCompleted(
    cycleId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.recordCycleEvent(cycleId, "cycle_completed", metadata);
  }

  /**
   * Check if a cycle has a specific event.
   */
  async hasCycleEvent(
    cycleId: string,
    eventType: CycleEventType
  ): Promise<boolean> {
    await this.ensureInitialized();
    const rows = await this.db.execute<CycleEventRow>(SQL.getEvent, [
      cycleId,
      eventType,
    ]);
    return rows.length > 0;
  }

  /**
   * Get all events for a cycle.
   */
  async getCycleEvents(cycleId: string): Promise<CycleEvent[]> {
    await this.ensureInitialized();
    const rows = await this.db.execute<CycleEventRow>(SQL.getCycleEvents, [
      cycleId,
    ]);
    return rows.map(this.rowToEvent);
  }

  /**
   * Find cycles that started but didn't complete.
   */
  async findIncompleteCycles(): Promise<string[]> {
    await this.ensureInitialized();
    const rows = await this.db.execute<{ cycle_id: string }>(
      SQL.getIncompleteCycles
    );
    return rows.map((row) => row.cycle_id);
  }

  /**
   * Clean up old checkpoints and events.
   */
  async cleanup(): Promise<{ checkpointsDeleted: number; eventsDeleted: number }> {
    await this.ensureInitialized();

    const cutoff = new Date(Date.now() - this.config.maxCheckpointAge).toISOString();

    const checkpointResult = await this.db.run(SQL.deleteOldCheckpoints, [
      cutoff,
    ]);
    const eventResult = await this.db.run(SQL.deleteOldEvents, [cutoff]);

    return {
      checkpointsDeleted: checkpointResult.changes,
      eventsDeleted: eventResult.changes,
    };
  }

  /**
   * Start a periodic cleanup task.
   * Returns a function to stop the cleanup.
   */
  startPeriodicCleanup(): () => void {
    const interval = setInterval(async () => {
      try {
        const result = await this.cleanup();
        if (result.checkpointsDeleted > 0 || result.eventsDeleted > 0) {
          console.log(
            `[Checkpointer] Cleanup: ${result.checkpointsDeleted} checkpoints, ${result.eventsDeleted} events deleted`
          );
        }
      } catch (error) {
        console.error("[Checkpointer] Cleanup error:", error);
      }
    }, this.config.cleanupInterval);

    return () => clearInterval(interval);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private rowToCheckpoint(row: CheckpointRow): Checkpoint {
    return {
      cycleId: row.cycle_id,
      phase: row.phase as CyclePhase,
      state: JSON.parse(row.state) as PhaseState,
      createdAt: row.created_at,
    };
  }

  private rowToEvent(row: CycleEventRow): CycleEvent {
    return {
      cycleId: row.cycle_id,
      eventType: row.event_type as CycleEventType,
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}

/**
 * Create a new checkpointer instance.
 */
export function createCheckpointer(
  db: TursoClient,
  config?: Partial<RecoveryConfig>
): Checkpointer {
  return new Checkpointer(db, config);
}
