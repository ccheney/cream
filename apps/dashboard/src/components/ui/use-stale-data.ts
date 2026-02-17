/**
 * useStaleData Hook
 *
 * Tracks data freshness and provides stale state for UI fadeout.
 *
 * @see docs/plans/ui/31-realtime-patterns.md line 26
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type StaleLevel = "fresh" | "stale" | "very-stale" | "extremely-stale";

export interface StaleState {
	/** Current stale level */
	level: StaleLevel;
	/** Whether data is considered stale (any level) */
	isStale: boolean;
	/** Opacity value (1.0 to 0.3) */
	opacity: number;
	/** Whether to show stale indicator */
	showIndicator: boolean;
	/** Seconds since last update */
	secondsSinceUpdate: number;
}

export interface UseStaleDataOptions {
	/** Threshold for first stale level (ms) */
	staleThresholdMs?: number;
	/** Threshold for very stale level (ms) */
	veryStaleThresholdMs?: number;
	/** Threshold for extremely stale level (ms) */
	extremelyStaleThresholdMs?: number;
	/** Update interval for checking staleness (ms) */
	updateIntervalMs?: number;
}

export interface UseStaleDataReturn {
	/** Current stale state */
	stale: StaleState;
	/** Mark data as updated (resets stale timer) */
	markUpdated: () => void;
}

const DEFAULT_STALE_THRESHOLD_MS = 5000; // 5 seconds
const DEFAULT_VERY_STALE_THRESHOLD_MS = 10000; // 10 seconds
const DEFAULT_EXTREMELY_STALE_THRESHOLD_MS = 30000; // 30 seconds
const DEFAULT_UPDATE_INTERVAL_MS = 1000; // 1 second

const OPACITY_VALUES: Record<StaleLevel, number> = {
	fresh: 1.0,
	stale: 0.7,
	"very-stale": 0.5,
	"extremely-stale": 0.3,
};

function createStaleState(
	level: StaleLevel,
	isStale: boolean,
	showIndicator: boolean,
	secondsSinceUpdate: number,
): StaleState {
	return {
		level,
		isStale,
		opacity: OPACITY_VALUES[level],
		showIndicator,
		secondsSinceUpdate,
	};
}

function getFreshStaleState(secondsSinceUpdate: number): StaleState {
	return createStaleState("fresh", false, false, secondsSinceUpdate);
}

function getStaleState(level: Exclude<StaleLevel, "fresh">, rawElapsedMs: number): StaleState {
	const secondsSinceUpdate = Math.floor(rawElapsedMs / 1000);
	return createStaleState(level, true, level !== "stale", secondsSinceUpdate);
}

function resolveStaleState(
	rawElapsedMs: number,
	staleThresholdMs: number,
	veryStaleThresholdMs: number,
	extremelyStaleThresholdMs: number,
): StaleState {
	if (rawElapsedMs >= extremelyStaleThresholdMs) {
		return getStaleState("extremely-stale", rawElapsedMs);
	}
	if (rawElapsedMs >= veryStaleThresholdMs) {
		return getStaleState("very-stale", rawElapsedMs);
	}
	if (rawElapsedMs >= staleThresholdMs) {
		return getStaleState("stale", rawElapsedMs);
	}
	return getFreshStaleState(Math.floor(rawElapsedMs / 1000));
}

/**
 * Hook to track data freshness and provide stale state.
 *
 * @example
 * ```tsx
 * const { stale, markUpdated } = useStaleData();
 *
 * useEffect(() => {
 *   // When new data arrives
 *   markUpdated();
 * }, [newData, markUpdated]);
 *
 * return (
 *   <div style={{ opacity: stale.opacity }}>
 *     {stale.showIndicator && <ClockIcon />}
 *     {price}
 *   </div>
 * );
 * ```
 */
export function useStaleData(
	lastUpdatedAt?: Date,
	options: UseStaleDataOptions = {},
): UseStaleDataReturn {
	const {
		staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS,
		veryStaleThresholdMs = DEFAULT_VERY_STALE_THRESHOLD_MS,
		extremelyStaleThresholdMs = DEFAULT_EXTREMELY_STALE_THRESHOLD_MS,
		updateIntervalMs = DEFAULT_UPDATE_INTERVAL_MS,
	} = options;

	const thresholds = useMemo(
		() => ({ staleThresholdMs, veryStaleThresholdMs, extremelyStaleThresholdMs }),
		[staleThresholdMs, veryStaleThresholdMs, extremelyStaleThresholdMs],
	);

	const [lastUpdate, setLastUpdate] = useState<Date>(lastUpdatedAt ?? new Date());
	const [stale, setStale] = useState<StaleState>(getFreshStaleState(0));
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const calculateStaleState = useCallback(
		(elapsedMs: number) =>
			resolveStaleState(
				elapsedMs,
				thresholds.staleThresholdMs,
				thresholds.veryStaleThresholdMs,
				thresholds.extremelyStaleThresholdMs,
			),
		[thresholds],
	);

	const markUpdated = useCallback(() => {
		setLastUpdate(new Date());
		setStale(getFreshStaleState(0));
	}, []);

	useEffect(() => {
		if (lastUpdatedAt) {
			setLastUpdate(lastUpdatedAt);
		}
	}, [lastUpdatedAt]);

	useEffect(() => {
		const updateStaleState = () => {
			const elapsedMs = Date.now() - lastUpdate.getTime();
			setStale(calculateStaleState(elapsedMs));
		};

		updateStaleState();
		intervalRef.current = setInterval(updateStaleState, updateIntervalMs);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
		};
	}, [calculateStaleState, lastUpdate, updateIntervalMs]);

	return { stale, markUpdated };
}

export default useStaleData;
