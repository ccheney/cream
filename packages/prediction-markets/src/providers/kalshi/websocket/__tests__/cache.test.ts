/**
 * Tests for MarketStateCache
 */

import { describe, expect, it } from "bun:test";
import { MarketStateCache } from "../index.js";

const nowIso = () => new Date().toISOString();

const wait = (ms: number) => {
	const start = Date.now();
	while (Date.now() - start < ms) {
		// Busy wait for expiration in synchronous tests
	}
};

describe("MarketStateCache read and write", () => {
	it("should store and retrieve market state", () => {
		const cache = new MarketStateCache();
		cache.updateFromTicker({
			market_ticker: "KXFED-26JAN29",
			yes_bid: 0.55,
			yes_ask: 0.57,
			last_price: 0.56,
			volume: 10000,
			open_interest: 5000,
			timestamp: nowIso(),
		});
		const state = cache.get("KXFED-26JAN29");
		expect(state?.yesBid).toBe(0.55);
		expect(state?.yesAsk).toBe(0.57);
		expect(state?.lastPrice).toBe(0.56);
		expect(state?.volume).toBe(10000);
		expect(state?.openInterest).toBe(5000);
	});

	it("should update existing state without losing fields", () => {
		const cache = new MarketStateCache();
		cache.updateFromTicker({
			market_ticker: "KXFED-26JAN29",
			yes_bid: 0.55,
			yes_ask: 0.57,
			timestamp: nowIso(),
		});
		cache.updateFromTicker({
			market_ticker: "KXFED-26JAN29",
			no_bid: 0.43,
			no_ask: 0.45,
			timestamp: nowIso(),
		});
		const state = cache.get("KXFED-26JAN29");
		expect(state?.yesBid).toBe(0.55);
		expect(state?.yesAsk).toBe(0.57);
		expect(state?.noBid).toBe(0.43);
		expect(state?.noAsk).toBe(0.45);
	});
});

describe("MarketStateCache expiration", () => {
	it("should expire entries after TTL", () => {
		const cache = new MarketStateCache(1);
		cache.updateFromTicker({ market_ticker: "KXFED-26JAN29", yes_bid: 0.55, timestamp: nowIso() });
		wait(10);
		expect(cache.get("KXFED-26JAN29")).toBeUndefined();
	});

	it("should prune expired entries", () => {
		const cache = new MarketStateCache(1);
		cache.updateFromTicker({ market_ticker: "TICKER1", yes_bid: 0.55, timestamp: nowIso() });
		cache.updateFromTicker({ market_ticker: "TICKER2", yes_bid: 0.6, timestamp: nowIso() });
		wait(10);
		expect(cache.prune()).toBe(2);
	});
});

describe("MarketStateCache utility methods", () => {
	it("should return undefined for unknown tickers", () => {
		expect(new MarketStateCache().get("UNKNOWN")).toBeUndefined();
	});

	it("should clear all entries", () => {
		const cache = new MarketStateCache();
		cache.updateFromTicker({ market_ticker: "TICKER1", yes_bid: 0.55, timestamp: nowIso() });
		cache.updateFromTicker({ market_ticker: "TICKER2", yes_bid: 0.6, timestamp: nowIso() });
		cache.clear();
		expect(cache.get("TICKER1")).toBeUndefined();
		expect(cache.get("TICKER2")).toBeUndefined();
	});

	it("should list all tickers", () => {
		const cache = new MarketStateCache();
		cache.updateFromTicker({ market_ticker: "TICKER1", yes_bid: 0.55, timestamp: nowIso() });
		cache.updateFromTicker({ market_ticker: "TICKER2", yes_bid: 0.6, timestamp: nowIso() });
		const tickers = cache.getAllTickers();
		expect(tickers).toContain("TICKER1");
		expect(tickers).toContain("TICKER2");
		expect(tickers).toHaveLength(2);
	});
});
