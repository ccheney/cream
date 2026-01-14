/**
 * Market state cache for Kalshi WebSocket data.
 *
 * Caches ticker data with TTL-based expiration.
 */

import type { CachedMarketState, TickerMessage } from "./types.js";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class MarketStateCache {
	private cache: Map<string, CachedMarketState> = new Map();
	private readonly ttlMs: number;

	constructor(ttlMs = DEFAULT_TTL_MS) {
		this.ttlMs = ttlMs;
	}

	updateFromTicker(msg: TickerMessage["msg"]): void {
		const now = new Date();
		const existing = this.cache.get(msg.market_ticker) ?? {
			ticker: msg.market_ticker,
			lastUpdated: now,
			expiresAt: new Date(now.getTime() + this.ttlMs),
		};

		this.cache.set(msg.market_ticker, {
			...existing,
			yesBid: msg.yes_bid ?? existing.yesBid,
			yesAsk: msg.yes_ask ?? existing.yesAsk,
			noBid: msg.no_bid ?? existing.noBid,
			noAsk: msg.no_ask ?? existing.noAsk,
			lastPrice: msg.last_price ?? existing.lastPrice,
			volume: msg.volume ?? existing.volume,
			openInterest: msg.open_interest ?? existing.openInterest,
			lastUpdated: now,
			expiresAt: new Date(now.getTime() + this.ttlMs),
		});
	}

	get(ticker: string): CachedMarketState | undefined {
		const entry = this.cache.get(ticker);
		if (!entry) {
			return undefined;
		}

		if (entry.expiresAt < new Date()) {
			this.cache.delete(ticker);
			return undefined;
		}

		return entry;
	}

	clear(): void {
		this.cache.clear();
	}

	prune(): number {
		const now = new Date();
		let removed = 0;

		for (const [ticker, entry] of this.cache.entries()) {
			if (entry.expiresAt < now) {
				this.cache.delete(ticker);
				removed++;
			}
		}

		return removed;
	}

	getAllTickers(): string[] {
		return [...this.cache.keys()];
	}
}
