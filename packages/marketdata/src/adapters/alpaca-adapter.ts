/**
 * Alpaca Market Data Adapter
 *
 * Implements the MarketDataAdapter interface using Alpaca's REST API.
 * Used in PAPER and LIVE modes for real market data.
 *
 * This adapter uses the REST API for:
 * - Historical candles (bars)
 * - Current quotes
 * - Snapshots
 *
 * For real-time streaming, use AlpacaWebSocketClient directly.
 *
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import type { AdapterCandle, AdapterQuote, MarketDataAdapter } from "../factory.js";
import {
	type AlpacaMarketDataClient,
	type AlpacaTimeframe,
	createAlpacaClientFromEnv,
	isAlpacaConfigured,
} from "../providers/alpaca.js";

// ============================================
// Timeframe Mapping
// ============================================

const TIMEFRAME_MAP: Record<"1m" | "5m" | "15m" | "1h" | "1d", AlpacaTimeframe> = {
	"1m": "1Min",
	"5m": "5Min",
	"15m": "15Min",
	"1h": "1Hour",
	"1d": "1Day",
};

// ============================================
// Adapter Implementation
// ============================================

/**
 * Alpaca market data adapter for the MarketDataAdapter interface.
 *
 * Uses Alpaca's REST API for historical and current market data.
 *
 * @example
 * ```typescript
 * const adapter = new AlpacaMarketDataAdapter();
 * const candles = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-10");
 * const quote = await adapter.getQuote("AAPL");
 * ```
 */
export class AlpacaMarketDataAdapter implements MarketDataAdapter {
	private client: AlpacaMarketDataClient;

	constructor(client?: AlpacaMarketDataClient) {
		this.client = client ?? createAlpacaClientFromEnv();
	}

	getType(): "alpaca" {
		return "alpaca" as const;
	}

	isReady(): boolean {
		return true;
	}

	/**
	 * Fetch historical candles for a symbol.
	 */
	async getCandles(
		symbol: string,
		timeframe: "1m" | "5m" | "15m" | "1h" | "1d",
		from: string,
		to: string
	): Promise<AdapterCandle[]> {
		const alpacaTimeframe = TIMEFRAME_MAP[timeframe];

		const bars = await this.client.getBars(symbol, alpacaTimeframe, from, to);

		return bars.map((bar) => ({
			timestamp: new Date(bar.timestamp).getTime(),
			open: bar.open,
			high: bar.high,
			low: bar.low,
			close: bar.close,
			volume: bar.volume,
			vwap: bar.vwap,
		}));
	}

	/**
	 * Fetch current quote for a symbol.
	 */
	async getQuote(symbol: string): Promise<AdapterQuote | null> {
		// Try to get quote directly
		const quote = await this.client.getQuote(symbol);

		if (quote) {
			// Get latest trade for the "last" price
			const trades = await this.client.getLatestTrades([symbol]);
			const trade = trades.get(symbol);

			return {
				symbol,
				bid: quote.bidPrice,
				ask: quote.askPrice,
				bidSize: quote.bidSize,
				askSize: quote.askSize,
				last: trade?.price ?? (quote.bidPrice + quote.askPrice) / 2,
				timestamp: new Date(quote.timestamp).getTime(),
			};
		}

		// Fallback to snapshot
		const snapshots = await this.client.getSnapshots([symbol]);
		const snapshot = snapshots.get(symbol);

		if (!snapshot) {
			return null;
		}

		return this.snapshotToQuote(snapshot);
	}

	/**
	 * Fetch current quotes for multiple symbols.
	 */
	async getQuotes(symbols: string[]): Promise<Map<string, AdapterQuote>> {
		const result = new Map<string, AdapterQuote>();

		// Get quotes and trades in parallel
		const [quotes, trades] = await Promise.all([
			this.client.getQuotes(symbols),
			this.client.getLatestTrades(symbols),
		]);

		for (const [symbol, quote] of quotes) {
			const trade = trades.get(symbol);

			result.set(symbol, {
				symbol,
				bid: quote.bidPrice,
				ask: quote.askPrice,
				bidSize: quote.bidSize,
				askSize: quote.askSize,
				last: trade?.price ?? (quote.bidPrice + quote.askPrice) / 2,
				timestamp: new Date(quote.timestamp).getTime(),
			});
		}

		// If we didn't get quotes for some symbols, try snapshots
		const missingSymbols = symbols.filter((s) => !result.has(s));

		if (missingSymbols.length > 0) {
			const snapshots = await this.client.getSnapshots(missingSymbols);

			for (const [symbol, snapshot] of snapshots) {
				if (!result.has(symbol)) {
					const quote = this.snapshotToQuote(snapshot);
					if (quote) {
						result.set(symbol, quote);
					}
				}
			}
		}

		return result;
	}

	/**
	 * Convert Alpaca snapshot to AdapterQuote.
	 */
	private snapshotToQuote(snapshot: {
		symbol: string;
		latestQuote?: {
			bidPrice: number;
			bidSize: number;
			askPrice: number;
			askSize: number;
			timestamp: string;
		};
		latestTrade?: {
			price: number;
			timestamp: string;
		};
		dailyBar?: {
			close: number;
		};
	}): AdapterQuote | null {
		const quote = snapshot.latestQuote;
		const trade = snapshot.latestTrade;

		if (!quote && !trade) {
			return null;
		}

		const bid = quote?.bidPrice ?? 0;
		const ask = quote?.askPrice ?? 0;
		const last = trade?.price ?? snapshot.dailyBar?.close ?? (bid + ask) / 2;

		return {
			symbol: snapshot.symbol,
			bid,
			ask,
			bidSize: quote?.bidSize ?? 0,
			askSize: quote?.askSize ?? 0,
			last,
			timestamp: quote?.timestamp
				? new Date(quote.timestamp).getTime()
				: trade?.timestamp
					? new Date(trade.timestamp).getTime()
					: Date.now(),
		};
	}
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create an Alpaca market data adapter from environment variables.
 */
export function createAlpacaAdapterFromEnv(): AlpacaMarketDataAdapter {
	return new AlpacaMarketDataAdapter();
}

/**
 * Check if Alpaca adapter can be created.
 */
export function isAlpacaAdapterAvailable(): boolean {
	return isAlpacaConfigured();
}
