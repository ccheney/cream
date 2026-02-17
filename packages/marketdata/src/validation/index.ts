/**
 * Data Quality Validation Module
 *
 * Comprehensive validation for candle data including staleness,
 * gaps, anomalies, and calendar-aware detection.
 *
 * @example
 * ```ts
 * import {
 *   validateCandleData,
 *   checkStaleness,
 *   detectGaps,
 *   detectAllAnomalies,
 * } from "@cream/marketdata";
 *
 * const result = validateCandleData(candles, {
 *   checkStaleness: true,
 *   checkGaps: true,
 *   checkAnomalies: true,
 *   calendarAware: true,
 * });
 *
 * if (!result.isValid) {
 *   console.log("Issues:", result.issues);
 * }
 * ```
 *
 * @see docs/plans/02-data-layer.md
 */

// Export all submodules
export * from "./anomalies";
export * from "./calendar";
export * from "./external";
export * from "./gaps";
export * from "./staleness";

import type { Timeframe } from "../ingestion/candleIngestion";
// Import for combined validation
import {
	type Anomaly,
	type AnomalyDetectionConfig,
	DEFAULT_ANOMALY_CONFIG,
	detectAllAnomalies,
} from "./anomalies";
import { DEFAULT_US_CALENDAR, isExpectedGap, type MarketCalendarConfig } from "./calendar";
import {
	type Candle,
	detectGaps,
	fillGaps,
	type GapDetectionResult,
	type InterpolatedCandle,
} from "./gaps";
import {
	checkStaleness,
	DEFAULT_STALENESS_THRESHOLDS,
	type StalenessThresholds,
} from "./staleness";

// ============================================
// Combined Validation Types
// ============================================

export interface ValidationConfig {
	/** Check for stale data */
	checkStaleness?: boolean;
	/** Check for gaps */
	checkGaps?: boolean;
	/** Check for anomalies */
	checkAnomalies?: boolean;
	/** Use calendar-aware gap detection */
	calendarAware?: boolean;
	/** Auto-fill single gaps with interpolation */
	autoFillGaps?: boolean;
	/** Staleness thresholds */
	stalenessThresholds?: StalenessThresholds;
	/** Anomaly detection config */
	anomalyConfig?: AnomalyDetectionConfig;
	/** Market calendar config */
	calendarConfig?: MarketCalendarConfig;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
	checkStaleness: true,
	checkGaps: true,
	checkAnomalies: true,
	calendarAware: true,
	autoFillGaps: false,
	stalenessThresholds: DEFAULT_STALENESS_THRESHOLDS,
	anomalyConfig: DEFAULT_ANOMALY_CONFIG,
	calendarConfig: DEFAULT_US_CALENDAR,
};

export interface ValidationIssue {
	type: "staleness" | "gap" | "anomaly" | "insufficient_data";
	severity: "info" | "warning" | "critical";
	message: string;
	timestamp?: string;
	details?: Record<string, unknown>;
}

export interface ValidationResult {
	/** Overall validation passed */
	isValid: boolean;
	/** Symbol validated */
	symbol: string;
	/** Timeframe validated */
	timeframe: Timeframe;
	/** Total candles processed */
	totalCandles: number;
	/** Validation issues found */
	issues: ValidationIssue[];
	/** Staleness result (if checked) */
	staleness?: {
		isStale: boolean;
		staleMinutes: number;
		threshold: number;
	};
	/** Gap detection result (if checked) */
	gaps?: GapDetectionResult;
	/** Anomaly detection result (if checked) */
	anomalies?: {
		count: number;
		items: Anomaly[];
	};
	/** Processed candles (may include interpolated) */
	processedCandles?: (Candle | InterpolatedCandle)[];
	/** Quality score (0-100) */
	qualityScore: number;
}

// ============================================
// Combined Validation
// ============================================

interface ValidationAccumulator {
	issues: ValidationIssue[];
	qualityScore: number;
	processedCandles: (Candle | InterpolatedCandle)[];
	staleness?: {
		isStale: boolean;
		staleMinutes: number;
		threshold: number;
	};
	gaps?: GapDetectionResult;
	anomalies?: {
		count: number;
		items: Anomaly[];
	};
}

function createNoDataResult(): ValidationResult {
	return {
		isValid: false,
		symbol: "",
		timeframe: "1h",
		totalCandles: 0,
		issues: [
			{
				type: "insufficient_data",
				severity: "critical",
				message: "No candle data provided",
			},
		],
		qualityScore: 0,
	};
}

function createAccumulator(candles: Candle[]): ValidationAccumulator {
	return {
		issues: [],
		qualityScore: 100,
		processedCandles: candles,
	};
}

function applyMinimumDataCheck(acc: ValidationAccumulator, candles: Candle[]): void {
	if (candles.length >= 10) {
		return;
	}
	acc.issues.push({
		type: "insufficient_data",
		severity: "warning",
		message: `Only ${candles.length} candles provided (minimum 10 recommended)`,
	});
	acc.qualityScore -= 10;
}

function applyStalenessCheck(
	acc: ValidationAccumulator,
	lastCandle: Candle,
	timeframe: Timeframe,
	config: ValidationConfig,
): void {
	if (config.checkStaleness === false) {
		return;
	}

	const staleness = checkStaleness(
		lastCandle.timestamp,
		timeframe,
		config.stalenessThresholds ?? DEFAULT_STALENESS_THRESHOLDS,
	);
	acc.staleness = {
		isStale: staleness.isStale,
		staleMinutes: staleness.staleMinutes,
		threshold: staleness.threshold,
	};

	if (!staleness.isStale) {
		return;
	}

	const critical = staleness.staleMinutes > staleness.threshold * 2;
	acc.issues.push({
		type: "staleness",
		severity: critical ? "critical" : "warning",
		message: `Data is stale: last update ${staleness.staleMinutes.toFixed(0)} minutes ago (threshold: ${staleness.threshold} minutes)`,
		timestamp: lastCandle.timestamp,
		details: { staleMinutes: staleness.staleMinutes, threshold: staleness.threshold },
	});
	acc.qualityScore -= critical ? 30 : 15;
}

function isUnexpectedGap(
	gap: GapDetectionResult["gaps"][number],
	config: ValidationConfig,
): boolean {
	if (config.calendarAware === false) {
		return true;
	}

	return !isExpectedGap(
		gap.previousTimestamp,
		new Date(new Date(gap.previousTimestamp).getTime() + gap.gapMinutes * 60_000).toISOString(),
		config.calendarConfig ?? DEFAULT_US_CALENDAR,
	);
}

function applyGapCheck(
	acc: ValidationAccumulator,
	candles: Candle[],
	config: ValidationConfig,
): void {
	if (config.checkGaps === false) {
		return;
	}

	const gapResult = detectGaps(candles);
	acc.gaps = gapResult;

	if (!gapResult.hasGaps) {
		return;
	}

	const unexpectedGaps = gapResult.gaps.filter((gap) => isUnexpectedGap(gap, config));
	if (unexpectedGaps.length > 0) {
		for (const gap of unexpectedGaps) {
			acc.issues.push({
				type: "gap",
				severity: gap.gapCandles > 5 ? "critical" : "warning",
				message: `Gap detected: ${gap.gapCandles} missing candle(s) (${gap.gapMinutes.toFixed(0)} minutes)`,
				timestamp: gap.expectedTimestamp,
				details: { gapCandles: gap.gapCandles, gapMinutes: gap.gapMinutes },
			});
		}
		acc.qualityScore -= Math.min(30, unexpectedGaps.length * 5);
	}

	if (config.autoFillGaps) {
		acc.processedCandles = fillGaps(candles, 1);
	}
}

function applyAnomalyCheck(
	acc: ValidationAccumulator,
	candles: Candle[],
	config: ValidationConfig,
): void {
	if (config.checkAnomalies === false) {
		return;
	}

	const anomalies = detectAllAnomalies(candles, config.anomalyConfig ?? DEFAULT_ANOMALY_CONFIG);
	if (!anomalies.hasAnomalies) {
		return;
	}

	acc.anomalies = {
		count: anomalies.anomalies.length,
		items: anomalies.anomalies,
	};

	for (const anomaly of anomalies.anomalies) {
		acc.issues.push({
			type: "anomaly",
			severity: anomaly.severity,
			message: anomaly.description,
			timestamp: anomaly.timestamp,
			details: { type: anomaly.type, value: anomaly.value },
		});
	}

	const criticalCount = anomalies.anomalies.filter((item) => item.severity === "critical").length;
	acc.qualityScore -= Math.min(20, criticalCount * 10);
}

/**
 * Validate candle data comprehensively.
 *
 * @param candles - Array of candles to validate
 * @param config - Validation configuration
 * @returns Validation result
 */
export function validateCandleData(
	candles: Candle[],
	config: ValidationConfig = DEFAULT_VALIDATION_CONFIG,
): ValidationResult {
	if (candles.length === 0) {
		return createNoDataResult();
	}

	const firstCandle = candles[0];
	const lastCandle = candles.at(-1);
	if (!firstCandle || !lastCandle) {
		return createNoDataResult();
	}

	const acc = createAccumulator(candles);
	applyMinimumDataCheck(acc, candles);
	applyStalenessCheck(acc, lastCandle, firstCandle.timeframe, config);
	applyGapCheck(acc, candles, config);
	applyAnomalyCheck(acc, candles, config);
	const criticalIssues = acc.issues.filter((issue) => issue.severity === "critical");
	const isValid = criticalIssues.length === 0;

	return {
		isValid,
		symbol: firstCandle.symbol,
		timeframe: firstCandle.timeframe,
		totalCandles: candles.length,
		issues: acc.issues,
		staleness: acc.staleness,
		gaps: acc.gaps,
		anomalies: acc.anomalies,
		processedCandles: config.autoFillGaps ? acc.processedCandles : undefined,
		qualityScore: Math.max(0, acc.qualityScore),
	};
}

/**
 * Quick validation check (returns boolean only).
 */
export function isValidCandleData(
	candles: Candle[],
	config: ValidationConfig = DEFAULT_VALIDATION_CONFIG,
): boolean {
	return validateCandleData(candles, config).isValid;
}

/**
 * Get quality score for candle data (0-100).
 */
export function getQualityScore(
	candles: Candle[],
	config: ValidationConfig = DEFAULT_VALIDATION_CONFIG,
): number {
	return validateCandleData(candles, config).qualityScore;
}

export default {
	validateCandleData,
	isValidCandleData,
	getQualityScore,
	DEFAULT_VALIDATION_CONFIG,
};
