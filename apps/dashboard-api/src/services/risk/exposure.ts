/**
 * Exposure Service
 *
 * Calculates portfolio exposure metrics from positions.
 *
 * @see docs/plans/ui/05-api-endpoints.md Risk section
 * @see docs/plans/ui/40-streaming-data-integration.md
 */

import {
	DEFAULT_EXPOSURE_LIMITS,
	type ExposureLimits,
	type ExposureMetrics,
	getSector,
	type PositionForExposure,
} from "./types.js";

// ============================================
// Exposure Calculation
// ============================================

export interface CalculateExposureOptions {
	/** Positions with market values */
	positions: PositionForExposure[];
	/** Portfolio NAV for percentage calculations */
	nav: number;
	/** Exposure limits from config */
	limits?: ExposureLimits;
}

/**
 * Calculate exposure metrics from positions.
 *
 * @example
 * ```typescript
 * const metrics = calculateExposure({
 *   positions: [
 *     { symbol: "AAPL", side: "LONG", quantity: 100, marketValue: 18750 },
 *     { symbol: "GOOGL", side: "LONG", quantity: 50, marketValue: 8500 },
 *   ],
 *   nav: 100000,
 *   limits: { maxGrossExposure: 500000, maxNetExposure: 200000, maxConcentration: 0.25 },
 * });
 * ```
 */
export function calculateExposure(options: CalculateExposureOptions): ExposureMetrics {
	const { positions, nav, limits = DEFAULT_EXPOSURE_LIMITS } = options;

	// Handle empty positions
	if (positions.length === 0 || nav <= 0) {
		return {
			gross: { current: 0, limit: limits.maxGrossExposure, pct: 0 },
			net: { current: 0, limit: limits.maxNetExposure, pct: 0 },
			long: 0,
			short: 0,
			concentrationMax: { symbol: "N/A", pct: 0 },
			sectorExposure: {},
		};
	}

	// Calculate long and short exposure
	let longExposure = 0;
	let shortExposure = 0;

	// Track position values for concentration
	const positionValues: Array<{ symbol: string; value: number }> = [];

	// Track sector exposure
	const sectorTotals: Record<string, number> = {};

	for (const position of positions) {
		const value = Math.abs(position.marketValue ?? 0);

		if (position.side === "LONG") {
			longExposure += value;
		} else {
			shortExposure += value;
		}

		// Track for concentration
		positionValues.push({ symbol: position.symbol, value });

		// Track sector exposure
		const sector = position.sector ?? getSector(position.symbol);
		sectorTotals[sector] = (sectorTotals[sector] ?? 0) + value;
	}

	// Calculate gross and net exposure
	const grossExposure = longExposure + shortExposure;
	const netExposure = longExposure - shortExposure;

	// Calculate gross/net as percentage of limits
	const grossPct =
		limits.maxGrossExposure > 0 ? (grossExposure / limits.maxGrossExposure) * 100 : 0;
	const netPct =
		limits.maxNetExposure > 0 ? (Math.abs(netExposure) / limits.maxNetExposure) * 100 : 0;

	// Find max concentration
	let maxConcentration = { symbol: "N/A", pct: 0 };
	for (const pv of positionValues) {
		const pct = nav > 0 ? (pv.value / nav) * 100 : 0;
		if (pct > maxConcentration.pct) {
			maxConcentration = { symbol: pv.symbol, pct };
		}
	}

	// Convert sector totals to percentages of NAV
	const sectorExposure: Record<string, number> = {};
	for (const [sector, total] of Object.entries(sectorTotals)) {
		sectorExposure[sector] = nav > 0 ? (total / nav) * 100 : 0;
	}

	return {
		gross: {
			current: grossExposure,
			limit: limits.maxGrossExposure,
			pct: grossPct,
		},
		net: {
			current: netExposure,
			limit: limits.maxNetExposure,
			pct: netPct,
		},
		long: longExposure,
		short: shortExposure,
		concentrationMax: maxConcentration,
		sectorExposure,
	};
}

// ============================================
// Exposure Warnings
// ============================================

export type WarningLevel = "ok" | "warning" | "critical";

export interface ExposureWarning {
	metric: "gross" | "net" | "concentration";
	level: WarningLevel;
	current: number;
	limit: number;
	pct: number;
	message: string;
}

/**
 * Check exposure metrics for warnings.
 */
export function checkExposureWarnings(
	metrics: ExposureMetrics,
	limits: ExposureLimits = DEFAULT_EXPOSURE_LIMITS,
): ExposureWarning[] {
	const warnings: ExposureWarning[] = [];

	// Gross exposure warning
	if (metrics.gross.pct >= 100) {
		warnings.push({
			metric: "gross",
			level: "critical",
			current: metrics.gross.current,
			limit: metrics.gross.limit,
			pct: metrics.gross.pct,
			message: "Gross exposure at or above limit",
		});
	} else if (metrics.gross.pct >= 80) {
		warnings.push({
			metric: "gross",
			level: "warning",
			current: metrics.gross.current,
			limit: metrics.gross.limit,
			pct: metrics.gross.pct,
			message: "Gross exposure approaching limit",
		});
	}

	// Net exposure warning
	if (metrics.net.pct >= 100) {
		warnings.push({
			metric: "net",
			level: "critical",
			current: metrics.net.current,
			limit: metrics.net.limit,
			pct: metrics.net.pct,
			message: "Net exposure at or above limit",
		});
	} else if (metrics.net.pct >= 80) {
		warnings.push({
			metric: "net",
			level: "warning",
			current: metrics.net.current,
			limit: metrics.net.limit,
			pct: metrics.net.pct,
			message: "Net exposure approaching limit",
		});
	}

	// Concentration warning
	const concentrationLimitPct = limits.maxConcentration * 100;
	if (metrics.concentrationMax.pct >= concentrationLimitPct) {
		warnings.push({
			metric: "concentration",
			level: "critical",
			current: metrics.concentrationMax.pct,
			limit: concentrationLimitPct,
			pct: (metrics.concentrationMax.pct / concentrationLimitPct) * 100,
			message: `Position ${metrics.concentrationMax.symbol} exceeds concentration limit`,
		});
	} else if (metrics.concentrationMax.pct >= concentrationLimitPct * 0.8) {
		warnings.push({
			metric: "concentration",
			level: "warning",
			current: metrics.concentrationMax.pct,
			limit: concentrationLimitPct,
			pct: (metrics.concentrationMax.pct / concentrationLimitPct) * 100,
			message: `Position ${metrics.concentrationMax.symbol} approaching concentration limit`,
		});
	}

	return warnings;
}

export default {
	calculateExposure,
	checkExposureWarnings,
};
