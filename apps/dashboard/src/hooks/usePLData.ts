/**
 * usePLData Hook
 *
 * Generates P/L data points for options strategies with real-time updates.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.3
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  analyzeStrategy,
  calculateDTE,
  generatePLData,
  getEarliestExpiration,
  type OptionLeg,
  type PLAnalysis,
  type PLDataPoint,
} from "@/components/options/PLCalculator";

export interface UsePLDataOptions {
  legs: OptionLeg[];
  underlyingPrice: number;
  rangePercent?: number;
  points?: number;
  dteOverride?: number;
}

export interface UsePLDataReturn {
  data: PLDataPoint[];
  analysis: PLAnalysis;
  dte: number;
  priceRange: { min: number; max: number };
  currentPnl: { atExpiration: number; today: number };
  updateUnderlyingPrice: (price: number) => void;
}

/**
 * Hook to generate P/L data for options strategies.
 *
 * @example
 * ```tsx
 * const { data, analysis, currentPnl } = usePLData({
 *   legs: [
 *     { strike: 190, right: "CALL", quantity: 1, premium: 2.20, expiration: "2026-01-17" },
 *   ],
 *   underlyingPrice: 187.50,
 * });
 * ```
 */
export function usePLData(options: UsePLDataOptions): UsePLDataReturn {
  const {
    legs,
    underlyingPrice: initialPrice,
    rangePercent = 20,
    points = 100,
    dteOverride,
  } = options;

  const [livePrice, setLivePrice] = useState(initialPrice);

  useEffect(() => {
    setLivePrice(initialPrice);
  }, [initialPrice]);

  const dte = useMemo(() => {
    if (dteOverride !== undefined) {
      return dteOverride;
    }
    if (legs.length === 0) {
      return 30;
    }
    const earliestExp = getEarliestExpiration(legs);
    return calculateDTE(earliestExp);
  }, [legs, dteOverride]);

  const priceRange = useMemo(() => {
    const min = livePrice * (1 - rangePercent / 100);
    const max = livePrice * (1 + rangePercent / 100);
    return { min, max };
  }, [livePrice, rangePercent]);

  // Generate P/L data
  const data = useMemo(() => {
    if (legs.length === 0) {
      return [];
    }
    return generatePLData(legs, livePrice, { rangePercent, points, dte });
  }, [legs, livePrice, rangePercent, points, dte]);

  // Analyze strategy
  const analysis = useMemo(() => {
    if (legs.length === 0 || data.length === 0) {
      return {
        breakevens: [],
        maxProfit: 0,
        maxLoss: 0,
        maxProfitPrices: [],
        maxLossPrices: [],
      };
    }
    return analyzeStrategy(legs, data);
  }, [legs, data]);

  // Calculate current P/L at underlying price
  const currentPnl = useMemo(() => {
    // Find data point closest to current price
    const firstPoint = data[0];
    if (data.length === 0 || !firstPoint) {
      return { atExpiration: 0, today: 0 };
    }

    let closest = firstPoint;
    let minDiff = Math.abs(closest.price - livePrice);

    for (const point of data) {
      const diff = Math.abs(point.price - livePrice);
      if (diff < minDiff) {
        minDiff = diff;
        closest = point;
      }
    }

    return {
      atExpiration: closest.pnlAtExpiration,
      today: closest.pnlToday,
    };
  }, [data, livePrice]);

  // Update underlying price
  const updateUnderlyingPrice = useCallback((price: number) => {
    setLivePrice(price);
  }, []);

  return {
    data,
    analysis,
    dte,
    priceRange,
    currentPnl,
    updateUnderlyingPrice,
  };
}

export default usePLData;
