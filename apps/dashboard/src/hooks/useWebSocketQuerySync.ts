/**
 * WebSocket Query Sync Hook
 *
 * Integrates WebSocket messages with TanStack Query cache invalidation.
 *
 * @see docs/plans/ui/07-state-management.md lines 46-66
 */

"use client";

import { useCallback, useRef, useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

// ============================================
// Types
// ============================================

/**
 * Server message types received via WebSocket.
 */
export type ServerMessageType =
  | "quote"
  | "order"
  | "decision"
  | "system_status"
  | "alert"
  | "agent_output"
  | "cycle_progress"
  | "portfolio"
  | "position"
  | "heartbeat"
  | "error";

/**
 * Quote message payload.
 */
export interface QuotePayload {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: string;
}

/**
 * Order message payload.
 */
export interface OrderPayload {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  status: "pending" | "filled" | "cancelled" | "rejected";
  filledQuantity?: number;
  timestamp: string;
}

/**
 * Decision message payload.
 */
export interface DecisionPayload {
  decisionId: string;
  symbol: string;
  action: "BUY" | "SELL" | "HOLD" | "CLOSE";
  confidence: number;
  timestamp: string;
}

/**
 * System status payload.
 */
export interface SystemStatusPayload {
  status: "online" | "offline" | "degraded";
  services: Record<string, "healthy" | "unhealthy" | "unknown">;
  lastUpdated: string;
}

/**
 * Alert payload.
 */
export interface AlertPayload {
  alertId: string;
  type: "info" | "warning" | "error" | "success";
  title: string;
  message: string;
  timestamp: string;
}

/**
 * Agent output payload.
 */
export interface AgentOutputPayload {
  agentId: string;
  agentName: string;
  output: string;
  timestamp: string;
}

/**
 * Cycle progress payload.
 */
export interface CycleProgressPayload {
  cycleId: string;
  phase: "observe" | "orient" | "decide" | "act" | "complete";
  progress: number;
  timestamp: string;
}

/**
 * Portfolio payload.
 */
export interface PortfolioPayload {
  equity: number;
  cash: number;
  buyingPower: number;
  dayPL: number;
  totalPL: number;
  timestamp: string;
}

/**
 * Position payload.
 */
export interface PositionPayload {
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  unrealizedPL: number;
  timestamp: string;
}

/**
 * Server message structure.
 */
export interface ServerMessage<T = unknown> {
  type: ServerMessageType;
  data: T;
  timestamp: string;
}

/**
 * Hook options.
 */
export interface UseWebSocketQuerySyncOptions {
  /** Debounce invalidations in ms (default: 100) */
  debounceMs?: number;

  /** Enable debug logging */
  debug?: boolean;

  /** Custom query key prefix */
  queryKeyPrefix?: string;

  /** Callback for cycle progress updates (for Zustand store) */
  onCycleProgress?: (payload: CycleProgressPayload) => void;

  /** Callback for errors */
  onError?: (error: Error) => void;
}

/**
 * Hook return type.
 */
export interface UseWebSocketQuerySyncReturn {
  /** Handle incoming WebSocket message */
  handleMessage: (message: unknown) => void;

  /** Manually invalidate queries by type */
  invalidateByType: (type: ServerMessageType) => void;

  /** Get pending invalidation count */
  pendingCount: number;

  /** Flush all pending invalidations immediately */
  flush: () => void;
}

// ============================================
// Query Key Factories
// ============================================

/**
 * Query key factories for consistent key generation.
 */
export const queryKeys = {
  // Market data
  marketQuote: (symbol: string) => ["market", "quote", symbol] as const,
  marketQuotes: () => ["market", "quotes"] as const,

  // Portfolio
  portfolio: () => ["portfolio"] as const,
  portfolioSummary: () => ["portfolio", "summary"] as const,
  positions: () => ["portfolio", "positions"] as const,
  position: (symbol: string) => ["portfolio", "positions", symbol] as const,

  // Orders
  orders: () => ["orders"] as const,
  order: (orderId: string) => ["orders", orderId] as const,
  activeOrders: () => ["orders", "active"] as const,

  // Decisions
  decisions: () => ["decisions"] as const,
  decision: (decisionId: string) => ["decisions", decisionId] as const,
  recentDecisions: () => ["decisions", "recent"] as const,

  // Alerts
  alerts: () => ["alerts"] as const,
  unreadAlerts: () => ["alerts", "unread"] as const,

  // Agents
  agents: () => ["agents"] as const,
  agentOutput: (agentId: string) => ["agents", agentId, "output"] as const,

  // System
  systemStatus: () => ["system", "status"] as const,
  systemHealth: () => ["system", "health"] as const,
} as const;

// ============================================
// Message Validation
// ============================================

/**
 * Validate and parse server message.
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const message = raw as Record<string, unknown>;

  if (typeof message.type !== "string") {
    return null;
  }

  const validTypes: ServerMessageType[] = [
    "quote",
    "order",
    "decision",
    "system_status",
    "alert",
    "agent_output",
    "cycle_progress",
    "portfolio",
    "position",
    "heartbeat",
    "error",
  ];

  if (!validTypes.includes(message.type as ServerMessageType)) {
    return null;
  }

  return {
    type: message.type as ServerMessageType,
    data: message.data,
    timestamp: (message.timestamp as string) || new Date().toISOString(),
  };
}

// ============================================
// Debounced Invalidation
// ============================================

/**
 * Create a debounced invalidation batcher.
 */
function createInvalidationBatcher(
  queryClient: QueryClient,
  debounceMs: number
) {
  const pending = new Set<string>();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (pending.size === 0) return;

    const keys = Array.from(pending);
    pending.clear();

    // Group by top-level key for batch invalidation
    const keyGroups = new Map<string, string[][]>();
    for (const keyStr of keys) {
      const key = JSON.parse(keyStr) as string[];
      const topLevel = key[0];
      if (!keyGroups.has(topLevel)) {
        keyGroups.set(topLevel, []);
      }
      keyGroups.get(topLevel)!.push(key);
    }

    // Invalidate by group
    for (const [_topLevel, queryKeys] of keyGroups) {
      // Use the shortest key for partial matching
      const shortestKey = queryKeys.reduce((a, b) =>
        a.length <= b.length ? a : b
      );
      queryClient.invalidateQueries({ queryKey: shortestKey });
    }
  };

  const add = (queryKey: readonly unknown[]) => {
    pending.add(JSON.stringify(queryKey));

    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(flush, debounceMs);
  };

  const cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return {
    add,
    flush,
    cancel,
    get size() {
      return pending.size;
    },
  };
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for syncing WebSocket messages with TanStack Query cache.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { handleMessage } = useWebSocketQuerySync({
 *     onCycleProgress: (payload) => useCycleStore.getState().setProgress(payload),
 *   });
 *
 *   useWebSocket({
 *     url: WS_URL,
 *     onMessage: handleMessage,
 *   });
 * }
 * ```
 */
export function useWebSocketQuerySync(
  options: UseWebSocketQuerySyncOptions = {}
): UseWebSocketQuerySyncReturn {
  const {
    debounceMs = 100,
    debug = false,
    onCycleProgress,
    onError,
  } = options;

  const queryClient = useQueryClient();

  // Refs for stable callbacks
  const onCycleProgressRef = useRef(onCycleProgress);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCycleProgressRef.current = onCycleProgress;
    onErrorRef.current = onError;
  }, [onCycleProgress, onError]);

  // Create invalidation batcher
  const batcherRef = useRef<ReturnType<typeof createInvalidationBatcher> | null>(
    null
  );

  if (!batcherRef.current) {
    batcherRef.current = createInvalidationBatcher(queryClient, debounceMs);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      batcherRef.current?.cancel();
    };
  }, []);

  // Handle message
  const handleMessage = useCallback(
    (raw: unknown) => {
      try {
        const message = parseServerMessage(raw);

        if (!message) {
          if (debug) {
            console.warn("[WS Query Sync] Invalid message:", raw);
          }
          return;
        }

        if (debug) {
          console.log("[WS Query Sync] Received:", message.type, message.data);
        }

        // Skip heartbeat
        if (message.type === "heartbeat") {
          return;
        }

        switch (message.type) {
          case "quote": {
            const payload = message.data as QuotePayload;
            // Use setQueryData for complete data (no refetch needed)
            queryClient.setQueryData(queryKeys.marketQuote(payload.symbol), payload);
            break;
          }

          case "order": {
            // Invalidate portfolio and orders queries
            batcherRef.current?.add(queryKeys.portfolio());
            batcherRef.current?.add(queryKeys.positions());
            batcherRef.current?.add(queryKeys.orders());
            break;
          }

          case "decision": {
            // Invalidate decisions queries
            batcherRef.current?.add(queryKeys.decisions());
            break;
          }

          case "system_status": {
            const payload = message.data as SystemStatusPayload;
            // Use setQueryData for complete data
            queryClient.setQueryData(queryKeys.systemStatus(), payload);
            break;
          }

          case "alert": {
            // Invalidate alerts queries
            batcherRef.current?.add(queryKeys.alerts());
            break;
          }

          case "agent_output": {
            // Invalidate agents queries
            batcherRef.current?.add(queryKeys.agents());
            break;
          }

          case "cycle_progress": {
            const payload = message.data as CycleProgressPayload;
            // Update Zustand store (not React Query)
            onCycleProgressRef.current?.(payload);
            break;
          }

          case "portfolio": {
            const payload = message.data as PortfolioPayload;
            // Use setQueryData for complete data
            queryClient.setQueryData(queryKeys.portfolioSummary(), payload);
            break;
          }

          case "position": {
            const payload = message.data as PositionPayload;
            // Update specific position
            queryClient.setQueryData(queryKeys.position(payload.symbol), payload);
            // Invalidate positions list
            batcherRef.current?.add(queryKeys.positions());
            break;
          }

          case "error": {
            const error = new Error(
              typeof message.data === "string"
                ? message.data
                : "WebSocket error"
            );
            onErrorRef.current?.(error);
            break;
          }

          default:
            if (debug) {
              console.warn("[WS Query Sync] Unknown message type:", message.type);
            }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (debug) {
          console.error("[WS Query Sync] Error handling message:", error);
        }
        onErrorRef.current?.(error);
      }
    },
    [queryClient, debug]
  );

  // Manual invalidation by type
  const invalidateByType = useCallback(
    (type: ServerMessageType) => {
      switch (type) {
        case "quote":
          queryClient.invalidateQueries({ queryKey: ["market"] });
          break;
        case "order":
          queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
          queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() });
          break;
        case "decision":
          queryClient.invalidateQueries({ queryKey: queryKeys.decisions() });
          break;
        case "system_status":
          queryClient.invalidateQueries({ queryKey: queryKeys.systemStatus() });
          break;
        case "alert":
          queryClient.invalidateQueries({ queryKey: queryKeys.alerts() });
          break;
        case "agent_output":
          queryClient.invalidateQueries({ queryKey: queryKeys.agents() });
          break;
        case "portfolio":
        case "position":
          queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() });
          break;
        default:
          break;
      }
    },
    [queryClient]
  );

  // Flush pending invalidations
  const flush = useCallback(() => {
    batcherRef.current?.flush();
  }, []);

  return {
    handleMessage,
    invalidateByType,
    pendingCount: batcherRef.current?.size ?? 0,
    flush,
  };
}

export default useWebSocketQuerySync;
