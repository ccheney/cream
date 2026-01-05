/**
 * Checkpoint and Recovery Types
 *
 * Defines types for mid-cycle crash recovery, including checkpoint phases,
 * state snapshots, and recovery decision logic.
 */

/**
 * Phases in the trading cycle where checkpoints can be saved.
 */
export type CyclePhase = "data_fetch" | "agents" | "synthesis" | "execution";

/**
 * All possible cycle phases as a const array for iteration.
 */
export const CYCLE_PHASES: readonly CyclePhase[] = [
  "data_fetch",
  "agents",
  "synthesis",
  "execution",
] as const;

/**
 * Phase ordering for resume logic.
 * Lower number = earlier in cycle.
 */
export const PHASE_ORDER: Record<CyclePhase, number> = {
  data_fetch: 0,
  agents: 1,
  synthesis: 2,
  execution: 3,
};

/**
 * State saved during data_fetch phase.
 */
export interface DataFetchState {
  /** Symbols for which data was fetched. */
  symbols: string[];
  /** Timestamp of candle data. */
  dataTimestamp: string;
  /** Whether all data was successfully fetched. */
  complete: boolean;
}

/**
 * Individual agent output stored in checkpoint.
 */
export interface AgentOutput {
  /** Agent identifier. */
  agentId: string;
  /** Agent's analysis or recommendation. */
  output: unknown;
  /** When the agent completed. */
  completedAt: string;
}

/**
 * State saved during agents phase.
 */
export interface AgentsState {
  /** Outputs from each agent that completed. */
  agentOutputs: AgentOutput[];
  /** Total number of agents expected. */
  totalAgents: number;
  /** Whether all agents completed. */
  complete: boolean;
}

/**
 * State saved during synthesis phase.
 */
export interface SynthesisState {
  /** The generated decision plan (if any). */
  decisionPlan: unknown | null;
  /** Whether synthesis completed successfully. */
  complete: boolean;
}

/**
 * Individual order status in execution checkpoint.
 */
export interface OrderCheckpoint {
  /** Client-side order ID. */
  clientOrderId: string;
  /** Broker-assigned order ID (if submitted). */
  brokerOrderId?: string;
  /** Symbol being traded. */
  symbol: string;
  /** Order side. */
  side: "buy" | "sell";
  /** Order quantity. */
  quantity: number;
  /** Order type. */
  orderType: "limit" | "market";
  /** Limit price (if applicable). */
  limitPrice?: number;
  /** Order status. */
  status: "pending" | "submitted" | "filled" | "cancelled" | "failed";
  /** Submission timestamp. */
  submittedAt?: string;
}

/**
 * State saved during execution phase.
 */
export interface ExecutionState {
  /** Orders that are part of this cycle. */
  orders: OrderCheckpoint[];
  /** Whether all orders have been processed. */
  complete: boolean;
}

/**
 * Union of all phase-specific states.
 */
export type PhaseState =
  | DataFetchState
  | AgentsState
  | SynthesisState
  | ExecutionState;

/**
 * A checkpoint record stored in the database.
 */
export interface Checkpoint {
  /** Unique identifier for this cycle. */
  cycleId: string;
  /** Current phase of the cycle. */
  phase: CyclePhase;
  /** Phase-specific state data. */
  state: PhaseState;
  /** When this checkpoint was created. */
  createdAt: string;
}

/**
 * Database row representation of a checkpoint.
 */
export interface CheckpointRow {
  cycle_id: string;
  phase: string;
  state: string; // JSON string
  created_at: string;
}

/**
 * Cycle lifecycle event types.
 */
export type CycleEventType = "cycle_started" | "cycle_completed";

/**
 * A cycle lifecycle event.
 */
export interface CycleEvent {
  /** Unique identifier for this cycle. */
  cycleId: string;
  /** Type of event. */
  eventType: CycleEventType;
  /** When the event occurred. */
  timestamp: string;
  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Database row for cycle events.
 */
export interface CycleEventRow {
  cycle_id: string;
  event_type: string;
  timestamp: string;
  metadata: string | null; // JSON string or null
}

/**
 * Recovery action to take after detecting an incomplete cycle.
 */
export type RecoveryAction =
  | { type: "restart"; reason: string }
  | { type: "resume"; fromPhase: CyclePhase; checkpoint: Checkpoint }
  | { type: "complete"; reason: string }
  | { type: "none"; reason: string };

/**
 * Result of order reconciliation with broker.
 */
export interface ReconciliationResult {
  /** Orders found in checkpoint but not in broker (may have failed). */
  missingFromBroker: OrderCheckpoint[];
  /** Orders found in broker but not in checkpoint (orphaned). */
  orphanedOrders: BrokerOrder[];
  /** Orders that match between checkpoint and broker. */
  matchedOrders: Array<{
    checkpoint: OrderCheckpoint;
    broker: BrokerOrder;
  }>;
  /** Summary of discrepancies. */
  discrepancies: string[];
}

/**
 * Order information from the broker.
 */
export interface BrokerOrder {
  /** Broker-assigned order ID. */
  orderId: string;
  /** Client order ID (if available). */
  clientOrderId?: string;
  /** Symbol. */
  symbol: string;
  /** Side. */
  side: "buy" | "sell";
  /** Quantity. */
  quantity: number;
  /** Status. */
  status: string;
  /** Created timestamp. */
  createdAt: string;
  /** Filled quantity. */
  filledQuantity?: number;
}

/**
 * Configuration for the recovery system.
 */
export interface RecoveryConfig {
  /** Maximum age of checkpoints to keep (milliseconds). Default: 24 hours. */
  maxCheckpointAge: number;
  /** How often to clean up old checkpoints (milliseconds). Default: 1 hour. */
  cleanupInterval: number;
  /** Whether to automatically attempt recovery on startup. */
  autoRecoverOnStartup: boolean;
  /** How far back to query broker orders for reconciliation (milliseconds). */
  reconciliationLookback: number;
}

/**
 * Default recovery configuration.
 */
export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  maxCheckpointAge: 24 * 60 * 60 * 1000, // 24 hours
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  autoRecoverOnStartup: true,
  reconciliationLookback: 24 * 60 * 60 * 1000, // 24 hours
};
