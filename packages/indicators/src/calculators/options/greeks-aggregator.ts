/**
 * Greeks Aggregator for Portfolio Positions
 *
 * Aggregates option Greeks across a portfolio to provide net exposure metrics.
 * Essential for understanding overall portfolio risk from options positions.
 *
 * Greeks:
 * - Delta: Directional exposure (equivalent shares)
 * - Gamma: Rate of delta change (convexity)
 * - Theta: Time decay (daily $ decay)
 * - Vega: Volatility exposure ($ per 1% IV change)
 *
 * Aggregation:
 * - Sum raw Greeks for total exposure
 * - Weight by position size (contracts × 100 shares)
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import { z } from "zod";

// ============================================================
// TYPES
// ============================================================

/**
 * Single option position
 */
export const OptionPositionSchema = z.object({
	symbol: z.string().describe("OCC option symbol (e.g., AAPL240119C00185000)"),
	underlyingSymbol: z.string(),
	optionType: z.enum(["call", "put"]),
	strike: z.number(),
	expiration: z.string().describe("Option expiration date in ISO format (YYYY-MM-DD)"),
	quantity: z.number().describe("Number of contracts: positive=long, negative=short"),
	delta: z.number(),
	gamma: z.number(),
	theta: z.number(),
	vega: z.number(),
	impliedVolatility: z.number().optional(),
	currentPrice: z.number().optional(),
	underlyingPrice: z.number().optional(),
});
export type OptionPosition = z.infer<typeof OptionPositionSchema>;

/**
 * Stock position (for delta-adjusted calculations)
 */
export interface StockPosition {
	symbol: string;
	quantity: number; // Shares
	currentPrice: number;
}

/**
 * Aggregated Greeks result
 */
export interface AggregatedGreeksResult {
	/** Net delta exposure (equivalent shares) */
	netDelta: number;
	/** Net dollar delta (delta × underlying price) */
	dollarDelta: number;
	/** Net gamma (delta change per $1 underlying move) */
	netGamma: number;
	/** Net dollar gamma (gamma × underlying price²) */
	dollarGamma: number;
	/** Net theta (daily time decay in $) */
	netTheta: number;
	/** Net vega ($ exposure per 1% IV change) */
	netVega: number;
	/** Breakdown by underlying */
	byUnderlying: Map<string, UnderlyingGreeks>;
	/** Number of positions included */
	positionCount: number;
	/** Timestamp */
	timestamp: number;
}

/**
 * Greeks for a single underlying
 */
export interface UnderlyingGreeks {
	symbol: string;
	underlyingPrice: number | null;
	netDelta: number;
	netGamma: number;
	netTheta: number;
	netVega: number;
	callDelta: number;
	putDelta: number;
	optionPositions: number;
	stockShares: number;
}

/**
 * Portfolio risk summary
 */
export interface PortfolioRiskSummary {
	/** Portfolio-level Greeks */
	aggregated: AggregatedGreeksResult;
	/** Largest delta exposures */
	topDeltaExposures: Array<{ symbol: string; delta: number }>;
	/** Largest gamma exposures */
	topGammaExposures: Array<{ symbol: string; gamma: number }>;
	/** Largest theta decay */
	topThetaDecay: Array<{ symbol: string; theta: number }>;
	/** Net delta as % of portfolio notional */
	deltaPctNotional: number | null;
}

// ============================================================
// AGGREGATION LOGIC
// ============================================================

const CONTRACT_MULTIPLIER = 100;

interface GreeksTotals {
	netDelta: number;
	dollarDelta: number;
	netGamma: number;
	dollarGamma: number;
	netTheta: number;
	netVega: number;
}

interface OptionContribution {
	positionDelta: number;
	positionGamma: number;
	positionTheta: number;
	positionVega: number;
	dollarDelta: number;
	dollarGamma: number;
}

function createEmptyTotals(): GreeksTotals {
	return {
		netDelta: 0,
		dollarDelta: 0,
		netGamma: 0,
		dollarGamma: 0,
		netTheta: 0,
		netVega: 0,
	};
}

function createUnderlyingGreeks(symbol: string, underlyingPrice: number | null): UnderlyingGreeks {
	return {
		symbol,
		underlyingPrice,
		netDelta: 0,
		netGamma: 0,
		netTheta: 0,
		netVega: 0,
		callDelta: 0,
		putDelta: 0,
		optionPositions: 0,
		stockShares: 0,
	};
}

function getOrCreateUnderlying(
	byUnderlying: Map<string, UnderlyingGreeks>,
	symbol: string,
	defaultUnderlyingPrice: number | null,
): UnderlyingGreeks {
	const existing = byUnderlying.get(symbol);
	if (existing) {
		return existing;
	}

	const created = createUnderlyingGreeks(symbol, defaultUnderlyingPrice);
	byUnderlying.set(symbol, created);
	return created;
}

function calculateOptionContribution(position: OptionPosition): OptionContribution {
	const signedQuantity = position.quantity;
	const positionDelta = position.delta * signedQuantity * CONTRACT_MULTIPLIER;
	const positionGamma = position.gamma * signedQuantity * CONTRACT_MULTIPLIER;
	const positionTheta = position.theta * signedQuantity * CONTRACT_MULTIPLIER;
	const positionVega = position.vega * signedQuantity * CONTRACT_MULTIPLIER;
	const underlyingPrice = position.underlyingPrice ?? 0;

	return {
		positionDelta,
		positionGamma,
		positionTheta,
		positionVega,
		dollarDelta: positionDelta * underlyingPrice,
		dollarGamma: positionGamma * underlyingPrice * underlyingPrice,
	};
}

function applyOptionToTotals(totals: GreeksTotals, contribution: OptionContribution): void {
	totals.netDelta += contribution.positionDelta;
	totals.dollarDelta += contribution.dollarDelta;
	totals.netGamma += contribution.positionGamma;
	totals.dollarGamma += contribution.dollarGamma;
	totals.netTheta += contribution.positionTheta;
	totals.netVega += contribution.positionVega;
}

function applyOptionToUnderlying(
	underlyingData: UnderlyingGreeks,
	position: OptionPosition,
	contribution: OptionContribution,
): void {
	underlyingData.netDelta += contribution.positionDelta;
	underlyingData.netGamma += contribution.positionGamma;
	underlyingData.netTheta += contribution.positionTheta;
	underlyingData.netVega += contribution.positionVega;
	underlyingData.optionPositions += Math.abs(position.quantity);

	if (position.underlyingPrice) {
		underlyingData.underlyingPrice = position.underlyingPrice;
	}

	if (position.optionType === "call") {
		underlyingData.callDelta += contribution.positionDelta;
		return;
	}

	underlyingData.putDelta += contribution.positionDelta;
}

function applyStockToTotalsAndUnderlying(
	totals: GreeksTotals,
	byUnderlying: Map<string, UnderlyingGreeks>,
	stock: StockPosition,
): void {
	const stockDelta = stock.quantity;
	totals.netDelta += stockDelta;
	totals.dollarDelta += stock.quantity * stock.currentPrice;

	const underlyingData = getOrCreateUnderlying(byUnderlying, stock.symbol, stock.currentPrice);
	underlyingData.netDelta += stockDelta;
	underlyingData.stockShares += stock.quantity;
	underlyingData.underlyingPrice = stock.currentPrice;
}

/**
 * Aggregate Greeks across option positions
 *
 * @param positions - Array of option positions
 * @param stockPositions - Optional stock positions for delta adjustment
 * @returns Aggregated Greeks result
 *
 * @example
 * ```typescript
 * const positions = [
 *   { symbol: "AAPL240119C00180000", underlyingSymbol: "AAPL", optionType: "call",
 *     strike: 180, expiration: "2024-01-19", quantity: 10, delta: 0.55,
 *     gamma: 0.02, theta: -0.05, vega: 0.15 },
 *   { symbol: "AAPL240119P00170000", underlyingSymbol: "AAPL", optionType: "put",
 *     strike: 170, expiration: "2024-01-19", quantity: -5, delta: -0.35,
 *     gamma: 0.018, theta: -0.04, vega: 0.12 }
 * ];
 * const result = aggregateGreeks(positions);
 * // result.netDelta = 550 + 175 = 725 (equivalent shares)
 * ```
 */
export function aggregateGreeks(
	positions: OptionPosition[],
	stockPositions: StockPosition[] = [],
): AggregatedGreeksResult {
	const byUnderlying = new Map<string, UnderlyingGreeks>();
	const totals = createEmptyTotals();

	for (const position of positions) {
		const contribution = calculateOptionContribution(position);
		applyOptionToTotals(totals, contribution);

		const underlyingData = getOrCreateUnderlying(
			byUnderlying,
			position.underlyingSymbol,
			position.underlyingPrice ?? null,
		);
		applyOptionToUnderlying(underlyingData, position, contribution);
	}

	for (const stock of stockPositions) {
		applyStockToTotalsAndUnderlying(totals, byUnderlying, stock);
	}

	return {
		netDelta: totals.netDelta,
		dollarDelta: totals.dollarDelta,
		netGamma: totals.netGamma,
		dollarGamma: totals.dollarGamma,
		netTheta: totals.netTheta,
		netVega: totals.netVega,
		byUnderlying,
		positionCount: positions.length + stockPositions.length,
		timestamp: Date.now(),
	};
}

/**
 * Calculate portfolio risk summary with top exposures
 *
 * @param positions - Option positions
 * @param stockPositions - Stock positions
 * @param portfolioNotional - Portfolio notional value for % calculations
 * @param topN - Number of top exposures to include
 * @returns Portfolio risk summary
 */
export function calculatePortfolioRiskSummary(
	positions: OptionPosition[],
	stockPositions: StockPosition[] = [],
	portfolioNotional: number | null = null,
	topN = 5,
): PortfolioRiskSummary {
	const aggregated = aggregateGreeks(positions, stockPositions);

	// Build sorted exposure lists
	const deltaExposures: Array<{ symbol: string; delta: number }> = [];
	const gammaExposures: Array<{ symbol: string; gamma: number }> = [];
	const thetaDecay: Array<{ symbol: string; theta: number }> = [];

	for (const [symbol, data] of aggregated.byUnderlying) {
		deltaExposures.push({ symbol, delta: data.netDelta });
		gammaExposures.push({ symbol, gamma: data.netGamma });
		thetaDecay.push({ symbol, theta: data.netTheta });
	}

	// Sort by absolute value, take top N
	deltaExposures.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
	gammaExposures.sort((a, b) => Math.abs(b.gamma) - Math.abs(a.gamma));
	thetaDecay.sort((a, b) => Math.abs(b.theta) - Math.abs(a.theta));

	const deltaPctNotional =
		portfolioNotional && portfolioNotional > 0
			? (aggregated.dollarDelta / portfolioNotional) * 100
			: null;

	return {
		aggregated,
		topDeltaExposures: deltaExposures.slice(0, topN),
		topGammaExposures: gammaExposures.slice(0, topN),
		topThetaDecay: thetaDecay.slice(0, topN),
		deltaPctNotional,
	};
}

/**
 * Calculate Greeks for a single underlying from positions
 */
export function aggregateGreeksForUnderlying(
	positions: OptionPosition[],
	underlyingSymbol: string,
	stockShares = 0,
	underlyingPriceParam: number | null = null,
): UnderlyingGreeks {
	const filtered = positions.filter((p) => p.underlyingSymbol === underlyingSymbol);

	let netDelta = stockShares; // Start with stock delta
	let netGamma = 0;
	let netTheta = 0;
	let netVega = 0;
	let callDelta = 0;
	let putDelta = 0;
	let optionPositions = 0;
	let underlyingPrice = underlyingPriceParam;

	for (const pos of filtered) {
		const contractMultiplier = 100;
		const positionDelta = pos.delta * pos.quantity * contractMultiplier;
		const positionGamma = pos.gamma * pos.quantity * contractMultiplier;
		const positionTheta = pos.theta * pos.quantity * contractMultiplier;
		const positionVega = pos.vega * pos.quantity * contractMultiplier;

		netDelta += positionDelta;
		netGamma += positionGamma;
		netTheta += positionTheta;
		netVega += positionVega;
		optionPositions += Math.abs(pos.quantity);

		if (pos.optionType === "call") {
			callDelta += positionDelta;
		} else {
			putDelta += positionDelta;
		}

		// Use position's underlying price if not provided
		if (underlyingPrice === null && pos.underlyingPrice) {
			underlyingPrice = pos.underlyingPrice;
		}
	}

	return {
		symbol: underlyingSymbol,
		underlyingPrice,
		netDelta,
		netGamma,
		netTheta,
		netVega,
		callDelta,
		putDelta,
		optionPositions,
		stockShares,
	};
}

/**
 * Calculate delta-neutral hedge ratio
 *
 * Returns number of shares to trade to neutralize delta exposure.
 *
 * @param currentDelta - Current net delta
 * @returns Shares to trade (negative = sell, positive = buy)
 */
export function calculateDeltaNeutralHedge(currentDelta: number): number {
	return -currentDelta;
}

/**
 * Calculate gamma scalping levels
 *
 * Returns the underlying price move needed to generate target delta change.
 *
 * @param currentGamma - Current net gamma
 * @param targetDeltaChange - Target delta change
 * @returns Required underlying price move
 */
export function calculateGammaScalpLevel(
	currentGamma: number,
	targetDeltaChange: number,
): number | null {
	if (currentGamma === 0) {
		return null;
	}
	return targetDeltaChange / currentGamma;
}
