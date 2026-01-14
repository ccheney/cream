/**
 * IV Skew Calculator
 *
 * IV Skew measures the asymmetry in implied volatility across strike prices.
 * Typically calculated as the difference between OTM put IV and OTM call IV
 * at equivalent delta levels (e.g., 25-delta).
 *
 * Theoretical Foundation:
 * - Rubinstein (1994): "Implied Binomial Trees" - Documents volatility smile
 * - Bates (1991): "The Crash of '87" - Explains put skew as crash protection pricing
 *
 * Interpretation:
 * - Positive skew (puts > calls): Market pricing in downside risk
 * - Negative skew (calls > puts): Market pricing in upside potential
 * - Magnitude indicates strength of directional fear/greed
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import { z } from "zod";

// ============================================================
// TYPES
// ============================================================

/**
 * Single options contract with relevant Greeks and IV
 */
export const OptionsContractSchema = z.object({
	symbol: z.string(),
	underlyingSymbol: z.string(),
	strike: z.number(),
	expiration: z.string().describe("Option expiration date in ISO format (YYYY-MM-DD)"),
	optionType: z.enum(["call", "put"]),
	impliedVolatility: z.number(),
	delta: z.number(),
	gamma: z.number().optional(),
	theta: z.number().optional(),
	vega: z.number().optional(),
	openInterest: z.number().optional(),
	volume: z.number().optional(),
	bid: z.number().optional(),
	ask: z.number().optional(),
});
export type OptionsContract = z.infer<typeof OptionsContractSchema>;

/**
 * Options chain for a single expiration
 */
export interface OptionsChain {
	underlyingSymbol: string;
	underlyingPrice: number;
	expiration: string;
	calls: OptionsContract[];
	puts: OptionsContract[];
}

/**
 * Result from IV skew calculation
 */
export interface IVSkewResult {
	/** IV skew value (put IV - call IV at target delta) */
	skew: number;
	/** IV of the OTM put used */
	putIV: number;
	/** IV of the OTM call used */
	callIV: number;
	/** Delta level used for comparison */
	targetDelta: number;
	/** Strike of the put used */
	putStrike: number;
	/** Strike of the call used */
	callStrike: number;
	/** Expiration date used */
	expiration: string;
	/** Timestamp of calculation */
	timestamp: number;
}

/**
 * Multi-expiration skew result
 */
export interface SkewTermStructure {
	/** Underlying symbol */
	symbol: string;
	/** Skew by expiration */
	expirations: Array<{
		expiration: string;
		daysToExpiry: number;
		skew: number;
	}>;
	/** Average skew across term structure */
	avgSkew: number;
	/** Timestamp */
	timestamp: number;
}

// ============================================================
// CALCULATORS
// ============================================================

/**
 * Find contract closest to target delta
 *
 * For puts, delta is negative, so we compare absolute values.
 * For calls, delta is positive.
 */
function findContractByDelta(
	contracts: OptionsContract[],
	targetDelta: number,
	optionType: "call" | "put"
): OptionsContract | null {
	if (contracts.length === 0) {
		return null;
	}

	const targetAbsDelta = Math.abs(targetDelta);

	let closest: OptionsContract | null = null;
	let minDiff = Infinity;

	for (const contract of contracts) {
		if (contract.optionType !== optionType) {
			continue;
		}
		if (contract.impliedVolatility <= 0) {
			continue;
		}

		const absDelta = Math.abs(contract.delta);
		const diff = Math.abs(absDelta - targetAbsDelta);

		if (diff < minDiff) {
			minDiff = diff;
			closest = contract;
		}
	}

	return closest;
}

/**
 * Calculate IV Skew for a single options chain (single expiration)
 *
 * IV Skew = Put IV (at target delta) - Call IV (at target delta)
 *
 * @param chain - Options chain with calls and puts
 * @param targetDelta - Delta level to compare (default: 0.25 for 25-delta)
 * @returns IV skew result or null if insufficient data
 *
 * @example
 * ```typescript
 * const chain = {
 *   underlyingSymbol: "AAPL",
 *   underlyingPrice: 175,
 *   expiration: "2024-01-19",
 *   calls: [...],
 *   puts: [...]
 * };
 * const result = calculateIVSkew(chain, 0.25);
 * // result.skew = 0.05 (5% higher IV in puts than calls)
 * ```
 */
export function calculateIVSkew(chain: OptionsChain, targetDelta = 0.25): IVSkewResult | null {
	if (targetDelta <= 0 || targetDelta >= 0.5) {
		return null;
	}

	// Find 25-delta (or target delta) put and call
	const otmPut = findContractByDelta(chain.puts, targetDelta, "put");
	const otmCall = findContractByDelta(chain.calls, targetDelta, "call");

	if (!otmPut || !otmCall) {
		return null;
	}

	const skew = otmPut.impliedVolatility - otmCall.impliedVolatility;

	return {
		skew,
		putIV: otmPut.impliedVolatility,
		callIV: otmCall.impliedVolatility,
		targetDelta,
		putStrike: otmPut.strike,
		callStrike: otmCall.strike,
		expiration: chain.expiration,
		timestamp: Date.now(),
	};
}

/**
 * Calculate ATM IV (at-the-money implied volatility)
 *
 * Uses the average of ATM call and put IVs, or the option closest to 50 delta.
 *
 * @param chain - Options chain
 * @returns ATM IV or null if not calculable
 */
export function calculateATMIV(chain: OptionsChain): number | null {
	// Find options closest to ATM (50 delta)
	const atmCall = findContractByDelta(chain.calls, 0.5, "call");
	const atmPut = findContractByDelta(chain.puts, 0.5, "put");

	if (!atmCall && !atmPut) {
		return null;
	}

	if (atmCall && atmPut) {
		return (atmCall.impliedVolatility + atmPut.impliedVolatility) / 2;
	}

	return atmCall?.impliedVolatility ?? atmPut?.impliedVolatility ?? null;
}

/**
 * Calculate IV skew normalized by ATM IV
 *
 * Normalized skew = (Put IV - Call IV) / ATM IV
 *
 * This makes skew comparable across securities with different IV levels.
 *
 * @param chain - Options chain
 * @param targetDelta - Delta level for OTM options
 * @returns Normalized skew (e.g., 0.10 = 10% of ATM IV)
 */
export function calculateNormalizedSkew(chain: OptionsChain, targetDelta = 0.25): number | null {
	const skewResult = calculateIVSkew(chain, targetDelta);
	const atmIV = calculateATMIV(chain);

	if (!skewResult || !atmIV || atmIV <= 0) {
		return null;
	}

	return skewResult.skew / atmIV;
}

/**
 * Calculate skew term structure across multiple expirations
 *
 * Returns skew for each expiration to analyze how skew changes with time.
 *
 * @param chains - Array of option chains (different expirations)
 * @param targetDelta - Delta level for comparison
 * @param referenceDate - Reference date for days-to-expiry calculation
 * @returns Term structure of skew
 */
export function calculateSkewTermStructure(
	chains: OptionsChain[],
	targetDelta = 0.25,
	referenceDate: Date = new Date()
): SkewTermStructure | null {
	if (chains.length === 0) {
		return null;
	}

	const symbol = chains[0]?.underlyingSymbol;
	if (!symbol) {
		return null;
	}

	const expirations: SkewTermStructure["expirations"] = [];

	for (const chain of chains) {
		const skewResult = calculateIVSkew(chain, targetDelta);
		if (!skewResult) {
			continue;
		}

		const expiryDate = new Date(chain.expiration);
		const daysToExpiry = Math.max(
			0,
			Math.ceil((expiryDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24))
		);

		expirations.push({
			expiration: chain.expiration,
			daysToExpiry,
			skew: skewResult.skew,
		});
	}

	if (expirations.length === 0) {
		return null;
	}

	// Sort by days to expiry
	expirations.sort((a, b) => a.daysToExpiry - b.daysToExpiry);

	const avgSkew = expirations.reduce((sum, e) => sum + e.skew, 0) / expirations.length;

	return {
		symbol,
		expirations,
		avgSkew,
		timestamp: Date.now(),
	};
}

/**
 * Classify skew level
 */
export type SkewLevel = "extreme_bearish" | "bearish" | "neutral" | "bullish" | "extreme_bullish";

/**
 * Classify IV skew level
 *
 * Thresholds are approximate and depend on the underlying:
 * - Equity index options typically have persistent positive skew
 * - Individual stocks vary more
 *
 * @param skew - IV skew value (put IV - call IV)
 * @returns Classification
 */
export function classifySkew(skew: number): SkewLevel {
	if (skew > 0.1) {
		return "extreme_bearish";
	}
	if (skew > 0.03) {
		return "bearish";
	}
	if (skew >= -0.03) {
		return "neutral";
	}
	if (skew >= -0.1) {
		return "bullish";
	}
	return "extreme_bullish";
}
