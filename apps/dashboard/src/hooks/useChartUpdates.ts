/**
 * Chart Updates Hook
 *
 * React hook for real-time chart updates via WebSocket.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EquityDataPoint } from "@/components/charts/EquityCurve";
import type { OHLCVData } from "@/lib/chart-config";
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
} from "@/lib/chart-updaters";

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

const DEFAULT_MAX_DATA_POINTS = 500;
const DEFAULT_THROTTLE_MS = 100;
const STALE_THRESHOLD_MS = 30000; // 30 seconds
const STALE_CHECK_INTERVAL_MS = 5000;

type ChartData = OHLCVData[] | EquityDataPoint[] | number[] | number;

interface ChartCallbacksContext {
	chartType: ChartUpdateType;
	symbol?: string;
	initialData: OHLCVData[] | EquityDataPoint[] | number[] | number | undefined;
	maxDataPoints: number;
	onUpdateRef: React.RefObject<((data: unknown) => void) | undefined>;
	throttlerRef: React.RefObject<ReturnType<typeof createThrottledUpdater<ChartData>> | null>;
	setState: React.Dispatch<React.SetStateAction<ChartUpdatesState>>;
	onUpdateError?: (error: Error) => void;
}

function useChartUpdateActions({
	chartType,
	symbol,
	initialData,
	maxDataPoints,
	onUpdateRef,
	throttlerRef,
	setState,
	onUpdateError,
}: ChartCallbacksContext) {
	const cancelPendingUpdate = useCallback(() => {
		const throttler = throttlerRef.current;
		throttler?.cancel();
	}, [throttlerRef]);

	const applyUpdate = useCallback(
		(message: ChartUpdateMessage) => {
			if (!shouldApplyMessage(message, chartType, symbol)) {
				return;
			}

			setState((prev) => {
				try {
					const nextData = getUpdatedData(chartType, prev.data, message, maxDataPoints);
					if (nextData !== null) {
						throttlerRef.current?.update(nextData);
					}
					return prev;
				} catch (error) {
					const nextError = error instanceof Error ? error : new Error(String(error));
					onUpdateRef.current?.(nextError);
					onUpdateError?.(nextError);
					return { ...prev, error: nextError };
				}
			});
		},
		[chartType, onUpdateError, onUpdateRef, setState, symbol, maxDataPoints, throttlerRef],
	);

	const reset = useCallback(() => {
		cancelPendingUpdate();
		setState({
			data: resolveInitialData(chartType, initialData),
			isConnected: false,
			isStale: false,
			lastUpdate: null,
			error: null,
		});
	}, [cancelPendingUpdate, chartType, initialData, setState]);

	const clearError = useCallback(() => {
		setState((prev) => ({ ...prev, error: null }));
	}, [setState]);

	return { applyUpdate, reset, clearError };
}

function useChartDataState(
	chartType: ChartUpdateType,
	initialData: OHLCVData[] | EquityDataPoint[] | number[] | number | undefined,
) {
	const [state, setState] = useState<ChartUpdatesState>(() => ({
		data: resolveInitialData(chartType, initialData),
		isConnected: false,
		isStale: false,
		lastUpdate: null,
		error: null,
	}));

	return { state, setState };
}

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

	const onUpdateRef = useRef(onUpdate);
	const onErrorRef = useRef(onError);

	useEffect(() => {
		onUpdateRef.current = onUpdate;
		onErrorRef.current = onError;
	}, [onUpdate, onError]);

	const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const { state, setState } = useChartDataState(chartType, initialData);

	const throttlerRef = useChartThrottler<ChartData>({
		setState,
		onUpdateRef,
		intervalMs: throttleMs,
	});

	useChartStaleTimer({
		state,
		setState,
		staleTimerRef,
	});

	const { applyUpdate, reset, clearError } = useChartUpdateActions({
		chartType,
		symbol,
		initialData,
		maxDataPoints,
		onUpdateRef,
		throttlerRef,
		setState,
		onUpdateError: (error) => onErrorRef.current?.(error),
	});

	return {
		...state,
		applyUpdate,
		reset,
		clearError,
	};
}

function useChartThrottler<TData>({
	setState,
	onUpdateRef,
	intervalMs,
}: {
	setState: React.Dispatch<React.SetStateAction<ChartUpdatesState>>;
	onUpdateRef: React.RefObject<((data: unknown) => void) | undefined>;
	intervalMs: number;
}) {
	const throttlerRef = useRef<ReturnType<typeof createThrottledUpdater<TData>> | null>(null);

	useEffect(() => {
		throttlerRef.current = createThrottledUpdater<TData>((data) => {
			setState((prev) => ({
				...prev,
				data: data as ChartData,
				lastUpdate: new Date(),
				isStale: false,
			}));
			onUpdateRef.current?.(data);
		}, intervalMs);

		return () => {
			throttlerRef.current?.cancel();
		};
	}, [intervalMs, onUpdateRef, setState]);

	return throttlerRef;
}

function useChartStaleTimer({
	state,
	setState,
	staleTimerRef,
}: {
	state: ChartUpdatesState;
	setState: React.Dispatch<React.SetStateAction<ChartUpdatesState>>;
	staleTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
}) {
	useEffect(() => {
		const checkStale = () => {
			if (!state.lastUpdate) {
				return;
			}

			const elapsed = Date.now() - state.lastUpdate.getTime();
			if (elapsed > STALE_THRESHOLD_MS && !state.isStale) {
				setState((prev) => ({ ...prev, isStale: true }));
			}
		};

		staleTimerRef.current = setInterval(checkStale, STALE_CHECK_INTERVAL_MS);
		return () => {
			if (staleTimerRef.current) {
				clearInterval(staleTimerRef.current);
			}
		};
	}, [state.lastUpdate, state.isStale, setState, staleTimerRef]);
}

function shouldApplyMessage(
	message: ChartUpdateMessage,
	chartType: ChartUpdateType,
	symbol?: string,
): message is ChartUpdateMessage {
	if (message.chartType !== chartType) {
		return false;
	}
	if (!symbol || !message.symbol) {
		return true;
	}
	return message.symbol === symbol;
}

function getUpdatedData(
	chartType: ChartUpdateType,
	previousData: ChartData,
	message: ChartUpdateMessage,
	maxDataPoints: number,
): ChartData | null {
	switch (chartType) {
		case "candles": {
			const candles = applyCandleUpdate(
				previousData as OHLCVData[],
				message.payload as CandleUpdate,
			);
			return trimData(candles, maxDataPoints);
		}

		case "equity": {
			const equity = appendEquityPoint(
				previousData as EquityDataPoint[],
				message.payload as EquityUpdate,
			);
			return trimData(equity, maxDataPoints);
		}

		case "sparkline": {
			const sparklineUpdate = message.payload as SparklineUpdate;
			return appendSparklineValue(
				previousData as number[],
				sparklineUpdate.value,
				sparklineUpdate.maxLength ?? maxDataPoints,
			);
		}

		case "gauge": {
			const gauge = message.payload as GaugeUpdate;
			return gauge.value;
		}

		default:
			return null;
	}
}

function resolveInitialData(
	chartType: ChartUpdateType,
	initialData?: OHLCVData[] | EquityDataPoint[] | number[] | number,
): ChartData {
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
			return [] as OHLCVData[];
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
	options?: Omit<UseChartUpdatesOptions, "chartType" | "symbol">,
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
