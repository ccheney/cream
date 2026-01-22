/**
 * Tests for Market Cache
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { PredictionMarketEvent, PredictionMarketScores } from "@cream/domain";
import { createMarketCache, MarketCache } from "./market-cache";

// ============================================
// Test Fixtures
// ============================================

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

// ============================================
// Tests
// ============================================

describe("MarketCache", () => {
	let cache: MarketCache;

	beforeEach(() => {
		cache = new MarketCache({ autoPrune: false });
	});

	afterEach(() => {
		cache.dispose();
	});

	describe("Event Cache", () => {
		it("should cache and retrieve events", () => {
			const event = createMockEvent("KXFED-26JAN29");
			cache.setEvent("KXFED-26JAN29", event);

			const retrieved = cache.getEvent("KXFED-26JAN29");
			expect(retrieved).not.toBeNull();
			expect(retrieved?.eventId).toBe("pm_KXFED-26JAN29");
		});

		it("should return null for uncached events", () => {
			const result = cache.getEvent("UNKNOWN");
			expect(result).toBeNull();
		});

		it("should expire events after TTL", () => {
			const shortTtlCache = new MarketCache({
				eventTtlMs: 1,
				autoPrune: false,
			});

			const event = createMockEvent("KXFED");
			shortTtlCache.setEvent("KXFED", event);

			// Wait for expiration
			const start = Date.now();
			while (Date.now() - start < 10) {
				// Busy wait
			}

			const result = shortTtlCache.getEvent("KXFED");
			expect(result).toBeNull();

			shortTtlCache.dispose();
		});

		it("should invalidate specific events", () => {
			cache.setEvent("TICKER1", createMockEvent("TICKER1"));
			cache.setEvent("TICKER2", createMockEvent("TICKER2"));

			const deleted = cache.invalidateEvent("TICKER1");
			expect(deleted).toBe(true);
			expect(cache.getEvent("TICKER1")).toBeNull();
			expect(cache.getEvent("TICKER2")).not.toBeNull();
		});

		it("should invalidate events by predicate", () => {
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

		it("should get all cached events", () => {
			cache.setEvent("TICKER1", createMockEvent("TICKER1"));
			cache.setEvent("TICKER2", createMockEvent("TICKER2"));

			const all = cache.getAllEvents();
			expect(all).toHaveLength(2);
		});

		it("should set multiple events", () => {
			const events = [
				createMockEvent("TICKER1"),
				createMockEvent("TICKER2"),
				createMockEvent("TICKER3"),
			];

			cache.setEvents(events);

			expect(cache.getEvent("TICKER1")).not.toBeNull();
			expect(cache.getEvent("TICKER2")).not.toBeNull();
			expect(cache.getEvent("TICKER3")).not.toBeNull();
		});

		it("should evict LRU entries when at capacity", () => {
			const smallCache = new MarketCache({
				maxEventEntries: 2,
				autoPrune: false,
			});

			smallCache.setEvent("TICKER1", createMockEvent("TICKER1"));
			smallCache.setEvent("TICKER2", createMockEvent("TICKER2"));

			// Access TICKER1 to make it more recently used
			smallCache.getEvent("TICKER1");

			// Add third entry, should evict TICKER2
			smallCache.setEvent("TICKER3", createMockEvent("TICKER3"));

			expect(smallCache.getEvent("TICKER1")).not.toBeNull();
			expect(smallCache.getEvent("TICKER2")).toBeNull();
			expect(smallCache.getEvent("TICKER3")).not.toBeNull();

			smallCache.dispose();
		});
	});

	describe("Scores Cache", () => {
		it("should cache and retrieve scores", () => {
			const scores = createMockScores();
			cache.setScores(scores);

			const retrieved = cache.getScores();
			expect(retrieved).not.toBeNull();
			expect(retrieved?.fedCutProbability).toBe(0.65);
		});

		it("should return null for uncached scores", () => {
			const result = cache.getScores();
			expect(result).toBeNull();
		});

		it("should expire scores after TTL", () => {
			const shortTtlCache = new MarketCache({
				scoresTtlMs: 1,
				autoPrune: false,
			});

			shortTtlCache.setScores(createMockScores());

			// Wait for expiration
			const start = Date.now();
			while (Date.now() - start < 10) {
				// Busy wait
			}

			const result = shortTtlCache.getScores();
			expect(result).toBeNull();

			shortTtlCache.dispose();
		});

		it("should invalidate scores", () => {
			cache.setScores(createMockScores());
			expect(cache.getScores()).not.toBeNull();

			cache.invalidateScores();
			expect(cache.getScores()).toBeNull();
		});
	});

	describe("Get or Fetch Patterns", () => {
		it("should return cached event without calling fetcher", async () => {
			const event = createMockEvent("CACHED");
			cache.setEvent("CACHED", event);

			let fetcherCalled = false;
			const result = await cache.getOrFetchEvent("CACHED", async () => {
				fetcherCalled = true;
				return createMockEvent("NEW");
			});

			expect(fetcherCalled).toBe(false);
			expect(result?.eventId).toBe("pm_CACHED");
		});

		it("should call fetcher for uncached event", async () => {
			let fetcherCalled = false;
			const result = await cache.getOrFetchEvent("NEW", async () => {
				fetcherCalled = true;
				return createMockEvent("NEW");
			});

			expect(fetcherCalled).toBe(true);
			expect(result?.eventId).toBe("pm_NEW");
		});

		it("should cache fetched event", async () => {
			await cache.getOrFetchEvent("FETCHED", async () => {
				return createMockEvent("FETCHED");
			});

			// Second call should hit cache
			let fetcherCalled = false;
			await cache.getOrFetchEvent("FETCHED", async () => {
				fetcherCalled = true;
				return createMockEvent("NEW");
			});

			expect(fetcherCalled).toBe(false);
		});

		it("should return cached scores without calling fetcher", async () => {
			cache.setScores(createMockScores());

			let fetcherCalled = false;
			const result = await cache.getOrFetchScores(async () => {
				fetcherCalled = true;
				return { fedCutProbability: 0.99 };
			});

			expect(fetcherCalled).toBe(false);
			expect(result.fedCutProbability).toBe(0.65);
		});

		it("should call fetcher for uncached scores", async () => {
			let fetcherCalled = false;
			const result = await cache.getOrFetchScores(async () => {
				fetcherCalled = true;
				return { fedCutProbability: 0.99 };
			});

			expect(fetcherCalled).toBe(true);
			expect(result.fedCutProbability).toBe(0.99);
		});
	});

	describe("Cache Management", () => {
		it("should clear all cached data", () => {
			cache.setEvent("TICKER", createMockEvent("TICKER"));
			cache.setScores(createMockScores());

			cache.clear();

			expect(cache.getEvent("TICKER")).toBeNull();
			expect(cache.getScores()).toBeNull();
		});

		it("should prune expired entries", () => {
			const shortTtlCache = new MarketCache({
				eventTtlMs: 1,
				scoresTtlMs: 1,
				autoPrune: false,
			});

			shortTtlCache.setEvent("TICKER", createMockEvent("TICKER"));
			shortTtlCache.setScores(createMockScores());

			// Wait for expiration
			const start = Date.now();
			while (Date.now() - start < 10) {
				// Busy wait
			}

			const pruned = shortTtlCache.prune();
			expect(pruned).toBe(2);

			shortTtlCache.dispose();
		});

		it("should track statistics", () => {
			cache.setEvent("TICKER", createMockEvent("TICKER"));

			// Hit
			cache.getEvent("TICKER");
			// Miss
			cache.getEvent("UNKNOWN");

			const stats = cache.getStats();
			expect(stats.eventEntries).toBe(1);
			expect(stats.hitCount).toBe(1);
			expect(stats.missCount).toBe(1);
			expect(stats.hitRate).toBe(0.5);
		});

		it("should reset statistics", () => {
			cache.getEvent("UNKNOWN");
			cache.resetStats();

			const stats = cache.getStats();
			expect(stats.hitCount).toBe(0);
			expect(stats.missCount).toBe(0);
		});
	});

	describe("Factory Function", () => {
		it("should create cache with default config", () => {
			const factoryCache = createMarketCache();
			expect(factoryCache).toBeInstanceOf(MarketCache);
			factoryCache.dispose();
		});

		it("should create cache with custom config", () => {
			const factoryCache = createMarketCache({
				eventTtlMs: 30000,
				maxEventEntries: 500,
			});
			expect(factoryCache).toBeInstanceOf(MarketCache);
			factoryCache.dispose();
		});
	});
});
