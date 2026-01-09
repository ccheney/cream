/**
 * useStreamingMetrics Hook
 *
 * Hook to track and update streaming WebSocket metrics.
 * Provides real-time updates for connection health monitoring.
 */

"use client";

import { useEffect } from "react";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import {
  useStreamingMetrics as useMetrics,
  useStreamingMetricsStore,
} from "@/stores/streaming-metrics-store";
import { useWSStore } from "@/stores/websocket";

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook to track streaming metrics.
 *
 * Sets up a ticker interval to update time-based metrics
 * and syncs with WebSocket connection state.
 *
 * @param tickInterval - Interval in ms for tick updates (default: 1000)
 */
export function useStreamingMetrics(tickInterval = 1000) {
  const { connectionState, connected } = useWebSocketContext();
  const wsStore = useWSStore();
  const store = useStreamingMetricsStore();
  const metrics = useMetrics();

  // Get subscription info from WS store
  const { subscribedSymbols, reconnectAttempts } = wsStore;

  // Sync connection state
  useEffect(() => {
    store.setStocksConnected(connected);
    // For now, options and stocks share same connection
    store.setOptionsConnected(connected);
  }, [connected, store]);

  // Sync subscription counts
  useEffect(() => {
    store.setSymbolCount(subscribedSymbols?.length ?? 0);
  }, [subscribedSymbols, store]);

  // Sync reconnection attempts
  useEffect(() => {
    store.setReconnectAttempts(reconnectAttempts ?? 0);
  }, [reconnectAttempts, store]);

  // Set up ticker for time-based updates
  useEffect(() => {
    const interval = setInterval(() => {
      store.tick();
    }, tickInterval);

    return () => {
      clearInterval(interval);
    };
  }, [tickInterval, store]);

  return {
    ...metrics,
    connectionState,
  };
}

/**
 * Hook to record incoming quote messages.
 *
 * Use this in your message handler to track quote metrics.
 *
 * @example
 * ```tsx
 * const { recordStockQuote, recordOptionsQuote } = useQuoteRecorder();
 *
 * const handleMessage = (data) => {
 *   if (data.type === 'quote') {
 *     recordStockQuote(data.timestamp);
 *   } else if (data.type === 'options_quote') {
 *     recordOptionsQuote(data.timestamp);
 *   }
 * };
 * ```
 */
export function useQuoteRecorder() {
  const store = useStreamingMetricsStore();

  return {
    recordStockQuote: store.recordStockQuote,
    recordOptionsQuote: store.recordOptionsQuote,
  };
}

export default useStreamingMetrics;
