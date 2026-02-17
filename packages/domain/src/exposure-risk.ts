import type { Position } from "./execution";
import {
	calculateExposureBySector,
	calculateExposureStats,
	type ExposureStats,
	type PositionWithMetadata,
} from "./exposure-core";

/** Exposure limit configuration */
export interface ExposureLimits {
	/** Maximum gross exposure as % of equity (default: 2.0 = 200%) */
	maxGrossExposure?: number;
	/** Maximum net exposure as % of equity (default: 1.0 = 100%) */
	maxNetExposure?: number;
	/** Maximum single-position exposure as % of equity (default: 0.20 = 20%) */
	maxSinglePositionExposure?: number;
	/** Maximum sector exposure as % of equity (default: 0.40 = 40%) */
	maxSectorExposure?: number;
}

/** Default exposure limits */
export const DEFAULT_EXPOSURE_LIMITS: Required<ExposureLimits> = {
	maxGrossExposure: 2.0,
	maxNetExposure: 1.0,
	maxSinglePositionExposure: 0.2,
	maxSectorExposure: 0.4,
};

/** Exposure limit violation */
export interface ExposureViolation {
	/** Type of limit violated */
	limitType: "gross" | "net" | "single_position" | "sector";
	/** Current value */
	currentValue: number;
	/** Limit value */
	limit: number;
	/** Human-readable message */
	message: string;
	/** Additional context (e.g., symbol or sector name) */
	context?: string;
}

/** Result of exposure validation */
export interface ExposureValidationResult {
	/** Whether all limits are satisfied */
	valid: boolean;
	/** List of violations (empty if valid) */
	violations: ExposureViolation[];
	/** Current exposure stats */
	stats: ExposureStats;
}

/**
 * Validate portfolio exposure against limits.
 */
export function validateExposure(
	positions: Position[],
	accountEquity: number,
	limits: ExposureLimits = {},
): ExposureValidationResult {
	const effectiveLimits = { ...DEFAULT_EXPOSURE_LIMITS, ...limits };
	const stats = calculateExposureStats(positions, accountEquity);
	const violations: ExposureViolation[] = [];

	if (stats.grossExposurePctEquity > effectiveLimits.maxGrossExposure) {
		violations.push({
			limitType: "gross",
			currentValue: stats.grossExposurePctEquity,
			limit: effectiveLimits.maxGrossExposure,
			message: `Gross exposure ${(stats.grossExposurePctEquity * 100).toFixed(1)}% exceeds limit of ${(effectiveLimits.maxGrossExposure * 100).toFixed(1)}%`,
		});
	}

	if (Math.abs(stats.netExposurePctEquity) > effectiveLimits.maxNetExposure) {
		violations.push({
			limitType: "net",
			currentValue: stats.netExposurePctEquity,
			limit: effectiveLimits.maxNetExposure,
			message: `Net exposure ${(stats.netExposurePctEquity * 100).toFixed(1)}% exceeds limit of ${(effectiveLimits.maxNetExposure * 100).toFixed(1)}%`,
		});
	}

	for (const pos of positions) {
		const posExposure = Math.abs(pos.marketValue) / accountEquity;
		if (posExposure > effectiveLimits.maxSinglePositionExposure) {
			violations.push({
				limitType: "single_position",
				currentValue: posExposure,
				limit: effectiveLimits.maxSinglePositionExposure,
				message: `Position ${pos.instrument.instrumentId} exposure ${(posExposure * 100).toFixed(1)}% exceeds limit of ${(effectiveLimits.maxSinglePositionExposure * 100).toFixed(1)}%`,
				context: pos.instrument.instrumentId,
			});
		}
	}

	return {
		valid: violations.length === 0,
		violations,
		stats,
	};
}

/**
 * Validate sector exposure against limits.
 */
export function validateSectorExposure(
	positions: PositionWithMetadata[],
	accountEquity: number,
	maxSectorExposure: number = DEFAULT_EXPOSURE_LIMITS.maxSectorExposure,
): ExposureViolation[] {
	const violations: ExposureViolation[] = [];
	const sectorExposure = calculateExposureBySector(positions, accountEquity);

	for (const [sector, exposure] of sectorExposure.breakdown) {
		if (exposure.gross.pctEquity > maxSectorExposure) {
			violations.push({
				limitType: "sector",
				currentValue: exposure.gross.pctEquity,
				limit: maxSectorExposure,
				message: `Sector ${sector} exposure ${(exposure.gross.pctEquity * 100).toFixed(1)}% exceeds limit of ${(maxSectorExposure * 100).toFixed(1)}%`,
				context: sector,
			});
		}
	}

	return violations;
}

/** Position with delta for options exposure calculation */
export interface PositionWithDelta extends Position {
	/** Delta for options (0-1 for calls, -1-0 for puts). Undefined for equity. */
	delta?: number;
	/** Underlying price for options (required if delta is provided) */
	underlyingPrice?: number;
}

function assertPositiveEquity(accountEquity: number): void {
	if (accountEquity <= 0) {
		throw new Error("accountEquity must be positive");
	}
}

function resolveDeltaAdjustedNotional(position: PositionWithDelta): number {
	if (position.delta !== undefined && position.underlyingPrice !== undefined) {
		const multiplier = position.instrument.instrumentType === "OPTION" ? 100 : 1;
		return (
			Math.abs(position.delta) * position.underlyingPrice * Math.abs(position.quantity) * multiplier
		);
	}

	return Math.abs(position.marketValue);
}

/**
 * Calculate delta-adjusted exposure for a portfolio with options.
 */
export function calculateDeltaAdjustedExposure(
	positions: PositionWithDelta[],
	accountEquity: number,
): ExposureStats {
	assertPositiveEquity(accountEquity);

	let longNotional = 0;
	let shortNotional = 0;
	let longCount = 0;
	let shortCount = 0;

	for (const pos of positions) {
		const notional = resolveDeltaAdjustedNotional(pos);

		if (pos.quantity > 0) {
			longNotional += notional;
			longCount++;
		} else if (pos.quantity < 0) {
			shortNotional += notional;
			shortCount++;
		}
	}

	const grossNotional = longNotional + shortNotional;
	const netNotional = longNotional - shortNotional;

	return {
		grossExposureNotional: grossNotional,
		netExposureNotional: netNotional,
		grossExposurePctEquity: grossNotional / accountEquity,
		netExposurePctEquity: netNotional / accountEquity,
		longExposureNotional: longNotional,
		shortExposureNotional: shortNotional,
		longPositionCount: longCount,
		shortPositionCount: shortCount,
		totalPositionCount: longCount + shortCount,
	};
}

/**
 * Format exposure stats as a human-readable string.
 */
export function formatExposureStats(stats: ExposureStats): string {
	const lines = [
		`Gross Exposure: ${(stats.grossExposurePctEquity * 100).toFixed(1)}% ($${stats.grossExposureNotional.toLocaleString()})`,
		`Net Exposure: ${(stats.netExposurePctEquity * 100).toFixed(1)}% ($${stats.netExposureNotional.toLocaleString()})`,
		`Long: ${((stats.longExposureNotional / stats.grossExposureNotional) * 100 || 0).toFixed(1)}% ($${stats.longExposureNotional.toLocaleString()}) - ${stats.longPositionCount} positions`,
		`Short: ${((stats.shortExposureNotional / stats.grossExposureNotional) * 100 || 0).toFixed(1)}% ($${stats.shortExposureNotional.toLocaleString()}) - ${stats.shortPositionCount} positions`,
	];

	return lines.join("\n");
}

/**
 * Create empty exposure stats.
 */
export function createEmptyExposureStats(): ExposureStats {
	return {
		grossExposureNotional: 0,
		netExposureNotional: 0,
		grossExposurePctEquity: 0,
		netExposurePctEquity: 0,
		longExposureNotional: 0,
		shortExposureNotional: 0,
		longPositionCount: 0,
		shortPositionCount: 0,
		totalPositionCount: 0,
	};
}
