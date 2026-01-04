/**
 * Universe Resolver Tests
 *
 * Tests for the universe resolution system including:
 * - Source resolution (static, index, ETF, screener)
 * - Composition (union, intersection)
 * - Filtering
 * - Ranking and limits
 */

import { describe, expect, it } from "bun:test";
import type { StaticSource, UniverseConfig } from "@cream/config";
import { resolveUniverse, resolveUniverseSymbols } from "./resolver.js";
import { resolveStaticSource } from "./sources.js";

// ============================================
// Static Source Tests
// ============================================

describe("resolveStaticSource", () => {
  it("should resolve static ticker list", async () => {
    const source: StaticSource = {
      type: "static",
      name: "core_watchlist",
      enabled: true,
      tickers: ["AAPL", "MSFT", "GOOG"],
    };

    const result = await resolveStaticSource(source);

    expect(result.sourceName).toBe("core_watchlist");
    expect(result.instruments).toHaveLength(3);
    expect(result.instruments.map((i) => i.symbol)).toEqual(["AAPL", "MSFT", "GOOG"]);
    expect(result.warnings).toHaveLength(0);
  });

  it("should uppercase ticker symbols", async () => {
    const source: StaticSource = {
      type: "static",
      name: "test",
      enabled: true,
      tickers: ["aapl", "Msft", "GOOG"],
    };

    const result = await resolveStaticSource(source);

    expect(result.instruments.map((i) => i.symbol)).toEqual(["AAPL", "MSFT", "GOOG"]);
  });

  it("should include source name in instruments", async () => {
    const source: StaticSource = {
      type: "static",
      name: "my_source",
      enabled: true,
      tickers: ["SPY"],
    };

    const result = await resolveStaticSource(source);

    expect(result.instruments[0].source).toBe("my_source");
  });
});

// ============================================
// Universe Composition Tests (using static sources)
// ============================================

describe("resolveUniverse composition", () => {
  const staticSource1: StaticSource = {
    type: "static",
    name: "source1",
    enabled: true,
    tickers: ["AAPL", "MSFT", "GOOG"],
  };

  const staticSource2: StaticSource = {
    type: "static",
    name: "source2",
    enabled: true,
    tickers: ["MSFT", "GOOG", "AMZN"],
  };

  it("should compose sources with union mode (default)", async () => {
    const config: UniverseConfig = {
      compose_mode: "union",
      sources: [staticSource1, staticSource2],
      max_instruments: 500,
    };

    const result = await resolveUniverse(config);

    // Should have unique symbols from both sources
    const symbols = result.instruments.map((i) => i.symbol);
    expect(symbols).toContain("AAPL");
    expect(symbols).toContain("MSFT");
    expect(symbols).toContain("GOOG");
    expect(symbols).toContain("AMZN");
    expect(new Set(symbols).size).toBe(4); // No duplicates
  });

  it("should compose sources with intersection mode", async () => {
    const config: UniverseConfig = {
      compose_mode: "intersection",
      sources: [staticSource1, staticSource2],
      max_instruments: 500,
    };

    const result = await resolveUniverse(config);

    // Should only have symbols in BOTH sources
    const symbols = result.instruments.map((i) => i.symbol);
    expect(symbols).toContain("MSFT");
    expect(symbols).toContain("GOOG");
    expect(symbols).not.toContain("AAPL"); // Only in source1
    expect(symbols).not.toContain("AMZN"); // Only in source2
    expect(symbols).toHaveLength(2);
  });

  it("should skip disabled sources", async () => {
    const disabledSource: StaticSource = {
      type: "static",
      name: "disabled",
      enabled: false,
      tickers: ["NVDA"],
    };

    const config: UniverseConfig = {
      compose_mode: "union",
      sources: [staticSource1, disabledSource],
      max_instruments: 500,
    };

    const result = await resolveUniverse(config);

    const symbols = result.instruments.map((i) => i.symbol);
    expect(symbols).not.toContain("NVDA");
    expect(symbols).toContain("AAPL");
  });

  it("should throw if no enabled sources", async () => {
    const config: UniverseConfig = {
      compose_mode: "union",
      sources: [
        { ...staticSource1, enabled: false },
        { ...staticSource2, enabled: false },
      ],
      max_instruments: 500,
    };

    await expect(resolveUniverse(config)).rejects.toThrow("No enabled sources");
  });
});

// ============================================
// Filter Tests
// ============================================

describe("resolveUniverse filters", () => {
  it("should apply exclude_tickers filter", async () => {
    const config: UniverseConfig = {
      compose_mode: "union",
      sources: [
        {
          type: "static",
          name: "test",
          enabled: true,
          tickers: ["AAPL", "MSFT", "GOOG", "BRKB"],
        },
      ],
      filters: {
        min_avg_volume: 0,
        min_market_cap: 0,
        min_price: 0,
        exclude_tickers: ["BRKB"],
      },
      max_instruments: 500,
    };

    const result = await resolveUniverse(config);

    const symbols = result.instruments.map((i) => i.symbol);
    expect(symbols).not.toContain("BRKB");
    expect(symbols).toContain("AAPL");
  });

  it("should apply exclude_tickers case-insensitively", async () => {
    const config: UniverseConfig = {
      compose_mode: "union",
      sources: [
        {
          type: "static",
          name: "test",
          enabled: true,
          tickers: ["AAPL", "MSFT"],
        },
      ],
      filters: {
        min_avg_volume: 0,
        min_market_cap: 0,
        min_price: 0,
        exclude_tickers: ["aapl"], // lowercase
      },
      max_instruments: 500,
    };

    const result = await resolveUniverse(config);

    const symbols = result.instruments.map((i) => i.symbol);
    expect(symbols).not.toContain("AAPL");
  });
});

// ============================================
// Limit Tests
// ============================================

describe("resolveUniverse limits", () => {
  it("should respect max_instruments limit", async () => {
    const config: UniverseConfig = {
      compose_mode: "union",
      sources: [
        {
          type: "static",
          name: "test",
          enabled: true,
          tickers: ["AAPL", "MSFT", "GOOG", "AMZN", "META", "NVDA"],
        },
      ],
      max_instruments: 3,
    };

    const result = await resolveUniverse(config);

    expect(result.instruments).toHaveLength(3);
  });

  it("should not limit if under max_instruments", async () => {
    const config: UniverseConfig = {
      compose_mode: "union",
      sources: [
        {
          type: "static",
          name: "test",
          enabled: true,
          tickers: ["AAPL", "MSFT"],
        },
      ],
      max_instruments: 100,
    };

    const result = await resolveUniverse(config);

    expect(result.instruments).toHaveLength(2);
  });
});

// ============================================
// Stats Tests
// ============================================

describe("resolveUniverse stats", () => {
  it("should track resolution statistics", async () => {
    const config: UniverseConfig = {
      compose_mode: "union",
      sources: [
        {
          type: "static",
          name: "source1",
          enabled: true,
          tickers: ["AAPL", "MSFT"],
        },
        {
          type: "static",
          name: "source2",
          enabled: true,
          tickers: ["MSFT", "GOOG"],
        },
      ],
      max_instruments: 500,
    };

    const result = await resolveUniverse(config);

    expect(result.stats.totalFromSources).toBe(4); // 2 + 2
    expect(result.stats.afterComposition).toBe(3); // AAPL, MSFT, GOOG (deduped)
    expect(result.stats.final).toBe(3);
  });

  it("should include source results", async () => {
    const config: UniverseConfig = {
      compose_mode: "union",
      sources: [
        {
          type: "static",
          name: "source1",
          enabled: true,
          tickers: ["AAPL"],
        },
        {
          type: "static",
          name: "source2",
          enabled: true,
          tickers: ["MSFT"],
        },
      ],
      max_instruments: 500,
    };

    const result = await resolveUniverse(config);

    expect(result.sourceResults).toHaveLength(2);
    expect(result.sourceResults[0].sourceName).toBe("source1");
    expect(result.sourceResults[1].sourceName).toBe("source2");
  });
});

// ============================================
// resolveUniverseSymbols Tests
// ============================================

describe("resolveUniverseSymbols", () => {
  it("should return just the symbols", async () => {
    const config: UniverseConfig = {
      compose_mode: "union",
      sources: [
        {
          type: "static",
          name: "test",
          enabled: true,
          tickers: ["AAPL", "MSFT", "GOOG"],
        },
      ],
      max_instruments: 500,
    };

    const symbols = await resolveUniverseSymbols(config);

    expect(symbols).toEqual(["AAPL", "MSFT", "GOOG"]);
  });
});

// ============================================
// Metadata Merging Tests
// ============================================

describe("metadata merging", () => {
  it("should merge sources in instrument source field", async () => {
    const config: UniverseConfig = {
      compose_mode: "union",
      sources: [
        {
          type: "static",
          name: "source1",
          enabled: true,
          tickers: ["AAPL"],
        },
        {
          type: "static",
          name: "source2",
          enabled: true,
          tickers: ["AAPL"],
        },
      ],
      max_instruments: 500,
    };

    const result = await resolveUniverse(config);

    expect(result.instruments).toHaveLength(1);
    expect(result.instruments[0].source).toBe("source1,source2");
  });
});
