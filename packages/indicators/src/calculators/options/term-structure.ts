/**
 * Term Structure Slope Calculator
 *
 * The volatility term structure shows how implied volatility varies
 * across option expiration dates. The slope indicates market expectations.
 *
 * Theoretical Foundation:
 * - Contango (upward slope): Normal state, longer-dated options have higher IV
 * - Backwardation (inverted/downward slope): Near-term uncertainty exceeds long-term
 *
 * Calculation:
 * Slope = (Long-dated IV - Short-dated IV) / Days between
 *
 * Interpretation:
 * - Positive slope: Normal market conditions
 * - Flat slope: Uncertainty about timing
 * - Negative slope: Near-term event risk (earnings, Fed, etc.)
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { OptionsChain } from "./iv-skew";
import { calculateATMIV } from "./iv-skew";

// ============================================================
// TYPES
// ============================================================

export interface TermStructurePoint {
	/** Days to expiration */
	daysToExpiry: number;
	/** Expiration date (ISO string) */
	expiration: string;
	/** ATM implied volatility */
	atmIV: number;
}

export interface TermStructureResult {
	/** Underlying symbol */
	symbol: string;
	/** IV term structure points */
	points: TermStructurePoint[];
	/** Slope: (long IV - short IV) / days difference */
	slope: number;
	/** Front-month ATM IV */
	frontIV: number;
	/** Back-month ATM IV */
	backIV: number;
	/** Days between front and back */
	daysDifference: number;
	/** Structure shape classification */
	shape: TermStructureShape;
	/** Timestamp */
	timestamp: number;
}

export type TermStructureShape =
	| "steep_contango"
	| "contango"
	| "flat"
	| "backwardation"
	| "steep_backwardation";

// ============================================================
// CALCULATORS
// ============================================================

/**
 * Calculate days to expiry from expiration date
 */
function calculateDaysToExpiry(expiration: string, referenceDate: Date): number {
	const expiryDate = new Date(expiration);
	const diffMs = expiryDate.getTime() - referenceDate.getTime();
	return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Build term structure from multiple option chains
 *
 * @param chains - Array of options chains (different expirations)
 * @param referenceDate - Reference date for DTE calculation
 * @returns Array of term structure points
 */
export function buildTermStructure(
	chains: OptionsChain[],
	referenceDate: Date = new Date(),
): TermStructurePoint[] {
	const points: TermStructurePoint[] = [];

	for (const chain of chains) {
		const atmIV = calculateATMIV(chain);
		if (atmIV === null) {
			continue;
		}

		const daysToExpiry = calculateDaysToExpiry(chain.expiration, referenceDate);
		if (daysToExpiry <= 0) {
			continue; // Skip expired options
		}

		points.push({
			daysToExpiry,
			expiration: chain.expiration,
			atmIV,
		});
	}

	// Sort by days to expiry
	points.sort((a, b) => a.daysToExpiry - b.daysToExpiry);

	return points;
}

/**
 * Calculate term structure slope
 *
 * Uses front-month and back-month IV to calculate slope.
 * Slope is expressed as IV change per day.
 *
 * @param chains - Array of options chains (different expirations)
 * @param referenceDate - Reference date for DTE calculation
 * @returns Term structure result or null
 *
 * @example
 * ```typescript
 * const chains = [chain30d, chain60d, chain90d];
 * const result = calculateTermStructureSlope(chains);
 * // result.slope = 0.0005 (contango: ~0.05% IV increase per day)
 * ```
 */
export function calculateTermStructureSlope(
	chains: OptionsChain[],
	referenceDate: Date = new Date(),
): TermStructureResult | null {
	if (chains.length < 2) {
		return null;
	}

	const symbol = chains[0]?.underlyingSymbol;
	if (!symbol) {
		return null;
	}

	const points = buildTermStructure(chains, referenceDate);

	if (points.length < 2) {
		return null;
	}

	// Use first and last points for slope
	const front = points[0];
	const back = points[points.length - 1];

	if (!front || !back) {
		return null;
	}

	const daysDifference = back.daysToExpiry - front.daysToExpiry;
	if (daysDifference <= 0) {
		return null;
	}

	const slope = (back.atmIV - front.atmIV) / daysDifference;
	const shape = classifyTermStructureShape(slope);

	return {
		symbol,
		points,
		slope,
		frontIV: front.atmIV,
		backIV: back.atmIV,
		daysDifference,
		shape,
		timestamp: Date.now(),
	};
}

/**
 * Calculate term structure using specific front and back months
 *
 * @param frontChain - Front-month options chain
 * @param backChain - Back-month options chain
 * @param referenceDate - Reference date
 * @returns Term structure result or null
 */
export function calculateTermStructureSlopeSimple(
	frontChain: OptionsChain,
	backChain: OptionsChain,
	referenceDate: Date = new Date(),
): TermStructureResult | null {
	return calculateTermStructureSlope([frontChain, backChain], referenceDate);
}

/**
 * Classify term structure shape
 *
 * @param slope - IV change per day
 * @returns Shape classification
 */
export function classifyTermStructureShape(slope: number): TermStructureShape {
	// Thresholds in IV per day
	// 0.001 per day ≈ 3% IV difference over 30 days
	if (slope > 0.001) {
		return "steep_contango";
	}
	if (slope > 0.0002) {
		return "contango";
	}
	if (slope >= -0.0002) {
		return "flat";
	}
	if (slope >= -0.001) {
		return "backwardation";
	}
	return "steep_backwardation";
}

/**
 * Calculate weighted average IV across term structure
 *
 * Weights shorter expirations more heavily.
 *
 * @param points - Term structure points
 * @returns Weighted average IV
 */
export function calculateWeightedAverageIV(points: TermStructurePoint[]): number | null {
	if (points.length === 0) {
		return null;
	}

	// Use inverse days as weights (shorter = more weight)
	let weightedSum = 0;
	let totalWeight = 0;

	for (const point of points) {
		if (point.daysToExpiry <= 0) {
			continue;
		}

		const weight = 1 / point.daysToExpiry;
		weightedSum += point.atmIV * weight;
		totalWeight += weight;
	}

	if (totalWeight === 0) {
		return null;
	}

	return weightedSum / totalWeight;
}

/**
 * Find kink points in term structure
 *
 * Kinks indicate specific event dates (earnings, FOMC, etc.)
 *
 * @param points - Term structure points (sorted by DTE)
 * @param threshold - Minimum IV jump to consider a kink (default: 0.02 = 2%)
 * @returns Array of kink points
 */
export function findTermStructureKinks(
	points: TermStructurePoint[],
	threshold = 0.02,
): TermStructurePoint[] {
	if (points.length < 3) {
		return [];
	}

	const kinks: TermStructurePoint[] = [];

	for (let i = 1; i < points.length - 1; i++) {
		const prev = points[i - 1];
		const curr = points[i];
		const next = points[i + 1];

		if (!prev || !curr || !next) {
			continue;
		}

		// Check for local maximum (IV spike)
		const jumpFromPrev = curr.atmIV - prev.atmIV;
		const dropToNext = curr.atmIV - next.atmIV;

		if (jumpFromPrev > threshold && dropToNext > threshold * 0.5) {
			kinks.push(curr);
		}
	}

	return kinks;
}

/**
 * Calculate term structure curvature (second derivative)
 *
 * Positive curvature: Convex (smile shape)
 * Negative curvature: Concave
 *
 * @param points - Term structure points
 * @returns Curvature metric or null
 */
export function calculateTermStructureCurvature(points: TermStructurePoint[]): number | null {
	if (points.length < 3) {
		return null;
	}

	// Use three points for second derivative approximation
	const p1 = points[0];
	const p2 = points[Math.floor(points.length / 2)];
	const p3 = points[points.length - 1];

	if (!p1 || !p2 || !p3) {
		return null;
	}

	const d1 = p2.daysToExpiry - p1.daysToExpiry;
	const d2 = p3.daysToExpiry - p2.daysToExpiry;

	if (d1 <= 0 || d2 <= 0) {
		return null;
	}

	// First derivatives
	const slope1 = (p2.atmIV - p1.atmIV) / d1;
	const slope2 = (p3.atmIV - p2.atmIV) / d2;

	// Second derivative (curvature)
	const avgD = (d1 + d2) / 2;
	return (slope2 - slope1) / avgD;
}
