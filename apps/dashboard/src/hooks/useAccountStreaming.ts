/**
 * Account Streaming Hook
 *
 * Listens for real-time account updates via WebSocket and merges
 * with initial REST data to provide live account state.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.3
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account } from "@/lib/api/types";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

// ============================================
// Types
// ============================================

export interface AccountStreamingState {
  /** Current cash balance */
  cash: number;
  /** Current equity value */
  equity: number;
  /** Available buying power */
  buyingPower: number;
  /** Today's P&L (equity change from previous close) */
  dayPnl: number;
  /** Today's P&L percentage */
  dayPnlPct: number;
  /** Whether receiving streaming updates */
  isStreaming: boolean;
  /** Last update timestamp */
  lastUpdated: Date | null;
}

interface AccountUpdateData {
  cash: number;
  equity: number;
  buyingPower: number;
  timestamp: string;
}

interface AccountUpdateMessage {
  type: "account_update";
  data: AccountUpdateData;
}

// ============================================
// Hook
// ============================================

/**
 * Hook to subscribe to real-time account updates.
 *
 * @param initialAccount - Initial account data from REST API (provides lastEquity for P&L calc)
 * @returns AccountStreamingState with live account metrics
 *
 * @example
 * ```tsx
 * const { data: account } = useAccount();
 * const streamingAccount = useAccountStreaming(account);
 *
 * return (
 *   <AccountSummary
 *     equity={streamingAccount.equity}
 *     dayPnl={streamingAccount.dayPnl}
 *     isLive={streamingAccount.isStreaming}
 *   />
 * );
 * ```
 */
export function useAccountStreaming(initialAccount?: Account): AccountStreamingState {
  const { lastMessage, connected, subscribe } = useWebSocketContext();

  // Track streaming state
  const [streamingData, setStreamingData] = useState<AccountUpdateData | null>(null);
  const lastUpdatedRef = useRef<Date | null>(null);

  // Subscribe to portfolio channel (account updates are sent there)
  useEffect(() => {
    if (connected) {
      subscribe(["portfolio"]);
    }
  }, [connected, subscribe]);

  // Handle incoming account_update messages
  useEffect(() => {
    if (!lastMessage) {
      return;
    }

    const message = lastMessage as unknown as AccountUpdateMessage;
    if (message.type === "account_update" && message.data) {
      setStreamingData(message.data);
      lastUpdatedRef.current = new Date();
    }
  }, [lastMessage]);

  // Calculate day P&L using lastEquity from initial account
  const calculateDayPnl = useCallback(
    (currentEquity: number): { dayPnl: number; dayPnlPct: number } => {
      if (!initialAccount?.lastEquity || initialAccount.lastEquity === 0) {
        return { dayPnl: 0, dayPnlPct: 0 };
      }

      const dayPnl = currentEquity - initialAccount.lastEquity;
      const dayPnlPct = (dayPnl / initialAccount.lastEquity) * 100;

      return { dayPnl, dayPnlPct };
    },
    [initialAccount?.lastEquity]
  );

  // Compute streaming state, merging with initial data
  const state = useMemo((): AccountStreamingState => {
    const isStreaming = streamingData !== null;

    // Use streaming data if available, otherwise fall back to initial
    const cash = streamingData?.cash ?? initialAccount?.cash ?? 0;
    const equity = streamingData?.equity ?? initialAccount?.equity ?? 0;
    const buyingPower = streamingData?.buyingPower ?? initialAccount?.buyingPower ?? 0;

    const { dayPnl, dayPnlPct } = calculateDayPnl(equity);

    return {
      cash,
      equity,
      buyingPower,
      dayPnl,
      dayPnlPct,
      isStreaming,
      lastUpdated: lastUpdatedRef.current,
    };
  }, [streamingData, initialAccount, calculateDayPnl]);

  return state;
}

export default useAccountStreaming;
