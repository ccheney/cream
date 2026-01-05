/**
 * Incomplete Cycle Detector
 *
 * Detects cycles that started but didn't complete, indicating a crash
 * or unexpected shutdown during execution.
 */

import type { Checkpointer } from "./checkpointer.js";
import type { Checkpoint, CyclePhase } from "./types.js";

/**
 * Information about a detected incomplete cycle.
 */
export interface IncompleteCycle {
  /** The cycle ID that was interrupted. */
  cycleId: string;
  /** The phase where the cycle was interrupted (from checkpoint). */
  lastPhase: CyclePhase | null;
  /** The checkpoint data (if available). */
  checkpoint: Checkpoint | null;
  /** When the cycle started. */
  startedAt: string | null;
  /** How long ago the cycle started (milliseconds). */
  ageMs: number;
}

/**
 * Detector for finding incomplete cycles on startup.
 */
export class CycleDetector {
  constructor(private readonly checkpointer: Checkpointer) {}

  /**
   * Detect any incomplete cycles.
   * Returns the most recent incomplete cycle, if any.
   */
  async detectIncompleteCycle(): Promise<IncompleteCycle | null> {
    // Find cycles that started but didn't complete
    const incompleteCycleIds = await this.checkpointer.findIncompleteCycles();

    if (incompleteCycleIds.length === 0) {
      return null;
    }

    // Get the most recent incomplete cycle
    const cycleId = incompleteCycleIds[0];
    return this.getIncompleteCycleInfo(cycleId);
  }

  /**
   * Detect all incomplete cycles.
   */
  async detectAllIncompleteCycles(): Promise<IncompleteCycle[]> {
    const incompleteCycleIds = await this.checkpointer.findIncompleteCycles();
    const cycles: IncompleteCycle[] = [];

    for (const cycleId of incompleteCycleIds) {
      const info = await this.getIncompleteCycleInfo(cycleId);
      if (info) {
        cycles.push(info);
      }
    }

    return cycles;
  }

  /**
   * Get detailed information about an incomplete cycle.
   */
  private async getIncompleteCycleInfo(
    cycleId: string
  ): Promise<IncompleteCycle | null> {
    // Get events for this cycle
    const events = await this.checkpointer.getCycleEvents(cycleId);
    const startEvent = events.find((e) => e.eventType === "cycle_started");

    if (!startEvent) {
      // No start event, shouldn't happen but handle gracefully
      return null;
    }

    // Get checkpoint if available
    const checkpoint = await this.checkpointer.loadCheckpoint(cycleId);

    // Calculate age
    const startedAt = startEvent.timestamp;
    const ageMs = Date.now() - new Date(startedAt).getTime();

    return {
      cycleId,
      lastPhase: checkpoint?.phase ?? null,
      checkpoint,
      startedAt,
      ageMs,
    };
  }

  /**
   * Check if a specific cycle is incomplete.
   */
  async isCycleIncomplete(cycleId: string): Promise<boolean> {
    const hasStarted = await this.checkpointer.hasCycleEvent(
      cycleId,
      "cycle_started"
    );
    const hasCompleted = await this.checkpointer.hasCycleEvent(
      cycleId,
      "cycle_completed"
    );

    return hasStarted && !hasCompleted;
  }

  /**
   * Get the count of incomplete cycles.
   */
  async countIncompleteCycles(): Promise<number> {
    const cycles = await this.checkpointer.findIncompleteCycles();
    return cycles.length;
  }
}

/**
 * Create a new cycle detector.
 */
export function createCycleDetector(checkpointer: Checkpointer): CycleDetector {
  return new CycleDetector(checkpointer);
}
