/**
 * Chart Updates Hook
 *
 * React hook for real-time chart updates via WebSocket.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EquityDataPoint } from "@/components/charts/EquityCurve.js";
import type { OHLCVData } from "@/lib/chart-config.js";
import {
  appendEquityPoint,
  appendSparklineValue,
  applyCandleUpdate,
  type CandleUpdate,
  type ChartUpdateMessage,
  type ChartUpdateType,
  createThrottledUpdater,
  type EquityUpdate,
  type GaugeUpdate,
  type SparklineUpdate,
  trimData,
} from "@/lib/chart-updaters.js";

// ============================================
// Types
// ============================================

export interface UseChartUpdatesOptions {
  /** Chart type to subscribe to */
  chartType: ChartUpdateType;

  /** Symbol filter (optional, for candles) */
  symbol?: string;

  /** Initial data */
  initialData?: OHLCVData[] | EquityDataPoint[] | number[] | number;

  /** Maximum data points to keep */
  maxDataPoints?: number;

  /** Throttle interval in ms (default: 100) */
  throttleMs?: number;

  /** Callback when data is updated */
  onUpdate?: (data: unknown) => void;

  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface ChartUpdatesState {
  /** Current data */
  data: OHLCVData[] | EquityDataPoint[] | number[] | number;

  /** Whether connected to data source */
  isConnected: boolean;

  /** Whether data is stale (no recent updates) */
  isStale: boolean;

  /** Last update timestamp */
  lastUpdate: Date | null;

  /** Error state */
  error: Error | null;
}

export interface ChartUpdatesActions {
  /** Manually apply an update */
  applyUpdate: (update: ChartUpdateMessage) => void;

  /** Reset data to initial state */
  reset: () => void;

  /** Clear error state */
  clearError: () => void;
}

export type UseChartUpdatesReturn = ChartUpdatesState & ChartUpdatesActions;

// ============================================
// Constants
// ============================================

const DEFAULT_MAX_DATA_POINTS = 500;
const DEFAULT_THROTTLE_MS = 100;
const STALE_THRESHOLD_MS = 30000; // 30 seconds

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for managing real-time chart updates.
 */
export function useChartUpdates(options: UseChartUpdatesOptions): UseChartUpdatesReturn {
  const {
    chartType,
    symbol,
    initialData,
    maxDataPoints = DEFAULT_MAX_DATA_POINTS,
    throttleMs = DEFAULT_THROTTLE_MS,
    onUpdate,
    onError,
  } = options;

  // State
  const [state, setState] = useState<ChartUpdatesState>(() => ({
    data: getInitialData(chartType, initialData),
    isConnected: false,
    isStale: false,
    lastUpdate: null,
    error: null,
  }));

  // Refs for callbacks and throttler
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  const throttlerRef = useRef<ReturnType<typeof createThrottledUpdater<unknown>> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update refs
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onErrorRef.current = onError;
  }, [onUpdate, onError]);

  // Initialize throttler
  useEffect(() => {
    throttlerRef.current = createThrottledUpdater<unknown>((data) => {
      setState((prev) => ({
        ...prev,
        data: data as typeof prev.data,
        lastUpdate: new Date(),
        isStale: false,
      }));
      onUpdateRef.current?.(data);
    }, throttleMs);

    return () => {
      throttlerRef.current?.cancel();
    };
  }, [throttleMs]);

  // Stale detection
  useEffect(() => {
    const checkStale = () => {
      if (state.lastUpdate) {
        const now = Date.now();
        const elapsed = now - state.lastUpdate.getTime();
        if (elapsed > STALE_THRESHOLD_MS && !state.isStale) {
          setState((prev) => ({ ...prev, isStale: true }));
        }
      }
    };

    staleTimerRef.current = setInterval(checkStale, 5000);

    return () => {
      if (staleTimerRef.current) {
        clearInterval(staleTimerRef.current);
      }
    };
  }, [state.lastUpdate, state.isStale]);

  // Apply update handler
  const applyUpdate = useCallback(
    (message: ChartUpdateMessage) => {
      try {
        // Validate message matches our chart type
        if (message.chartType !== chartType) {
          return;
        }

        // Check symbol filter
        if (symbol && message.symbol && message.symbol !== symbol) {
          return;
        }

        setState((prev) => {
          let newData: typeof prev.data;

          switch (chartType) {
            case "candles":
              newData = applyCandleUpdate(
                prev.data as OHLCVData[],
                message.payload as CandleUpdate
              );
              newData = trimData(newData as OHLCVData[], maxDataPoints);
              break;

            case "equity":
              newData = appendEquityPoint(
                prev.data as EquityDataPoint[],
                message.payload as EquityUpdate
              );
              newData = trimData(newData as EquityDataPoint[], maxDataPoints);
              break;

            case "sparkline": {
              const sparklineUpdate = message.payload as SparklineUpdate;
              newData = appendSparklineValue(
                prev.data as number[],
                sparklineUpdate.value,
                sparklineUpdate.maxLength ?? maxDataPoints
              );
              break;
            }

            case "gauge": {
              const gaugeUpdate = message.payload as GaugeUpdate;
              newData = gaugeUpdate.value;
              break;
            }

            default:
              return prev;
          }

          // Use throttler for actual state update
          throttlerRef.current?.update(newData);

          return prev; // State will be updated by throttler
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({ ...prev, error }));
        onErrorRef.current?.(error);
      }
    },
    [chartType, symbol, maxDataPoints]
  );

  // Reset handler
  const reset = useCallback(() => {
    throttlerRef.current?.cancel();
    setState({
      data: getInitialData(chartType, initialData),
      isConnected: false,
      isStale: false,
      lastUpdate: null,
      error: null,
    });
  }, [chartType, initialData]);

  // Clear error handler
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    applyUpdate,
    reset,
    clearError,
  };
}

// ============================================
// Helper Functions
// ============================================

function getInitialData(
  chartType: ChartUpdateType,
  initialData?: OHLCVData[] | EquityDataPoint[] | number[] | number
): OHLCVData[] | EquityDataPoint[] | number[] | number {
  if (initialData !== undefined) {
    return initialData;
  }

  switch (chartType) {
    case "candles":
      return [] as OHLCVData[];
    case "equity":
      return [] as EquityDataPoint[];
    case "sparkline":
      return [] as number[];
    case "gauge":
      return 0;
    default:
      return [];
  }
}

// ============================================
// Convenience Hooks
// ============================================

/**
 * Hook for candle chart updates.
 */
export function useCandleUpdates(
  symbol: string,
  options?: Omit<UseChartUpdatesOptions, "chartType" | "symbol">
) {
  return useChartUpdates({
    chartType: "candles",
    symbol,
    ...options,
  });
}

/**
 * Hook for equity curve updates.
 */
export function useEquityUpdates(options?: Omit<UseChartUpdatesOptions, "chartType">) {
  return useChartUpdates({
    chartType: "equity",
    ...options,
  });
}

/**
 * Hook for sparkline updates.
 */
export function useSparklineUpdates(options?: Omit<UseChartUpdatesOptions, "chartType">) {
  return useChartUpdates({
    chartType: "sparkline",
    ...options,
  });
}

/**
 * Hook for gauge updates.
 */
export function useGaugeUpdates(options?: Omit<UseChartUpdatesOptions, "chartType">) {
  return useChartUpdates({
    chartType: "gauge",
    ...options,
  });
}

export default useChartUpdates;
