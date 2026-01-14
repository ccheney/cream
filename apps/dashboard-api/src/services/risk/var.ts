/**
 * Value at Risk (VaR) Service
 *
 * Calculates portfolio VaR using historical simulation or parametric methods.
 *
 * @see docs/plans/ui/05-api-endpoints.md Risk section
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import type { AlpacaMarketDataClient } from "@cream/marketdata";
import { createAlpacaClientFromEnv, isAlpacaConfigured } from "@cream/marketdata";
import type { PositionForExposure } from "./types.js";

// ============================================
// Types
// ============================================

export interface VaRMetrics {
	/** 1-day VaR at 95% confidence ($) */
	oneDay95: number;
	/** 1-day VaR at 99% confidence ($) */
	oneDay99: number;
	/** 10-day VaR at 95% confidence ($) */
	tenDay95: number;
	/** Method used for calculation */
	method: "historical" | "parametric";
}

export interface CalculateVaROptions {
	/** Positions with market values */
	positions: PositionForExposure[];
	/** Portfolio NAV */
	nav: number;
	/** Lookback period in trading days (default: 252 - 1 year) */
	lookbackDays?: number;
	/** Preferred method (will fallback if data insufficient) */
	preferredMethod?: "historical" | "parametric";
}

// ============================================
// Constants
// ============================================

/** Z-scores for confidence levels (normal distribution) */
const Z_SCORES = {
	95: 1.645,
	99: 2.326,
};

/** Minimum data points required for historical VaR */
const MIN_HISTORICAL_DATA_POINTS = 50;

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate daily returns from close prices.
 */
function calculateReturns(prices: number[]): number[] {
	const returns: number[] = [];
	for (let i = 1; i < prices.length; i++) {
		const prev = prices[i - 1] ?? 0;
		const curr = prices[i] ?? 0;
		if (prev !== 0) {
			returns.push((curr - prev) / prev);
		}
	}
	return returns;
}

/**
 * Format date as YYYY-MM-DD.
 */
function formatDate(date: Date): string {
	const parts = date.toISOString().split("T");
	return parts[0] ?? "";
}

/**
 * Get date N trading days ago (approximation: calendar days * 1.4).
 */
function getFromDate(tradingDays: number): string {
	const calendarDays = Math.ceil(tradingDays * 1.4);
	const date = new Date();
	date.setDate(date.getDate() - calendarDays);
	return formatDate(date);
}

/**
 * Calculate portfolio returns from position weights and individual returns.
 */
function calculatePortfolioReturns(
	positions: PositionForExposure[],
	returnsBySymbol: Record<string, number[]>,
	nav: number
): number[] {
	// Determine the length of aligned return series
	const lengths = positions
		.map((p) => returnsBySymbol[p.symbol]?.length ?? 0)
		.filter((len) => len > 0);

	if (lengths.length === 0) {
		return [];
	}

	const minLength = Math.min(...lengths);
	if (minLength === 0) {
		return [];
	}

	// Calculate portfolio return for each day
	const portfolioReturns: number[] = [];

	for (let day = 0; day < minLength; day++) {
		let dayReturn = 0;

		for (const position of positions) {
			const marketValue = position.marketValue ?? 0;
			if (marketValue === 0 || nav === 0) {
				continue;
			}

			const weight = marketValue / nav;
			const symbolReturns = returnsBySymbol[position.symbol];
			const returnValue = symbolReturns?.[symbolReturns.length - minLength + day] ?? 0;

			// For short positions, invert the return
			const adjustedReturn = position.side === "SHORT" ? -returnValue : returnValue;
			dayReturn += weight * adjustedReturn;
		}

		portfolioReturns.push(dayReturn);
	}

	return portfolioReturns;
}

/**
 * Calculate VaR using historical simulation.
 */
function historicalVaR(
	portfolioReturns: number[],
	nav: number,
	confidence: number,
	holdingPeriod = 1
): number {
	if (portfolioReturns.length < MIN_HISTORICAL_DATA_POINTS) {
		return 0;
	}

	// Sort returns ascending (worst to best)
	const sortedReturns = portfolioReturns.toSorted((a, b) => a - b);

	// Find the percentile index
	const index = Math.floor((1 - confidence) * sortedReturns.length);
	const varPct = Math.abs(sortedReturns[index] ?? 0);

	// Scale for holding period using square-root-of-time rule
	const scaledVar = varPct * Math.sqrt(holdingPeriod);

	// Convert to dollar amount
	return scaledVar * nav;
}

/**
 * Calculate VaR using parametric (variance-covariance) method.
 */
function parametricVaR(
	portfolioReturns: number[],
	nav: number,
	confidence: number,
	holdingPeriod = 1
): number {
	if (portfolioReturns.length < 2) {
		return 0;
	}

	// Calculate portfolio standard deviation
	const n = portfolioReturns.length;
	const mean = portfolioReturns.reduce((sum, r) => sum + r, 0) / n;
	const squaredDiffs = portfolioReturns.map((r) => (r - mean) ** 2);
	const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (n - 1);
	const stdDev = Math.sqrt(variance);

	// Get z-score for confidence level
	const zScore = confidence >= 0.99 ? Z_SCORES[99] : Z_SCORES[95];

	// Calculate VaR
	return nav * stdDev * zScore * Math.sqrt(holdingPeriod);
}

// ============================================
// VaR Calculation Service
// ============================================

/**
 * Calculate VaR metrics for portfolio.
 *
 * @example
 * ```typescript
 * const var = await calculateVaR({
 *   positions: [
 *     { symbol: "AAPL", side: "LONG", quantity: 100, marketValue: 18500 },
 *     { symbol: "MSFT", side: "LONG", quantity: 50, marketValue: 21000 },
 *   ],
 *   nav: 100000,
 * });
 * // { oneDay95: 1234, oneDay99: 1789, tenDay95: 3901, method: "historical" }
 * ```
 */
export async function calculateVaR(options: CalculateVaROptions): Promise<VaRMetrics> {
	const { positions, nav, lookbackDays = 252, preferredMethod = "historical" } = options;

	// Handle empty portfolio
	if (positions.length === 0 || nav === 0) {
		return {
			oneDay95: 0,
			oneDay99: 0,
			tenDay95: 0,
			method: "parametric",
		};
	}

	// Get date range
	const to = formatDate(new Date());
	const from = getFromDate(lookbackDays);

	// Create Alpaca client
	let client: AlpacaMarketDataClient;
	if (!isAlpacaConfigured()) {
		// If no API key, return zero VaR
		return {
			oneDay95: 0,
			oneDay99: 0,
			tenDay95: 0,
			method: "parametric",
		};
	}

	try {
		client = createAlpacaClientFromEnv();
	} catch {
		// If client creation fails, return zero VaR
		return {
			oneDay95: 0,
			oneDay99: 0,
			tenDay95: 0,
			method: "parametric",
		};
	}

	// Fetch historical prices for all positions
	const returnsBySymbol: Record<string, number[]> = {};

	await Promise.all(
		positions.map(async (position) => {
			try {
				const bars = await client.getBars(position.symbol, "1Day", from, to);

				if (bars.length > 0) {
					const prices = bars.map((bar) => bar.close);
					returnsBySymbol[position.symbol] = calculateReturns(prices);
				}
			} catch {
				// Skip symbols with fetch errors
			}
		})
	);

	// Calculate portfolio returns
	const portfolioReturns = calculatePortfolioReturns(positions, returnsBySymbol, nav);

	// Determine method based on data availability
	const useHistorical =
		preferredMethod === "historical" && portfolioReturns.length >= MIN_HISTORICAL_DATA_POINTS;

	const method = useHistorical ? "historical" : "parametric";

	// Calculate VaR metrics
	let oneDay95: number;
	let oneDay99: number;
	let tenDay95: number;

	if (useHistorical) {
		oneDay95 = historicalVaR(portfolioReturns, nav, 0.95, 1);
		oneDay99 = historicalVaR(portfolioReturns, nav, 0.99, 1);
		tenDay95 = historicalVaR(portfolioReturns, nav, 0.95, 10);
	} else {
		oneDay95 = parametricVaR(portfolioReturns, nav, 0.95, 1);
		oneDay99 = parametricVaR(portfolioReturns, nav, 0.99, 1);
		tenDay95 = parametricVaR(portfolioReturns, nav, 0.95, 10);
	}

	return {
		oneDay95: Number(oneDay95.toFixed(2)),
		oneDay99: Number(oneDay99.toFixed(2)),
		tenDay95: Number(tenDay95.toFixed(2)),
		method,
	};
}

// ============================================
// Cache
// ============================================

interface CachedVaR {
	data: VaRMetrics;
	timestamp: number;
}

const varCache = new Map<string, CachedVaR>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Create cache key from positions.
 */
function createCacheKey(positions: PositionForExposure[], nav: number): string {
	const positionHash = positions
		.map((p) => `${p.symbol}:${p.side}:${p.quantity}`)
		.sort()
		.join("|");
	return `var:${positionHash}:${Math.round(nav)}`;
}

/**
 * Get cached VaR metrics or calculate new ones.
 */
export async function getVaRMetrics(options: CalculateVaROptions): Promise<VaRMetrics> {
	const cacheKey = createCacheKey(options.positions, options.nav);
	const cached = varCache.get(cacheKey);

	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.data;
	}

	const data = await calculateVaR(options);

	varCache.set(cacheKey, {
		data,
		timestamp: Date.now(),
	});

	return data;
}

/**
 * Clear VaR cache.
 */
export function clearVaRCache(): void {
	varCache.clear();
}

export default {
	calculateVaR,
	getVaRMetrics,
	clearVaRCache,
};
