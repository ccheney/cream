/**
 * useTickHistory Hook
 *
 * Tracks price tick direction history for a symbol.
 * Returns an array of 'up'/'down' ticks based on recent price changes.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 1.1
 */

import { useCallback, useRef, useState } from "react";
import type { TickDirection } from "@/components/ui/tick-dots";

export interface UseTickHistoryOptions {
  /** Maximum number of ticks to track (default: 8) */
  maxTicks?: number;
}

export interface UseTickHistoryResult {
  /** Array of tick directions (most recent last) */
  ticks: TickDirection[];
  /** Record a new price tick */
  recordTick: (price: number) => void;
  /** Clear tick history */
  clearTicks: () => void;
  /** Get price history (raw prices) */
  priceHistory: number[];
}

/**
 * Hook to track price tick direction history.
 *
 * @example
 * ```tsx
 * const { ticks, recordTick } = useTickHistory({ maxTicks: 8 });
 *
 * // When new price arrives
 * useEffect(() => {
 *   if (quote.price) {
 *     recordTick(quote.price);
 *   }
 * }, [quote.price, recordTick]);
 *
 * return <TickDots ticks={ticks} />;
 * ```
 */
export function useTickHistory(options: UseTickHistoryOptions = {}): UseTickHistoryResult {
  const { maxTicks = 8 } = options;

  const [ticks, setTicks] = useState<TickDirection[]>([]);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const lastPriceRef = useRef<number | null>(null);

  const recordTick = useCallback(
    (price: number) => {
      const lastPrice = lastPriceRef.current;

      // Update price history (keep last 20 for sparkline)
      setPriceHistory((prev) => {
        const updated = [...prev, price];
        return updated.slice(-20);
      });

      // Only record tick if we have a previous price and it changed
      if (lastPrice !== null && price !== lastPrice) {
        const direction: TickDirection = price > lastPrice ? "up" : "down";
        setTicks((prev) => {
          const updated = [...prev, direction];
          return updated.slice(-maxTicks);
        });
      }

      lastPriceRef.current = price;
    },
    [maxTicks]
  );

  const clearTicks = useCallback(() => {
    setTicks([]);
    setPriceHistory([]);
    lastPriceRef.current = null;
  }, []);

  return {
    ticks,
    recordTick,
    clearTicks,
    priceHistory,
  };
}

// ============================================
// Multi-Symbol Hook
// ============================================

export interface UseMultiTickHistoryResult {
  /** Get ticks for a symbol */
  getTicks: (symbol: string) => TickDirection[];
  /** Get price history for a symbol */
  getPriceHistory: (symbol: string) => number[];
  /** Record a tick for a symbol */
  recordTick: (symbol: string, price: number) => void;
  /** Clear ticks for a symbol */
  clearTicks: (symbol: string) => void;
  /** Clear all tick history */
  clearAll: () => void;
}

/**
 * Hook to track tick history for multiple symbols.
 *
 * @example
 * ```tsx
 * const { getTicks, recordTick } = useMultiTickHistory();
 *
 * // When quote arrives for any symbol
 * quotes.forEach(quote => {
 *   recordTick(quote.symbol, quote.price);
 * });
 *
 * return symbols.map(sym => (
 *   <TickerItem
 *     key={sym}
 *     symbol={sym}
 *     tickHistory={getTicks(sym)}
 *   />
 * ));
 * ```
 */
export function useMultiTickHistory(
  options: UseTickHistoryOptions = {}
): UseMultiTickHistoryResult {
  const { maxTicks = 8 } = options;

  const ticksRef = useRef<Map<string, TickDirection[]>>(new Map());
  const pricesRef = useRef<Map<string, number[]>>(new Map());
  const lastPricesRef = useRef<Map<string, number>>(new Map());
  const [, forceUpdate] = useState(0);

  const getTicks = useCallback((symbol: string): TickDirection[] => {
    return ticksRef.current.get(symbol) ?? [];
  }, []);

  const getPriceHistory = useCallback((symbol: string): number[] => {
    return pricesRef.current.get(symbol) ?? [];
  }, []);

  const recordTick = useCallback(
    (symbol: string, price: number) => {
      const lastPrice = lastPricesRef.current.get(symbol);

      // Update price history
      const prices = pricesRef.current.get(symbol) ?? [];
      const updatedPrices = [...prices, price].slice(-20);
      pricesRef.current.set(symbol, updatedPrices);

      // Record tick direction if price changed
      if (lastPrice !== undefined && price !== lastPrice) {
        const direction: TickDirection = price > lastPrice ? "up" : "down";
        const ticks = ticksRef.current.get(symbol) ?? [];
        const updatedTicks = [...ticks, direction].slice(-maxTicks);
        ticksRef.current.set(symbol, updatedTicks);
        forceUpdate((n) => n + 1);
      }

      lastPricesRef.current.set(symbol, price);
    },
    [maxTicks]
  );

  const clearTicks = useCallback((symbol: string) => {
    ticksRef.current.delete(symbol);
    pricesRef.current.delete(symbol);
    lastPricesRef.current.delete(symbol);
    forceUpdate((n) => n + 1);
  }, []);

  const clearAll = useCallback(() => {
    ticksRef.current.clear();
    pricesRef.current.clear();
    lastPricesRef.current.clear();
    forceUpdate((n) => n + 1);
  }, []);

  return {
    getTicks,
    getPriceHistory,
    recordTick,
    clearTicks,
    clearAll,
  };
}
