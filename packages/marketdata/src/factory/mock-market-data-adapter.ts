import type { AdapterCandle, AdapterQuote, MarketDataAdapter } from "../factory.js";

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
		_to: string,
	): Promise<AdapterCandle[]> {
		const candles: AdapterCandle[] = [];
		const intervalMs = this.getIntervalMs(timeframe);
		const count = 120;

		const hash = this.hashSymbol(symbol);
		let basePrice = 100 + (hash % 400);

		for (let i = 0; i < count; i++) {
			const timestamp = this.baseTimestamp - (count - i) * intervalMs;
			const volatility = 0.02 + (hash % 5) * 0.005;

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
		const spread = price * 0.0002;

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
			hash &= hash;
		}
		return Math.abs(hash);
	}
}
