/**
 * Bid-Ask Spread Calculator
 *
 * Measures market liquidity through the difference between best bid and ask prices.
 * The bid-ask spread is a key indicator of transaction costs and market depth.
 *
 * Theoretical Foundation:
 * - Amihud & Mendelson (1986): "Asset Pricing and the Bid-Ask Spread"
 *   Establishes that bid-ask spread affects expected returns as a transaction cost
 * - Kyle (1985): Market microstructure and price formation
 *
 * Formulas:
 * - Absolute Spread: Ask - Bid
 * - Percentage Spread: (Ask - Bid) / Midpoint * 100
 * - Midpoint: (Ask + Bid) / 2
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { Quote } from "../../types";

export interface BidAskSpreadResult {
	/** Absolute spread in price units */
	spread: number;
	/** Spread as percentage of midpoint */
	spreadPct: number;
	/** Midpoint price */
	midpoint: number;
	/** Timestamp of the quote */
	timestamp: number;
}

/**
 * Calculate bid-ask spread from a quote
 *
 * @param quote - Quote with bid/ask prices
 * @returns Spread metrics or null if quote is invalid
 *
 * @example
 * ```typescript
 * const quote = { bidPrice: 100.00, askPrice: 100.05, bidSize: 100, askSize: 200, timestamp: Date.now() };
 * const result = calculateBidAskSpread(quote);
 * // result.spread = 0.05
 * // result.spreadPct = 0.04998... (approx 0.05%)
 * // result.midpoint = 100.025
 * ```
 */
export function calculateBidAskSpread(quote: Quote): BidAskSpreadResult | null {
	const { bidPrice, askPrice, timestamp } = quote;

	// Validate quote
	if (bidPrice <= 0 || askPrice <= 0) {
		return null;
	}

	if (askPrice < bidPrice) {
		// Crossed quote - invalid market state
		return null;
	}

	const spread = askPrice - bidPrice;
	const midpoint = (askPrice + bidPrice) / 2;
	const spreadPct = midpoint > 0 ? (spread / midpoint) * 100 : 0;

	return {
		spread,
		spreadPct,
		midpoint,
		timestamp,
	};
}

/**
 * Calculate average bid-ask spread over multiple quotes
 *
 * Useful for computing time-weighted average spread (TWAS)
 *
 * @param quotes - Array of quotes (oldest first)
 * @returns Average spread metrics or null if no valid quotes
 */
export function calculateAverageBidAskSpread(quotes: Quote[]): BidAskSpreadResult | null {
	const validResults = quotes
		.map((q) => calculateBidAskSpread(q))
		.filter((r): r is BidAskSpreadResult => r !== null);

	if (validResults.length === 0) {
		return null;
	}

	const avgSpread = validResults.reduce((sum, r) => sum + r.spread, 0) / validResults.length;
	const avgSpreadPct = validResults.reduce((sum, r) => sum + r.spreadPct, 0) / validResults.length;
	const avgMidpoint = validResults.reduce((sum, r) => sum + r.midpoint, 0) / validResults.length;
	const latestTimestamp = validResults[validResults.length - 1]?.timestamp ?? Date.now();

	return {
		spread: avgSpread,
		spreadPct: avgSpreadPct,
		midpoint: avgMidpoint,
		timestamp: latestTimestamp,
	};
}

/**
 * Classify spread quality based on percentage
 *
 * Categories based on typical equity market standards:
 * - Tight: < 0.05% (highly liquid large caps)
 * - Normal: 0.05% - 0.20% (liquid mid-caps)
 * - Wide: 0.20% - 0.50% (less liquid)
 * - Very Wide: > 0.50% (illiquid/small caps)
 */
export type SpreadQuality = "tight" | "normal" | "wide" | "very_wide";

export function classifySpreadQuality(spreadPct: number): SpreadQuality {
	if (spreadPct < 0.05) {
		return "tight";
	}
	if (spreadPct < 0.2) {
		return "normal";
	}
	if (spreadPct < 0.5) {
		return "wide";
	}
	return "very_wide";
}
