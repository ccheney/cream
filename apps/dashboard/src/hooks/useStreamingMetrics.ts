"use client";

import { useEffect } from "react";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import {
  useStreamingMetrics as useMetrics,
  useStreamingMetricsStore,
} from "@/stores/streaming-metrics-store";
import { useWSStore } from "@/stores/websocket";

export function useStreamingMetrics(tickInterval = 1000) {
  const { connectionState, connected } = useWebSocketContext();
  const wsStore = useWSStore();
  const store = useStreamingMetricsStore();
  const metrics = useMetrics();
  const { subscribedSymbols, reconnectAttempts } = wsStore;

  useEffect(() => {
    store.setStocksConnected(connected);
    // Options and stocks share the same connection for now
    store.setOptionsConnected(connected);
  }, [connected, store]);

  useEffect(() => {
    store.setSymbolCount(subscribedSymbols?.length ?? 0);
  }, [subscribedSymbols, store]);

  useEffect(() => {
    store.setReconnectAttempts(reconnectAttempts ?? 0);
  }, [reconnectAttempts, store]);

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

export function useQuoteRecorder() {
  const store = useStreamingMetricsStore();

  return {
    recordStockQuote: store.recordStockQuote,
    recordOptionsQuote: store.recordOptionsQuote,
  };
}

export default useStreamingMetrics;
