/**
 * Staleness Detection
 *
 * Detect stale candle data based on configurable thresholds per timeframe.
 *
 * @see docs/plans/02-data-layer.md
 */

import { z } from "zod";
import type { Timeframe } from "../ingestion/candleIngestion";

// ============================================
// Types
// ============================================

export const StalenessThresholdsSchema = z.record(
	z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]),
	z.number().positive()
);

export type StalenessThresholds = z.infer<typeof StalenessThresholdsSchema>;

export interface StalenessCheckResult {
	isStale: boolean;
	lastTimestamp: string | null;
	staleMinutes: number;
	threshold: number;
	timeframe: Timeframe;
}

// ============================================
// Default Thresholds
// ============================================

/**
 * Default staleness thresholds in minutes.
 *
 * Rule: Allow 2x the timeframe duration before marking as stale.
 */
export const DEFAULT_STALENESS_THRESHOLDS: StalenessThresholds = {
	"1m": 2, // 2 minutes
	"5m": 10, // 10 minutes
	"15m": 30, // 30 minutes
	"30m": 60, // 1 hour
	"1h": 120, // 2 hours
	"4h": 480, // 8 hours
	"1d": 2880, // 2 days (48 hours)
	"1w": 20160, // 2 weeks
};

// ============================================
// Staleness Detection
// ============================================

/**
 * Check if candle data is stale.
 *
 * @param lastTimestamp - ISO timestamp of last candle (or null if no data)
 * @param timeframe - Candle timeframe
 * @param thresholds - Custom staleness thresholds (optional)
 * @returns Staleness check result
 */
export function checkStaleness(
	lastTimestamp: string | null,
	timeframe: Timeframe,
	thresholds: StalenessThresholds = DEFAULT_STALENESS_THRESHOLDS
): StalenessCheckResult {
	const threshold = thresholds[timeframe] ?? DEFAULT_STALENESS_THRESHOLDS[timeframe];

	// Ensure threshold is defined (should always be, but TypeScript needs the guard)
	if (threshold === undefined) {
		throw new Error(`No staleness threshold defined for timeframe: ${timeframe}`);
	}

	if (!lastTimestamp) {
		return {
			isStale: true,
			lastTimestamp: null,
			staleMinutes: Infinity,
			threshold,
			timeframe,
		};
	}

	const lastTime = new Date(lastTimestamp).getTime();
	const now = Date.now();
	const staleMinutes = (now - lastTime) / (1000 * 60);

	return {
		isStale: staleMinutes > threshold,
		lastTimestamp,
		staleMinutes,
		threshold,
		timeframe,
	};
}

/**
 * Check staleness for multiple symbols.
 *
 * @param timestamps - Map of symbol to last candle timestamp
 * @param timeframe - Candle timeframe
 * @param thresholds - Custom staleness thresholds (optional)
 * @returns Map of symbol to staleness result
 */
export function checkMultipleStaleness(
	timestamps: Map<string, string | null>,
	timeframe: Timeframe,
	thresholds: StalenessThresholds = DEFAULT_STALENESS_THRESHOLDS
): Map<string, StalenessCheckResult> {
	const results = new Map<string, StalenessCheckResult>();

	for (const [symbol, timestamp] of timestamps) {
		results.set(symbol, checkStaleness(timestamp, timeframe, thresholds));
	}

	return results;
}

/**
 * Get stale symbols from a map of timestamps.
 *
 * @param timestamps - Map of symbol to last candle timestamp
 * @param timeframe - Candle timeframe
 * @param thresholds - Custom staleness thresholds (optional)
 * @returns Array of stale symbols
 */
export function getStaleSymbols(
	timestamps: Map<string, string | null>,
	timeframe: Timeframe,
	thresholds: StalenessThresholds = DEFAULT_STALENESS_THRESHOLDS
): string[] {
	const stale: string[] = [];

	for (const [symbol, timestamp] of timestamps) {
		const result = checkStaleness(timestamp, timeframe, thresholds);
		if (result.isStale) {
			stale.push(symbol);
		}
	}

	return stale;
}

/**
 * Check if data is fresh (not stale).
 */
export function isFresh(
	lastTimestamp: string | null,
	timeframe: Timeframe,
	thresholds: StalenessThresholds = DEFAULT_STALENESS_THRESHOLDS
): boolean {
	return !checkStaleness(lastTimestamp, timeframe, thresholds).isStale;
}

export default {
	checkStaleness,
	checkMultipleStaleness,
	getStaleSymbols,
	isFresh,
	DEFAULT_STALENESS_THRESHOLDS,
};
