/**
 * Tests for IndicatorService
 */

import { describe, expect, test } from "bun:test";
import {
  createEmptyCorporateIndicators,
  createEmptyLiquidityIndicators,
  createEmptyOptionsIndicators,
  createEmptyPriceIndicators,
  createEmptyQualityIndicators,
  createEmptySentimentIndicators,
  createEmptyShortInterestIndicators,
  createEmptyValueIndicators,
  type OHLCVBar,
  type Quote,
} from "../types";
import { IndicatorCache } from "./indicator-cache";
import {
  type CorporateActionsRepository,
  type FundamentalRepository,
  IndicatorService,
  type IndicatorServiceDependencies,
  type LiquidityCalculator,
  type MarketDataProvider,
  type OptionsCalculator,
  type OptionsDataProvider,
  type PriceCalculator,
  type SentimentRepository,
  type ShortInterestRepository,
} from "./indicator-service";

// ============================================================
// Mock Implementations
// ============================================================

function createMockBars(count: number, startPrice = 100): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  const baseTime = Date.now() - count * 86400000;

  for (let i = 0; i < count; i++) {
    const price = startPrice + i * 0.5;
    bars.push({
      timestamp: baseTime + i * 86400000,
      open: price,
      high: price + 1,
      low: price - 1,
      close: price + 0.5,
      volume: 1000000,
    });
  }

  return bars;
}

function createMockQuote(): Quote {
  return {
    timestamp: Date.now(),
    bidPrice: 150.0,
    bidSize: 100,
    askPrice: 150.05,
    askSize: 200,
  };
}

function createMockMarketDataProvider(bars: OHLCVBar[], quote: Quote | null): MarketDataProvider {
  return {
    async getBars() {
      return bars;
    },
    async getQuote() {
      return quote;
    },
  };
}

function createMockPriceCalculator(): PriceCalculator {
  return {
    calculate() {
      const indicators = createEmptyPriceIndicators();
      indicators.rsi_14 = 55.5;
      indicators.atr_14 = 2.3;
      indicators.sma_20 = 105.0;
      return indicators;
    },
  };
}

function createMockLiquidityCalculator(): LiquidityCalculator {
  return {
    calculate() {
      const indicators = createEmptyLiquidityIndicators();
      indicators.bid_ask_spread = 0.05;
      indicators.vwap = 150.25;
      return indicators;
    },
  };
}

function createMockOptionsDataProvider(): OptionsDataProvider {
  return {
    async getImpliedVolatility() {
      return 0.35;
    },
    async getIVSkew() {
      return 0.05;
    },
    async getPutCallRatio() {
      return 0.8;
    },
  };
}

function createMockOptionsCalculator(): OptionsCalculator {
  return {
    async calculate() {
      const indicators = createEmptyOptionsIndicators();
      indicators.atm_iv = 0.35;
      indicators.iv_skew_25d = 0.05;
      return indicators;
    },
  };
}

function createMockFundamentalRepo(): FundamentalRepository {
  return {
    async getLatest() {
      const value = createEmptyValueIndicators();
      value.pe_ratio_ttm = 25.5;
      value.pb_ratio = 8.2;
      const quality = createEmptyQualityIndicators();
      quality.roe = 0.85;
      return { value, quality };
    },
  };
}

function createMockShortInterestRepo(): ShortInterestRepository {
  return {
    async getLatest() {
      const indicators = createEmptyShortInterestIndicators();
      indicators.short_pct_float = 0.05;
      indicators.days_to_cover = 2.5;
      indicators.settlement_date = "2026-01-08";
      return indicators;
    },
  };
}

function createMockSentimentRepo(): SentimentRepository {
  return {
    async getLatest() {
      const indicators = createEmptySentimentIndicators();
      indicators.overall_score = 0.65;
      indicators.news_volume = 150;
      return indicators;
    },
  };
}

function createMockCorporateRepo(): CorporateActionsRepository {
  return {
    async getLatest() {
      const indicators = createEmptyCorporateIndicators();
      indicators.trailing_dividend_yield = 0.005;
      indicators.recent_split = false;
      return indicators;
    },
  };
}

function createFullDependencies(): IndicatorServiceDependencies {
  return {
    marketData: createMockMarketDataProvider(createMockBars(200), createMockQuote()),
    optionsData: createMockOptionsDataProvider(),
    priceCalculator: createMockPriceCalculator(),
    liquidityCalculator: createMockLiquidityCalculator(),
    optionsCalculator: createMockOptionsCalculator(),
    fundamentalRepo: createMockFundamentalRepo(),
    shortInterestRepo: createMockShortInterestRepo(),
    sentimentRepo: createMockSentimentRepo(),
    corporateActionsRepo: createMockCorporateRepo(),
    cache: new IndicatorCache(),
  };
}

// ============================================================
// Basic getSnapshot Tests
// ============================================================

describe("IndicatorService.getSnapshot", () => {
  test("returns complete snapshot with all dependencies", async () => {
    const service = new IndicatorService(createFullDependencies());

    const snapshot = await service.getSnapshot("AAPL");

    expect(snapshot.symbol).toBe("AAPL");
    expect(snapshot.timestamp).toBeGreaterThan(0);
    expect(snapshot.price.rsi_14).toBe(55.5);
    expect(snapshot.price.atr_14).toBe(2.3);
    expect(snapshot.liquidity.bid_ask_spread).toBe(0.05);
    expect(snapshot.options.atm_iv).toBe(0.35);
    expect(snapshot.value.pe_ratio_ttm).toBe(25.5);
    expect(snapshot.quality.roe).toBe(0.85);
    expect(snapshot.short_interest.short_pct_float).toBe(0.05);
    expect(snapshot.sentiment.overall_score).toBe(0.65);
    expect(snapshot.corporate.trailing_dividend_yield).toBe(0.005);
  });

  test("normalizes symbol to uppercase", async () => {
    const service = new IndicatorService(createFullDependencies());

    const snapshot = await service.getSnapshot("aapl");

    expect(snapshot.symbol).toBe("AAPL");
  });

  test("returns empty indicators when calculators not provided", async () => {
    const service = new IndicatorService({
      marketData: createMockMarketDataProvider(createMockBars(200), createMockQuote()),
    });

    const snapshot = await service.getSnapshot("AAPL");

    expect(snapshot.price.rsi_14).toBeNull();
    expect(snapshot.liquidity.bid_ask_spread).toBeNull();
    expect(snapshot.options.atm_iv).toBeNull();
  });

  test("includes metadata with data quality assessment", async () => {
    const service = new IndicatorService(createFullDependencies());

    const snapshot = await service.getSnapshot("AAPL");

    expect(snapshot.metadata.price_updated_at).toBeGreaterThan(0);
    expect(snapshot.metadata.data_quality).toBe("COMPLETE");
    expect(Array.isArray(snapshot.metadata.missing_fields)).toBe(true);
  });

  test("marks data quality as PARTIAL when missing some data", async () => {
    const deps = createFullDependencies();
    deps.fundamentalRepo = undefined;
    deps.shortInterestRepo = undefined;
    deps.sentimentRepo = undefined;

    const service = new IndicatorService(deps);

    const snapshot = await service.getSnapshot("AAPL");

    expect(snapshot.metadata.data_quality).toBe("PARTIAL");
  });

  test("marks data quality as STALE when missing most data", async () => {
    const service = new IndicatorService({
      marketData: createMockMarketDataProvider([], null),
    });

    const snapshot = await service.getSnapshot("AAPL");

    expect(snapshot.metadata.data_quality).toBe("STALE");
  });
});

// ============================================================
// Cache Integration Tests
// ============================================================

describe("IndicatorService - Cache Integration", () => {
  test("caches snapshot and returns cached value", async () => {
    const deps = createFullDependencies();
    let fetchCount = 0;
    deps.marketData = {
      async getBars() {
        fetchCount++;
        return createMockBars(200);
      },
      async getQuote() {
        return createMockQuote();
      },
    };

    const service = new IndicatorService(deps);

    // First call - should fetch
    await service.getSnapshot("AAPL");
    expect(fetchCount).toBe(1);

    // Second call - should use cache
    await service.getSnapshot("AAPL");
    expect(fetchCount).toBe(1); // No additional fetch
  });

  test("bypasses cache when bypassCache is true", async () => {
    const deps = createFullDependencies();
    let fetchCount = 0;
    deps.marketData = {
      async getBars() {
        fetchCount++;
        return createMockBars(200);
      },
      async getQuote() {
        return createMockQuote();
      },
    };

    const service = new IndicatorService(deps, { bypassCache: true });

    await service.getSnapshot("AAPL");
    expect(fetchCount).toBe(1);

    await service.getSnapshot("AAPL");
    expect(fetchCount).toBe(2); // Should fetch again
  });

  test("disables cache when enableCache is false", async () => {
    const deps = createFullDependencies();
    let fetchCount = 0;
    deps.marketData = {
      async getBars() {
        fetchCount++;
        return createMockBars(200);
      },
      async getQuote() {
        return createMockQuote();
      },
    };

    const service = new IndicatorService(deps, { enableCache: false });

    await service.getSnapshot("AAPL");
    await service.getSnapshot("AAPL");

    expect(fetchCount).toBe(2);
  });

  test("invalidateCache clears cached snapshot", async () => {
    const deps = createFullDependencies();
    let fetchCount = 0;
    deps.marketData = {
      async getBars() {
        fetchCount++;
        return createMockBars(200);
      },
      async getQuote() {
        return createMockQuote();
      },
    };

    const service = new IndicatorService(deps);

    await service.getSnapshot("AAPL");
    expect(fetchCount).toBe(1);

    service.invalidateCache("AAPL");

    await service.getSnapshot("AAPL");
    expect(fetchCount).toBe(2); // Should fetch again after invalidation
  });
});

// ============================================================
// Parallel Fetching and Error Handling Tests
// ============================================================

describe("IndicatorService - Parallel Fetching", () => {
  test("handles partial failures gracefully", async () => {
    const deps = createFullDependencies();
    deps.fundamentalRepo = {
      async getLatest() {
        throw new Error("Database connection failed");
      },
    };

    const service = new IndicatorService(deps);

    const snapshot = await service.getSnapshot("AAPL");

    // Should still have other indicators
    expect(snapshot.price.rsi_14).toBe(55.5);
    expect(snapshot.liquidity.bid_ask_spread).toBe(0.05);
    // Failed data should be empty
    expect(snapshot.value.pe_ratio_ttm).toBeNull();
    expect(snapshot.quality.roe).toBeNull();
  });

  test("handles market data failure gracefully", async () => {
    const deps = createFullDependencies();
    deps.marketData = {
      async getBars() {
        throw new Error("Market data unavailable");
      },
      async getQuote() {
        throw new Error("Quote unavailable");
      },
    };
    // Price calculator returns null when given empty bars (more realistic behavior)
    deps.priceCalculator = {
      calculate(bars) {
        if (bars.length === 0) {
          return createEmptyPriceIndicators();
        }
        const indicators = createEmptyPriceIndicators();
        indicators.rsi_14 = 55.5;
        return indicators;
      },
    };
    deps.liquidityCalculator = {
      calculate(bars, quote) {
        if (bars.length === 0 && quote === null) {
          return createEmptyLiquidityIndicators();
        }
        const indicators = createEmptyLiquidityIndicators();
        indicators.bid_ask_spread = 0.05;
        return indicators;
      },
    };

    const service = new IndicatorService(deps);

    const snapshot = await service.getSnapshot("AAPL");

    // Should return empty price indicators (no bars)
    expect(snapshot.price.rsi_14).toBeNull();
    expect(snapshot.liquidity.bid_ask_spread).toBeNull();
    // Batch data should still work
    expect(snapshot.value.pe_ratio_ttm).toBe(25.5);
  });

  test("handles multiple concurrent failures", async () => {
    const deps = createFullDependencies();
    deps.fundamentalRepo = {
      async getLatest() {
        throw new Error("Fundamentals failed");
      },
    };
    deps.shortInterestRepo = {
      async getLatest() {
        throw new Error("Short interest failed");
      },
    };
    deps.sentimentRepo = {
      async getLatest() {
        throw new Error("Sentiment failed");
      },
    };

    const service = new IndicatorService(deps);

    const snapshot = await service.getSnapshot("AAPL");

    // Real-time indicators should work
    expect(snapshot.price.rsi_14).toBe(55.5);
    // Failed batch data should be empty
    expect(snapshot.value.pe_ratio_ttm).toBeNull();
    expect(snapshot.short_interest.short_pct_float).toBeNull();
    expect(snapshot.sentiment.overall_score).toBeNull();
  });
});

// ============================================================
// Configuration Tests
// ============================================================

describe("IndicatorService - Configuration", () => {
  test("respects includeBatchIndicators = false", async () => {
    const deps = createFullDependencies();
    let batchFetchCount = 0;
    deps.fundamentalRepo = {
      async getLatest() {
        batchFetchCount++;
        return { value: createEmptyValueIndicators(), quality: createEmptyQualityIndicators() };
      },
    };

    const service = new IndicatorService(deps, { includeBatchIndicators: false });

    await service.getSnapshot("AAPL");

    expect(batchFetchCount).toBe(0);
  });

  test("respects includeOptionsIndicators = false", async () => {
    const deps = createFullDependencies();
    let optionsFetchCount = 0;
    deps.optionsCalculator = {
      async calculate() {
        optionsFetchCount++;
        return createEmptyOptionsIndicators();
      },
    };

    const service = new IndicatorService(deps, { includeOptionsIndicators: false });

    await service.getSnapshot("AAPL");

    expect(optionsFetchCount).toBe(0);
  });

  test("respects custom barsLookback", async () => {
    const deps = createFullDependencies();
    let requestedLimit = 0;
    deps.marketData = {
      async getBars(_symbol, limit) {
        requestedLimit = limit;
        return createMockBars(limit);
      },
      async getQuote() {
        return createMockQuote();
      },
    };

    const service = new IndicatorService(deps, { barsLookback: 100 });

    await service.getSnapshot("AAPL");

    expect(requestedLimit).toBe(100);
  });
});

// ============================================================
// Helper Method Tests
// ============================================================

describe("IndicatorService - Helper Methods", () => {
  test("getPriceIndicators returns only price indicators", async () => {
    const service = new IndicatorService(createFullDependencies());

    const price = await service.getPriceIndicators("AAPL");

    expect(price.rsi_14).toBe(55.5);
    expect(price.atr_14).toBe(2.3);
  });

  test("getLiquidityIndicators returns only liquidity indicators", async () => {
    const service = new IndicatorService(createFullDependencies());

    const liquidity = await service.getLiquidityIndicators("AAPL");

    expect(liquidity.bid_ask_spread).toBe(0.05);
    expect(liquidity.vwap).toBe(150.25);
  });

  test("getOptionsIndicators returns only options indicators", async () => {
    const service = new IndicatorService(createFullDependencies());

    const options = await service.getOptionsIndicators("AAPL");

    expect(options.atm_iv).toBe(0.35);
  });

  test("getSnapshots returns snapshots for multiple symbols", async () => {
    const service = new IndicatorService(createFullDependencies());

    const snapshots = await service.getSnapshots(["AAPL", "TSLA", "GOOG"]);

    expect(snapshots.size).toBe(3);
    expect(snapshots.get("AAPL")).toBeDefined();
    expect(snapshots.get("TSLA")).toBeDefined();
    expect(snapshots.get("GOOG")).toBeDefined();
  });

  test("getCacheMetrics returns metrics when cache enabled", async () => {
    const service = new IndicatorService(createFullDependencies());

    await service.getSnapshot("AAPL");

    const metrics = service.getCacheMetrics();

    expect(metrics).not.toBeNull();
    expect(metrics!.snapshot.size).toBe(1);
  });

  test("getCacheMetrics returns null when cache not configured", async () => {
    const deps = createFullDependencies();
    deps.cache = undefined;

    const service = new IndicatorService(deps);

    const metrics = service.getCacheMetrics();

    expect(metrics).toBeNull();
  });
});

// ============================================================
// Integration-style Tests
// ============================================================

describe("IndicatorService - Integration", () => {
  test("full workflow: fetch -> cache -> invalidate -> refetch", async () => {
    const deps = createFullDependencies();
    let version = 1;
    deps.priceCalculator = {
      calculate() {
        const indicators = createEmptyPriceIndicators();
        indicators.rsi_14 = 50 + version;
        return indicators;
      },
    };

    const service = new IndicatorService(deps);

    // First fetch
    const snapshot1 = await service.getSnapshot("AAPL");
    expect(snapshot1.price.rsi_14).toBe(51);

    // Update "data"
    version = 2;

    // Should still get cached value
    const snapshot2 = await service.getSnapshot("AAPL");
    expect(snapshot2.price.rsi_14).toBe(51);

    // Invalidate cache
    service.invalidateCache("AAPL");

    // Should get new value
    const snapshot3 = await service.getSnapshot("AAPL");
    expect(snapshot3.price.rsi_14).toBe(52);
  });
});
