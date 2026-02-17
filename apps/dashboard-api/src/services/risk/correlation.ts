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

function createIdentityMatrix(symbols: string[]): number[][] {
	return symbols.map((_, i) => symbols.map((_, j) => (i === j ? 1 : 0)));
}

function createIdentityResult(symbols: string[]): CorrelationMatrix {
	return {
		symbols,
		matrix: createIdentityMatrix(symbols),
		highCorrelationPairs: [],
	};
}

async function createCorrelationClient(): Promise<AlpacaMarketDataClient | null> {
	if (!isAlpacaConfigured()) {
		return null;
	}

	try {
		return createAlpacaClientFromEnv();
	} catch {
		return null;
	}
}

async function fetchPriceData(
	client: AlpacaMarketDataClient,
	symbols: string[],
	from: string,
	to: string,
): Promise<Record<string, number[]>> {
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

	return priceData;
}

function filterSymbolsWithData(symbols: string[], priceData: Record<string, number[]>): string[] {
	return symbols.filter((symbol) => {
		const data = priceData[symbol];
		return data !== undefined && data.length > 10;
	});
}

function buildReturns(
	symbolsWithData: string[],
	priceData: Record<string, number[]>,
): Record<string, number[]> {
	const returns: Record<string, number[]> = {};
	for (const symbol of symbolsWithData) {
		const data = priceData[symbol];
		if (data) {
			returns[symbol] = calculateReturns(data);
		}
	}
	return returns;
}

function alignReturns(symbolsWithData: string[], returns: Record<string, number[]>): void {
	const returnLengths = symbolsWithData
		.map((symbol) => returns[symbol]?.length ?? 0)
		.filter((length) => length > 0);
	const minLength = returnLengths.length > 0 ? Math.min(...returnLengths) : 0;

	for (const symbol of symbolsWithData) {
		const symbolReturns = returns[symbol];
		if (symbolReturns) {
			returns[symbol] = symbolReturns.slice(-minLength);
		}
	}
}

function buildCorrelationMatrix(symbols: string[], returns: Record<string, number[]>): number[][] {
	const matrix: number[][] = [];

	for (let i = 0; i < symbols.length; i++) {
		const row: number[] = [];
		const symbolI = symbols[i];
		for (let j = 0; j < symbols.length; j++) {
			const symbolJ = symbols[j];
			if (i === j) {
				row.push(1);
				continue;
			}

			if (symbolI && symbolJ) {
				const returnsI = returns[symbolI];
				const returnsJ = returns[symbolJ];
				if (returnsI && returnsJ && returnsI.length > 0 && returnsJ.length > 0) {
					row.push(pearsonCorrelation(returnsI, returnsJ));
					continue;
				}
			}

			row.push(0);
		}
		matrix.push(row);
	}

	return matrix;
}

function findHighCorrelationPairs(
	symbols: string[],
	matrix: number[][],
	threshold: number,
): HighCorrelationPair[] {
	const highCorrelationPairs: HighCorrelationPair[] = [];

	for (let i = 0; i < symbols.length; i++) {
		for (let j = i + 1; j < symbols.length; j++) {
			const row = matrix[i];
			const correlation = row?.[j];
			const symbolA = symbols[i];
			const symbolB = symbols[j];
			if (correlation !== undefined && symbolA && symbolB && Math.abs(correlation) > threshold) {
				highCorrelationPairs.push({
					a: symbolA,
					b: symbolB,
					correlation: Number(correlation.toFixed(4)),
				});
			}
		}
	}

	highCorrelationPairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
	return highCorrelationPairs;
}

function roundCorrelationMatrix(matrix: number[][]): number[][] {
	return matrix.map((row) => row.map((value) => Number(value.toFixed(4))));
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

	if (symbols.length === 0) {
		return { symbols: [], matrix: [], highCorrelationPairs: [] };
	}

	if (symbols.length === 1) {
		return { symbols, matrix: [[1]], highCorrelationPairs: [] };
	}

	const to = formatDate(new Date());
	const from = getFromDate(lookbackDays);
	const client = await createCorrelationClient();
	if (!client) {
		return createIdentityResult(symbols);
	}

	const priceData = await fetchPriceData(client, symbols, from, to);
	const symbolsWithData = filterSymbolsWithData(symbols, priceData);
	if (symbolsWithData.length < 2) {
		return createIdentityResult(symbols);
	}

	const returns = buildReturns(symbolsWithData, priceData);
	alignReturns(symbolsWithData, returns);
	const matrix = buildCorrelationMatrix(symbols, returns);
	const highCorrelationPairs = findHighCorrelationPairs(symbols, matrix, threshold);
	return {
		symbols,
		matrix: roundCorrelationMatrix(matrix),
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
