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
		to: string
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
	getType(): "mock" | "alpaca";
}

// ============================================
// Mock Adapter (for testing)
// ============================================

/**
 * Mock adapter that generates deterministic fixture data.
 * Used in test mode for reproducible testing.
 */
export class MockMarketDataAdapter implements MarketDataAdapter {
	private readonly baseTimestamp = Date.UTC(2026, 0, 6, 14, 30, 0); // 2026-01-06 14:30 UTC

	getType(): "mock" {
		return "mock";
	}

	isReady(): boolean {
		return true;
	}

	async getCandles(
		symbol: string,
		timeframe: "1m" | "5m" | "15m" | "1h" | "1d",
		_from: string,
		_to: string
	): Promise<AdapterCandle[]> {
		const candles: AdapterCandle[] = [];
		const intervalMs = this.getIntervalMs(timeframe);
		const count = 120; // Generate 120 candles

		// Generate deterministic candles based on symbol hash
		const hash = this.hashSymbol(symbol);
		let basePrice = 100 + (hash % 400); // Price between 100-500

		for (let i = 0; i < count; i++) {
			const timestamp = this.baseTimestamp - (count - i) * intervalMs;
			const volatility = 0.02 + (hash % 5) * 0.005; // 2-4.5% volatility

			// Generate deterministic price movement
			const seed = (hash + i * 17) % 100;
			const direction = seed > 50 ? 1 : -1;
			const change = (seed / 100) * volatility * basePrice * direction;

			const open = basePrice;
			const close = basePrice + change;
			const high = Math.max(open, close) * (1 + volatility * 0.3);
			const low = Math.min(open, close) * (1 - volatility * 0.3);
			const volume = 100000 + seed * 1000 + (hash % 50000);

			candles.push({
				timestamp,
				open: Number(open.toFixed(2)),
				high: Number(high.toFixed(2)),
				low: Number(low.toFixed(2)),
				close: Number(close.toFixed(2)),
				volume: Math.round(volume),
				vwap: Number(((open + close + high + low) / 4).toFixed(2)),
			});

			basePrice = close;
		}

		return candles;
	}

	async getQuote(symbol: string): Promise<AdapterQuote | null> {
		const hash = this.hashSymbol(symbol);
		const price = 100 + (hash % 400);
		const spread = price * 0.0002; // 2bp spread

		return {
			symbol,
			bid: Number((price - spread / 2).toFixed(2)),
			ask: Number((price + spread / 2).toFixed(2)),
			bidSize: 100 + (hash % 900),
			askSize: 100 + ((hash * 3) % 900),
			last: price,
			timestamp: Date.now(),
		};
	}

	async getQuotes(symbols: string[]): Promise<Map<string, AdapterQuote>> {
		const quotes = new Map<string, AdapterQuote>();
		for (const symbol of symbols) {
			const quote = await this.getQuote(symbol);
			if (quote) {
				quotes.set(symbol, quote);
			}
		}
		return quotes;
	}

	private getIntervalMs(timeframe: string): number {
		switch (timeframe) {
			case "1m":
				return 60 * 1000;
			case "5m":
				return 5 * 60 * 1000;
			case "15m":
				return 15 * 60 * 1000;
			case "1h":
				return 60 * 60 * 1000;
			case "1d":
				return 24 * 60 * 60 * 1000;
			default:
				return 60 * 60 * 1000;
		}
	}

	private hashSymbol(symbol: string): number {
		let hash = 0;
		for (let i = 0; i < symbol.length; i++) {
			hash = (hash << 5) - hash + symbol.charCodeAt(i);
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash);
	}
}

// ============================================
// Re-export Alpaca Adapter
// ============================================

// Re-export AlpacaMarketDataAdapter for backward compatibility
export { AlpacaMarketDataAdapter } from "./adapters/alpaca-adapter.js";

// ============================================
// Factory Functions
// ============================================

/**
 * Error thrown when market data provider is not configured.
 */
export class MarketDataConfigError extends Error {
	constructor(
		public readonly provider: string,
		public readonly missingVar: string
	) {
		super(
			`Market data provider "${provider}" requires ${missingVar} environment variable.`
		);
		this.name = "MarketDataConfigError";
	}
}

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
	// Environment validation (will use CREAM_ENV if not provided)
	if (!env) {
		requireEnv();
	}

	// PAPER/LIVE mode requires Alpaca API keys
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
