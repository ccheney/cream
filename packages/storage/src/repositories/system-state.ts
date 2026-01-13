/**
 * System State Repository
 *
 * Data access for system_state table - persists system status per environment.
 */

import type { Row, TursoClient } from "../turso.js";

// ============================================
// Types
// ============================================

/**
 * System status
 */
export type SystemStatus = "STOPPED" | "ACTIVE" | "PAUSED";

/**
 * Cycle phase
 */
export type SystemCyclePhase = "observe" | "orient" | "decide" | "act" | "complete";

/**
 * System state entity
 */
export interface SystemState {
  environment: string;
  status: SystemStatus;
  lastCycleId: string | null;
  lastCycleTime: string | null;
  currentPhase: SystemCyclePhase | null;
  phaseStartedAt: string | null;
  nextCycleAt: string | null;
  errorMessage: string | null;
  updatedAt: string;
}

/**
 * Update system state input
 */
export interface UpdateSystemStateInput {
  status?: SystemStatus;
  lastCycleId?: string | null;
  lastCycleTime?: string | null;
  currentPhase?: SystemCyclePhase | null;
  phaseStartedAt?: string | null;
  nextCycleAt?: string | null;
  errorMessage?: string | null;
}

// ============================================
// Row Mapper
// ============================================

function mapSystemStateRow(row: Row): SystemState {
  return {
    environment: row.environment as string,
    status: (row.status as string).toUpperCase() as SystemStatus,
    lastCycleId: row.last_cycle_id as string | null,
    lastCycleTime: row.last_cycle_time as string | null,
    currentPhase: row.current_phase as SystemCyclePhase | null,
    phaseStartedAt: row.phase_started_at as string | null,
    nextCycleAt: row.next_cycle_at as string | null,
    errorMessage: row.error_message as string | null,
    updatedAt: row.updated_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * System state repository
 */
export class SystemStateRepository {
  private readonly table = "system_state";

  constructor(private readonly client: TursoClient) {}

  /**
   * Get system state for an environment, creating default if not exists
   */
  async getOrCreate(environment: string): Promise<SystemState> {
    const existing = await this.findByEnvironment(environment);
    if (existing) {
      return existing;
    }

    // Create default state
    await this.client.run(
      `INSERT INTO ${this.table} (environment, status, updated_at)
       VALUES (?, 'STOPPED', datetime('now'))`,
      [environment]
    );

    return this.findByEnvironment(environment) as Promise<SystemState>;
  }

  /**
   * Find system state by environment
   */
  async findByEnvironment(environment: string): Promise<SystemState | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ?`,
      [environment]
    );

    return row ? mapSystemStateRow(row) : null;
  }

  /**
   * Update system state for an environment.
   * Uses INSERT OR REPLACE (upsert) to ensure the row exists.
   */
  async update(environment: string, input: UpdateSystemStateInput): Promise<SystemState> {
    // First ensure the row exists
    await this.getOrCreate(environment);

    const setClauses: string[] = ["updated_at = datetime('now')"];
    const args: unknown[] = [];

    if (input.status !== undefined) {
      setClauses.push("status = ?");
      args.push(input.status);
    }
    if (input.lastCycleId !== undefined) {
      setClauses.push("last_cycle_id = ?");
      args.push(input.lastCycleId);
    }
    if (input.lastCycleTime !== undefined) {
      setClauses.push("last_cycle_time = ?");
      args.push(input.lastCycleTime);
    }
    if (input.currentPhase !== undefined) {
      setClauses.push("current_phase = ?");
      args.push(input.currentPhase);
    }
    if (input.phaseStartedAt !== undefined) {
      setClauses.push("phase_started_at = ?");
      args.push(input.phaseStartedAt);
    }
    if (input.nextCycleAt !== undefined) {
      setClauses.push("next_cycle_at = ?");
      args.push(input.nextCycleAt);
    }
    if (input.errorMessage !== undefined) {
      setClauses.push("error_message = ?");
      args.push(input.errorMessage);
    }

    args.push(environment);

    await this.client.run(
      `UPDATE ${this.table} SET ${setClauses.join(", ")} WHERE environment = ?`,
      args
    );

    return this.findByEnvironment(environment) as Promise<SystemState>;
  }

  /**
   * Set system status
   */
  async setStatus(environment: string, status: SystemStatus): Promise<SystemState> {
    return this.update(environment, { status });
  }

  /**
   * Update cycle information
   */
  async updateCycle(
    environment: string,
    cycleId: string,
    phase: SystemCyclePhase
  ): Promise<SystemState> {
    const now = new Date().toISOString();
    return this.update(environment, {
      lastCycleId: cycleId,
      currentPhase: phase,
      phaseStartedAt: now,
      lastCycleTime: phase === "complete" ? now : undefined,
    });
  }

  /**
   * Clear cycle state (when cycle completes or is cancelled)
   */
  async clearCycle(environment: string): Promise<SystemState> {
    return this.update(environment, {
      currentPhase: null,
      phaseStartedAt: null,
    });
  }

  /**
   * Set error state
   */
  async setError(environment: string, errorMessage: string): Promise<SystemState> {
    return this.update(environment, { errorMessage });
  }

  /**
   * Clear error state
   */
  async clearError(environment: string): Promise<SystemState> {
    return this.update(environment, { errorMessage: null });
  }
}
