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

interface ExposureAccumulation {
	longExposure: number;
	shortExposure: number;
	positionValues: Array<{ symbol: string; value: number }>;
	sectorTotals: Record<string, number>;
}

function createEmptyExposureMetrics(limits: ExposureLimits): ExposureMetrics {
	return {
		gross: { current: 0, limit: limits.maxGrossExposure, pct: 0 },
		net: { current: 0, limit: limits.maxNetExposure, pct: 0 },
		long: 0,
		short: 0,
		concentrationMax: { symbol: "N/A", pct: 0 },
		sectorExposure: {},
	};
}

function accumulateExposure(positions: PositionForExposure[]): ExposureAccumulation {
	const result: ExposureAccumulation = {
		longExposure: 0,
		shortExposure: 0,
		positionValues: [],
		sectorTotals: {},
	};

	for (const position of positions) {
		const value = Math.abs(position.marketValue ?? 0);
		if (position.side === "LONG") {
			result.longExposure += value;
		} else {
			result.shortExposure += value;
		}

		result.positionValues.push({ symbol: position.symbol, value });
		const sector = position.sector ?? getSector(position.symbol);
		result.sectorTotals[sector] = (result.sectorTotals[sector] ?? 0) + value;
	}

	return result;
}

function findMaxConcentration(
	positionValues: Array<{ symbol: string; value: number }>,
	nav: number,
): { symbol: string; pct: number } {
	let maxConcentration = { symbol: "N/A", pct: 0 };
	for (const pv of positionValues) {
		const pct = nav > 0 ? (pv.value / nav) * 100 : 0;
		if (pct > maxConcentration.pct) {
			maxConcentration = { symbol: pv.symbol, pct };
		}
	}
	return maxConcentration;
}

function mapSectorExposure(
	sectorTotals: Record<string, number>,
	nav: number,
): Record<string, number> {
	const sectorExposure: Record<string, number> = {};
	for (const [sector, total] of Object.entries(sectorTotals)) {
		sectorExposure[sector] = nav > 0 ? (total / nav) * 100 : 0;
	}
	return sectorExposure;
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

	if (positions.length === 0 || nav <= 0) {
		return createEmptyExposureMetrics(limits);
	}

	const { longExposure, shortExposure, positionValues, sectorTotals } =
		accumulateExposure(positions);
	const grossExposure = longExposure + shortExposure;
	const netExposure = longExposure - shortExposure;
	const grossPct =
		limits.maxGrossExposure > 0 ? (grossExposure / limits.maxGrossExposure) * 100 : 0;
	const netPct =
		limits.maxNetExposure > 0 ? (Math.abs(netExposure) / limits.maxNetExposure) * 100 : 0;
	const maxConcentration = findMaxConcentration(positionValues, nav);
	const sectorExposure = mapSectorExposure(sectorTotals, nav);

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

function createWarning(
	metric: "gross" | "net" | "concentration",
	level: WarningLevel,
	current: number,
	limit: number,
	pct: number,
	message: string,
): ExposureWarning {
	return {
		metric,
		level,
		current,
		limit,
		pct,
		message,
	};
}

function addExposureWarning(
	warnings: ExposureWarning[],
	metric: "gross" | "net",
	current: number,
	limit: number,
	pct: number,
): void {
	if (pct >= 100) {
		warnings.push(
			createWarning(
				metric,
				"critical",
				current,
				limit,
				pct,
				`${metric === "gross" ? "Gross" : "Net"} exposure at or above limit`,
			),
		);
		return;
	}
	if (pct >= 80) {
		warnings.push(
			createWarning(
				metric,
				"warning",
				current,
				limit,
				pct,
				`${metric === "gross" ? "Gross" : "Net"} exposure approaching limit`,
			),
		);
	}
}

/**
 * Check exposure metrics for warnings.
 */
export function checkExposureWarnings(
	metrics: ExposureMetrics,
	limits: ExposureLimits = DEFAULT_EXPOSURE_LIMITS,
): ExposureWarning[] {
	const warnings: ExposureWarning[] = [];

	addExposureWarning(
		warnings,
		"gross",
		metrics.gross.current,
		metrics.gross.limit,
		metrics.gross.pct,
	);
	addExposureWarning(warnings, "net", metrics.net.current, metrics.net.limit, metrics.net.pct);

	const concentrationLimitPct = limits.maxConcentration * 100;
	if (metrics.concentrationMax.pct >= concentrationLimitPct) {
		warnings.push(
			createWarning(
				"concentration",
				"critical",
				metrics.concentrationMax.pct,
				concentrationLimitPct,
				(metrics.concentrationMax.pct / concentrationLimitPct) * 100,
				`Position ${metrics.concentrationMax.symbol} exceeds concentration limit`,
			),
		);
	} else if (metrics.concentrationMax.pct >= concentrationLimitPct * 0.8) {
		warnings.push(
			createWarning(
				"concentration",
				"warning",
				metrics.concentrationMax.pct,
				concentrationLimitPct,
				(metrics.concentrationMax.pct / concentrationLimitPct) * 100,
				`Position ${metrics.concentrationMax.symbol} approaching concentration limit`,
			),
		);
	}

	return warnings;
}

export default {
	calculateExposure,
	checkExposureWarnings,
};
