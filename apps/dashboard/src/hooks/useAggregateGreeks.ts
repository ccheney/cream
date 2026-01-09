/**
 * useAggregateGreeks Hook
 *
 * Calculates and streams portfolio-level aggregate Greeks from options positions.
 * Uses usePositionGreeks for per-position Greek calculations.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.3
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuotes } from "@/hooks/queries/useMarket";
import { useOptionsPositions } from "@/hooks/queries/useOptionsPositions";
import { usePositionGreeks } from "@/hooks/usePositionGreeks";

// ============================================
// Types
// ============================================

export interface AggregateGreeksData {
  /** Delta-adjusted notional exposure in dollars */
  deltaNotional: number;
  /** Delta expressed as SPY share equivalent */
  deltaSPYEquivalent: number;
  /** Total gamma (change in delta per $1 underlying move) */
  gammaTotal: number;
  /** Daily theta decay in dollars */
  thetaDaily: number;
  /** Total vega exposure per 1% IV change in dollars */
  vegaTotal: number;
  /** Total rho exposure per 1% rate change (optional) */
  rhoTotal: number;
  /** Number of positions included */
  positionCount: number;
  /** Last update timestamp */
  lastUpdated: Date;
}

export interface UseAggregateGreeksOptions {
  /** Throttle updates to this interval in ms (default: 100) */
  throttleMs?: number;
  /** SPY price for share equivalent calculation */
  spyPrice?: number;
  /** Enable streaming updates */
  enabled?: boolean;
}

export interface UseAggregateGreeksReturn {
  /** Aggregated greeks data */
  data: AggregateGreeksData | null;
  /** Whether data is loading */
  isLoading: boolean;
  /** Whether streaming is active */
  isStreaming: boolean;
  /** Error if any */
  error: Error | null;
  /** Force refresh */
  refresh: () => void;
}

// ============================================
// Constants
// ============================================

const DEFAULT_THROTTLE_MS = 100;
const DEFAULT_SPY_PRICE = 500;

// ============================================
// Hook Implementation
// ============================================

/**
 * useAggregateGreeks provides real-time portfolio-level options Greeks.
 *
 * Features:
 * - Streams updates from options positions
 * - Calculates delta notional, gamma, theta, vega
 * - Converts delta to SPY share equivalent
 * - Throttles updates for performance
 *
 * @example
 * ```tsx
 * const { data, isLoading, isStreaming } = useAggregateGreeks({
 *   throttleMs: 100,
 *   enabled: true,
 * });
 *
 * if (data) {
 *   console.log(`Delta: $${data.deltaNotional.toFixed(0)}`);
 *   console.log(`≈ ${data.deltaSPYEquivalent.toFixed(0)} SPY shares`);
 * }
 * ```
 */
export function useAggregateGreeks(
  options: UseAggregateGreeksOptions = {}
): UseAggregateGreeksReturn {
  const { throttleMs = DEFAULT_THROTTLE_MS, spyPrice: providedSpyPrice, enabled = true } = options;

  // Fetch options positions
  const {
    data: positionsResponse,
    isLoading: positionsLoading,
    error: positionsError,
    refetch: refetchPositions,
  } = useOptionsPositions();

  // Extract positions and underlying prices
  const positions = useMemo(() => positionsResponse?.positions ?? [], [positionsResponse]);
  const underlyingPricesFromApi = useMemo(
    () => positionsResponse?.underlyingPrices ?? {},
    [positionsResponse]
  );

  // Get unique underlyings for WebSocket quotes + SPY for conversion
  const underlyingSymbols = useMemo(() => {
    const symbols = new Set(positions.map((p) => p.underlying));
    symbols.add("SPY");
    return Array.from(symbols);
  }, [positions]);

  // Stream underlying quotes
  const { data: quotesData } = useQuotes(underlyingSymbols);

  // Build price lookup from streaming quotes
  const underlyingPrices = useMemo(() => {
    const prices: Record<string, number> = { ...underlyingPricesFromApi };
    // Override with streaming prices if available
    if (quotesData.length > 0) {
      for (const quote of quotesData) {
        prices[quote.symbol] = quote.last ?? quote.bid ?? quote.ask ?? 0;
      }
    }
    return prices;
  }, [quotesData, underlyingPricesFromApi]);

  // Use position greeks hook for Black-Scholes calculations
  const { aggregateGreeks, isStreaming: greeksStreaming } = usePositionGreeks({
    positions,
    underlyingPrices,
  });

  // State for throttled output
  const [data, setData] = useState<AggregateGreeksData | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const lastUpdateRef = useRef<number>(0);
  const pendingUpdateRef = useRef<AggregateGreeksData | null>(null);

  // Transform aggregate greeks to our format with SPY equivalent
  const transformedData = useMemo((): AggregateGreeksData | null => {
    if (positions.length === 0) {
      return null;
    }

    const spyPrice = providedSpyPrice ?? underlyingPrices.SPY ?? DEFAULT_SPY_PRICE;
    const deltaSPYEquivalent = spyPrice > 0 ? aggregateGreeks.deltaNotional / spyPrice : 0;

    return {
      deltaNotional: aggregateGreeks.deltaNotional,
      deltaSPYEquivalent,
      gammaTotal: aggregateGreeks.totalGamma,
      thetaDaily: aggregateGreeks.totalTheta,
      vegaTotal: aggregateGreeks.totalVega,
      rhoTotal: aggregateGreeks.totalRho,
      positionCount: positions.length,
      lastUpdated: new Date(),
    };
  }, [aggregateGreeks, positions.length, providedSpyPrice, underlyingPrices.SPY]);

  // Throttled update effect
  useEffect(() => {
    if (!enabled || !transformedData) {
      if (!transformedData) {
        setData(null);
      }
      return undefined;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    if (timeSinceLastUpdate >= throttleMs) {
      setData(transformedData);
      lastUpdateRef.current = now;
      setIsStreaming(greeksStreaming);
      return undefined;
    }

    pendingUpdateRef.current = transformedData;

    const timeoutId = setTimeout(() => {
      if (pendingUpdateRef.current) {
        setData(pendingUpdateRef.current);
        lastUpdateRef.current = Date.now();
        pendingUpdateRef.current = null;
        setIsStreaming(greeksStreaming);
      }
    }, throttleMs - timeSinceLastUpdate);

    return () => clearTimeout(timeoutId);
  }, [transformedData, enabled, throttleMs, greeksStreaming]);

  // Refresh function
  const refresh = useCallback(() => {
    refetchPositions();
  }, [refetchPositions]);

  return {
    data,
    isLoading: positionsLoading,
    isStreaming,
    error: positionsError instanceof Error ? positionsError : null,
    refresh,
  };
}

export default useAggregateGreeks;
