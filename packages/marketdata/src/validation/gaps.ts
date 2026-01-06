/**
 * Gap Detection and Handling
 *
 * Detect missing candles in time series data and optionally interpolate.
 *
 * @see docs/plans/02-data-layer.md
 */

import { z } from "zod";
import type { Timeframe } from "../ingestion/candleIngestion";

// ============================================
// Types
// ============================================

export interface Candle {
  symbol: string;
  timeframe: Timeframe;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number | null;
  tradeCount?: number | null;
  adjusted?: boolean;
}

export const GapInfoSchema = z.object({
  expectedTimestamp: z.string().datetime(),
  previousTimestamp: z.string().datetime(),
  gapMinutes: z.number(),
  gapCandles: z.number(),
});

export type GapInfo = z.infer<typeof GapInfoSchema>;

export interface GapDetectionResult {
  symbol: string;
  timeframe: Timeframe;
  totalCandles: number;
  gaps: GapInfo[];
  gapCount: number;
  totalMissingCandles: number;
  hasGaps: boolean;
}

export interface InterpolatedCandle extends Candle {
  interpolated: true;
}

// ============================================
// Timeframe Utilities
// ============================================

const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
  "1w": 10080,
};

/**
 * Get expected interval in milliseconds for a timeframe.
 */
export function getExpectedIntervalMs(timeframe: Timeframe): number {
  return TIMEFRAME_MINUTES[timeframe] * 60 * 1000;
}

// ============================================
// Gap Detection
// ============================================

/**
 * Detect gaps in candle data.
 *
 * @param candles - Array of candles (oldest first)
 * @param toleranceMultiplier - Gap detection tolerance (default: 1.5x interval)
 * @returns Gap detection result
 */
export function detectGaps(candles: Candle[], toleranceMultiplier = 1.5): GapDetectionResult {
  if (candles.length === 0) {
    return {
      symbol: "",
      timeframe: "1h",
      totalCandles: 0,
      gaps: [],
      gapCount: 0,
      totalMissingCandles: 0,
      hasGaps: false,
    };
  }

  const firstCandle = candles[0]!;
  const timeframe = firstCandle.timeframe;
  const expectedIntervalMs = getExpectedIntervalMs(timeframe);
  const toleranceMs = expectedIntervalMs * toleranceMultiplier;

  const gaps: GapInfo[] = [];
  let totalMissingCandles = 0;

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const curr = candles[i]!;

    const prevTime = new Date(prev.timestamp).getTime();
    const currTime = new Date(curr.timestamp).getTime();
    const actualInterval = currTime - prevTime;

    if (actualInterval > toleranceMs) {
      const gapMinutes = actualInterval / (1000 * 60);
      const gapCandles = Math.floor(actualInterval / expectedIntervalMs) - 1;

      gaps.push({
        expectedTimestamp: new Date(prevTime + expectedIntervalMs).toISOString(),
        previousTimestamp: prev.timestamp,
        gapMinutes,
        gapCandles,
      });

      totalMissingCandles += gapCandles;
    }
  }

  return {
    symbol: firstCandle.symbol,
    timeframe,
    totalCandles: candles.length,
    gaps,
    gapCount: gaps.length,
    totalMissingCandles,
    hasGaps: gaps.length > 0,
  };
}

/**
 * Check if gap should be interpolated (single candle gap only).
 *
 * @param gap - Gap info
 * @param maxInterpolateCandles - Maximum candles to interpolate (default: 1)
 * @returns true if gap should be interpolated
 */
export function shouldInterpolate(gap: GapInfo, maxInterpolateCandles = 1): boolean {
  return gap.gapCandles <= maxInterpolateCandles;
}

/**
 * Interpolate a single missing candle between two adjacent candles.
 *
 * Uses linear interpolation for OHLC, sets volume to 0.
 *
 * @param prev - Previous candle
 * @param next - Next candle
 * @param timestamp - Timestamp for interpolated candle
 * @returns Interpolated candle
 */
export function interpolateCandle(
  prev: Candle,
  next: Candle,
  timestamp: string
): InterpolatedCandle {
  // Linear interpolation between prev.close and next.open
  const midPrice = (prev.close + next.open) / 2;

  return {
    symbol: prev.symbol,
    timeframe: prev.timeframe,
    timestamp,
    open: prev.close, // Open at previous close
    high: Math.max(prev.close, next.open, midPrice),
    low: Math.min(prev.close, next.open, midPrice),
    close: next.open, // Close at next open
    volume: 0, // No actual volume
    vwap: null,
    tradeCount: 0,
    adjusted: prev.adjusted,
    interpolated: true,
  };
}

/**
 * Fill gaps in candle data with interpolated candles.
 *
 * Only fills single-candle gaps by default.
 *
 * @param candles - Array of candles (oldest first)
 * @param maxInterpolateCandles - Maximum consecutive candles to interpolate
 * @returns Array of candles with gaps filled
 */
export function fillGaps(
  candles: Candle[],
  maxInterpolateCandles = 1
): (Candle | InterpolatedCandle)[] {
  if (candles.length < 2) {
    return candles;
  }

  const firstCandle = candles[0];
  if (!firstCandle) {
    return candles;
  }
  const expectedIntervalMs = getExpectedIntervalMs(firstCandle.timeframe);
  const result: (Candle | InterpolatedCandle)[] = [firstCandle];

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const curr = candles[i]!;

    const prevTime = new Date(prev.timestamp).getTime();
    const currTime = new Date(curr.timestamp).getTime();
    const gapCandles = Math.floor((currTime - prevTime) / expectedIntervalMs) - 1;

    // Only interpolate if within threshold
    if (gapCandles > 0 && gapCandles <= maxInterpolateCandles) {
      for (let j = 1; j <= gapCandles; j++) {
        const interpolatedTime = prevTime + j * expectedIntervalMs;
        const interpolated = interpolateCandle(
          prev,
          curr,
          new Date(interpolatedTime).toISOString()
        );
        result.push(interpolated);
      }
    }

    result.push(curr);
  }

  return result;
}

/**
 * Filter out extended gaps that should not be interpolated.
 *
 * @param gaps - Array of gap info
 * @param maxInterpolateCandles - Maximum candles to interpolate
 * @returns Filtered gaps (those that exceed max interpolation)
 */
export function getExtendedGaps(gaps: GapInfo[], maxInterpolateCandles = 1): GapInfo[] {
  return gaps.filter((gap) => gap.gapCandles > maxInterpolateCandles);
}

export default {
  detectGaps,
  fillGaps,
  interpolateCandle,
  shouldInterpolate,
  getExtendedGaps,
  getExpectedIntervalMs,
};
