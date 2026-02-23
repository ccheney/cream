/**
 * Limits Service
 *
 * Monitors portfolio risk limits and constraint utilization.
 *
 * @see docs/plans/ui/05-api-endpoints.md Risk section
 */

import type { ExposureMetrics, PositionForExposure } from "./types.js";

// ============================================
// Constraint Types (mirror @cream/config)
// ============================================

export interface PerInstrumentConstraints {
	max_units: number;
	max_notional: number;
	max_pct_equity: number;
}

export interface PortfolioConstraints {
	max_gross_notional: number;
	max_net_notional: number;
	max_gross_pct_equity: number;
	max_net_pct_equity: number;
}

export interface OptionsGreeksConstraints {
	max_delta_notional: number;
	max_gamma: number;
	max_vega: number;
	max_theta: number;
}

export interface ConstraintsConfig {
	per_instrument?: PerInstrumentConstraints;
	portfolio?: PortfolioConstraints;
	options?: OptionsGreeksConstraints;
}

// ============================================
// Types
// ============================================

export type LimitCategory = "per_instrument" | "portfolio" | "options";
export type LimitStatus = "ok" | "warning" | "critical";

export interface LimitStatusItem {
	/** Human-readable limit name */
	name: string;
	/** Limit category */
	category: LimitCategory;
	/** Current value */
	current: number;
	/** Configured limit */
	limit: number;
	/** Utilization as percentage (0-100+) */
	utilization: number;
	/** Status based on utilization */
	status: LimitStatus;
}

export interface PortfolioGreeks {
	delta: number;
	gamma: number;
	vega: number;
	theta: number;
}

export interface CalculateLimitsOptions {
	/** Portfolio exposure metrics */
	exposure: ExposureMetrics;
	/** Portfolio Greeks (optional - for options limits) */
	greeks?: PortfolioGreeks;
	/** Current positions for per-instrument checks */
	positions: PositionForExposure[];
	/** Portfolio NAV */
	nav: number;
	/** Configured constraints */
	constraints: ConstraintsConfig;
}

// ============================================
// Status Calculation
// ============================================

/**
 * Determine limit status based on utilization percentage.
 */
function getStatus(utilization: number): LimitStatus {
	if (utilization >= 95) {
		return "critical";
	}
	if (utilization >= 80) {
		return "warning";
	}
	return "ok";
}

/**
 * Calculate utilization percentage.
 */
function calculateUtilization(current: number, limit: number): number {
	if (limit === 0) {
		return 0;
	}
	return Math.abs(current / limit) * 100;
}

function createLimitItem(
	name: string,
	category: LimitCategory,
	current: number,
	limit: number,
	utilizationCurrent = current,
): LimitStatusItem {
	const utilization = calculateUtilization(utilizationCurrent, limit);
	return {
		name,
		category,
		current,
		limit,
		utilization,
		status: getStatus(utilization),
	};
}

function getPerInstrumentMaxima(
	positions: PositionForExposure[],
	nav: number,
): { maxUnits: number; maxNotional: number; maxPctEquity: number } {
	let maxUnits = 0;
	let maxNotional = 0;
	let maxPctEquity = 0;

	for (const position of positions) {
		const units = Math.abs(position.quantity);
		const notional = Math.abs(position.marketValue ?? 0);
		const pctEquity = nav > 0 ? notional / nav : 0;
		if (units > maxUnits) {
			maxUnits = units;
		}
		if (notional > maxNotional) {
			maxNotional = notional;
		}
		if (pctEquity > maxPctEquity) {
			maxPctEquity = pctEquity;
		}
	}

	return { maxUnits, maxNotional, maxPctEquity };
}

// ============================================
// Limit Calculations
// ============================================

/**
 * Calculate per-instrument limit statuses.
 */
function calculatePerInstrumentLimits(
	positions: PositionForExposure[],
	nav: number,
	constraints: PerInstrumentConstraints,
): LimitStatusItem[] {
	const { maxUnits, maxNotional, maxPctEquity } = getPerInstrumentMaxima(positions, nav);
	const pctEquityLimit = constraints.max_pct_equity * 100;
	const pctEquityCurrent = maxPctEquity * 100;

	return [
		createLimitItem("Max Units Per Position", "per_instrument", maxUnits, constraints.max_units),
		createLimitItem(
			"Max Notional Per Position",
			"per_instrument",
			maxNotional,
			constraints.max_notional,
		),
		createLimitItem(
			"Max % Equity Per Position",
			"per_instrument",
			pctEquityCurrent,
			pctEquityLimit,
			maxPctEquity,
		),
	];
}

/**
 * Calculate portfolio-level limit statuses.
 */
function calculatePortfolioLimits(
	exposure: ExposureMetrics,
	nav: number,
	constraints: PortfolioConstraints,
): LimitStatusItem[] {
	const grossPctEquity = nav > 0 ? exposure.gross.current / nav : 0;
	const netPctEquity = nav > 0 ? Math.abs(exposure.net.current) / nav : 0;
	const concentrationLimit = 25;

	return [
		createLimitItem(
			"Gross Exposure",
			"portfolio",
			exposure.gross.current,
			constraints.max_gross_notional,
		),
		createLimitItem(
			"Net Exposure",
			"portfolio",
			exposure.net.current,
			constraints.max_net_notional,
			Math.abs(exposure.net.current),
		),
		createLimitItem(
			"Gross Exposure % Equity",
			"portfolio",
			grossPctEquity * 100,
			constraints.max_gross_pct_equity * 100,
			grossPctEquity,
		),
		createLimitItem(
			"Net Exposure % Equity",
			"portfolio",
			netPctEquity * 100,
			constraints.max_net_pct_equity * 100,
			netPctEquity,
		),
		createLimitItem(
			"Concentration",
			"portfolio",
			exposure.concentrationMax.pct,
			concentrationLimit,
		),
	];
}

/**
 * Calculate options Greeks limit statuses.
 */
function calculateOptionsLimits(
	greeks: PortfolioGreeks,
	constraints: OptionsGreeksConstraints,
): LimitStatusItem[] {
	const limits: LimitStatusItem[] = [];

	// Delta Notional
	const deltaUtil = calculateUtilization(Math.abs(greeks.delta), constraints.max_delta_notional);
	limits.push({
		name: "Delta Exposure",
		category: "options",
		current: greeks.delta,
		limit: constraints.max_delta_notional,
		utilization: deltaUtil,
		status: getStatus(deltaUtil),
	});

	// Gamma
	const gammaUtil = calculateUtilization(Math.abs(greeks.gamma), constraints.max_gamma);
	limits.push({
		name: "Gamma",
		category: "options",
		current: greeks.gamma,
		limit: constraints.max_gamma,
		utilization: gammaUtil,
		status: getStatus(gammaUtil),
	});

	// Vega
	const vegaUtil = calculateUtilization(Math.abs(greeks.vega), constraints.max_vega);
	limits.push({
		name: "Vega",
		category: "options",
		current: greeks.vega,
		limit: constraints.max_vega,
		utilization: vegaUtil,
		status: getStatus(vegaUtil),
	});

	// Theta (negative limit - cost cap)
	// For theta, we compare the absolute values
	const thetaLimit = Math.abs(constraints.max_theta);
	const thetaUtil = calculateUtilization(Math.abs(greeks.theta), thetaLimit);
	limits.push({
		name: "Theta (Daily Decay)",
		category: "options",
		current: greeks.theta,
		limit: constraints.max_theta,
		utilization: thetaUtil,
		status: getStatus(thetaUtil),
	});

	return limits;
}

// ============================================
// Main Calculation Function
// ============================================

/**
 * Calculate all limit statuses.
 *
 * @example
 * ```typescript
 * const limits = calculateLimits({
 *   exposure: { gross: { current: 450000, limit: 500000, pct: 90 }, ... },
 *   greeks: { delta: 85000, gamma: 500, vega: 3000, theta: -300 },
 *   positions: [...],
 *   nav: 500000,
 *   constraints: config.constraints,
 * });
 * ```
 */
export function calculateLimits(options: CalculateLimitsOptions): LimitStatusItem[] {
	const { exposure, greeks, positions, nav, constraints } = options;

	const limits: LimitStatusItem[] = [];

	const perInstrument = constraints.per_instrument;
	if (!perInstrument) {
		throw new Error("Missing per-instrument constraints");
	}
	const portfolio = constraints.portfolio;
	if (!portfolio) {
		throw new Error("Missing portfolio constraints");
	}

	// Per-instrument limits
	limits.push(...calculatePerInstrumentLimits(positions, nav, perInstrument));

	// Portfolio limits
	limits.push(...calculatePortfolioLimits(exposure, nav, portfolio));

	// Options limits (only if Greeks provided)
	if (greeks) {
		const optionsConstraints = constraints.options;
		if (!optionsConstraints) {
			throw new Error("Missing options constraints while Greeks were provided");
		}
		limits.push(...calculateOptionsLimits(greeks, optionsConstraints));
	}

	return limits;
}

// ============================================
// Summary Functions
// ============================================

/**
 * Get limits that are in warning or critical status.
 */
export function getBreachingLimits(limits: LimitStatusItem[]): LimitStatusItem[] {
	return limits.filter((l) => l.status === "warning" || l.status === "critical");
}

/**
 * Get the worst status across all limits.
 */
export function getWorstStatus(limits: LimitStatusItem[]): LimitStatus {
	if (limits.some((l) => l.status === "critical")) {
		return "critical";
	}
	if (limits.some((l) => l.status === "warning")) {
		return "warning";
	}
	return "ok";
}

export default {
	calculateLimits,
	getBreachingLimits,
	getWorstStatus,
};
