/**
 * Universe Resolution Type Tests
 */

import { describe, expect, test } from "bun:test";
import {
  ComposeMode,
  createEmptyFilterStats,
  DiversificationRulesSchema,
  ETFHoldingsSourceSchema,
  FilterStatsSchema,
  IndexSourceSchema,
  IndexType,
  isReasonableAttrition,
  LiquidityFilterSchema,
  RankingMetric,
  ResolvedUniverseSchema,
  ScreenerSourceSchema,
  StaticSourceSchema,
  UniverseConfigSchema,
  UniverseFiltersSchema,
  UniverseLimitsSchema,
  UniverseMetadataSchema,
  UniverseSourceSchema,
  UniverseSourceType,
  validateUniverseConfig,
  VolatilityFilterSchema,
} from "./universe";

// ============================================
// Enum Tests
// ============================================

describe("UniverseSourceType", () => {
  test("accepts valid source types", () => {
    expect(() => UniverseSourceType.parse("static")).not.toThrow();
    expect(() => UniverseSourceType.parse("index")).not.toThrow();
    expect(() => UniverseSourceType.parse("etf_holdings")).not.toThrow();
    expect(() => UniverseSourceType.parse("screener")).not.toThrow();
  });

  test("rejects invalid source types", () => {
    expect(() => UniverseSourceType.parse("watchlist")).toThrow();
    expect(() => UniverseSourceType.parse("custom")).toThrow();
  });
});

describe("IndexType", () => {
  test("accepts valid index types", () => {
    expect(() => IndexType.parse("SP500")).not.toThrow();
    expect(() => IndexType.parse("NASDAQ100")).not.toThrow();
    expect(() => IndexType.parse("DOW30")).not.toThrow();
    expect(() => IndexType.parse("RUSSELL2000")).not.toThrow();
  });

  test("rejects invalid index types", () => {
    expect(() => IndexType.parse("NYSE")).toThrow();
    expect(() => IndexType.parse("FTSE100")).toThrow();
  });
});

describe("RankingMetric", () => {
  test("accepts valid metrics", () => {
    expect(() => RankingMetric.parse("dollar_volume")).not.toThrow();
    expect(() => RankingMetric.parse("relative_volume")).not.toThrow();
    expect(() => RankingMetric.parse("volatility")).not.toThrow();
    expect(() => RankingMetric.parse("momentum")).not.toThrow();
    expect(() => RankingMetric.parse("none")).not.toThrow();
  });
});

describe("ComposeMode", () => {
  test("accepts union and intersection", () => {
    expect(() => ComposeMode.parse("union")).not.toThrow();
    expect(() => ComposeMode.parse("intersection")).not.toThrow();
  });
});

// ============================================
// Source Schema Tests
// ============================================

describe("StaticSourceSchema", () => {
  test("accepts valid static source", () => {
    const result = StaticSourceSchema.safeParse({
      name: "my-watchlist",
      type: "static",
      tickers: ["AAPL", "MSFT", "GOOGL"],
    });
    expect(result.success).toBe(true);
  });

  test("requires at least one ticker", () => {
    const result = StaticSourceSchema.safeParse({
      name: "empty",
      type: "static",
      tickers: [],
    });
    expect(result.success).toBe(false);
  });

  test("defaults enabled to true", () => {
    const result = StaticSourceSchema.parse({
      name: "test",
      type: "static",
      tickers: ["AAPL"],
    });
    expect(result.enabled).toBe(true);
  });
});

describe("IndexSourceSchema", () => {
  test("accepts valid index source", () => {
    const result = IndexSourceSchema.safeParse({
      name: "sp500",
      type: "index",
      index: "SP500",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid index", () => {
    const result = IndexSourceSchema.safeParse({
      name: "custom",
      type: "index",
      index: "CUSTOM",
    });
    expect(result.success).toBe(false);
  });
});

describe("ETFHoldingsSourceSchema", () => {
  test("accepts valid ETF source", () => {
    const result = ETFHoldingsSourceSchema.safeParse({
      name: "spy-holdings",
      type: "etf_holdings",
      etf: "SPY",
    });
    expect(result.success).toBe(true);
  });

  test("accepts minWeight filter", () => {
    const result = ETFHoldingsSourceSchema.parse({
      name: "spy-top",
      type: "etf_holdings",
      etf: "SPY",
      minWeight: 0.5,
    });
    expect(result.minWeight).toBe(0.5);
  });

  test("rejects minWeight > 100", () => {
    const result = ETFHoldingsSourceSchema.safeParse({
      name: "bad",
      type: "etf_holdings",
      etf: "SPY",
      minWeight: 150,
    });
    expect(result.success).toBe(false);
  });
});

describe("ScreenerSourceSchema", () => {
  test("accepts valid screener source", () => {
    const result = ScreenerSourceSchema.safeParse({
      name: "large-cap",
      type: "screener",
      minMarketCap: 10000000000,
      minAvgVolume: 1000000,
    });
    expect(result.success).toBe(true);
  });

  test("accepts sector filters", () => {
    const result = ScreenerSourceSchema.parse({
      name: "tech",
      type: "screener",
      sectors: ["Technology", "Communication Services"],
      excludeSectors: ["Energy"],
    });
    expect(result.sectors).toHaveLength(2);
  });
});

describe("UniverseSourceSchema (discriminated union)", () => {
  test("correctly discriminates static", () => {
    const result = UniverseSourceSchema.parse({
      name: "static",
      type: "static",
      tickers: ["AAPL"],
    });
    expect(result.type).toBe("static");
  });

  test("correctly discriminates index", () => {
    const result = UniverseSourceSchema.parse({
      name: "index",
      type: "index",
      index: "SP500",
    });
    expect(result.type).toBe("index");
  });
});

// ============================================
// Filter Schema Tests
// ============================================

describe("LiquidityFilterSchema", () => {
  test("accepts valid liquidity filters", () => {
    const result = LiquidityFilterSchema.safeParse({
      minDollarVolume: 10000000,
      minShareVolume: 500000,
      maxSpreadPct: 0.1,
    });
    expect(result.success).toBe(true);
  });

  test("accepts empty filter", () => {
    const result = LiquidityFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("VolatilityFilterSchema", () => {
  test("accepts valid volatility filters", () => {
    const result = VolatilityFilterSchema.safeParse({
      minHistVol: 0.15,
      maxHistVol: 0.60,
      minAtrPct: 0.01,
      maxAtrPct: 0.05,
    });
    expect(result.success).toBe(true);
  });

  test("rejects histVol > 10", () => {
    const result = VolatilityFilterSchema.safeParse({
      maxHistVol: 15,
    });
    expect(result.success).toBe(false);
  });
});

describe("DiversificationRulesSchema", () => {
  test("accepts valid diversification rules", () => {
    const result = DiversificationRulesSchema.safeParse({
      maxPerSector: 10,
      maxPerIndustry: 5,
      minSectors: 3,
    });
    expect(result.success).toBe(true);
  });
});

describe("UniverseFiltersSchema", () => {
  test("accepts combined filters", () => {
    const result = UniverseFiltersSchema.safeParse({
      liquidity: { minDollarVolume: 10000000 },
      volatility: { maxHistVol: 0.60 },
    });
    expect(result.success).toBe(true);
  });
});

// ============================================
// Universe Config Tests
// ============================================

describe("UniverseLimitsSchema", () => {
  test("applies defaults", () => {
    const result = UniverseLimitsSchema.parse({});
    expect(result.maxCandidatesPerCycle).toBe(50);
    expect(result.rankingMetric).toBe("dollar_volume");
  });

  test("accepts custom values", () => {
    const result = UniverseLimitsSchema.parse({
      maxCandidatesPerCycle: 25,
      rankingMetric: "momentum",
    });
    expect(result.maxCandidatesPerCycle).toBe(25);
    expect(result.rankingMetric).toBe("momentum");
  });
});

describe("UniverseConfigSchema", () => {
  const validConfig = {
    sources: [
      {
        name: "sp500",
        type: "index" as const,
        index: "SP500" as const,
      },
    ],
    composeMode: "union" as const,
    filters: {
      liquidity: { minDollarVolume: 10000000 },
    },
    limits: {
      maxCandidatesPerCycle: 50,
      rankingMetric: "dollar_volume" as const,
    },
  };

  test("accepts valid config", () => {
    const result = UniverseConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  test("requires at least one source", () => {
    const result = UniverseConfigSchema.safeParse({
      ...validConfig,
      sources: [],
    });
    expect(result.success).toBe(false);
  });

  test("applies default composeMode", () => {
    const result = UniverseConfigSchema.parse({
      sources: validConfig.sources,
    });
    expect(result.composeMode).toBe("union");
  });

  test("applies default limits", () => {
    const result = UniverseConfigSchema.parse({
      sources: validConfig.sources,
    });
    expect(result.limits.maxCandidatesPerCycle).toBe(50);
  });
});

describe("validateUniverseConfig", () => {
  test("returns validated config", () => {
    const config = validateUniverseConfig({
      sources: [{ name: "test", type: "static", tickers: ["AAPL"] }],
    });
    expect(config.sources).toHaveLength(1);
  });

  test("throws on invalid config", () => {
    expect(() => validateUniverseConfig({ sources: [] })).toThrow();
  });
});

// ============================================
// Filter Stats Tests
// ============================================

describe("FilterStatsSchema", () => {
  const validStats = {
    beforeFilters: 500,
    afterLiquidity: 400,
    afterVolatility: 350,
    afterDiversification: 200,
    final: 50,
  };

  test("accepts valid stats", () => {
    const result = FilterStatsSchema.safeParse(validStats);
    expect(result.success).toBe(true);
  });

  test("rejects negative values", () => {
    const result = FilterStatsSchema.safeParse({
      ...validStats,
      final: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("isReasonableAttrition", () => {
  test("returns true for reasonable attrition", () => {
    const stats = {
      beforeFilters: 500,
      afterLiquidity: 400,
      afterVolatility: 350,
      afterDiversification: 200,
      final: 50,
    };
    expect(isReasonableAttrition(stats)).toBe(true);
  });

  test("returns false for zero beforeFilters", () => {
    const stats = {
      beforeFilters: 0,
      afterLiquidity: 0,
      afterVolatility: 0,
      afterDiversification: 0,
      final: 0,
    };
    expect(isReasonableAttrition(stats)).toBe(false);
  });

  test("returns false for zero final", () => {
    const stats = {
      beforeFilters: 500,
      afterLiquidity: 0,
      afterVolatility: 0,
      afterDiversification: 0,
      final: 0,
    };
    expect(isReasonableAttrition(stats)).toBe(false);
  });

  test("returns false for extreme attrition", () => {
    const stats = {
      beforeFilters: 500,
      afterLiquidity: 10, // 98% loss
      afterVolatility: 5,
      afterDiversification: 2,
      final: 1,
    };
    expect(isReasonableAttrition(stats)).toBe(false);
  });
});

describe("createEmptyFilterStats", () => {
  test("returns all zeros", () => {
    const stats = createEmptyFilterStats();
    expect(stats.beforeFilters).toBe(0);
    expect(stats.afterLiquidity).toBe(0);
    expect(stats.afterVolatility).toBe(0);
    expect(stats.afterDiversification).toBe(0);
    expect(stats.final).toBe(0);
  });
});

// ============================================
// Resolved Universe Tests
// ============================================

describe("UniverseMetadataSchema", () => {
  test("accepts valid metadata", () => {
    const result = UniverseMetadataSchema.safeParse({
      sources: ["sp500", "nasdaq100"],
      resolvedAt: "2026-01-05T10:00:00Z",
      filterStats: {
        beforeFilters: 600,
        afterLiquidity: 500,
        afterVolatility: 400,
        afterDiversification: 200,
        final: 50,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("ResolvedUniverseSchema", () => {
  test("accepts valid resolved universe", () => {
    const result = ResolvedUniverseSchema.safeParse({
      tickers: ["AAPL", "MSFT", "GOOGL"],
      metadata: {
        sources: ["sp500"],
        resolvedAt: "2026-01-05T10:00:00Z",
        filterStats: {
          beforeFilters: 500,
          afterLiquidity: 400,
          afterVolatility: 350,
          afterDiversification: 200,
          final: 3,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  test("requires at least empty tickers array", () => {
    const result = ResolvedUniverseSchema.safeParse({
      tickers: [],
      metadata: {
        sources: [],
        resolvedAt: "2026-01-05T10:00:00Z",
        filterStats: {
          beforeFilters: 0,
          afterLiquidity: 0,
          afterVolatility: 0,
          afterDiversification: 0,
          final: 0,
        },
      },
    });
    expect(result.success).toBe(true);
  });
});
