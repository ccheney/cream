/**
 * usePortfolioStreaming Hook
 *
 * Manages real-time streaming for portfolio positions.
 * Subscribes to quote updates for all position symbols and
 * calculates real-time P/L.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.2
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Position } from "@/lib/api/types";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

// ============================================
// Types
// ============================================

export interface StreamingQuote {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  changePercent?: number;
  timestamp: Date;
}

export interface StreamingPosition extends Position {
  /** Live price from streaming (overrides Position.currentPrice) */
  livePrice: number;
  /** Calculated market value using live price */
  liveMarketValue: number;
  /** Calculated unrealized P/L using live price */
  liveUnrealizedPnl: number;
  /** Calculated unrealized P/L % using live price */
  liveUnrealizedPnlPct: number;
  /** Previous price for flash animation */
  previousPrice: number;
  /** Is this position receiving live updates */
  isStreaming: boolean;
  /** Last update timestamp */
  lastUpdated: Date | null;
}

export interface PortfolioStreamingState {
  /** Total NAV with live prices */
  liveNav: number;
  /** Total unrealized P/L with live prices */
  liveTotalPnl: number;
  /** Total unrealized P/L % with live prices */
  liveTotalPnlPct: number;
  /** Day P/L (requires open prices) */
  liveDayPnl: number;
  /** Day P/L % */
  liveDayPnlPct: number;
  /** Are we receiving streaming data */
  isStreaming: boolean;
  /** Last portfolio update time */
  lastUpdated: Date | null;
}

export interface UsePortfolioStreamingOptions {
  /** Cash balance for NAV calculation */
  cash?: number;
  /** Initial positions from query */
  positions?: Position[];
  /** Enable streaming */
  enabled?: boolean;
}

export interface UsePortfolioStreamingResult {
  /** Positions with live pricing */
  streamingPositions: StreamingPosition[];
  /** Portfolio-level streaming state */
  state: PortfolioStreamingState;
  /** Get live quote for a symbol */
  getQuote: (symbol: string) => StreamingQuote | undefined;
  /** Force refresh subscriptions */
  refresh: () => void;
}

// ============================================
// Hook
// ============================================

/**
 * Hook to manage real-time streaming for portfolio positions.
 *
 * @example
 * ```tsx
 * const { streamingPositions, state } = usePortfolioStreaming({
 *   positions: queryPositions,
 *   cash: summary?.cash,
 *   enabled: true,
 * });
 *
 * return (
 *   <>
 *     <PortfolioSummary nav={state.liveNav} pnl={state.liveTotalPnl} />
 *     {streamingPositions.map(pos => (
 *       <PositionRow key={pos.id} position={pos} />
 *     ))}
 *   </>
 * );
 * ```
 */
export function usePortfolioStreaming(
  options: UsePortfolioStreamingOptions = {}
): UsePortfolioStreamingResult {
  const { cash = 0, positions = [], enabled = true } = options;

  const { subscribe, subscribeSymbols, connected } = useWebSocketContext();
  const [quotes, setQuotes] = useState<Map<string, StreamingQuote>>(new Map());
  const previousPricesRef = useRef<Map<string, number>>(new Map());
  const lastUpdatedRef = useRef<Date | null>(null);

  // Get unique symbols from positions
  const symbols = useMemo(() => {
    return [...new Set(positions.map((p) => p.symbol))];
  }, [positions]);

  // Subscribe to symbols when they change
  useEffect(() => {
    if (!enabled || !connected || symbols.length === 0) {
      return;
    }

    // Subscribe to quotes channel
    subscribe(["quotes"]);
    subscribeSymbols(symbols);
  }, [enabled, connected, symbols, subscribe, subscribeSymbols]);

  // Handle incoming quote updates
  const handleQuoteUpdate = useCallback((quote: StreamingQuote) => {
    setQuotes((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(quote.symbol);

      // Store previous price for flash animation
      if (existing && existing.price !== quote.price) {
        previousPricesRef.current.set(quote.symbol, existing.price);
      }

      updated.set(quote.symbol, quote);
      lastUpdatedRef.current = new Date();
      return updated;
    });
  }, []);

  // Expose handler for WebSocket provider
  useEffect(() => {
    (
      window as unknown as { __portfolioQuoteHandler?: typeof handleQuoteUpdate }
    ).__portfolioQuoteHandler = handleQuoteUpdate;
    return () => {
      delete (window as unknown as { __portfolioQuoteHandler?: typeof handleQuoteUpdate })
        .__portfolioQuoteHandler;
    };
  }, [handleQuoteUpdate]);

  // Calculate streaming positions with live P/L
  const streamingPositions = useMemo((): StreamingPosition[] => {
    return positions.map((position) => {
      const quote = quotes.get(position.symbol);
      const livePrice = quote?.price ?? position.currentPrice;
      const previousPrice = previousPricesRef.current.get(position.symbol) ?? position.currentPrice;

      // Calculate P/L based on side
      const multiplier = position.side === "LONG" ? 1 : -1;
      const liveMarketValue = livePrice * position.qty;
      const _costBasis = position.avgEntry * position.qty;
      const liveUnrealizedPnl = (livePrice - position.avgEntry) * position.qty * multiplier;
      const liveUnrealizedPnlPct =
        position.avgEntry !== 0
          ? ((livePrice - position.avgEntry) / position.avgEntry) * 100 * multiplier
          : 0;

      return {
        ...position,
        livePrice,
        liveMarketValue,
        liveUnrealizedPnl,
        liveUnrealizedPnlPct,
        previousPrice,
        isStreaming: quote !== undefined,
        lastUpdated: quote?.timestamp ?? null,
      };
    });
  }, [positions, quotes]);

  // Calculate portfolio-level metrics
  const state = useMemo((): PortfolioStreamingState => {
    const totalMarketValue = streamingPositions.reduce((sum, p) => sum + p.liveMarketValue, 0);
    const liveTotalPnl = streamingPositions.reduce((sum, p) => sum + p.liveUnrealizedPnl, 0);
    const totalCostBasis = positions.reduce((sum, p) => sum + p.avgEntry * p.qty, 0);
    const liveTotalPnlPct = totalCostBasis !== 0 ? (liveTotalPnl / totalCostBasis) * 100 : 0;

    // Calculate NAV: cash + total market value
    const liveNav = cash + totalMarketValue;

    // Day P/L would require open prices - placeholder for now
    const liveDayPnl = 0;
    const liveDayPnlPct = 0;

    const isStreaming = streamingPositions.some((p) => p.isStreaming);

    return {
      liveNav,
      liveTotalPnl,
      liveTotalPnlPct,
      liveDayPnl,
      liveDayPnlPct,
      isStreaming,
      lastUpdated: lastUpdatedRef.current,
    };
  }, [streamingPositions, positions, cash]);

  // Get quote for a symbol
  const getQuote = useCallback(
    (symbol: string): StreamingQuote | undefined => {
      return quotes.get(symbol);
    },
    [quotes]
  );

  // Force refresh subscriptions
  const refresh = useCallback(() => {
    if (connected && symbols.length > 0) {
      subscribeSymbols(symbols);
    }
  }, [connected, symbols, subscribeSymbols]);

  return {
    streamingPositions,
    state,
    getQuote,
    refresh,
  };
}

export default usePortfolioStreaming;
