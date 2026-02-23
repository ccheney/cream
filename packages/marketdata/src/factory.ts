/**
 * Market Data Factory
 *
 * Environment-aware factory for creating market data adapters.
 * Uses Alpaca for unified market data in both PAPER and LIVE environments.
 *
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import { type CreamEnvironment, requireEnv } from "@cream/domain";
import { AlpacaMarketDataAdapter, isAlpacaAdapterAvailable } from "./adapters/alpaca-adapter.js";
import { MarketDataConfigError } from "./factory/errors.js";

// ============================================
// Types
// ============================================

/**
 * Candle data returned by the adapter.
 */
export interface AdapterCandle {
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	vwap?: number;
}

/**
 * Quote data returned by the adapter.
 */
export interface AdapterQuote {
	symbol: string;
	bid: number;
	ask: number;
	bidSize: number;
	askSize: number;
	last: number;
	timestamp: number;
}

/**
 * Market data adapter interface for unified access to candles and quotes.
 */
export interface MarketDataAdapter {
	/**
	 * Fetch historical candles for a symbol.
	 *
	 * @param symbol - Ticker symbol
	 * @param timeframe - Candle timeframe (e.g., "1h", "1d")
	 * @param from - Start date (YYYY-MM-DD)
	 * @param to - End date (YYYY-MM-DD)
	 * @returns Array of candles
	 */
	getCandles(
		symbol: string,
		timeframe: "1m" | "5m" | "15m" | "1h" | "1d",
		from: string,
		to: string,
	): Promise<AdapterCandle[]>;

	/**
	 * Fetch current quote for a symbol.
	 *
	 * @param symbol - Ticker symbol
	 * @returns Quote data
	 */
	getQuote(symbol: string): Promise<AdapterQuote | null>;

	/**
	 * Fetch current quotes for multiple symbols.
	 *
	 * @param symbols - Array of ticker symbols
	 * @returns Map of symbol to quote
	 */
	getQuotes(symbols: string[]): Promise<Map<string, AdapterQuote>>;

	/**
	 * Check if the adapter is configured and ready.
	 */
	isReady(): boolean;

	/**
	 * Get the adapter type for logging.
	 */
	getType(): "alpaca";
}

export { MarketDataConfigError };

// ============================================
// Re-export Alpaca Adapter
// ============================================

// Re-export AlpacaMarketDataAdapter for backward compatibility
export { AlpacaMarketDataAdapter } from "./adapters/alpaca-adapter.js";

// ============================================
// Factory Functions
// ============================================

/**
 * Create a market data adapter based on the current environment.
 *
 * Both PAPER and LIVE use AlpacaMarketDataAdapter with real market data.
 *
 * @param env - Optional environment override (uses CREAM_ENV if not provided)
 * @returns Market data adapter
 * @throws MarketDataConfigError if API keys are missing
 *
 * @example
 * ```ts
 * const adapter = createMarketDataAdapter();
 * const candles = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-06");
 * ```
 */
export function createMarketDataAdapter(env?: CreamEnvironment): MarketDataAdapter {
	if (!env) {
		requireEnv();
	}

	if (!isAlpacaAdapterAvailable()) {
		throw new MarketDataConfigError("alpaca", "ALPACA_KEY and ALPACA_SECRET");
	}

	return new AlpacaMarketDataAdapter();
}

/**
 * Get a market data adapter, returning null instead of throwing if not configured.
 *
 * Useful for optional market data access where missing config should not be fatal.
 *
 * @param env - Optional environment override
 * @returns Market data adapter or null if not configured
 */
export function getMarketDataAdapter(env?: CreamEnvironment): MarketDataAdapter | null {
	try {
		return createMarketDataAdapter(env);
	} catch (error) {
		if (error instanceof MarketDataConfigError) {
			return null;
		}
		throw error;
	}
}

/**
 * Check if market data is available for the current environment.
 *
 * @param env - Optional environment override
 * @returns true if market data adapter can be created
 */
export function isMarketDataAvailable(env?: CreamEnvironment): boolean {
	return getMarketDataAdapter(env) !== null;
}
