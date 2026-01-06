/**
 * Feature Snapshot Builder Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { Candle } from "@cream/indicators";
import type { ResolvedInstrument } from "@cream/universe";

import {
  buildSnapshot,
  buildSnapshots,
  type CandleDataSource,
  compactSnapshot,
  createMockCandleSource,
  createMockEventSource,
  createMockUniverseSource,
  getSnapshotSummary,
  serializeSnapshot,
} from "./builder";
import { getGlobalCache, resetGlobalCache, SnapshotCache } from "./cache";
import {
  classifyMarketCap,
  type ExternalEventSummary,
  type FeatureSnapshot,
  FeatureSnapshotSchema,
  isValidFeatureSnapshot,
  parseFeatureSnapshot,
  type Timeframe,
} from "./schema";

// ============================================
// Test Fixtures
// ============================================

/**
 * Generate sample candles for testing.
 */
function generateCandles(count: number, basePrice: number, baseTime: number): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2; // -1 to 1
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 0.5;
    const low = Math.min(open, close) - Math.random() * 0.5;
    const volume = 1000000 + Math.random() * 500000;

    candles.push({
      timestamp: baseTime + i * 3600000, // 1 hour intervals
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return candles;
}

/**
 * Create test data sources.
 */
function createTestSources() {
  const baseTime = Date.now() - 200 * 3600000; // 200 hours ago

  // Generate candles for different timeframes
  const aaplCandles = new Map<Timeframe, Candle[]>();
  aaplCandles.set("1h", generateCandles(200, 150, baseTime));
  aaplCandles.set("4h", generateCandles(50, 150, baseTime));
  aaplCandles.set("1d", generateCandles(30, 150, baseTime));

  const msftCandles = new Map<Timeframe, Candle[]>();
  msftCandles.set("1h", generateCandles(200, 350, baseTime));
  msftCandles.set("4h", generateCandles(50, 350, baseTime));
  msftCandles.set("1d", generateCandles(30, 350, baseTime));

  const candlesBySymbol = new Map<string, Map<Timeframe, Candle[]>>();
  candlesBySymbol.set("AAPL", aaplCandles);
  candlesBySymbol.set("MSFT", msftCandles);

  // Generate events
  const aaplEvents: ExternalEventSummary[] = [
    {
      eventId: "event-1",
      eventType: "EARNINGS",
      eventTime: new Date(Date.now() - 24 * 3600000).toISOString(),
      summary: "Q4 earnings beat expectations",
      sentimentScore: 0.7,
      importanceScore: 0.9,
    },
    {
      eventId: "event-2",
      eventType: "NEWS",
      eventTime: new Date(Date.now() - 48 * 3600000).toISOString(),
      summary: "New product announcement",
      sentimentScore: 0.5,
      importanceScore: 0.6,
    },
  ];

  const eventsBySymbol = new Map<string, ExternalEventSummary[]>();
  eventsBySymbol.set("AAPL", aaplEvents);
  eventsBySymbol.set("MSFT", []);

  // Generate metadata
  const aaplMetadata: ResolvedInstrument = {
    symbol: "AAPL",
    name: "Apple Inc.",
    sector: "Technology",
    industry: "Consumer Electronics",
    marketCap: 3000000000000, // $3T
    avgVolume: 50000000,
    price: 150,
    source: "test",
  };

  const msftMetadata: ResolvedInstrument = {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    sector: "Technology",
    industry: "Software",
    marketCap: 2800000000000, // $2.8T
    avgVolume: 25000000,
    price: 350,
    source: "test",
  };

  const metadataBySymbol = new Map<string, ResolvedInstrument>();
  metadataBySymbol.set("AAPL", aaplMetadata);
  metadataBySymbol.set("MSFT", msftMetadata);

  return {
    candles: createMockCandleSource(candlesBySymbol),
    events: createMockEventSource(eventsBySymbol),
    universe: createMockUniverseSource(metadataBySymbol),
  };
}

// ============================================
// Schema Tests
// ============================================

describe("Schema", () => {
  describe("classifyMarketCap", () => {
    it("should classify MEGA cap", () => {
      expect(classifyMarketCap(250_000_000_000)).toBe("MEGA");
      expect(classifyMarketCap(3_000_000_000_000)).toBe("MEGA");
    });

    it("should classify LARGE cap", () => {
      expect(classifyMarketCap(50_000_000_000)).toBe("LARGE");
      expect(classifyMarketCap(10_000_000_000)).toBe("LARGE");
    });

    it("should classify MID cap", () => {
      expect(classifyMarketCap(5_000_000_000)).toBe("MID");
      expect(classifyMarketCap(2_000_000_000)).toBe("MID");
    });

    it("should classify SMALL cap", () => {
      expect(classifyMarketCap(1_000_000_000)).toBe("SMALL");
      expect(classifyMarketCap(300_000_000)).toBe("SMALL");
    });

    it("should classify MICRO cap", () => {
      expect(classifyMarketCap(100_000_000)).toBe("MICRO");
      expect(classifyMarketCap(50_000_000)).toBe("MICRO");
    });

    it("should return undefined for undefined input", () => {
      expect(classifyMarketCap(undefined)).toBeUndefined();
    });
  });

  describe("parseFeatureSnapshot", () => {
    it("should validate a valid snapshot", () => {
      const snapshot: FeatureSnapshot = {
        symbol: "AAPL",
        timestamp: Date.now(),
        createdAt: new Date().toISOString(),
        candles: {},
        latestPrice: 150.5,
        latestVolume: 1000000,
        indicators: { rsi_14_1h: 65 },
        normalized: { zscore_rsi_14_1h: 0.5 },
        regime: {
          regime: "BULL_TREND",
          confidence: 0.8,
        },
        recentEvents: [],
        metadata: { symbol: "AAPL" },
        config: {
          lookbackWindow: 100,
          timeframes: ["1h", "4h", "1d"],
          eventLookbackHours: 72,
        },
      };

      const parsed = parseFeatureSnapshot(snapshot);
      expect(parsed.symbol).toBe("AAPL");
      expect(parsed.regime.regime).toBe("BULL_TREND");
    });

    it("should reject invalid regime label", () => {
      const invalid = {
        symbol: "AAPL",
        timestamp: Date.now(),
        createdAt: new Date().toISOString(),
        candles: {},
        latestPrice: 150.5,
        latestVolume: 1000000,
        indicators: {},
        normalized: {},
        regime: {
          regime: "INVALID_REGIME",
          confidence: 0.8,
        },
        recentEvents: [],
        metadata: { symbol: "AAPL" },
        config: {
          lookbackWindow: 100,
          timeframes: ["1h"],
          eventLookbackHours: 72,
        },
      };

      expect(() => parseFeatureSnapshot(invalid)).toThrow();
    });
  });

  describe("isValidFeatureSnapshot", () => {
    it("should return true for valid snapshot", () => {
      const snapshot = {
        symbol: "AAPL",
        timestamp: Date.now(),
        createdAt: new Date().toISOString(),
        candles: {},
        latestPrice: 150.5,
        latestVolume: 1000000,
        indicators: {},
        normalized: {},
        regime: {
          regime: "RANGE",
          confidence: 0.6,
        },
        recentEvents: [],
        metadata: { symbol: "AAPL" },
        config: {
          lookbackWindow: 100,
          timeframes: ["1h"],
          eventLookbackHours: 72,
        },
      };

      expect(isValidFeatureSnapshot(snapshot)).toBe(true);
    });

    it("should return false for invalid snapshot", () => {
      expect(isValidFeatureSnapshot({})).toBe(false);
      expect(isValidFeatureSnapshot(null)).toBe(false);
      expect(isValidFeatureSnapshot("not an object")).toBe(false);
    });
  });
});

// ============================================
// Cache Tests
// ============================================

describe("SnapshotCache", () => {
  beforeEach(() => {
    resetGlobalCache();
  });

  it("should store and retrieve snapshots", () => {
    const cache = new SnapshotCache();
    const snapshot: FeatureSnapshot = {
      symbol: "AAPL",
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      candles: {},
      latestPrice: 150,
      latestVolume: 1000000,
      indicators: {},
      normalized: {},
      regime: { regime: "BULL_TREND", confidence: 0.8 },
      recentEvents: [],
      metadata: { symbol: "AAPL" },
      config: { lookbackWindow: 100, timeframes: ["1h"], eventLookbackHours: 72 },
    };

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

  it("should expire entries after TTL", () => {
    const cache = new SnapshotCache({ ttlMs: 100 });
    const snapshot: FeatureSnapshot = {
      symbol: "AAPL",
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      candles: {},
      latestPrice: 150,
      latestVolume: 1000000,
      indicators: {},
      normalized: {},
      regime: { regime: "BULL_TREND", confidence: 0.8 },
      recentEvents: [],
      metadata: { symbol: "AAPL" },
      config: { lookbackWindow: 100, timeframes: ["1h"], eventLookbackHours: 72 },
    };

    cache.set(snapshot);

    // Should be available immediately
    expect(cache.get("AAPL", snapshot.timestamp)).not.toBeNull();

    // Wait for TTL to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cache.get("AAPL", snapshot.timestamp)).toBeNull();
        resolve();
      }, 150);
    });
  });

  it("should evict oldest entries when at capacity", () => {
    const cache = new SnapshotCache({ maxEntries: 2 });
    const ts = Date.now();

    const snap1: FeatureSnapshot = {
      symbol: "AAPL",
      timestamp: ts,
      createdAt: new Date().toISOString(),
      candles: {},
      latestPrice: 150,
      latestVolume: 1000000,
      indicators: {},
      normalized: {},
      regime: { regime: "BULL_TREND", confidence: 0.8 },
      recentEvents: [],
      metadata: { symbol: "AAPL" },
      config: { lookbackWindow: 100, timeframes: ["1h"], eventLookbackHours: 72 },
    };

    const snap2: FeatureSnapshot = { ...snap1, symbol: "MSFT" };
    const snap3: FeatureSnapshot = { ...snap1, symbol: "GOOGL" };

    cache.set(snap1);
    cache.set(snap2);
    cache.set(snap3);

    // First entry should be evicted
    expect(cache.get("AAPL", ts)).toBeNull();
    expect(cache.get("MSFT", ts)).not.toBeNull();
    expect(cache.get("GOOGL", ts)).not.toBeNull();
  });

  it("should track hit/miss statistics", () => {
    const cache = new SnapshotCache();
    const ts = Date.now();

    const snapshot: FeatureSnapshot = {
      symbol: "AAPL",
      timestamp: ts,
      createdAt: new Date().toISOString(),
      candles: {},
      latestPrice: 150,
      latestVolume: 1000000,
      indicators: {},
      normalized: {},
      regime: { regime: "BULL_TREND", confidence: 0.8 },
      recentEvents: [],
      metadata: { symbol: "AAPL" },
      config: { lookbackWindow: 100, timeframes: ["1h"], eventLookbackHours: 72 },
    };

    cache.set(snapshot);

    cache.get("AAPL", ts); // hit
    cache.get("AAPL", ts); // hit
    cache.get("MISSING", ts); // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.667, 2);
  });

  it("should invalidate specific snapshots", () => {
    const cache = new SnapshotCache();
    const ts = Date.now();

    const snapshot: FeatureSnapshot = {
      symbol: "AAPL",
      timestamp: ts,
      createdAt: new Date().toISOString(),
      candles: {},
      latestPrice: 150,
      latestVolume: 1000000,
      indicators: {},
      normalized: {},
      regime: { regime: "BULL_TREND", confidence: 0.8 },
      recentEvents: [],
      metadata: { symbol: "AAPL" },
      config: { lookbackWindow: 100, timeframes: ["1h"], eventLookbackHours: 72 },
    };

    cache.set(snapshot);
    expect(cache.has("AAPL", ts)).toBe(true);

    cache.invalidate("AAPL", ts);
    expect(cache.has("AAPL", ts)).toBe(false);
  });

  it("should invalidate all snapshots for a symbol", () => {
    const cache = new SnapshotCache();
    const ts1 = Date.now();
    const ts2 = ts1 + 3600000;

    const snap1: FeatureSnapshot = {
      symbol: "AAPL",
      timestamp: ts1,
      createdAt: new Date().toISOString(),
      candles: {},
      latestPrice: 150,
      latestVolume: 1000000,
      indicators: {},
      normalized: {},
      regime: { regime: "BULL_TREND", confidence: 0.8 },
      recentEvents: [],
      metadata: { symbol: "AAPL" },
      config: { lookbackWindow: 100, timeframes: ["1h"], eventLookbackHours: 72 },
    };

    const snap2: FeatureSnapshot = { ...snap1, timestamp: ts2 };

    cache.set(snap1);
    cache.set(snap2);

    const count = cache.invalidateSymbol("AAPL");
    expect(count).toBe(2);
    expect(cache.get("AAPL", ts1)).toBeNull();
    expect(cache.get("AAPL", ts2)).toBeNull();
  });

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

  it("should clear all entries and reset stats", () => {
    const cache = new SnapshotCache();
    const ts = Date.now();

    const snapshot: FeatureSnapshot = {
      symbol: "AAPL",
      timestamp: ts,
      createdAt: new Date().toISOString(),
      candles: {},
      latestPrice: 150,
      latestVolume: 1000000,
      indicators: {},
      normalized: {},
      regime: { regime: "BULL_TREND", confidence: 0.8 },
      recentEvents: [],
      metadata: { symbol: "AAPL" },
      config: { lookbackWindow: 100, timeframes: ["1h"], eventLookbackHours: 72 },
    };

    cache.set(snapshot);
    cache.get("AAPL", ts); // hit
    cache.get("MISSING", ts); // miss

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

  it("should prune expired entries", async () => {
    const cache = new SnapshotCache({ ttlMs: 50 });
    const ts = Date.now();

    const snapshot1: FeatureSnapshot = {
      symbol: "AAPL",
      timestamp: ts,
      createdAt: new Date().toISOString(),
      candles: {},
      latestPrice: 150,
      latestVolume: 1000000,
      indicators: {},
      normalized: {},
      regime: { regime: "BULL_TREND", confidence: 0.8 },
      recentEvents: [],
      metadata: { symbol: "AAPL" },
      config: { lookbackWindow: 100, timeframes: ["1h"], eventLookbackHours: 72 },
    };

    cache.set(snapshot1);

    // Wait for entry to expire
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Add a fresh entry
    const snapshot2: FeatureSnapshot = {
      ...snapshot1,
      symbol: "MSFT",
      timestamp: Date.now(),
    };
    cache.set(snapshot2);

    // Prune should remove AAPL but keep MSFT
    const pruned = cache.prune();
    expect(pruned).toBe(1);

    const stats = cache.getStats();
    expect(stats.size).toBe(1);
  });
});

// ============================================
// Builder Tests
// ============================================

describe("buildSnapshot", () => {
  beforeEach(() => {
    resetGlobalCache();
  });

  it("should build a complete snapshot", async () => {
    const sources = createTestSources();
    const ts = Date.now();

    const snapshot = await buildSnapshot("AAPL", ts, sources);

    expect(snapshot.symbol).toBe("AAPL");
    expect(snapshot.timestamp).toBe(ts);
    expect(snapshot.latestPrice).toBeGreaterThan(0);
    expect(snapshot.latestVolume).toBeGreaterThan(0);

    // Check regime
    expect(snapshot.regime.regime).toBeDefined();
    expect(snapshot.regime.confidence).toBeGreaterThanOrEqual(0);
    expect(snapshot.regime.confidence).toBeLessThanOrEqual(1);

    // Check indicators
    expect(Object.keys(snapshot.indicators).length).toBeGreaterThan(0);

    // Check metadata
    expect(snapshot.metadata.symbol).toBe("AAPL");
    expect(snapshot.metadata.sector).toBe("Technology");
    expect(snapshot.metadata.marketCapBucket).toBe("MEGA");

    // Check events
    expect(snapshot.recentEvents.length).toBe(2);
    expect(snapshot.recentEvents[0]?.eventType).toBe("EARNINGS");
  });

  it("should use cache on subsequent calls", async () => {
    const sources = createTestSources();
    const ts = Date.now();
    const cache = new SnapshotCache();

    const snap1 = await buildSnapshot("AAPL", ts, sources, { cache });
    const snap2 = await buildSnapshot("AAPL", ts, sources, { cache });

    // Should be the same object from cache
    expect(snap1).toBe(snap2);

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
  });

  it("should bypass cache when useCache is false", async () => {
    const sources = createTestSources();
    const ts = Date.now();
    const cache = new SnapshotCache();

    const snap1 = await buildSnapshot("AAPL", ts, sources, { cache, useCache: true });
    const snap2 = await buildSnapshot("AAPL", ts, sources, { cache, useCache: false });

    // Should not be the same object
    expect(snap1).not.toBe(snap2);
    // But should have same values
    expect(snap1.symbol).toBe(snap2.symbol);
  });

  it("should respect lookback window configuration", async () => {
    const sources = createTestSources();
    const ts = Date.now();

    const snapshot = await buildSnapshot("AAPL", ts, sources, {
      config: { lookbackWindow: 50 },
      useCache: false,
    });

    // Primary timeframe should have at most 50 candles
    const primaryCandles = snapshot.candles["1h"];
    expect(primaryCandles).toBeDefined();
    expect(primaryCandles!.length).toBeLessThanOrEqual(50);
  });

  it("should include only specified timeframes", async () => {
    const sources = createTestSources();
    const ts = Date.now();

    const snapshot = await buildSnapshot("AAPL", ts, sources, {
      config: { timeframes: ["1h", "1d"] },
      useCache: false,
    });

    expect(snapshot.candles["1h"]).toBeDefined();
    expect(snapshot.candles["1d"]).toBeDefined();
    expect(snapshot.candles["4h"]).toBeUndefined();
    expect(snapshot.config.timeframes).toEqual(["1h", "1d"]);
  });

  it("should work without event source", async () => {
    const sources = createTestSources();
    const { events, ...sourcesWithoutEvents } = sources;
    const ts = Date.now();

    const snapshot = await buildSnapshot("AAPL", ts, sourcesWithoutEvents, {
      useCache: false,
    });

    expect(snapshot.recentEvents).toEqual([]);
  });

  it("should work without universe source", async () => {
    const sources = createTestSources();
    const { universe, ...sourcesWithoutUniverse } = sources;
    const ts = Date.now();

    const snapshot = await buildSnapshot("AAPL", ts, sourcesWithoutUniverse, {
      useCache: false,
    });

    expect(snapshot.metadata.symbol).toBe("AAPL");
    expect(snapshot.metadata.sector).toBeUndefined();
  });

  it("should throw if no candle data available", async () => {
    const emptyCandleSource: CandleDataSource = {
      async getCandles() {
        return [];
      },
    };

    const sources = { candles: emptyCandleSource };

    await expect(buildSnapshot("AAPL", Date.now(), sources)).rejects.toThrow(
      "No candle data available"
    );
  });

  it("should validate output against schema", async () => {
    const sources = createTestSources();
    const snapshot = await buildSnapshot("AAPL", Date.now(), sources, {
      useCache: false,
    });

    // Should pass schema validation
    const parsed = FeatureSnapshotSchema.parse(snapshot);
    expect(parsed.symbol).toBe("AAPL");
  });
});

describe("buildSnapshots", () => {
  beforeEach(() => {
    resetGlobalCache();
  });

  it("should build snapshots for multiple symbols", async () => {
    const sources = createTestSources();
    const ts = Date.now();

    const snapshots = await buildSnapshots(["AAPL", "MSFT"], ts, sources, {
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
    const ts = Date.now();

    // Include a symbol that doesn't exist
    const snapshots = await buildSnapshots(["AAPL", "MISSING"], ts, sources, {
      useCache: false,
    });

    // Should have AAPL but not MISSING
    expect(snapshots.size).toBe(1);
    expect(snapshots.get("AAPL")).toBeDefined();
    expect(snapshots.get("MISSING")).toBeUndefined();
  });
});

// ============================================
// Serialization Tests
// ============================================

describe("Serialization", () => {
  it("should serialize snapshot to compact JSON", async () => {
    const sources = createTestSources();
    const snapshot = await buildSnapshot("AAPL", Date.now(), sources, {
      useCache: false,
    });

    const json = serializeSnapshot(snapshot);
    expect(typeof json).toBe("string");

    const parsed = JSON.parse(json);
    expect(parsed.symbol).toBe("AAPL");
    expect(parsed.regime.label).toBe(snapshot.regime.regime);
  });

  it("should compact snapshot removing nulls", async () => {
    const sources = createTestSources();
    const snapshot = await buildSnapshot("AAPL", Date.now(), sources, {
      useCache: false,
    });

    // Add some null values
    snapshot.indicators.null_indicator = null;

    const compacted = compactSnapshot(snapshot);

    expect(compacted.symbol).toBe("AAPL");
    expect((compacted.indicators as Record<string, number>).null_indicator).toBeUndefined();
  });

  it("should round numbers to specified precision", async () => {
    const sources = createTestSources();
    const snapshot = await buildSnapshot("AAPL", Date.now(), sources, {
      useCache: false,
    });

    const compacted = compactSnapshot(snapshot, 2);

    // Price should be rounded to 2 decimal places
    const priceStr = String(compacted.price);
    const parts = priceStr.split(".");
    const decimalPlaces = priceStr.includes(".") && parts[1] ? parts[1].length : 0;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });

  it("should generate summary string", async () => {
    const sources = createTestSources();
    const snapshot = await buildSnapshot("AAPL", Date.now(), sources, {
      useCache: false,
    });

    const summary = getSnapshotSummary(snapshot);

    expect(summary).toContain("AAPL");
    expect(summary).toContain("Price:");
    expect(summary).toContain("Regime:");
    expect(summary).toContain("Technology");
  });
});
