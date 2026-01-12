/**
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.2
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Position } from "@/lib/api/types";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

export interface StreamingQuote {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  changePercent?: number;
  timestamp: Date;
}

export interface StreamingPosition extends Position {
  livePrice: number;
  liveMarketValue: number;
  liveUnrealizedPnl: number;
  liveUnrealizedPnlPct: number;
  liveDayPnl: number;
  previousPrice: number;
  isStreaming: boolean;
  lastUpdated: Date | null;
}

export interface PortfolioStreamingState {
  liveNav: number;
  liveTotalPnl: number;
  liveTotalPnlPct: number;
  liveDayPnl: number;
  liveDayPnlPct: number;
  isStreaming: boolean;
  lastUpdated: Date | null;
}

export interface UsePortfolioStreamingOptions {
  cash?: number;
  positions?: Position[];
  enabled?: boolean;
}

export interface UsePortfolioStreamingResult {
  streamingPositions: StreamingPosition[];
  state: PortfolioStreamingState;
  getQuote: (symbol: string) => StreamingQuote | undefined;
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
      const liveUnrealizedPnl = (livePrice - position.avgEntry) * position.qty * multiplier;
      const liveUnrealizedPnlPct =
        position.avgEntry !== 0
          ? ((livePrice - position.avgEntry) / position.avgEntry) * 100 * multiplier
          : 0;

      // Calculate Day P&L using lastdayPrice from Alpaca
      // Formula: (currentPrice - lastdayPrice) * qty
      let liveDayPnl = 0;
      if (position.lastdayPrice != null && livePrice > 0) {
        liveDayPnl = (livePrice - position.lastdayPrice) * position.qty * multiplier;
      }

      return {
        ...position,
        livePrice,
        liveMarketValue,
        liveUnrealizedPnl,
        liveUnrealizedPnlPct,
        liveDayPnl,
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

    // Calculate Day P&L from streaming positions using lastdayPrice
    const liveDayPnl = streamingPositions.reduce((sum, p) => sum + p.liveDayPnl, 0);

    // Calculate Day P&L percentage based on yesterday's portfolio value
    // Yesterday's value = current NAV - today's P&L
    const yesterdayNav = liveNav - liveDayPnl;
    const liveDayPnlPct = yesterdayNav > 0 ? (liveDayPnl / yesterdayNav) * 100 : 0;

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
