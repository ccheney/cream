import { beforeEach, describe, expect, it } from "bun:test";

import { buildSnapshot, buildSnapshots, type CandleDataSource } from "./builder";
import { resetGlobalCache, SnapshotCache } from "./cache";
import { FeatureSnapshotSchema } from "./schema";
import { createTestSources } from "./snapshot.test.fixtures";

beforeEach(() => {
	resetGlobalCache();
});

describe("buildSnapshot complete snapshot", () => {
	it("should build a complete snapshot", async () => {
		const sources = createTestSources();
		const ts = Date.now();

		const snapshot = await buildSnapshot("AAPL", ts, sources);

		expect(snapshot.symbol).toBe("AAPL");
		expect(snapshot.timestamp).toBe(ts);
		expect(snapshot.latestPrice).toBeGreaterThan(0);
		expect(snapshot.latestVolume).toBeGreaterThan(0);
		expect(snapshot.regime.regime).toBeDefined();
		expect(snapshot.regime.confidence).toBeGreaterThanOrEqual(0);
		expect(snapshot.regime.confidence).toBeLessThanOrEqual(1);
		expect(Object.keys(snapshot.indicators).length).toBeGreaterThan(0);
		expect(snapshot.metadata.symbol).toBe("AAPL");
		expect(snapshot.metadata.sector).toBe("Technology");
		expect(snapshot.metadata.marketCapBucket).toBe("MEGA");
		expect(snapshot.recentEvents.length).toBe(2);
		expect(snapshot.recentEvents[0]?.eventType).toBe("EARNINGS");
	});
});

describe("buildSnapshot cache behavior", () => {
	it("should use cache on subsequent calls", async () => {
		const sources = createTestSources();
		const ts = Date.now();
		const cache = new SnapshotCache();

		const snap1 = await buildSnapshot("AAPL", ts, sources, { cache });
		const snap2 = await buildSnapshot("AAPL", ts, sources, { cache });

		expect(snap1).toBe(snap2);
		expect(cache.getStats().hits).toBe(1);
	});

	it("should bypass cache when useCache is false", async () => {
		const sources = createTestSources();
		const ts = Date.now();
		const cache = new SnapshotCache();

		const snap1 = await buildSnapshot("AAPL", ts, sources, { cache, useCache: true });
		const snap2 = await buildSnapshot("AAPL", ts, sources, { cache, useCache: false });

		expect(snap1).not.toBe(snap2);
		expect(snap1.symbol).toBe(snap2.symbol);
	});
});

describe("buildSnapshot configuration", () => {
	it("should respect lookback window configuration", async () => {
		const sources = createTestSources();
		const snapshot = await buildSnapshot("AAPL", Date.now(), sources, {
			config: { lookbackWindow: 50 },
			useCache: false,
		});

		const primaryCandles = snapshot.candles["1h"];
		expect(primaryCandles).toBeDefined();
		if (!primaryCandles) {
			throw new Error("Expected primary candles to be defined");
		}
		expect(primaryCandles.length).toBeLessThanOrEqual(50);
	});

	it("should include only specified timeframes", async () => {
		const sources = createTestSources();
		const snapshot = await buildSnapshot("AAPL", Date.now(), sources, {
			config: { timeframes: ["1h", "1d"] },
			useCache: false,
		});

		expect(snapshot.candles["1h"]).toBeDefined();
		expect(snapshot.candles["1d"]).toBeDefined();
		expect(snapshot.candles["4h"]).toBeUndefined();
		expect(snapshot.config.timeframes).toEqual(["1h", "1d"]);
	});
});

describe("buildSnapshot optional sources", () => {
	it("should work without event source", async () => {
		const sources = createTestSources();
		const { events, ...sourcesWithoutEvents } = sources;
		void events;

		const snapshot = await buildSnapshot("AAPL", Date.now(), sourcesWithoutEvents, {
			useCache: false,
		});

		expect(snapshot.recentEvents).toEqual([]);
	});

	it("should work without universe source", async () => {
		const sources = createTestSources();
		const { universe, ...sourcesWithoutUniverse } = sources;
		void universe;

		const snapshot = await buildSnapshot("AAPL", Date.now(), sourcesWithoutUniverse, {
			useCache: false,
		});

		expect(snapshot.metadata.symbol).toBe("AAPL");
		expect(snapshot.metadata.sector).toBeUndefined();
	});
});

describe("buildSnapshot error handling", () => {
	it("should throw if no candle data available", async () => {
		const emptyCandleSource: CandleDataSource = {
			async getCandles() {
				return [];
			},
		};

		await expect(buildSnapshot("AAPL", Date.now(), { candles: emptyCandleSource })).rejects.toThrow(
			"No candle data available",
		);
	});
});

describe("buildSnapshot schema validation", () => {
	it("should validate output against schema", async () => {
		const sources = createTestSources();
		const snapshot = await buildSnapshot("AAPL", Date.now(), sources, {
			useCache: false,
		});

		const parsed = FeatureSnapshotSchema.parse(snapshot);
		expect(parsed.symbol).toBe("AAPL");
	});
});

describe("buildSnapshots", () => {
	it("should build snapshots for multiple symbols", async () => {
		const sources = createTestSources();
		const snapshots = await buildSnapshots(["AAPL", "MSFT"], Date.now(), sources, {
			useCache: false,
		});

		expect(snapshots.size).toBe(2);
		expect(snapshots.get("AAPL")).toBeDefined();
		expect(snapshots.get("MSFT")).toBeDefined();
		expect(snapshots.get("AAPL")?.metadata.name).toBe("Apple Inc.");
		expect(snapshots.get("MSFT")?.metadata.name).toBe("Microsoft Corporation");
	});

	it("should continue on individual failures", async () => {
		const sources = createTestSources();
		const snapshots = await buildSnapshots(["AAPL", "MISSING"], Date.now(), sources, {
			useCache: false,
		});

		expect(snapshots.size).toBe(1);
		expect(snapshots.get("AAPL")).toBeDefined();
		expect(snapshots.get("MISSING")).toBeUndefined();
	});
});
