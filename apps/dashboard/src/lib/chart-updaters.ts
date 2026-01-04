/**
 * Chart Updater Functions
 *
 * Functions for incrementally updating chart data without full re-renders.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import type { OHLCVData } from "./chart-config.js";
import type { EquityDataPoint } from "@/components/charts/EquityCurve.js";

// ============================================
// Types
// ============================================

/**
 * Chart update types.
 */
export type ChartUpdateType = "candles" | "equity" | "sparkline" | "gauge";

/**
 * Candle update payload.
 */
export interface CandleUpdate {
  type: "append" | "update";
  candle: OHLCVData;
}

/**
 * Equity update payload.
 */
export interface EquityUpdate {
  value: number;
  timestamp: string | number;
  drawdown?: number;
}

/**
 * Sparkline update payload.
 */
export interface SparklineUpdate {
  value: number;
  maxLength?: number;
}

/**
 * Gauge update payload.
 */
export interface GaugeUpdate {
  value: number;
}

/**
 * Update message envelope.
 */
export interface ChartUpdateMessage {
  chartType: ChartUpdateType;
  symbol?: string;
  payload: CandleUpdate | EquityUpdate | SparklineUpdate | GaugeUpdate;
  timestamp: string;
}

// ============================================
// Candle Updaters
// ============================================

/**
 * Append a new candle to the data array.
 */
export function appendCandle(
  data: OHLCVData[],
  candle: OHLCVData
): OHLCVData[] {
  return [...data, candle];
}

/**
 * Update the last candle (for real-time updates within a period).
 */
export function updateLastCandle(
  data: OHLCVData[],
  candle: OHLCVData
): OHLCVData[] {
  if (data.length === 0) {
    return [candle];
  }

  const newData = [...data];
  const lastIndex = newData.length - 1;
  const lastCandle = newData[lastIndex];

  // Only update if same time period
  if (lastCandle.time === candle.time) {
    newData[lastIndex] = candle;
  } else {
    // Different time, append new candle
    newData.push(candle);
  }

  return newData;
}

/**
 * Apply a candle update (handles both append and update).
 */
export function applyCandleUpdate(
  data: OHLCVData[],
  update: CandleUpdate
): OHLCVData[] {
  if (update.type === "append") {
    return appendCandle(data, update.candle);
  } else {
    return updateLastCandle(data, update.candle);
  }
}

/**
 * Trim data to a maximum length (keeping most recent).
 */
export function trimData<T>(data: T[], maxLength: number): T[] {
  if (data.length <= maxLength) {
    return data;
  }
  return data.slice(data.length - maxLength);
}

// ============================================
// Equity Updaters
// ============================================

/**
 * Append a new equity point.
 */
export function appendEquityPoint(
  data: EquityDataPoint[],
  update: EquityUpdate
): EquityDataPoint[] {
  const newPoint: EquityDataPoint = {
    time: update.timestamp,
    value: update.value,
    drawdown: update.drawdown,
  };
  return [...data, newPoint];
}

/**
 * Update the last equity point (for intraday updates).
 */
export function updateLastEquityPoint(
  data: EquityDataPoint[],
  update: EquityUpdate
): EquityDataPoint[] {
  if (data.length === 0) {
    return [{ time: update.timestamp, value: update.value, drawdown: update.drawdown }];
  }

  const newData = [...data];
  const lastIndex = newData.length - 1;
  const lastPoint = newData[lastIndex];

  // Compare timestamps (handle both string and number)
  const lastTime = typeof lastPoint.time === "string" ? lastPoint.time : lastPoint.time;
  const updateTime = typeof update.timestamp === "string" ? update.timestamp : update.timestamp;

  if (lastTime === updateTime) {
    newData[lastIndex] = {
      time: update.timestamp,
      value: update.value,
      drawdown: update.drawdown,
    };
  } else {
    newData.push({
      time: update.timestamp,
      value: update.value,
      drawdown: update.drawdown,
    });
  }

  return newData;
}

// ============================================
// Sparkline Updaters
// ============================================

/**
 * Append a value to sparkline data, shifting if max length exceeded.
 */
export function appendSparklineValue(
  data: number[],
  value: number,
  maxLength: number = 20
): number[] {
  const newData = [...data, value];
  if (newData.length > maxLength) {
    return newData.slice(newData.length - maxLength);
  }
  return newData;
}

/**
 * Batch update sparkline with multiple values.
 */
export function batchUpdateSparkline(
  data: number[],
  values: number[],
  maxLength: number = 20
): number[] {
  const newData = [...data, ...values];
  if (newData.length > maxLength) {
    return newData.slice(newData.length - maxLength);
  }
  return newData;
}

// ============================================
// Throttle Utility
// ============================================

/**
 * Create a throttled update function.
 */
export function createThrottledUpdater<T>(
  updateFn: (value: T) => void,
  intervalMs: number = 100
): {
  update: (value: T) => void;
  flush: () => void;
  cancel: () => void;
} {
  let pending: T | null = null;
  let lastUpdate = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const scheduleUpdate = () => {
    if (pending === null) return;

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdate;

    if (timeSinceLastUpdate >= intervalMs) {
      // Can update immediately
      updateFn(pending);
      lastUpdate = now;
      pending = null;
    } else {
      // Schedule for later
      const delay = intervalMs - timeSinceLastUpdate;
      if (timeoutId === null) {
        timeoutId = setTimeout(() => {
          timeoutId = null;
          if (pending !== null) {
            updateFn(pending);
            lastUpdate = Date.now();
            pending = null;
          }
        }, delay);
      }
    }
  };

  return {
    update: (value: T) => {
      pending = value;
      scheduleUpdate();
    },
    flush: () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (pending !== null) {
        updateFn(pending);
        lastUpdate = Date.now();
        pending = null;
      }
    },
    cancel: () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      pending = null;
    },
  };
}

// ============================================
// Message Parsing
// ============================================

/**
 * Parse a chart update message.
 */
export function parseChartUpdateMessage(
  raw: unknown
): ChartUpdateMessage | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  if (
    typeof obj.chartType !== "string" ||
    !["candles", "equity", "sparkline", "gauge"].includes(obj.chartType)
  ) {
    return null;
  }

  if (typeof obj.payload !== "object" || obj.payload === null) {
    return null;
  }

  if (typeof obj.timestamp !== "string") {
    return null;
  }

  return {
    chartType: obj.chartType as ChartUpdateType,
    symbol: typeof obj.symbol === "string" ? obj.symbol : undefined,
    payload: obj.payload as ChartUpdateMessage["payload"],
    timestamp: obj.timestamp,
  };
}

/**
 * Sort updates by timestamp.
 */
export function sortByTimestamp<T extends { timestamp: string }>(
  updates: T[]
): T[] {
  return [...updates].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });
}

/**
 * Filter out stale updates (older than threshold).
 */
export function filterStaleUpdates<T extends { timestamp: string }>(
  updates: T[],
  maxAgeMs: number = 5000
): T[] {
  const now = Date.now();
  return updates.filter((update) => {
    const updateTime = new Date(update.timestamp).getTime();
    return now - updateTime <= maxAgeMs;
  });
}
