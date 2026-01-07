/**
 * Streaming Metrics Store
 *
 * Zustand store for tracking WebSocket streaming metrics:
 * - Quote counts per minute
 * - Message latency
 * - Connection health indicators
 *
 * @see bead cream-wsw5n
 */

import { create } from "zustand";

// ============================================
// Types
// ============================================

/**
 * Health status for streaming connection.
 */
export type HealthStatus = "healthy" | "degraded" | "disconnected";

/**
 * Streaming metrics state.
 */
export interface StreamingMetricsState {
  /** Stocks WebSocket connected */
  stocksConnected: boolean;
  /** Options WebSocket connected */
  optionsConnected: boolean;
  /** Count of subscribed symbols */
  symbolCount: number;
  /** Count of subscribed options contracts */
  contractCount: number;
  /** Stock quotes received in last minute */
  quotesPerMinute: number;
  /** Options quotes received in last minute */
  optionsQuotesPerMinute: number;
  /** Milliseconds since last message */
  lastMessageAgo: number;
  /** Average message latency in ms */
  avgLatency: number;
  /** Current reconnection attempts */
  reconnectAttempts: number;
  /** Timestamp of last message received */
  lastMessageTimestamp: number | null;
  /** Queue of recent latencies for rolling average */
  latencyQueue: number[];
  /** Queue of recent message timestamps for quotes/min calculation */
  stockQuoteTimestamps: number[];
  /** Queue of recent options message timestamps */
  optionsQuoteTimestamps: number[];
}

/**
 * Streaming metrics actions.
 */
export interface StreamingMetricsActions {
  /** Record a stock quote message received */
  recordStockQuote: (serverTimestamp?: number) => void;
  /** Record an options quote message received */
  recordOptionsQuote: (serverTimestamp?: number) => void;
  /** Update connection status */
  setStocksConnected: (connected: boolean) => void;
  setOptionsConnected: (connected: boolean) => void;
  /** Update subscription counts */
  setSymbolCount: (count: number) => void;
  setContractCount: (count: number) => void;
  /** Update reconnection attempts */
  setReconnectAttempts: (attempts: number) => void;
  /** Tick to update time-based metrics */
  tick: () => void;
  /** Reset all metrics */
  reset: () => void;
}

export type StreamingMetricsStore = StreamingMetricsState & StreamingMetricsActions;

// ============================================
// Constants
// ============================================

const LATENCY_QUEUE_SIZE = 100;
const QUOTE_WINDOW_MS = 60000; // 1 minute

// ============================================
// Initial State
// ============================================

const initialState: StreamingMetricsState = {
  stocksConnected: false,
  optionsConnected: false,
  symbolCount: 0,
  contractCount: 0,
  quotesPerMinute: 0,
  optionsQuotesPerMinute: 0,
  lastMessageAgo: 0,
  avgLatency: 0,
  reconnectAttempts: 0,
  lastMessageTimestamp: null,
  latencyQueue: [],
  stockQuoteTimestamps: [],
  optionsQuoteTimestamps: [],
};

// ============================================
// Store Implementation
// ============================================

export const useStreamingMetricsStore = create<StreamingMetricsStore>()((set, get) => ({
  ...initialState,

  recordStockQuote: (serverTimestamp) => {
    const now = Date.now();
    const state = get();

    // Calculate latency if server timestamp provided
    let newLatencyQueue = state.latencyQueue;
    if (serverTimestamp) {
      const latency = now - serverTimestamp;
      newLatencyQueue = [...state.latencyQueue, latency].slice(-LATENCY_QUEUE_SIZE);
    }

    // Add to quote timestamps, remove old ones
    const cutoff = now - QUOTE_WINDOW_MS;
    const newQuoteTimestamps = [...state.stockQuoteTimestamps, now].filter((t) => t > cutoff);

    // Calculate new average latency
    const avgLatency =
      newLatencyQueue.length > 0
        ? newLatencyQueue.reduce((a, b) => a + b, 0) / newLatencyQueue.length
        : 0;

    set({
      lastMessageTimestamp: now,
      lastMessageAgo: 0,
      latencyQueue: newLatencyQueue,
      avgLatency,
      stockQuoteTimestamps: newQuoteTimestamps,
      quotesPerMinute: newQuoteTimestamps.length,
    });
  },

  recordOptionsQuote: (serverTimestamp) => {
    const now = Date.now();
    const state = get();

    // Calculate latency if server timestamp provided
    let newLatencyQueue = state.latencyQueue;
    if (serverTimestamp) {
      const latency = now - serverTimestamp;
      newLatencyQueue = [...state.latencyQueue, latency].slice(-LATENCY_QUEUE_SIZE);
    }

    // Add to quote timestamps, remove old ones
    const cutoff = now - QUOTE_WINDOW_MS;
    const newQuoteTimestamps = [...state.optionsQuoteTimestamps, now].filter((t) => t > cutoff);

    // Calculate new average latency
    const avgLatency =
      newLatencyQueue.length > 0
        ? newLatencyQueue.reduce((a, b) => a + b, 0) / newLatencyQueue.length
        : 0;

    set({
      lastMessageTimestamp: now,
      lastMessageAgo: 0,
      latencyQueue: newLatencyQueue,
      avgLatency,
      optionsQuoteTimestamps: newQuoteTimestamps,
      optionsQuotesPerMinute: newQuoteTimestamps.length,
    });
  },

  setStocksConnected: (connected) => {
    set({ stocksConnected: connected });
  },

  setOptionsConnected: (connected) => {
    set({ optionsConnected: connected });
  },

  setSymbolCount: (count) => {
    set({ symbolCount: count });
  },

  setContractCount: (count) => {
    set({ contractCount: count });
  },

  setReconnectAttempts: (attempts) => {
    set({ reconnectAttempts: attempts });
  },

  tick: () => {
    const state = get();
    const now = Date.now();

    // Update lastMessageAgo
    const lastMessageAgo = state.lastMessageTimestamp ? now - state.lastMessageTimestamp : 0;

    // Clean up old quote timestamps
    const cutoff = now - QUOTE_WINDOW_MS;
    const stockQuoteTimestamps = state.stockQuoteTimestamps.filter((t) => t > cutoff);
    const optionsQuoteTimestamps = state.optionsQuoteTimestamps.filter((t) => t > cutoff);

    set({
      lastMessageAgo,
      stockQuoteTimestamps,
      optionsQuoteTimestamps,
      quotesPerMinute: stockQuoteTimestamps.length,
      optionsQuotesPerMinute: optionsQuoteTimestamps.length,
    });
  },

  reset: () => {
    set(initialState);
  },
}));

// ============================================
// Derived State Selectors
// ============================================

/**
 * Get health status based on metrics.
 */
export function getHealthStatus(state: StreamingMetricsState): HealthStatus {
  // Disconnected if no connection
  if (!state.stocksConnected && !state.optionsConnected) {
    return "disconnected";
  }

  // Degraded if high latency or no message in 5s
  if (state.avgLatency > 500 || state.lastMessageAgo > 5000) {
    return "degraded";
  }

  // Healthy
  return "healthy";
}

/**
 * Hook for health status.
 */
export function useHealthStatus(): HealthStatus {
  return useStreamingMetricsStore((state) => getHealthStatus(state));
}

/**
 * Hook for stocks connection status.
 */
export function useStocksConnected(): boolean {
  return useStreamingMetricsStore((state) => state.stocksConnected);
}

/**
 * Hook for options connection status.
 */
export function useOptionsConnected(): boolean {
  return useStreamingMetricsStore((state) => state.optionsConnected);
}

/**
 * Hook for metrics summary.
 */
export function useStreamingMetrics() {
  return useStreamingMetricsStore((state) => ({
    stocksConnected: state.stocksConnected,
    optionsConnected: state.optionsConnected,
    symbolCount: state.symbolCount,
    contractCount: state.contractCount,
    quotesPerMinute: state.quotesPerMinute,
    optionsQuotesPerMinute: state.optionsQuotesPerMinute,
    lastMessageAgo: state.lastMessageAgo,
    avgLatency: state.avgLatency,
    reconnectAttempts: state.reconnectAttempts,
    healthStatus: getHealthStatus(state),
  }));
}

export default useStreamingMetricsStore;
