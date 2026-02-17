/**
 * Tests for Market Cache
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { PredictionMarketEvent, PredictionMarketScores } from "@cream/domain";
import { createMarketCache, MarketCache } from "./market-cache";

function createMockEvent(ticker: string): PredictionMarketEvent {
	return {
		eventId: `pm_${ticker}`,
		eventType: "PREDICTION_MARKET",
		eventTime: new Date().toISOString(),
		payload: {
			platform: "KALSHI",
			marketType: "FED_RATE",
			marketTicker: ticker,
			marketQuestion: `Test question for ${ticker}`,
			outcomes: [
				{ outcome: "Yes", probability: 0.6, price: 0.6 },
				{ outcome: "No", probability: 0.4, price: 0.4 },
			],
			lastUpdated: new Date().toISOString(),
		},
		relatedInstrumentIds: [],
	};
}

function createMockScores(): PredictionMarketScores {
	return {
		fedCutProbability: 0.65,
		fedHikeProbability: 0.05,
		recessionProbability12m: 0.25,
		macroUncertaintyIndex: 0.4,
		policyEventRisk: 0.3,
	};
}

function waitForExpiration(durationMs = 10): void {
	const start = Date.now();
	while (Date.now() - start < durationMs) {
		// Busy wait
	}
}

let cache: MarketCache;

beforeEach(() => {
	cache = new MarketCache({ autoPrune: false });
});

afterEach(() => {
	cache.dispose();
});

describe("MarketCache event storage", () => {
	it("caches and retrieves events", () => {
		cache.setEvent("KXFED-26JAN29", createMockEvent("KXFED-26JAN29"));
		const retrieved = cache.getEvent("KXFED-26JAN29");
		expect(retrieved?.eventId).toBe("pm_KXFED-26JAN29");
	});

	it("returns null for unknown tickers", () => {
		expect(cache.getEvent("UNKNOWN")).toBeNull();
	});

	it("returns all cached events", () => {
		cache.setEvent("TICKER1", createMockEvent("TICKER1"));
		cache.setEvent("TICKER2", createMockEvent("TICKER2"));
		expect(cache.getAllEvents()).toHaveLength(2);
	});
});

describe("MarketCache event invalidation", () => {
	it("invalidates a specific event", () => {
		cache.setEvent("TICKER1", createMockEvent("TICKER1"));
		cache.setEvent("TICKER2", createMockEvent("TICKER2"));
		const deleted = cache.invalidateEvent("TICKER1");
		expect(deleted).toBe(true);
		expect(cache.getEvent("TICKER1")).toBeNull();
		expect(cache.getEvent("TICKER2")).not.toBeNull();
	});

	it("invalidates events by predicate", () => {
		cache.setEvent("KXFED-1", createMockEvent("KXFED-1"));
		cache.setEvent("KXFED-2", createMockEvent("KXFED-2"));
		cache.setEvent("OTHER", createMockEvent("OTHER"));
		const count = cache.invalidateEventsWhere((event) =>
			event.payload.marketTicker.startsWith("KXFED"),
		);
		expect(count).toBe(2);
		expect(cache.getEvent("KXFED-1")).toBeNull();
		expect(cache.getEvent("KXFED-2")).toBeNull();
		expect(cache.getEvent("OTHER")).not.toBeNull();
	});

	it("sets multiple events in one call", () => {
		cache.setEvents([createMockEvent("TICKER1"), createMockEvent("TICKER2")]);
		expect(cache.getEvent("TICKER1")).not.toBeNull();
		expect(cache.getEvent("TICKER2")).not.toBeNull();
	});
});

describe("MarketCache event eviction", () => {
	it("expires events after TTL", () => {
		const shortTtlCache = new MarketCache({ eventTtlMs: 1, autoPrune: false });
		shortTtlCache.setEvent("KXFED", createMockEvent("KXFED"));
		waitForExpiration();
		expect(shortTtlCache.getEvent("KXFED")).toBeNull();
		shortTtlCache.dispose();
	});

	it("evicts LRU entries when at capacity", () => {
		const smallCache = new MarketCache({ maxEventEntries: 2, autoPrune: false });
		smallCache.setEvent("TICKER1", createMockEvent("TICKER1"));
		smallCache.setEvent("TICKER2", createMockEvent("TICKER2"));
		smallCache.getEvent("TICKER1");
		smallCache.setEvent("TICKER3", createMockEvent("TICKER3"));
		expect(smallCache.getEvent("TICKER1")).not.toBeNull();
		expect(smallCache.getEvent("TICKER2")).toBeNull();
		expect(smallCache.getEvent("TICKER3")).not.toBeNull();
		smallCache.dispose();
	});
});

describe("MarketCache score storage", () => {
	it("caches and retrieves scores", () => {
		cache.setScores(createMockScores());
		expect(cache.getScores()?.fedCutProbability).toBe(0.65);
	});

	it("returns null when scores are missing", () => {
		expect(cache.getScores()).toBeNull();
	});

	it("expires scores after TTL", () => {
		const shortTtlCache = new MarketCache({ scoresTtlMs: 1, autoPrune: false });
		shortTtlCache.setScores(createMockScores());
		waitForExpiration();
		expect(shortTtlCache.getScores()).toBeNull();
		shortTtlCache.dispose();
	});

	it("invalidates scores", () => {
		cache.setScores(createMockScores());
		cache.invalidateScores();
		expect(cache.getScores()).toBeNull();
	});
});

describe("MarketCache getOrFetch events", () => {
	it("returns cached events without calling fetcher", async () => {
		cache.setEvent("CACHED", createMockEvent("CACHED"));
		let fetcherCalled = false;
		const result = await cache.getOrFetchEvent("CACHED", async () => {
			fetcherCalled = true;
			return createMockEvent("NEW");
		});
		expect(fetcherCalled).toBe(false);
		expect(result?.eventId).toBe("pm_CACHED");
	});

	it("calls fetcher for uncached events", async () => {
		let fetcherCalled = false;
		const result = await cache.getOrFetchEvent("NEW", async () => {
			fetcherCalled = true;
			return createMockEvent("NEW");
		});
		expect(fetcherCalled).toBe(true);
		expect(result?.eventId).toBe("pm_NEW");
	});

	it("caches fetched events", async () => {
		await cache.getOrFetchEvent("FETCHED", async () => createMockEvent("FETCHED"));
		let fetcherCalled = false;
		await cache.getOrFetchEvent("FETCHED", async () => {
			fetcherCalled = true;
			return createMockEvent("NEW");
		});
		expect(fetcherCalled).toBe(false);
	});
});

describe("MarketCache getOrFetch scores", () => {
	it("returns cached scores without calling fetcher", async () => {
		cache.setScores(createMockScores());
		let fetcherCalled = false;
		const result = await cache.getOrFetchScores(async () => {
			fetcherCalled = true;
			return { fedCutProbability: 0.99 };
		});
		expect(fetcherCalled).toBe(false);
		expect(result.fedCutProbability).toBe(0.65);
	});

	it("calls fetcher for uncached scores", async () => {
		let fetcherCalled = false;
		const result = await cache.getOrFetchScores(async () => {
			fetcherCalled = true;
			return { fedCutProbability: 0.99 };
		});
		expect(fetcherCalled).toBe(true);
		expect(result.fedCutProbability).toBe(0.99);
	});
});

describe("MarketCache management", () => {
	it("clears all cached data", () => {
		cache.setEvent("TICKER", createMockEvent("TICKER"));
		cache.setScores(createMockScores());
		cache.clear();
		expect(cache.getEvent("TICKER")).toBeNull();
		expect(cache.getScores()).toBeNull();
	});

	it("prunes expired entries", () => {
		const shortTtlCache = new MarketCache({
			eventTtlMs: 1,
			scoresTtlMs: 1,
			autoPrune: false,
		});
		shortTtlCache.setEvent("TICKER", createMockEvent("TICKER"));
		shortTtlCache.setScores(createMockScores());
		waitForExpiration();
		expect(shortTtlCache.prune()).toBe(2);
		shortTtlCache.dispose();
	});

	it("tracks hit/miss statistics", () => {
		cache.setEvent("TICKER", createMockEvent("TICKER"));
		cache.getEvent("TICKER");
		cache.getEvent("UNKNOWN");
		const stats = cache.getStats();
		expect(stats.eventEntries).toBe(1);
		expect(stats.hitCount).toBe(1);
		expect(stats.missCount).toBe(1);
		expect(stats.hitRate).toBe(0.5);
	});

	it("resets statistics", () => {
		cache.getEvent("UNKNOWN");
		cache.resetStats();
		const stats = cache.getStats();
		expect(stats.hitCount).toBe(0);
		expect(stats.missCount).toBe(0);
	});
});

describe("createMarketCache", () => {
	it("creates cache with default config", () => {
		const factoryCache = createMarketCache();
		expect(factoryCache).toBeInstanceOf(MarketCache);
		factoryCache.dispose();
	});

	it("creates cache with custom config", () => {
		const factoryCache = createMarketCache({ eventTtlMs: 30000, maxEventEntries: 500 });
		expect(factoryCache).toBeInstanceOf(MarketCache);
		factoryCache.dispose();
	});
});
