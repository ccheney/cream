/**
 * Correlation Service
 *
 * Calculates pairwise correlation matrix for portfolio positions.
 *
 * @see docs/plans/ui/05-api-endpoints.md Risk section
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import type { AlpacaMarketDataClient } from "@cream/marketdata";
import { createAlpacaClientFromEnv, isAlpacaConfigured } from "@cream/marketdata";

// ============================================
// Types
// ============================================

export interface CorrelationMatrix {
	/** Position symbols in the matrix */
	symbols: string[];
	/** NxN correlation matrix */
	matrix: number[][];
	/** Pairs exceeding correlation threshold */
	highCorrelationPairs: HighCorrelationPair[];
}

export interface HighCorrelationPair {
	a: string;
	b: string;
	correlation: number;
}

export interface CalculateCorrelationOptions {
	/** Symbols to calculate correlation for */
	symbols: string[];
	/** Lookback period in trading days (default: 60) */
	lookbackDays?: number;
	/** Correlation threshold for flagging pairs (default: 0.7) */
	threshold?: number;
}

// ============================================
// Correlation Calculation
// ============================================

/**
 * Calculate mean of an array.
 */
function mean(arr: number[]): number {
	if (arr.length === 0) {
		return 0;
	}
	return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Calculate Pearson correlation coefficient between two arrays.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
	if (x.length !== y.length || x.length < 2) {
		return 0;
	}

	const n = x.length;
	const meanX = mean(x);
	const meanY = mean(y);

	let numerator = 0;
	let denomX = 0;
	let denomY = 0;

	for (let i = 0; i < n; i++) {
		const xi = x[i] ?? 0;
		const yi = y[i] ?? 0;
		const dx = xi - meanX;
		const dy = yi - meanY;
		numerator += dx * dy;
		denomX += dx * dx;
		denomY += dy * dy;
	}

	const denominator = Math.sqrt(denomX) * Math.sqrt(denomY);
	if (denominator === 0) {
		return 0;
	}

	return numerator / denominator;
}

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

// ============================================
// Correlation Service
// ============================================

/**
 * Calculate correlation matrix for given symbols.
 *
 * @example
 * ```typescript
 * const result = await calculateCorrelationMatrix({
 *   symbols: ["AAPL", "MSFT", "GOOGL"],
 *   lookbackDays: 60,
 *   threshold: 0.7,
 * });
 * ```
 */
export async function calculateCorrelationMatrix(
	options: CalculateCorrelationOptions,
): Promise<CorrelationMatrix> {
	const { symbols, lookbackDays = 60, threshold = 0.7 } = options;

	// Handle empty or single symbol case
	if (symbols.length === 0) {
		return { symbols: [], matrix: [], highCorrelationPairs: [] };
	}

	if (symbols.length === 1) {
		return {
			symbols,
			matrix: [[1]],
			highCorrelationPairs: [],
		};
	}

	// Get date range
	const to = formatDate(new Date());
	const from = getFromDate(lookbackDays);

	// Create Alpaca client
	let client: AlpacaMarketDataClient;
	if (!isAlpacaConfigured()) {
		// If no API key, return identity matrix
		const matrix = symbols.map((_, i) => symbols.map((_, j) => (i === j ? 1 : 0)));
		return { symbols, matrix, highCorrelationPairs: [] };
	}

	try {
		client = createAlpacaClientFromEnv();
	} catch {
		// If client creation fails, return identity matrix
		const matrix = symbols.map((_, i) => symbols.map((_, j) => (i === j ? 1 : 0)));
		return { symbols, matrix, highCorrelationPairs: [] };
	}

	// Fetch historical prices for all symbols
	const priceData: Record<string, number[]> = {};

	await Promise.all(
		symbols.map(async (symbol) => {
			try {
				const bars = await client.getBars(symbol, "1Day", from, to);

				if (bars.length > 0) {
					priceData[symbol] = bars.map((bar) => bar.close);
				}
			} catch {
				// Skip symbols with fetch errors
			}
		}),
	);

	// Filter to symbols with data
	const symbolsWithData = symbols.filter((s) => {
		const data = priceData[s];
		return data && data.length > 10;
	});

	if (symbolsWithData.length < 2) {
		// Not enough data for correlation
		const matrix = symbols.map((_, i) => symbols.map((_, j) => (i === j ? 1 : 0)));
		return { symbols, matrix, highCorrelationPairs: [] };
	}

	// Calculate returns for each symbol
	const returns: Record<string, number[]> = {};
	for (const symbol of symbolsWithData) {
		const data = priceData[symbol];
		if (data) {
			returns[symbol] = calculateReturns(data);
		}
	}

	// Align returns to same length (use minimum)
	const returnLengths = symbolsWithData
		.map((s) => returns[s]?.length ?? 0)
		.filter((len) => len > 0);
	const minLength = returnLengths.length > 0 ? Math.min(...returnLengths) : 0;

	for (const symbol of symbolsWithData) {
		const symbolReturns = returns[symbol];
		if (symbolReturns) {
			returns[symbol] = symbolReturns.slice(-minLength);
		}
	}

	// Build correlation matrix
	const n = symbols.length;
	const matrix: number[][] = [];

	for (let i = 0; i < n; i++) {
		const row: number[] = [];
		const symbolI = symbols[i];
		for (let j = 0; j < n; j++) {
			const symbolJ = symbols[j];
			if (i === j) {
				row.push(1); // Diagonal is always 1
			} else if (symbolI && symbolJ) {
				const ri = returns[symbolI];
				const rj = returns[symbolJ];

				if (ri && rj && ri.length > 0 && rj.length > 0) {
					row.push(pearsonCorrelation(ri, rj));
				} else {
					row.push(0); // No data available
				}
			} else {
				row.push(0);
			}
		}
		matrix.push(row);
	}

	// Find high correlation pairs
	const highCorrelationPairs: HighCorrelationPair[] = [];

	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const row = matrix[i];
			const corr = row?.[j];
			const symbolA = symbols[i];
			const symbolB = symbols[j];
			if (corr !== undefined && symbolA && symbolB && Math.abs(corr) > threshold) {
				highCorrelationPairs.push({
					a: symbolA,
					b: symbolB,
					correlation: Number(corr.toFixed(4)),
				});
			}
		}
	}

	// Sort high correlation pairs by absolute correlation (descending)
	highCorrelationPairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

	// Round matrix values
	const roundedMatrix = matrix.map((row) => row.map((val) => Number(val.toFixed(4))));

	return {
		symbols,
		matrix: roundedMatrix,
		highCorrelationPairs,
	};
}

// ============================================
// Cache
// ============================================

interface CachedCorrelation {
	data: CorrelationMatrix;
	timestamp: number;
}

const correlationCache = new Map<string, CachedCorrelation>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get cached correlation matrix or calculate new one.
 */
export async function getCorrelationMatrix(
	options: CalculateCorrelationOptions,
): Promise<CorrelationMatrix> {
	const cacheKey = options.symbols.toSorted().join(",");
	const cached = correlationCache.get(cacheKey);

	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.data;
	}

	const data = await calculateCorrelationMatrix(options);

	correlationCache.set(cacheKey, {
		data,
		timestamp: Date.now(),
	});

	return data;
}

/**
 * Clear correlation cache.
 */
export function clearCorrelationCache(): void {
	correlationCache.clear();
}

export default {
	calculateCorrelationMatrix,
	getCorrelationMatrix,
	clearCorrelationCache,
};
