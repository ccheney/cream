/**
 * Mock Market Data Adapter
 *
 * Loads JSON fixtures for development and testing.
 * Provides convenience functions for filtering/transforming fixture data.
 * Includes error simulation capabilities for testing error handling.
 *
 * @see docs/plans/17-mock-data-layer.md
 */

// Local types for fixture data (matches legacy format in fixtures)
interface FixtureAggregateBar {
	o: number;
	h: number;
	l: number;
	c: number;
	v: number;
	vw?: number;
	t: number;
	n?: number;
}

interface FixtureAggregatesResponse {
	ticker: string;
	queryCount: number;
	resultsCount: number;
	adjusted: boolean;
	status: string;
	results: FixtureAggregateBar[];
}

interface FixtureSnapshot {
	ticker: string;
	day?: {
		o: number;
		h: number;
		l: number;
		c: number;
		v: number;
		vw?: number;
	};
	lastQuote?: {
		P: number;
		S: number;
		p: number;
		s: number;
		t: number;
	};
	lastTrade?: {
		p: number;
		s: number;
		t: number;
	};
	todaysChange?: number;
	todaysChangePerc?: number;
	updated: number;
}

// ============================================
// Fixture Imports
// ============================================

// Alpaca fixtures
import alpacaAccount from "../../fixtures/alpaca/account.json";
// Alpaca fixtures for market data
import candlesAAPL from "../../fixtures/alpaca/candles-1h-AAPL.json";
import alpacaOrders from "../../fixtures/alpaca/orders.json";
import alpacaPositions from "../../fixtures/alpaca/positions.json";
import quoteAAPL from "../../fixtures/alpaca/quote-AAPL.json";
import tradesAAPL from "../../fixtures/alpaca/trades-AAPL.json";

// ============================================
// Fixture Registry
// ============================================

/**
 * All mock data fixtures organized by provider.
 */
export const mockData = {
	alpacaMarketData: {
		candles: {
			AAPL: {
				"1h": candlesAAPL,
			},
		},
		quotes: {
			AAPL: quoteAAPL,
		},
		trades: {
			AAPL: tradesAAPL,
		},
	},
	alpaca: {
		account: alpacaAccount,
		positions: alpacaPositions,
		orders: alpacaOrders,
	},
} as const;

// ============================================
// Types
// ============================================

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface MockCandle {
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	vwap?: number;
}

export interface MockQuote {
	symbol: string;
	timestamp: number;
	bid: number;
	ask: number;
	bidSize: number;
	askSize: number;
}

export interface MockTrade {
	symbol: string;
	timestamp: number;
	price: number;
	size: number;
}

export interface MockAccount {
	id: string;
	equity: string;
	buyingPower: string;
	cash: string;
	portfolioValue: string;
	patternDayTrader: boolean;
}

export interface MockPosition {
	symbol: string;
	qty: string;
	avgEntryPrice: string;
	marketValue: string;
	unrealizedPl: string;
	side: "long" | "short";
}

export interface MockOrder {
	id: string;
	symbol: string;
	qty: string;
	side: "buy" | "sell";
	type: string;
	status: string;
	limitPrice?: string;
	filledQty: string;
	filledAvgPrice?: string;
}

export interface MockMacroIndicator {
	name: string;
	interval: string;
	unit: string;
	data: Array<{ date: string; value: string }>;
}

// ============================================
// Error Simulation
// ============================================

export type ErrorType =
	| "NETWORK_ERROR"
	| "TIMEOUT"
	| "RATE_LIMIT"
	| "AUTH_ERROR"
	| "NOT_FOUND"
	| "SERVER_ERROR"
	| "INVALID_RESPONSE";

export interface ErrorSimulationConfig {
	/** Error type to simulate */
	errorType: ErrorType;
	/** Probability of error (0-1). Default: 1.0 (always) */
	probability?: number;
	/** Delay before error (ms). Default: 0 */
	delayMs?: number;
	/** Custom error message */
	message?: string;
	/** HTTP status code for HTTP errors */
	statusCode?: number;
}

/**
 * Mock API error for testing error handling.
 */
export class MockApiError extends Error {
	constructor(
		public readonly errorType: ErrorType,
		public readonly statusCode: number,
		message: string,
	) {
		super(message);
		this.name = "MockApiError";
	}
}

const ERROR_DEFAULTS: Record<ErrorType, { statusCode: number; message: string }> = {
	NETWORK_ERROR: { statusCode: 0, message: "Network request failed" },
	TIMEOUT: { statusCode: 0, message: "Request timed out" },
	RATE_LIMIT: { statusCode: 429, message: "Rate limit exceeded" },
	AUTH_ERROR: { statusCode: 401, message: "Authentication failed" },
	NOT_FOUND: { statusCode: 404, message: "Resource not found" },
	SERVER_ERROR: { statusCode: 500, message: "Internal server error" },
	INVALID_RESPONSE: { statusCode: 0, message: "Invalid response format" },
};

/**
 * Simulate an API error based on configuration.
 */
async function simulateError(config: ErrorSimulationConfig): Promise<void> {
	const probability = config.probability ?? 1.0;

	if (Math.random() > probability) {
		return; // No error this time
	}

	if (config.delayMs && config.delayMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, config.delayMs));
	}

	const defaults = ERROR_DEFAULTS[config.errorType];
	throw new MockApiError(
		config.errorType,
		config.statusCode ?? defaults.statusCode,
		config.message ?? defaults.message,
	);
}

// ============================================
// Mock Adapter Class
// ============================================

/**
 * Configuration for the mock adapter.
 */
export interface MockAdapterConfig {
	/** Simulate network latency (ms). Default: 0 */
	latencyMs?: number;
	/** Error simulation configuration */
	errorSimulation?: ErrorSimulationConfig;
}

/**
 * Mock market data adapter that loads fixtures.
 */
export class MockAdapter {
	private config: MockAdapterConfig;

	constructor(config: MockAdapterConfig = {}) {
		this.config = config;
	}

	/**
	 * Simulate network latency.
	 */
	private async simulateLatency(): Promise<void> {
		if (this.config.latencyMs && this.config.latencyMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
		}
	}

	/**
	 * Apply error simulation if configured.
	 */
	private async maybeThrowError(): Promise<void> {
		if (this.config.errorSimulation) {
			await simulateError(this.config.errorSimulation);
		}
	}

	// ============================================
	// Candle Data
	// ============================================

	/**
	 * Get mock candles for a symbol and timeframe.
	 */
	async getCandles(symbol: string, timeframe: Timeframe = "1h"): Promise<MockCandle[]> {
		await this.maybeThrowError();
		await this.simulateLatency();

		const candleData =
			mockData.alpacaMarketData.candles[symbol as keyof typeof mockData.alpacaMarketData.candles];
		if (!candleData) {
			return [];
		}

		const tfData = candleData[timeframe as keyof typeof candleData] as
			| FixtureAggregatesResponse
			| undefined;
		if (!tfData?.results) {
			return [];
		}

		return tfData.results.map((bar: FixtureAggregateBar) => ({
			timestamp: bar.t,
			open: bar.o,
			high: bar.h,
			low: bar.l,
			close: bar.c,
			volume: bar.v,
			vwap: bar.vw,
		}));
	}

	/**
	 * Get candles filtered by date range.
	 */
	async getCandlesInRange(
		symbol: string,
		timeframe: Timeframe,
		startTs: number,
		endTs: number,
	): Promise<MockCandle[]> {
		const candles = await this.getCandles(symbol, timeframe);
		return candles.filter((c) => c.timestamp >= startTs && c.timestamp <= endTs);
	}

	/**
	 * Get the most recent N candles.
	 */
	async getRecentCandles(
		symbol: string,
		timeframe: Timeframe,
		count: number,
	): Promise<MockCandle[]> {
		const candles = await this.getCandles(symbol, timeframe);
		return candles.slice(-count);
	}

	// ============================================
	// Quote Data
	// ============================================

	/**
	 * Get mock quote for a symbol.
	 */
	async getQuote(symbol: string): Promise<MockQuote | null> {
		await this.maybeThrowError();
		await this.simulateLatency();

		const quoteData =
			mockData.alpacaMarketData.quotes[symbol as keyof typeof mockData.alpacaMarketData.quotes];
		if (!quoteData?.results?.[0]) {
			return null;
		}

		const q = quoteData.results[0];
		return {
			symbol: q.T,
			timestamp: Number(BigInt(q.t) / BigInt(1000000)), // ns to ms
			bid: q.p,
			ask: q.P,
			bidSize: q.s,
			askSize: q.S,
		};
	}

	/**
	 * Get quotes for multiple symbols.
	 */
	async getQuotes(symbols: string[]): Promise<Map<string, MockQuote>> {
		const quotes = new Map<string, MockQuote>();
		for (const symbol of symbols) {
			const quote = await this.getQuote(symbol);
			if (quote) {
				quotes.set(symbol, quote);
			}
		}
		return quotes;
	}

	// ============================================
	// Trade Data
	// ============================================

	/**
	 * Get mock trades for a symbol.
	 */
	async getTrades(symbol: string): Promise<MockTrade[]> {
		await this.maybeThrowError();
		await this.simulateLatency();

		const tradeData =
			mockData.alpacaMarketData.trades[symbol as keyof typeof mockData.alpacaMarketData.trades];
		if (!tradeData?.results) {
			return [];
		}

		return tradeData.results.map((t: { T: string; t: number; p: number; s: number }) => ({
			symbol: t.T,
			timestamp: Number(BigInt(t.t) / BigInt(1000000)), // ns to ms
			price: t.p,
			size: t.s,
		}));
	}

	// ============================================
	// Account Data (Alpaca)
	// ============================================

	/**
	 * Get mock account information.
	 */
	async getAccount(): Promise<MockAccount> {
		await this.maybeThrowError();
		await this.simulateLatency();

		const acct = mockData.alpaca.account;
		return {
			id: acct.id,
			equity: acct.equity,
			buyingPower: acct.buying_power,
			cash: acct.cash,
			portfolioValue: acct.portfolio_value,
			patternDayTrader: acct.pattern_day_trader,
		};
	}

	/**
	 * Get mock positions.
	 */
	async getPositions(): Promise<MockPosition[]> {
		await this.maybeThrowError();
		await this.simulateLatency();

		return mockData.alpaca.positions.map(
			(p: {
				symbol: string;
				qty: string;
				avg_entry_price: string;
				market_value: string;
				unrealized_pl: string;
				side: string;
			}) => ({
				symbol: p.symbol,
				qty: p.qty,
				avgEntryPrice: p.avg_entry_price,
				marketValue: p.market_value,
				unrealizedPl: p.unrealized_pl,
				side: p.side as "long" | "short",
			}),
		);
	}

	/**
	 * Get position for a specific symbol.
	 */
	async getPosition(symbol: string): Promise<MockPosition | null> {
		const positions = await this.getPositions();
		return positions.find((p) => p.symbol === symbol) ?? null;
	}

	/**
	 * Get mock orders.
	 */
	async getOrders(status?: string): Promise<MockOrder[]> {
		await this.maybeThrowError();
		await this.simulateLatency();

		let orders = mockData.alpaca.orders.map(
			(o: {
				id: string;
				symbol: string;
				qty: string;
				side: string;
				type: string;
				status: string;
				limit_price: string | null;
				filled_qty: string;
				filled_avg_price: string | null;
			}) => ({
				id: o.id,
				symbol: o.symbol,
				qty: o.qty,
				side: o.side as "buy" | "sell",
				type: o.type,
				status: o.status,
				limitPrice: o.limit_price ?? undefined,
				filledQty: o.filled_qty,
				filledAvgPrice: o.filled_avg_price ?? undefined,
			}),
		);

		if (status) {
			orders = orders.filter((o) => o.status === status);
		}

		return orders;
	}

	// ============================================
	// Snapshot Builder
	// ============================================

	/**
	 * Build a mock market snapshot for a symbol.
	 */
	async buildSnapshot(symbol: string): Promise<FixtureSnapshot | null> {
		await this.maybeThrowError();
		await this.simulateLatency();

		const quote = await this.getQuote(symbol);
		const candles = await this.getRecentCandles(symbol, "1h", 1);

		if (!quote && candles.length === 0) {
			return null;
		}

		const lastCandle = candles.at(-1);

		return {
			ticker: symbol,
			day: lastCandle
				? {
						o: lastCandle.open,
						h: lastCandle.high,
						l: lastCandle.low,
						c: lastCandle.close,
						v: lastCandle.volume,
						vw: lastCandle.vwap,
					}
				: undefined,
			lastQuote: quote
				? {
						P: quote.ask,
						S: quote.askSize,
						p: quote.bid,
						s: quote.bidSize,
						t: quote.timestamp,
					}
				: undefined,
			lastTrade: undefined,
			todaysChange: lastCandle ? lastCandle.close - lastCandle.open : undefined,
			todaysChangePerc: lastCandle
				? ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100
				: undefined,
			updated: Date.now(),
		};
	}
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Get mock candles for a symbol and timeframe.
 * Convenience function that creates a temporary adapter.
 */
export async function getMockCandles(
	symbol: string,
	timeframe: Timeframe = "1h",
): Promise<MockCandle[]> {
	const adapter = new MockAdapter();
	return adapter.getCandles(symbol, timeframe);
}

/**
 * Get mock quote for a symbol.
 * Convenience function that creates a temporary adapter.
 */
export async function getMockQuote(symbol: string): Promise<MockQuote | null> {
	const adapter = new MockAdapter();
	return adapter.getQuote(symbol);
}

/**
 * Get mock trades for a symbol.
 * Convenience function that creates a temporary adapter.
 */
export async function getMockTrades(symbol: string): Promise<MockTrade[]> {
	const adapter = new MockAdapter();
	return adapter.getTrades(symbol);
}

/**
 * Get mock account information.
 * Convenience function that creates a temporary adapter.
 */
export async function getMockAccount(): Promise<MockAccount> {
	const adapter = new MockAdapter();
	return adapter.getAccount();
}

/**
 * Get mock positions.
 * Convenience function that creates a temporary adapter.
 */
export async function getMockPositions(): Promise<MockPosition[]> {
	const adapter = new MockAdapter();
	return adapter.getPositions();
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a mock adapter with default configuration.
 */
export function createMockAdapter(config?: MockAdapterConfig): MockAdapter {
	return new MockAdapter(config);
}

/**
 * Create a mock adapter with simulated latency.
 */
export function createMockAdapterWithLatency(latencyMs: number): MockAdapter {
	return new MockAdapter({ latencyMs });
}

/**
 * Create a mock adapter that always throws errors.
 */
export function createFailingMockAdapter(errorType: ErrorType): MockAdapter {
	return new MockAdapter({
		errorSimulation: { errorType },
	});
}

/**
 * Create a mock adapter with intermittent failures.
 */
export function createFlakeMockAdapter(errorType: ErrorType, probability: number): MockAdapter {
	return new MockAdapter({
		errorSimulation: { errorType, probability },
	});
}
