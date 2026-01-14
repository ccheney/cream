/**
 * Implied Volatility Solver
 *
 * Calculates implied volatility from option prices using Newton-Raphson method.
 * Uses Black-Scholes model for European-style options.
 *
 * @see https://en.wikipedia.org/wiki/Newton%27s_method
 */

import { normalCDF, normalPDF, type OptionType } from "./greeks";

// ============================================
// Types
// ============================================

export interface IVSolverInput {
	/** Market price of the option */
	optionPrice: number;
	/** Current price of the underlying */
	underlyingPrice: number;
	/** Strike price */
	strike: number;
	/** Time to expiration in years */
	timeToExpiration: number;
	/** Option type (CALL or PUT) */
	optionType: OptionType;
	/** Risk-free rate (default: 0.05 for 5%) */
	riskFreeRate?: number;
}

export interface IVSolverResult {
	/** Implied volatility (e.g., 0.25 for 25%) */
	impliedVolatility: number;
	/** Number of iterations to converge */
	iterations: number;
	/** Whether the solver converged */
	converged: boolean;
}

// ============================================
// Constants
// ============================================

const DEFAULT_RISK_FREE_RATE = 0.05;
const MAX_ITERATIONS = 100;
const PRECISION = 1e-8;
const MIN_IV = 0.001; // 0.1%
const MAX_IV = 5.0; // 500%
const INITIAL_IV_GUESS = 0.25; // 25%

// ============================================
// Black-Scholes Price Calculation
// ============================================

/**
 * Calculate Black-Scholes option price.
 */
function blackScholesPrice(
	S: number, // Spot price
	K: number, // Strike
	T: number, // Time to expiry (years)
	r: number, // Risk-free rate
	sigma: number, // Volatility
	optionType: OptionType
): number {
	if (T <= 0) {
		// At expiration, return intrinsic value
		return optionType === "CALL" ? Math.max(S - K, 0) : Math.max(K - S, 0);
	}

	if (sigma <= 0) {
		const pv = Math.exp(-r * T);
		return optionType === "CALL" ? Math.max(S - K * pv, 0) : Math.max(K * pv - S, 0);
	}

	const sqrtT = Math.sqrt(T);
	const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
	const d2 = d1 - sigma * sqrtT;

	const Nd1 = normalCDF(d1);
	const Nd2 = normalCDF(d2);
	const expRT = Math.exp(-r * T);

	if (optionType === "CALL") {
		return S * Nd1 - K * expRT * Nd2;
	} else {
		return K * expRT * (1 - Nd2) - S * (1 - Nd1);
	}
}

/**
 * Calculate vega (sensitivity of option price to volatility).
 * Vega is the same for calls and puts.
 */
function blackScholesVega(
	S: number, // Spot price
	K: number, // Strike
	T: number, // Time to expiry (years)
	r: number, // Risk-free rate
	sigma: number // Volatility
): number {
	if (T <= 0 || sigma <= 0) {
		return 0;
	}

	const sqrtT = Math.sqrt(T);
	const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);

	return S * sqrtT * normalPDF(d1);
}

// ============================================
// Newton-Raphson IV Solver
// ============================================

/**
 * Solve for implied volatility using Newton-Raphson method.
 *
 * Newton-Raphson iteratively refines IV guess using:
 *   IV_new = IV_old - (BS_price(IV_old) - market_price) / vega(IV_old)
 *
 * @param input - Option parameters and market price
 * @returns Implied volatility result
 *
 * @example
 * ```typescript
 * const result = solveIV({
 *   optionPrice: 5.50,
 *   underlyingPrice: 150,
 *   strike: 155,
 *   timeToExpiration: 30 / 365, // 30 days
 *   optionType: "CALL",
 * });
 *
 * console.log(result.impliedVolatility); // e.g., 0.28 (28%)
 * ```
 */
export function solveIV(input: IVSolverInput): IVSolverResult {
	const {
		optionPrice,
		underlyingPrice: S,
		strike: K,
		timeToExpiration: T,
		optionType,
		riskFreeRate: r = DEFAULT_RISK_FREE_RATE,
	} = input;

	// Edge case: expired option
	if (T <= 0) {
		return {
			impliedVolatility: 0,
			iterations: 0,
			converged: true,
		};
	}

	// Edge case: price below discounted intrinsic value
	// For European options with non-zero interest rates:
	// - Call lower bound: max(S - K*exp(-rT), 0)
	// - Put lower bound: max(K*exp(-rT) - S, 0)
	const discountFactor = Math.exp(-r * T);
	const discountedIntrinsic =
		optionType === "CALL"
			? Math.max(S - K * discountFactor, 0)
			: Math.max(K * discountFactor - S, 0);

	if (optionPrice < discountedIntrinsic - PRECISION) {
		return {
			impliedVolatility: MIN_IV,
			iterations: 0,
			converged: false,
		};
	}

	// Edge case: price is essentially zero
	if (optionPrice < PRECISION) {
		return {
			impliedVolatility: MIN_IV,
			iterations: 0,
			converged: true,
		};
	}

	// Start with initial guess
	let sigma = INITIAL_IV_GUESS;

	for (let i = 0; i < MAX_ITERATIONS; i++) {
		const bsPrice = blackScholesPrice(S, K, T, r, sigma, optionType);
		const diff = bsPrice - optionPrice;

		// Check convergence
		if (Math.abs(diff) < PRECISION) {
			return {
				impliedVolatility: sigma,
				iterations: i + 1,
				converged: true,
			};
		}

		// Calculate vega for Newton-Raphson step
		const vega = blackScholesVega(S, K, T, r, sigma);

		// Vega too small - use bisection fallback
		if (Math.abs(vega) < PRECISION) {
			// Adjust sigma based on price difference
			if (diff > 0) {
				sigma *= 0.8;
			} else {
				sigma *= 1.2;
			}
		} else {
			// Newton-Raphson step
			sigma = sigma - diff / vega;
		}

		// Keep sigma in bounds
		sigma = Math.max(MIN_IV, Math.min(MAX_IV, sigma));
	}

	// Did not converge, return best estimate
	return {
		impliedVolatility: sigma,
		iterations: MAX_ITERATIONS,
		converged: false,
	};
}

/**
 * Calculate IV from mid-price of bid/ask spread.
 * Returns null if IV cannot be calculated.
 */
export function solveIVFromQuote(
	bidPrice: number,
	askPrice: number,
	underlyingPrice: number,
	strike: number,
	timeToExpiration: number,
	optionType: OptionType,
	riskFreeRate = DEFAULT_RISK_FREE_RATE
): number | null {
	// Use mid price
	const midPrice = (bidPrice + askPrice) / 2;

	// Skip if prices are invalid
	if (midPrice <= 0 || bidPrice <= 0 || askPrice <= 0) {
		return null;
	}

	// Skip if spread is too wide (> 50% of mid)
	const spreadPct = (askPrice - bidPrice) / midPrice;
	if (spreadPct > 0.5) {
		return null;
	}

	const result = solveIV({
		optionPrice: midPrice,
		underlyingPrice,
		strike,
		timeToExpiration,
		optionType,
		riskFreeRate,
	});

	return result.converged ? result.impliedVolatility : null;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Parse OCC option symbol to extract components.
 * Format: ROOT + YYMMDD + C/P + Strike*1000 (8 digits)
 *
 * @example
 * parseOptionSymbol("AAPL240315C00172500")
 * // { root: "AAPL", expiry: "2024-03-15", type: "CALL", strike: 172.5 }
 */
export function parseOptionSymbol(symbol: string): {
	root: string;
	expiry: string;
	type: OptionType;
	strike: number;
} | null {
	// OCC symbol: ROOT (1-6 chars) + YYMMDD (6) + C/P (1) + Strike (8)
	// Minimum length: 1 + 6 + 1 + 8 = 16
	if (symbol.length < 16) {
		return null;
	}

	// Strike is last 8 characters
	const strikeStr = symbol.slice(-8);
	const strike = Number.parseInt(strikeStr, 10) / 1000;

	// Option type is the character before strike
	const typeChar = symbol.slice(-9, -8).toUpperCase();
	const type: OptionType = typeChar === "C" ? "CALL" : "PUT";

	// Date is 6 characters before type
	const dateStr = symbol.slice(-15, -9);
	const year = 2000 + Number.parseInt(dateStr.slice(0, 2), 10);
	const month = dateStr.slice(2, 4);
	const day = dateStr.slice(4, 6);
	const expiry = `${year}-${month}-${day}`;

	// Root is everything before the date
	const root = symbol.slice(0, -15);

	if (root.length === 0 || Number.isNaN(strike)) {
		return null;
	}

	return { root, expiry, type, strike };
}

/**
 * Calculate time to expiration in years.
 */
export function timeToExpiry(expiryDate: string | Date): number {
	const expiry = typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate;
	const now = new Date();

	// Calculate difference in milliseconds
	const diffMs = expiry.getTime() - now.getTime();

	// Convert to years (use 365.25 days)
	const years = diffMs / (365.25 * 24 * 60 * 60 * 1000);

	// Return 0 if expired
	return Math.max(0, years);
}

/**
 * Build an OCC option symbol.
 *
 * @example
 * buildOptionSymbol("AAPL", "2024-03-15", "CALL", 172.5)
 * // "AAPL240315C00172500"
 */
export function buildOptionSymbol(
	root: string,
	expiry: string | Date,
	type: OptionType,
	strike: number
): string {
	const expiryDate = typeof expiry === "string" ? new Date(expiry) : expiry;

	const yy = String(expiryDate.getFullYear()).slice(-2);
	const mm = String(expiryDate.getMonth() + 1).padStart(2, "0");
	const dd = String(expiryDate.getDate()).padStart(2, "0");

	const typeChar = type === "CALL" ? "C" : "P";
	const strikeStr = String(Math.round(strike * 1000)).padStart(8, "0");

	return `${root.toUpperCase()}${yy}${mm}${dd}${typeChar}${strikeStr}`;
}

export default {
	solveIV,
	solveIVFromQuote,
	parseOptionSymbol,
	timeToExpiry,
	buildOptionSymbol,
};
