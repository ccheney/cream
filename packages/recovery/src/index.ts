/**
 * @cream/recovery - Mid-cycle crash recovery
 *
 * Provides checkpoint-based crash recovery for trading cycles,
 * with order reconciliation and resume/restart decision logic.
 *
 * @example
 * ```typescript
 * import { createRecoverySystem } from "@cream/recovery";
 * import { createTursoClient } from "@cream/storage";
 *
 * const db = await createTursoClient();
 * const brokerFetcher = createAlpacaBrokerFetcher(alpacaClient);
 *
 * const recovery = createRecoverySystem(db, brokerFetcher);
 *
 * // On startup, check for incomplete cycles
 * const action = await recovery.manager.checkAndRecover();
 *
 * switch (action.type) {
 *   case "restart":
 *     console.log("Restarting cycle:", action.reason);
 *     startNewCycle();
 *     break;
 *   case "resume":
 *     console.log("Resuming from:", action.fromPhase);
 *     resumeCycle(action.checkpoint);
 *     break;
 *   case "complete":
 *     console.log("Previous cycle completed:", action.reason);
 *     startNewCycle();
 *     break;
 *   case "none":
 *     console.log("No recovery needed");
 *     startNewCycle();
 *     break;
 * }
 *
 * // During cycle execution, save checkpoints
 * await recovery.checkpointer.markCycleStarted(cycleId);
 * await recovery.checkpointer.saveCheckpoint(cycleId, "data_fetch", dataState);
 * await recovery.checkpointer.saveCheckpoint(cycleId, "agents", agentsState);
 * await recovery.checkpointer.saveCheckpoint(cycleId, "synthesis", synthesisState);
 * await recovery.checkpointer.saveCheckpoint(cycleId, "execution", executionState);
 * await recovery.checkpointer.markCycleCompleted(cycleId);
 *
 * // Cleanup on shutdown
 * recovery.cleanup();
 * ```
 */

// Types
export type {
  AgentOutput,
  AgentsState,
  BrokerOrder,
  Checkpoint,
  CheckpointRow,
  CycleEvent,
  CycleEventRow,
  CycleEventType,
  CyclePhase,
  DataFetchState,
  ExecutionState,
  OrderCheckpoint,
  PhaseState,
  ReconciliationResult,
  RecoveryAction,
  RecoveryConfig,
  SynthesisState,
} from "./types.js";

export {
  CYCLE_PHASES,
  DEFAULT_RECOVERY_CONFIG,
  PHASE_ORDER,
} from "./types.js";

// Checkpointer
export { Checkpointer, createCheckpointer } from "./checkpointer.js";

// Detector
export type { IncompleteCycle } from "./detector.js";
export { CycleDetector, createCycleDetector } from "./detector.js";

// Reconciler
export type { BrokerOrderFetcher } from "./reconciler.js";
export {
  createMockBrokerFetcher,
  createOrderReconciler,
  OrderReconciler,
} from "./reconciler.js";

// Recovery
export type { RecoverySystem } from "./recovery.js";
export {
  createRecoveryManager,
  createRecoverySystem,
  RecoveryManager,
} from "./recovery.js";
