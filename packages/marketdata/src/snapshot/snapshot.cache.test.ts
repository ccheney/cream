import { beforeEach, describe, expect, it } from "bun:test";

import { getGlobalCache, resetGlobalCache, SnapshotCache } from "./cache";
import { createSimpleSnapshot } from "./snapshot.test.fixtures";

beforeEach(() => {
	resetGlobalCache();
});

describe("SnapshotCache set/get", () => {
	it("should store and retrieve snapshots", () => {
		const cache = new SnapshotCache();
		const snapshot = createSimpleSnapshot("AAPL", Date.now());

		cache.set(snapshot);
		const retrieved = cache.get("AAPL", snapshot.timestamp);

		expect(retrieved).not.toBeNull();
		expect(retrieved?.symbol).toBe("AAPL");
		expect(retrieved?.latestPrice).toBe(150);
	});

	it("should return null for missing entries", () => {
		const cache = new SnapshotCache();
		const result = cache.get("MISSING", Date.now());
		expect(result).toBeNull();
	});
});

describe("SnapshotCache TTL", () => {
	it("should expire entries after TTL", () => {
		const cache = new SnapshotCache({ ttlMs: 100 });
		const snapshot = createSimpleSnapshot("AAPL", Date.now());

		cache.set(snapshot);
		expect(cache.get("AAPL", snapshot.timestamp)).not.toBeNull();

		return new Promise<void>((resolve) => {
			setTimeout(() => {
				expect(cache.get("AAPL", snapshot.timestamp)).toBeNull();
				resolve();
			}, 150);
		});
	});
});

describe("SnapshotCache capacity", () => {
	it("should evict oldest entries when at capacity", () => {
		const cache = new SnapshotCache({ maxEntries: 2 });
		const ts = Date.now();

		cache.set(createSimpleSnapshot("AAPL", ts));
		cache.set(createSimpleSnapshot("MSFT", ts));
		cache.set(createSimpleSnapshot("GOOGL", ts));

		expect(cache.get("AAPL", ts)).toBeNull();
		expect(cache.get("MSFT", ts)).not.toBeNull();
		expect(cache.get("GOOGL", ts)).not.toBeNull();
	});
});

describe("SnapshotCache stats", () => {
	it("should track hit/miss statistics", () => {
		const cache = new SnapshotCache();
		const ts = Date.now();

		cache.set(createSimpleSnapshot("AAPL", ts));
		cache.get("AAPL", ts);
		cache.get("AAPL", ts);
		cache.get("MISSING", ts);

		const stats = cache.getStats();
		expect(stats.hits).toBe(2);
		expect(stats.misses).toBe(1);
		expect(stats.hitRate).toBeCloseTo(0.667, 2);
	});
});

describe("SnapshotCache invalidation", () => {
	it("should invalidate specific snapshots", () => {
		const cache = new SnapshotCache();
		const ts = Date.now();

		cache.set(createSimpleSnapshot("AAPL", ts));
		expect(cache.has("AAPL", ts)).toBe(true);

		cache.invalidate("AAPL", ts);
		expect(cache.has("AAPL", ts)).toBe(false);
	});

	it("should invalidate all snapshots for a symbol", () => {
		const cache = new SnapshotCache();
		const ts1 = Date.now();
		const ts2 = ts1 + 3600000;

		cache.set(createSimpleSnapshot("AAPL", ts1));
		cache.set(createSimpleSnapshot("AAPL", ts2));

		const count = cache.invalidateSymbol("AAPL");
		expect(count).toBe(2);
		expect(cache.get("AAPL", ts1)).toBeNull();
		expect(cache.get("AAPL", ts2)).toBeNull();
	});
});

describe("SnapshotCache globals", () => {
	it("should use global cache singleton", () => {
		const cache1 = getGlobalCache();
		const cache2 = getGlobalCache();
		expect(cache1).toBe(cache2);
	});

	it("should reset global cache", () => {
		const cache1 = getGlobalCache();
		resetGlobalCache();
		const cache2 = getGlobalCache();
		expect(cache1).not.toBe(cache2);
	});
});

describe("SnapshotCache clear", () => {
	it("should clear all entries and reset stats", () => {
		const cache = new SnapshotCache();
		const ts = Date.now();

		cache.set(createSimpleSnapshot("AAPL", ts));
		cache.get("AAPL", ts);
		cache.get("MISSING", ts);

		const statsBefore = cache.getStats();
		expect(statsBefore.size).toBe(1);
		expect(statsBefore.hits).toBe(1);
		expect(statsBefore.misses).toBe(1);

		cache.clear();

		const statsAfter = cache.getStats();
		expect(statsAfter.size).toBe(0);
		expect(statsAfter.hits).toBe(0);
		expect(statsAfter.misses).toBe(0);
		expect(cache.get("AAPL", ts)).toBeNull();
	});
});

describe("SnapshotCache prune", () => {
	it("should prune expired entries", async () => {
		const cache = new SnapshotCache({ ttlMs: 50 });
		const ts = Date.now();

		cache.set(createSimpleSnapshot("AAPL", ts));
		await new Promise((resolve) => setTimeout(resolve, 100));

		cache.set(createSimpleSnapshot("MSFT", Date.now()));

		const pruned = cache.prune();
		expect(pruned).toBe(1);

		const stats = cache.getStats();
		expect(stats.size).toBe(1);
	});
});
