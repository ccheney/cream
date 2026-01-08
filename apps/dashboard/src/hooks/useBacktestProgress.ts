/**
 * useBacktestProgress Hook
 *
 * React hook for real-time backtest progress updates via WebSocket.
 * Subscribes to backtest-specific events and provides progress state.
 *
 * @see docs/plans/28-backtest-execution-pipeline.md Phase 4
 */

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { queryKeys } from "@/lib/api/query-client";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

// ============================================
// Types
// ============================================

/**
 * Backtest progress state.
 */
export interface BacktestProgress {
  /** Progress percentage (0-100) */
  progress: number;
  /** Current timestamp being processed */
  currentTimestamp?: string;
  /** Number of bars processed */
  barsProcessed?: number;
  /** Total bars to process */
  totalBars?: number;
}

/**
 * Backtest trade from WebSocket.
 */
export interface BacktestProgressTrade {
  timestamp: string;
  symbol: string;
  action: "BUY" | "SELL" | "SHORT" | "COVER";
  quantity: number;
  price: number;
  pnl: number | null;
}

/**
 * Backtest equity point from WebSocket.
 */
export interface BacktestProgressEquity {
  timestamp: string;
  nav: number;
  drawdown?: number;
  drawdownPct?: number;
}

/**
 * Backtest completion metrics.
 */
export interface BacktestMetrics {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
}

/**
 * Backtest status.
 */
export type BacktestStatus = "idle" | "running" | "completed" | "error";

/**
 * Return type for useBacktestProgress hook.
 */
export interface UseBacktestProgressReturn {
  /** Current backtest status */
  status: BacktestStatus;
  /** Progress information */
  progress: BacktestProgress | null;
  /** Recent trades (last 50) */
  recentTrades: BacktestProgressTrade[];
  /** Recent equity points (last 100) */
  recentEquity: BacktestProgressEquity[];
  /** Final metrics (when completed) */
  metrics: BacktestMetrics | null;
  /** Error message (if failed) */
  error: string | null;
  /** Whether subscribed to WebSocket */
  isSubscribed: boolean;
}

// ============================================
// Message Types (match server messages)
// ============================================

interface BacktestStartedMessage {
  type: "backtest:started";
  payload: { backtestId: string };
}

interface BacktestProgressMessage {
  type: "backtest:progress";
  payload: {
    backtestId: string;
    progress: number;
    currentTimestamp?: string;
    barsProcessed?: number;
    totalBars?: number;
  };
}

interface BacktestTradeMessage {
  type: "backtest:trade";
  payload: {
    backtestId: string;
    timestamp: string;
    symbol: string;
    action: "BUY" | "SELL" | "SHORT" | "COVER";
    quantity: number;
    price: number;
    pnl: number | null;
  };
}

interface BacktestEquityMessage {
  type: "backtest:equity";
  payload: {
    backtestId: string;
    timestamp: string;
    nav: number;
    drawdown?: number;
    drawdownPct?: number;
  };
}

interface BacktestCompletedMessage {
  type: "backtest:completed";
  payload: {
    backtestId: string;
    metrics?: BacktestMetrics;
  };
}

interface BacktestErrorMessage {
  type: "backtest:error";
  payload: {
    backtestId: string;
    error: string;
  };
}

type BacktestWSMessage =
  | BacktestStartedMessage
  | BacktestProgressMessage
  | BacktestTradeMessage
  | BacktestEquityMessage
  | BacktestCompletedMessage
  | BacktestErrorMessage;

// ============================================
// Constants
// ============================================

const MAX_RECENT_TRADES = 50;
const MAX_RECENT_EQUITY = 100;

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for real-time backtest progress updates.
 *
 * @param backtestId - The backtest ID to subscribe to (null to disable)
 * @returns Backtest progress state
 *
 * @example
 * ```tsx
 * function BacktestDetail({ id }: { id: string }) {
 *   const { status, progress, recentTrades, error } = useBacktestProgress(id);
 *
 *   if (status === "running" && progress) {
 *     return <ProgressBar value={progress.progress} />;
 *   }
 *
 *   if (status === "error") {
 *     return <Alert variant="error">{error}</Alert>;
 *   }
 *
 *   return <BacktestResults id={id} />;
 * }
 * ```
 */
export function useBacktestProgress(backtestId: string | null): UseBacktestProgressReturn {
  const queryClient = useQueryClient();
  const { lastMessage, subscribeBacktest, unsubscribeBacktest, connected } = useWebSocketContext();

  // State
  const [status, setStatus] = useState<BacktestStatus>("idle");
  const [progress, setProgress] = useState<BacktestProgress | null>(null);
  const [recentTrades, setRecentTrades] = useState<BacktestProgressTrade[]>([]);
  const [recentEquity, setRecentEquity] = useState<BacktestProgressEquity[]>([]);
  const [metrics, setMetrics] = useState<BacktestMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Track current backtest ID in ref to avoid stale closures
  const backtestIdRef = useRef(backtestId);
  backtestIdRef.current = backtestId;

  // Reset state when backtest ID changes
  const resetState = useCallback(() => {
    setStatus("idle");
    setProgress(null);
    setRecentTrades([]);
    setRecentEquity([]);
    setMetrics(null);
    setError(null);
  }, []);

  // Handle backtest messages
  const handleMessage = useCallback(
    (message: BacktestWSMessage) => {
      // Filter messages for our backtest
      if (!("payload" in message) || !message.payload) {
        return;
      }

      const payload = message.payload as { backtestId?: string };
      if (payload.backtestId !== backtestIdRef.current) {
        return;
      }

      switch (message.type) {
        case "backtest:started":
          setStatus("running");
          setProgress({ progress: 0 });
          break;

        case "backtest:progress": {
          const progressPayload = message.payload as BacktestProgressMessage["payload"];
          setStatus("running");
          setProgress({
            progress: progressPayload.progress,
            currentTimestamp: progressPayload.currentTimestamp,
            barsProcessed: progressPayload.barsProcessed,
            totalBars: progressPayload.totalBars,
          });
          break;
        }

        case "backtest:trade": {
          const tradePayload = message.payload as BacktestTradeMessage["payload"];
          setRecentTrades((prev) => {
            const newTrades = [
              ...prev,
              {
                timestamp: tradePayload.timestamp,
                symbol: tradePayload.symbol,
                action: tradePayload.action,
                quantity: tradePayload.quantity,
                price: tradePayload.price,
                pnl: tradePayload.pnl,
              },
            ];
            // Keep only recent trades
            return newTrades.slice(-MAX_RECENT_TRADES);
          });
          break;
        }

        case "backtest:equity": {
          const equityPayload = message.payload as BacktestEquityMessage["payload"];
          setRecentEquity((prev) => {
            const newEquity = [
              ...prev,
              {
                timestamp: equityPayload.timestamp,
                nav: equityPayload.nav,
                drawdown: equityPayload.drawdown,
                drawdownPct: equityPayload.drawdownPct,
              },
            ];
            // Keep only recent points
            return newEquity.slice(-MAX_RECENT_EQUITY);
          });
          break;
        }

        case "backtest:completed": {
          const completedPayload = message.payload as BacktestCompletedMessage["payload"];
          setStatus("completed");
          setProgress({ progress: 100 });
          if (completedPayload.metrics) {
            setMetrics(completedPayload.metrics);
          }
          // Invalidate TanStack Query cache to refresh data
          if (backtestIdRef.current) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.backtests.detail(backtestIdRef.current),
            });
          }
          break;
        }

        case "backtest:error": {
          const errorPayload = message.payload as BacktestErrorMessage["payload"];
          setStatus("error");
          setError(errorPayload.error);
          // Invalidate cache to refresh status
          if (backtestIdRef.current) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.backtests.detail(backtestIdRef.current),
            });
          }
          break;
        }
      }
    },
    [queryClient]
  );

  // Process incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage || !backtestId) {
      return;
    }

    const message = lastMessage as unknown as BacktestWSMessage;
    if (
      message.type?.startsWith("backtest:") &&
      typeof message.payload === "object" &&
      message.payload !== null
    ) {
      handleMessage(message);
    }
  }, [lastMessage, backtestId, handleMessage]);

  // Subscribe/unsubscribe when backtest ID changes
  useEffect(() => {
    if (!backtestId) {
      resetState();
      setIsSubscribed(false);
      return;
    }

    // Only subscribe when connected
    if (!connected) {
      setIsSubscribed(false);
      return;
    }

    // Subscribe to backtest
    subscribeBacktest(backtestId);
    setIsSubscribed(true);

    // Cleanup: unsubscribe when ID changes or component unmounts
    return () => {
      unsubscribeBacktest(backtestId);
      setIsSubscribed(false);
    };
  }, [backtestId, connected, subscribeBacktest, unsubscribeBacktest, resetState]);

  // Memoize return value
  return useMemo(
    () => ({
      status,
      progress,
      recentTrades,
      recentEquity,
      metrics,
      error,
      isSubscribed,
    }),
    [status, progress, recentTrades, recentEquity, metrics, error, isSubscribed]
  );
}

export default useBacktestProgress;
