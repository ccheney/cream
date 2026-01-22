/**
 * Options Greeks Calculation and Portfolio Aggregation
 *
 * Implements Black-Scholes Greeks calculation for European-style options
 * and portfolio-level aggregation for risk management.
 *
 * @see docs/plans/03-market-snapshot.md - Options Greeks Exposure (lines 471-484)
 */

// ============================================
// Types
// ============================================

/**
 * Option type (call or put)
 */
export type OptionType = "CALL" | "PUT";

/**
 * Individual option position
 */
export interface OptionPosition {
	/** Symbol (e.g., "AAPL") */
	symbol: string;
	/** Number of contracts (positive = long, negative = short) */
	contracts: number;
	/** Strike price */
	strike: number;
	/** Current underlying price */
	underlyingPrice: number;
	/** Time to expiration in years (e.g., 30 days = 30/365) */
	timeToExpiration: number;
	/** Implied volatility (e.g., 0.25 for 25%) */
	impliedVolatility: number;
	/** Option type */
	optionType: OptionType;
	/** Contract multiplier (default 100) */
	multiplier?: number;
	/** Risk-free rate (default 0) */
	riskFreeRate?: number;
}

/**
 * Greeks for a single option
 */
export interface OptionGreeks {
	/** Delta: change in option price per $1 change in underlying */
	delta: number;
	/** Gamma: change in delta per $1 change in underlying */
	gamma: number;
	/** Theta: change in option price per day (negative = time decay) */
	theta: number;
	/** Vega: change in option price per 1% change in volatility */
	vega: number;
	/** Rho: change in option price per 1% change in interest rates */
	rho: number;
	/** Theoretical option price */
	theoreticalPrice: number;
}

/**
 * Portfolio-level options exposure
 */
export interface OptionsExposure {
	/** Delta-adjusted notional: sum(contracts × multiplier × delta × underlyingPrice) */
	deltaNotional: number;
	/** Total gamma exposure: sum(contracts × multiplier × gamma) */
	totalGamma: number;
	/** Total vega exposure: sum(contracts × multiplier × vega) */
	totalVega: number;
	/** Total theta exposure: sum(contracts × multiplier × theta) */
	totalTheta: number;
	/** Total rho exposure: sum(contracts × multiplier × rho) */
	totalRho: number;
	/** Number of positions */
	positionCount: number;
	/** Total contracts (absolute) */
	totalContracts: number;
	/** Breakdown by symbol */
	bySymbol: Map<string, SymbolExposure>;
}

/**
 * Exposure breakdown for a single symbol
 */
export interface SymbolExposure {
	symbol: string;
	deltaNotional: number;
	gamma: number;
	vega: number;
	theta: number;
	rho: number;
	contracts: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MULTIPLIER = 100;
const DEFAULT_RISK_FREE_RATE = 0;
const DAYS_PER_YEAR = 365;

// ============================================
// Standard Normal Distribution
// ============================================

/**
 * Standard normal cumulative distribution function (CDF)
 * Uses Abramowitz and Stegun approximation (equation 7.1.26)
 * Maximum absolute error: 7.5×10^−8
 */
export function normalCDF(x: number): number {
	// Coefficients for the approximation
	const p = 0.2316419;
	const b1 = 0.31938153;
	const b2 = -0.356563782;
	const b3 = 1.781477937;
	const b4 = -1.821255978;
	const b5 = 1.330274429;

	const absX = Math.abs(x);
	const t = 1.0 / (1.0 + p * absX);
	const t2 = t * t;
	const t3 = t2 * t;
	const t4 = t3 * t;
	const t5 = t4 * t;

	// Standard normal PDF at absX
	const pdf = Math.exp(-0.5 * absX * absX) / Math.sqrt(2 * Math.PI);

	// Approximation for x >= 0
	const cdfPositive = 1.0 - pdf * (b1 * t + b2 * t2 + b3 * t3 + b4 * t4 + b5 * t5);

	// Use symmetry for negative x
	return x >= 0 ? cdfPositive : 1.0 - cdfPositive;
}

/**
 * Standard normal probability density function (PDF)
 */
export function normalPDF(x: number): number {
	return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ============================================
// Black-Scholes Greeks Calculation
// ============================================

/**
 * Calculate d1 and d2 for Black-Scholes
 */
function calculateD1D2(
	S: number, // Spot price
	K: number, // Strike price
	T: number, // Time to expiration
	r: number, // Risk-free rate
	sigma: number, // Volatility
): { d1: number; d2: number } {
	// Handle edge case: at or near expiration
	if (T <= 0) {
		return { d1: 0, d2: 0 };
	}

	const sqrtT = Math.sqrt(T);
	const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
	const d2 = d1 - sigma * sqrtT;

	return { d1, d2 };
}

/**
 * Calculate all Greeks for a single option using Black-Scholes model.
 *
 * @param position - Option position details
 * @returns Greeks values for the option
 */
export function calculateGreeks(position: OptionPosition): OptionGreeks {
	const {
		strike: K,
		underlyingPrice: S,
		timeToExpiration: T,
		impliedVolatility: sigma,
		optionType,
		riskFreeRate: r = DEFAULT_RISK_FREE_RATE,
	} = position;

	// Handle edge case: expired option
	if (T <= 0) {
		const isCall = optionType === "CALL";
		const intrinsicValue = isCall ? Math.max(S - K, 0) : Math.max(K - S, 0);
		const delta = isCall ? (S > K ? 1 : 0) : S < K ? -1 : 0;

		return {
			delta,
			gamma: 0,
			theta: 0,
			vega: 0,
			rho: 0,
			theoreticalPrice: intrinsicValue,
		};
	}

	// Handle edge case: zero volatility
	if (sigma <= 0) {
		const isCall = optionType === "CALL";
		const pv = Math.exp(-r * T);
		const intrinsicValue = isCall ? Math.max(S - K * pv, 0) : Math.max(K * pv - S, 0);
		const delta = isCall ? (S > K * pv ? 1 : 0) : S < K * pv ? -1 : 0;

		return {
			delta,
			gamma: 0,
			theta: 0,
			vega: 0,
			rho: 0,
			theoreticalPrice: intrinsicValue,
		};
	}

	const { d1, d2 } = calculateD1D2(S, K, T, r, sigma);
	const sqrtT = Math.sqrt(T);
	const expRT = Math.exp(-r * T);

	const Nd1 = normalCDF(d1);
	const Nd2 = normalCDF(d2);
	const nd1 = normalPDF(d1);

	const isCall = optionType === "CALL";

	// Delta
	let delta: number;
	if (isCall) {
		delta = Nd1;
	} else {
		delta = Nd1 - 1;
	}

	// Gamma (same for calls and puts)
	const gamma = nd1 / (S * sigma * sqrtT);

	// Theta (time decay per day)
	let theta: number;
	const thetaTerm1 = -(S * nd1 * sigma) / (2 * sqrtT);
	if (isCall) {
		theta = thetaTerm1 - r * K * expRT * Nd2;
	} else {
		theta = thetaTerm1 + r * K * expRT * (1 - Nd2);
	}
	// Convert to per-day (from per-year)
	theta = theta / DAYS_PER_YEAR;

	// Vega (per 1% change in volatility)
	const vega = (S * sqrtT * nd1) / 100; // Divide by 100 for 1% change

	// Rho (per 1% change in interest rate)
	let rho: number;
	if (isCall) {
		rho = (K * T * expRT * Nd2) / 100;
	} else {
		rho = (-K * T * expRT * (1 - Nd2)) / 100;
	}

	// Theoretical price
	let theoreticalPrice: number;
	if (isCall) {
		theoreticalPrice = S * Nd1 - K * expRT * Nd2;
	} else {
		theoreticalPrice = K * expRT * (1 - Nd2) - S * (1 - Nd1);
	}

	return {
		delta,
		gamma,
		theta,
		vega,
		rho,
		theoreticalPrice: Math.max(theoreticalPrice, 0),
	};
}

// ============================================
// Portfolio Aggregation
// ============================================

/**
 * Calculate portfolio-level options exposure.
 *
 * @param positions - Array of option positions
 * @returns Aggregated options exposure
 */
export function calculateOptionsExposure(positions: OptionPosition[]): OptionsExposure {
	const bySymbol = new Map<string, SymbolExposure>();

	let totalDeltaNotional = 0;
	let totalGamma = 0;
	let totalVega = 0;
	let totalTheta = 0;
	let totalRho = 0;
	let totalContracts = 0;

	for (const position of positions) {
		const multiplier = position.multiplier ?? DEFAULT_MULTIPLIER;
		const greeks = calculateGreeks(position);

		// Position-level values (contracts can be negative for shorts)
		const positionMultiplier = position.contracts * multiplier;
		const deltaNotional = positionMultiplier * greeks.delta * position.underlyingPrice;
		const gamma = positionMultiplier * greeks.gamma;
		const vega = positionMultiplier * greeks.vega;
		const theta = positionMultiplier * greeks.theta;
		const rho = positionMultiplier * greeks.rho;

		// Add to totals
		totalDeltaNotional += deltaNotional;
		totalGamma += gamma;
		totalVega += vega;
		totalTheta += theta;
		totalRho += rho;
		totalContracts += Math.abs(position.contracts);

		// Add to symbol breakdown
		const existing = bySymbol.get(position.symbol);
		if (existing) {
			existing.deltaNotional += deltaNotional;
			existing.gamma += gamma;
			existing.vega += vega;
			existing.theta += theta;
			existing.rho += rho;
			existing.contracts += position.contracts;
		} else {
			bySymbol.set(position.symbol, {
				symbol: position.symbol,
				deltaNotional,
				gamma,
				vega,
				theta,
				rho,
				contracts: position.contracts,
			});
		}
	}

	return {
		deltaNotional: totalDeltaNotional,
		totalGamma,
		totalVega,
		totalTheta,
		totalRho,
		positionCount: positions.length,
		totalContracts,
		bySymbol,
	};
}

/**
 * Create an empty options exposure (for portfolios with no options).
 */
export function createEmptyExposure(): OptionsExposure {
	return {
		deltaNotional: 0,
		totalGamma: 0,
		totalVega: 0,
		totalTheta: 0,
		totalRho: 0,
		positionCount: 0,
		totalContracts: 0,
		bySymbol: new Map(),
	};
}

// ============================================
// Utility Functions
// ============================================

/**
 * Convert days to years for time to expiration.
 */
export function daysToYears(days: number): number {
	return days / DAYS_PER_YEAR;
}

/**
 * Calculate moneyness (S/K ratio).
 */
export function calculateMoneyness(spotPrice: number, strike: number): number {
	return spotPrice / strike;
}

/**
 * Determine if option is ITM, ATM, or OTM.
 */
export function getMoneyStatus(
	spotPrice: number,
	strike: number,
	optionType: OptionType,
): "ITM" | "ATM" | "OTM" {
	const threshold = 0.02; // 2% threshold for ATM
	const ratio = spotPrice / strike;

	if (Math.abs(ratio - 1) < threshold) {
		return "ATM";
	}

	if (optionType === "CALL") {
		return ratio > 1 ? "ITM" : "OTM";
	} else {
		return ratio < 1 ? "ITM" : "OTM";
	}
}

/**
 * Format exposure for display.
 */
export function formatExposure(exposure: OptionsExposure): string {
	const format = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

	return [
		`Delta Notional: $${format(exposure.deltaNotional)}`,
		`Total Gamma: ${format(exposure.totalGamma)}`,
		`Total Vega: ${format(exposure.totalVega)}`,
		`Total Theta: ${format(exposure.totalTheta)}/day`,
		`Total Rho: ${format(exposure.totalRho)}`,
		`Positions: ${exposure.positionCount}`,
		`Contracts: ${exposure.totalContracts}`,
	].join("\n");
}

// ============================================
// Exports
// ============================================

export default {
	calculateGreeks,
	calculateOptionsExposure,
	createEmptyExposure,
	normalCDF,
	normalPDF,
	daysToYears,
	calculateMoneyness,
	getMoneyStatus,
	formatExposure,
};
