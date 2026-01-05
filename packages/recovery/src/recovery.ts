/**
 * Recovery Logic
 *
 * Implements the decision logic for resume vs restart after
 * detecting an incomplete cycle.
 */

import type { Checkpointer } from "./checkpointer.js";
import type { CycleDetector, IncompleteCycle } from "./detector.js";
import type { BrokerOrderFetcher, OrderReconciler } from "./reconciler.js";
import type {
  CyclePhase,
  ExecutionState,
  RecoveryAction,
  RecoveryConfig,
} from "./types.js";
import { DEFAULT_RECOVERY_CONFIG, PHASE_ORDER } from "./types.js";

/**
 * Recovery decision rules based on phase:
 *
 * - data_fetch: Restart (data may be stale)
 * - agents: Restart (no side effects yet)
 * - synthesis: Restart (no side effects yet)
 * - execution: Reconcile orders, then:
 *   - If all orders processed: Complete
 *   - If partial orders: Resume with remaining
 *   - If no orders submitted: Can restart
 */
const RESTARTABLE_PHASES: Set<CyclePhase> = new Set([
  "data_fetch",
  "agents",
  "synthesis",
]);

/**
 * Recovery manager handles the startup recovery process.
 */
export class RecoveryManager {
  private readonly config: RecoveryConfig;

  constructor(
    private readonly checkpointer: Checkpointer,
    private readonly detector: CycleDetector,
    private readonly reconciler: OrderReconciler,
    config: Partial<RecoveryConfig> = {}
  ) {
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
  }

  /**
   * Perform startup recovery check.
   * Returns the action to take.
   */
  async checkAndRecover(): Promise<RecoveryAction> {
    // Detect incomplete cycle
    const incompleteCycle = await this.detector.detectIncompleteCycle();

    if (!incompleteCycle) {
      return { type: "none", reason: "No incomplete cycle found" };
    }

    return this.determineRecoveryAction(incompleteCycle);
  }

  /**
   * Determine what action to take for an incomplete cycle.
   */
  async determineRecoveryAction(
    incompleteCycle: IncompleteCycle
  ): Promise<RecoveryAction> {
    const { cycleId, lastPhase, checkpoint, ageMs } = incompleteCycle;

    // If the cycle is very old, just clean it up
    if (ageMs > this.config.maxCheckpointAge) {
      await this.cleanupCycle(cycleId);
      return {
        type: "restart",
        reason: `Cycle ${cycleId} is too old (${Math.round(ageMs / 3600000)}h), cleaning up and starting fresh`,
      };
    }

    // If no checkpoint, we crashed before any phase completed
    if (!checkpoint || !lastPhase) {
      await this.cleanupCycle(cycleId);
      return {
        type: "restart",
        reason: `Cycle ${cycleId} has no checkpoint, starting fresh`,
      };
    }

    // Check if it's a restartable phase
    if (RESTARTABLE_PHASES.has(lastPhase)) {
      await this.cleanupCycle(cycleId);
      return {
        type: "restart",
        reason: `Cycle ${cycleId} crashed in ${lastPhase} phase (no side effects), restarting`,
      };
    }

    // Execution phase requires reconciliation
    if (lastPhase === "execution") {
      return this.handleExecutionRecovery(cycleId, checkpoint);
    }

    // Shouldn't reach here, but handle gracefully
    await this.cleanupCycle(cycleId);
    return {
      type: "restart",
      reason: `Unknown phase ${lastPhase}, starting fresh`,
    };
  }

  /**
   * Handle recovery from execution phase crash.
   */
  private async handleExecutionRecovery(
    cycleId: string,
    checkpoint: { phase: CyclePhase; state: unknown }
  ): Promise<RecoveryAction> {
    const executionState = checkpoint.state as ExecutionState;

    // Check if all orders have been processed
    const allProcessed = await this.reconciler.areAllOrdersProcessed(
      executionState
    );

    if (allProcessed) {
      // All orders done, just mark cycle complete
      await this.checkpointer.markCycleCompleted(cycleId, {
        recoveredAt: new Date().toISOString(),
        recoveryReason: "All orders already processed at broker",
      });
      await this.cleanupCycle(cycleId);

      return {
        type: "complete",
        reason: `Cycle ${cycleId} execution was complete, marked as finished`,
      };
    }

    // Check pending orders
    const pendingOrders = await this.reconciler.getPendingOrders(executionState);

    if (pendingOrders.length === 0) {
      // No pending orders, all were submitted
      await this.checkpointer.markCycleCompleted(cycleId);
      await this.cleanupCycle(cycleId);

      return {
        type: "complete",
        reason: `Cycle ${cycleId} has no pending orders, marking complete`,
      };
    }

    // There are pending orders - resume execution
    return {
      type: "resume",
      fromPhase: "execution",
      checkpoint: {
        cycleId,
        phase: checkpoint.phase,
        state: {
          ...executionState,
          // Mark already-submitted orders
          orders: executionState.orders.map((order) => {
            const isPending = pendingOrders.some(
              (p) => p.clientOrderId === order.clientOrderId
            );
            return isPending ? order : { ...order, status: "submitted" as const };
          }),
        },
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Clean up a cycle's checkpoint and events.
   */
  private async cleanupCycle(cycleId: string): Promise<void> {
    await this.checkpointer.deleteCheckpoint(cycleId);
    // Note: We keep events for audit trail, cleanup will handle old ones
  }

  /**
   * Perform full recovery including cleanup.
   */
  async performFullRecovery(): Promise<{
    action: RecoveryAction;
    cleanupResult: { checkpointsDeleted: number; eventsDeleted: number };
  }> {
    const action = await this.checkAndRecover();
    const cleanupResult = await this.checkpointer.cleanup();

    return { action, cleanupResult };
  }

  /**
   * Generate a new cycle ID.
   */
  static generateCycleId(): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const random = Math.random().toString(36).substring(2, 8);
    return `cycle-${timestamp}-${random}`;
  }
}

/**
 * Create a recovery manager.
 */
export function createRecoveryManager(
  checkpointer: Checkpointer,
  detector: CycleDetector,
  reconciler: OrderReconciler,
  config?: Partial<RecoveryConfig>
): RecoveryManager {
  return new RecoveryManager(checkpointer, detector, reconciler, config);
}

/**
 * Convenience function to set up the full recovery system.
 */
export interface RecoverySystem {
  checkpointer: Checkpointer;
  detector: CycleDetector;
  reconciler: OrderReconciler;
  manager: RecoveryManager;
  cleanup: () => void;
}

/**
 * Create a complete recovery system.
 */
export function createRecoverySystem(
  db: import("@cream/storage").TursoClient,
  brokerFetcher: BrokerOrderFetcher,
  config?: Partial<RecoveryConfig>
): RecoverySystem {
  // Import here to avoid circular dependencies
  const { createCheckpointer } = require("./checkpointer.js");
  const { createCycleDetector } = require("./detector.js");
  const { createOrderReconciler } = require("./reconciler.js");

  const checkpointer = createCheckpointer(db, config);
  const detector = createCycleDetector(checkpointer);
  const reconciler = createOrderReconciler(brokerFetcher, config);
  const manager = createRecoveryManager(checkpointer, detector, reconciler, config);

  // Start periodic cleanup
  const stopCleanup = checkpointer.startPeriodicCleanup();

  return {
    checkpointer,
    detector,
    reconciler,
    manager,
    cleanup: stopCleanup,
  };
}
