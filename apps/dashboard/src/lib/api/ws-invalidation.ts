/**
 * WebSocket Cache Invalidation
 *
 * Handles TanStack Query cache invalidation triggered by WebSocket messages.
 * Uses debouncing to avoid excessive refetches from rapid message bursts.
 *
 * @see docs/plans/ui/07-state-management.md lines 47-66
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.2
 */

import { type CyclePhase, useCycleStore } from "@/stores/cycle-store";
import { getQueryClient, queryKeys } from "./query-client";

// ============================================
// Debounced Invalidation
// ============================================

/** Pending invalidation keys, grouped by category for efficient debouncing */
const pendingInvalidations = new Set<string>();

/** Debounce timer reference */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce delay in milliseconds */
const DEBOUNCE_MS = 100;

/**
 * Map server invalidation hints to TanStack Query keys.
 * The server sends dot-notation strings like "portfolio.positions".
 */
function mapInvalidationHintToQueryKey(hint: string): readonly unknown[] | null {
  const parts = hint.split(".");

  switch (parts[0]) {
    case "portfolio":
      if (parts[1] === "positions") {
        return parts[2] ? queryKeys.portfolio.position(parts[2]) : queryKeys.portfolio.positions();
      }
      if (parts[1] === "summary") {
        return queryKeys.portfolio.summary();
      }
      if (parts[1] === "account") {
        return queryKeys.portfolio.account();
      }
      return queryKeys.portfolio.all;

    case "orders":
      // Orders are not in queryKeys, invalidate decisions as fallback
      return queryKeys.decisions.all;

    case "decisions":
      if (parts[1]) {
        return queryKeys.decisions.detail(parts[1]);
      }
      return queryKeys.decisions.all;

    case "market":
      if (parts[1]) {
        if (parts[2] === "quote") {
          return queryKeys.market.quote(parts[1]);
        }
        return queryKeys.market.symbol(parts[1]);
      }
      return queryKeys.market.all;

    case "system":
      if (parts[1] === "status") {
        return queryKeys.system.status();
      }
      return queryKeys.system.all;

    case "alerts":
      return queryKeys.alerts.all;

    default:
      return null;
  }
}

/**
 * Queue an invalidation hint for debounced processing.
 */
function queueInvalidation(hint: string): void {
  pendingInvalidations.add(hint);
  scheduleFlush();
}

/**
 * Queue multiple invalidation hints.
 */
function queueInvalidations(hints: string[]): void {
  for (const hint of hints) {
    pendingInvalidations.add(hint);
  }
  scheduleFlush();
}

/**
 * Schedule a debounced flush of pending invalidations.
 */
function scheduleFlush(): void {
  if (debounceTimer !== null) {
    return; // Already scheduled
  }

  debounceTimer = setTimeout(() => {
    flushPendingInvalidations();
    debounceTimer = null;
  }, DEBOUNCE_MS);
}

/**
 * Flush all pending invalidations immediately.
 */
function flushPendingInvalidations(): void {
  if (pendingInvalidations.size === 0) {
    return;
  }

  const queryClient = getQueryClient();
  const processedKeys = new Set<string>();

  for (const hint of pendingInvalidations) {
    const queryKey = mapInvalidationHintToQueryKey(hint);
    if (queryKey) {
      const keyString = JSON.stringify(queryKey);
      // Avoid invalidating the same key multiple times
      if (!processedKeys.has(keyString)) {
        processedKeys.add(keyString);
        queryClient.invalidateQueries({ queryKey });
      }
    }
  }

  pendingInvalidations.clear();
}

// ============================================
// Message Types
// ============================================

export type WSMessageType =
  | "quote"
  | "aggregate"
  | "order"
  | "decision"
  | "agent_output"
  | "cycle_progress"
  | "cycle_result"
  | "alert"
  | "system_status"
  | "account_update"
  | "position_update"
  | "order_update"
  | "portfolio_update"
  | "portfolio";

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  data: T;
  timestamp?: string;
  /** Server-provided cache invalidation hints */
  invalidates?: string[];
}

export interface QuoteData {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: string;
  bidSize?: number;
  askSize?: number;
  prevClose?: number;
  changePercent?: number;
}

export interface OrderData {
  id: string;
  symbol: string;
  status: string;
  filledQty?: number;
  avgPrice?: number;
}

export interface DecisionData {
  id: string;
  symbol: string;
  action: string;
  status: string;
}

export interface AgentOutputData {
  decisionId: string;
  agentType: string;
  status: "processing" | "complete";
  vote?: "APPROVE" | "REJECT" | "ABSTAIN";
  confidence?: number;
  reasoning?: string;
  output?: string;
}

export interface CycleProgressData {
  cycleId: string;
  phase: CyclePhase;
  step: string;
  progress: number;
  message: string;
  activeSymbol?: string;
  totalSymbols?: number;
  completedSymbols?: number;
  startedAt?: string;
  estimatedCompletion?: string;
  timestamp: string;
}

export interface CycleResultData {
  cycleId: string;
  environment: string;
  status: "completed" | "failed";
  result?: {
    approved: boolean;
    iterations: number;
    decisions: unknown[];
    orders: unknown[];
  };
  error?: string;
  durationMs: number;
  configVersion?: string;
  timestamp: string;
}

export interface SystemStatusData {
  status: "running" | "paused" | "stopped" | "error";
  lastCycleId?: string;
  lastCycleTime?: string;
  nextCycleAt?: string;
}

export function handleWSMessage(message: WSMessage): void {
  const queryClient = getQueryClient();

  switch (message.type) {
    case "quote": {
      const quote = message.data as QuoteData;
      // Direct cache update avoids refetch latency for high-frequency quote data
      queryClient.setQueryData(queryKeys.market.quote(quote.symbol), quote);
      break;
    }

    case "system_status": {
      const status = message.data as SystemStatusData;
      queryClient.setQueryData(queryKeys.system.status(), status);
      break;
    }

    case "order": {
      // Use debounced invalidation for order bursts
      queueInvalidations(["portfolio.positions", "portfolio.summary"]);
      break;
    }

    case "decision": {
      // Use debounced invalidation for decision updates
      queueInvalidation("decisions");
      break;
    }

    case "agent_output": {
      const data = message.data as AgentOutputData;
      const store = useCycleStore.getState();

      if (data.status === "processing") {
        // Streaming partial output
        store.setStreamingOutput({
          agentType: data.agentType,
          text: data.output || "",
        });
      } else if (data.status === "complete") {
        // Agent finished - save final output and clear streaming
        store.updateAgentOutput({
          decisionId: data.decisionId,
          agentType: data.agentType,
          vote: data.vote || "ABSTAIN",
          confidence: data.confidence || 0,
          reasoningSummary: data.reasoning,
          timestamp: new Date().toISOString(),
        });
        store.setStreamingOutput(null);
      }

      // Also invalidate decision detail for vote display
      queryClient.invalidateQueries({
        queryKey: queryKeys.decisions.detail(data.decisionId),
      });
      break;
    }

    case "cycle_progress": {
      const data = message.data as CycleProgressData;
      const store = useCycleStore.getState();

      // Normalize phase to lowercase for cycle-store compatibility
      const normalizedPhase = data.phase.toLowerCase() as CyclePhase;

      // Update cycle store with progress
      store.setCycle({
        id: data.cycleId,
        phase: normalizedPhase,
        progress: data.progress,
        startedAt: data.startedAt ?? data.timestamp,
        estimatedEndAt: data.estimatedCompletion,
      });

      // Update phase explicitly in case setCycle doesn't update it
      store.updatePhase(normalizedPhase);
      store.updateProgress(data.progress);

      // Also invalidate system status
      queryClient.invalidateQueries({ queryKey: queryKeys.system.status() });
      break;
    }

    case "cycle_result": {
      const data = message.data as CycleResultData;
      const store = useCycleStore.getState();

      if (data.status === "completed") {
        // Mark cycle as complete
        store.completeCycle();
      } else if (data.status === "failed") {
        // Reset the store on failure
        store.reset();
      }

      // Use debounced invalidation for multiple query types
      queueInvalidations(["system.status", "decisions", "portfolio"]);
      break;
    }

    case "alert": {
      // Use debounced invalidation for alert bursts
      queueInvalidation("alerts");
      break;
    }

    case "account_update": {
      // Use server-provided invalidation hints if available
      if (message.invalidates?.length) {
        queueInvalidations(message.invalidates);
      } else {
        // Fallback to default invalidation
        queueInvalidation("portfolio.account");
      }
      break;
    }

    case "position_update": {
      // Use server-provided invalidation hints if available
      if (message.invalidates?.length) {
        queueInvalidations(message.invalidates);
      } else {
        // Fallback to default invalidation
        queueInvalidation("portfolio.positions");
      }
      break;
    }

    case "order_update": {
      // Use server-provided invalidation hints if available
      if (message.invalidates?.length) {
        queueInvalidations(message.invalidates);
      } else {
        // Fallback to default invalidation
        queueInvalidations(["portfolio.positions", "portfolio.summary"]);
      }
      break;
    }

    case "portfolio_update":
    case "portfolio": {
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all });
      break;
    }

    default:
  }
}

/**
 * Create a WebSocket message handler bound to the query client.
 *
 * @example
 * ```typescript
 * const handler = createWSMessageHandler();
 * websocket.addEventListener('message', (event) => {
 *   handler(JSON.parse(event.data));
 * });
 * ```
 */
export function createWSMessageHandler() {
  return handleWSMessage;
}

/**
 * Immediately flush all pending debounced invalidations.
 *
 * Call this when you need to force an immediate cache refresh,
 * such as before navigation or when the user explicitly requests it.
 */
export function flushInvalidations(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  flushPendingInvalidations();
}

/**
 * Queue invalidation hints for debounced processing.
 * Exported for direct use when handling custom messages.
 */
export { queueInvalidation, queueInvalidations };

export default handleWSMessage;
