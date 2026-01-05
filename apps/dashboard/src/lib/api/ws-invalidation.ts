/**
 * WebSocket Query Invalidation
 *
 * Handles real-time data updates by invalidating or directly
 * updating TanStack Query cache when WebSocket messages arrive.
 *
 * @see docs/plans/ui/07-state-management.md lines 47-66
 */

import { getQueryClient, queryKeys } from "./query-client.js";

// ============================================
// Types
// ============================================

/**
 * WebSocket message types that trigger cache updates.
 */
export type WSMessageType =
  | "quote"
  | "order"
  | "decision"
  | "agent_output"
  | "cycle_progress"
  | "alert"
  | "system_status"
  | "position_update"
  | "portfolio_update";

/**
 * WebSocket message structure.
 */
export interface WSMessage<T = unknown> {
  type: WSMessageType;
  data: T;
  timestamp: string;
}

/**
 * Quote update message data.
 */
export interface QuoteData {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: string;
}

/**
 * Order update message data.
 */
export interface OrderData {
  id: string;
  symbol: string;
  status: string;
  filledQty?: number;
  avgPrice?: number;
}

/**
 * Decision update message data.
 */
export interface DecisionData {
  id: string;
  symbol: string;
  action: string;
  status: string;
}

/**
 * Agent output message data.
 */
export interface AgentOutputData {
  decisionId: string;
  agentType: string;
  vote: string;
  confidence: number;
  reasoning?: string;
}

/**
 * System status message data.
 */
export interface SystemStatusData {
  status: "running" | "paused" | "stopped" | "error";
  lastCycleId?: string;
  lastCycleTime?: string;
  nextCycleAt?: string;
}

// ============================================
// Handler Implementation
// ============================================

/**
 * Handle incoming WebSocket message and update query cache.
 *
 * Uses two strategies:
 * 1. Direct cache update (setQueryData) for high-frequency data like quotes
 * 2. Invalidation (invalidateQueries) for data that should refetch
 *
 * @example
 * ```typescript
 * websocket.onmessage = (event) => {
 *   const message = JSON.parse(event.data);
 *   handleWSMessage(message);
 * };
 * ```
 */
export function handleWSMessage(message: WSMessage): void {
  const queryClient = getQueryClient();

  switch (message.type) {
    // ----------------------------------------
    // Direct cache updates (high frequency)
    // ----------------------------------------

    case "quote": {
      const quote = message.data as QuoteData;
      // Update quote cache directly to avoid refetch latency
      queryClient.setQueryData(queryKeys.market.quote(quote.symbol), quote);
      break;
    }

    case "system_status": {
      const status = message.data as SystemStatusData;
      queryClient.setQueryData(queryKeys.system.status(), status);
      break;
    }

    // ----------------------------------------
    // Invalidation (triggers background refetch)
    // ----------------------------------------

    case "order": {
      // Order updates affect positions and portfolio
      queryClient.invalidateQueries({
        queryKey: queryKeys.portfolio.positions.all,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.summary() });
      break;
    }

    case "decision": {
      // New or updated decision
      queryClient.invalidateQueries({ queryKey: queryKeys.decisions.all });
      break;
    }

    case "agent_output": {
      const output = message.data as AgentOutputData;
      // Invalidate specific decision to show agent votes
      queryClient.invalidateQueries({
        queryKey: queryKeys.decisions.detail(output.decisionId),
      });
      break;
    }

    case "cycle_progress": {
      // System status updated during OODA cycle
      queryClient.invalidateQueries({ queryKey: queryKeys.system.status() });
      break;
    }

    case "alert": {
      // New alert, refresh alerts list
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
      break;
    }

    case "position_update": {
      // Position changed (fill, close)
      queryClient.invalidateQueries({
        queryKey: queryKeys.portfolio.positions.all,
      });
      break;
    }

    case "portfolio_update": {
      // Portfolio metrics changed
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
 * Batch multiple invalidations for performance.
 *
 * Call this after processing a batch of WebSocket messages
 * to ensure a single refetch instead of multiple.
 */
export function flushInvalidations(): void {
  // TanStack Query batches invalidations automatically,
  // but this provides an explicit flush point if needed
  const queryClient = getQueryClient();
  queryClient.invalidateQueries();
}

export default handleWSMessage;
