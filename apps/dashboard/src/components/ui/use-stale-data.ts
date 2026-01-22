/**
 * useStaleData Hook
 *
 * Tracks data freshness and provides stale state for UI fadeout.
 *
 * @see docs/plans/ui/31-realtime-patterns.md line 26
 */

import { useCallback, useEffect, useRef, useState } from "react";

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

	const [lastUpdate, setLastUpdate] = useState<Date>(lastUpdatedAt ?? new Date());
	const [stale, setStale] = useState<StaleState>({
		level: "fresh",
		isStale: false,
		opacity: 1.0,
		showIndicator: false,
		secondsSinceUpdate: 0,
	});

	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const calculateStaleState = useCallback(
		(elapsedMs: number): StaleState => {
			const secondsSinceUpdate = Math.floor(elapsedMs / 1000);

			if (elapsedMs >= extremelyStaleThresholdMs) {
				return {
					level: "extremely-stale",
					isStale: true,
					opacity: OPACITY_VALUES["extremely-stale"],
					showIndicator: true,
					secondsSinceUpdate,
				};
			}

			if (elapsedMs >= veryStaleThresholdMs) {
				return {
					level: "very-stale",
					isStale: true,
					opacity: OPACITY_VALUES["very-stale"],
					showIndicator: true,
					secondsSinceUpdate,
				};
			}

			if (elapsedMs >= staleThresholdMs) {
				return {
					level: "stale",
					isStale: true,
					opacity: OPACITY_VALUES.stale,
					showIndicator: false,
					secondsSinceUpdate,
				};
			}

			return {
				level: "fresh",
				isStale: false,
				opacity: OPACITY_VALUES.fresh,
				showIndicator: false,
				secondsSinceUpdate,
			};
		},
		[staleThresholdMs, veryStaleThresholdMs, extremelyStaleThresholdMs],
	);

	const markUpdated = () => {
		setLastUpdate(new Date());
		setStale({
			level: "fresh",
			isStale: false,
			opacity: 1.0,
			showIndicator: false,
			secondsSinceUpdate: 0,
		});
	};

	useEffect(() => {
		if (lastUpdatedAt) {
			setLastUpdate(lastUpdatedAt);
		}
	}, [lastUpdatedAt]);

	useEffect(() => {
		const checkStaleness = () => {
			const elapsedMs = Date.now() - lastUpdate.getTime();
			const newState = calculateStaleState(elapsedMs);
			setStale(newState);
		};

		checkStaleness();
		intervalRef.current = setInterval(checkStaleness, updateIntervalMs);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
		};
	}, [lastUpdate, updateIntervalMs, calculateStaleState]);

	return { stale, markUpdated };
}

export default useStaleData;
