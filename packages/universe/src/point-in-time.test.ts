/**
 * Tests for Point-in-Time Universe Resolver
 *
 * Tests survivorship-bias-free universe resolution.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type {
  IndexConstituent,
  IndexConstituentsRepository,
  TickerChange,
  TickerChangesRepository,
  UniverseSnapshot,
  UniverseSnapshotsRepository,
} from "@cream/storage";
import { PointInTimeUniverseResolver, type PointInTimeResolverConfig } from "./point-in-time.js";

// ============================================
// Mock Repositories
// ============================================

function createMockConstituentsRepo(): IndexConstituentsRepository {
  const constituents: IndexConstituent[] = [
    {
      indexId: "SP500",
      symbol: "AAPL",
      dateAdded: "2010-01-01",
      dateRemoved: null,
      sector: "Technology",
      provider: "fmp",
    },
    {
      indexId: "SP500",
      symbol: "MSFT",
      dateAdded: "2000-01-01",
      dateRemoved: null,
      sector: "Technology",
      provider: "fmp",
    },
    {
      indexId: "SP500",
      symbol: "META",
      dateAdded: "2013-12-23",
      dateRemoved: null,
      sector: "Communication Services",
      provider: "fmp",
    },
    // Removed stock (survivorship bias case)
    {
      indexId: "SP500",
      symbol: "ENRON",
      dateAdded: "1997-01-01",
      dateRemoved: "2001-12-03",
      reasonRemoved: "delisted",
      sector: "Energy",
      provider: "fmp",
    },
    // Stock that was in index but later removed
    {
      indexId: "SP500",
      symbol: "GE",
      dateAdded: "1896-05-26",
      dateRemoved: "2018-06-19",
      reasonRemoved: "market_cap",
      sector: "Industrials",
      provider: "fmp",
    },
  ];

  return {
    upsert: mock(async () => {}),
    bulkInsert: mock(async (items: unknown[]) => items.length),
    getConstituentsAsOf: mock(async (indexId: string, asOfDate: string) => {
      return constituents
        .filter(
          (c) =>
            c.indexId === indexId &&
            c.dateAdded <= asOfDate &&
            (c.dateRemoved === null || c.dateRemoved > asOfDate)
        )
        .map((c) => c.symbol);
    }),
    getCurrentConstituents: mock(async (indexId: string) => {
      return constituents.filter((c) => c.indexId === indexId && c.dateRemoved === null);
    }),
    getSymbolHistory: mock(async (symbol: string) => {
      return constituents.filter((c) => c.symbol === symbol);
    }),
    wasInIndexOnDate: mock(async (indexId: string, symbol: string, date: string) => {
      return constituents.some(
        (c) =>
          c.indexId === indexId &&
          c.symbol === symbol &&
          c.dateAdded <= date &&
          (c.dateRemoved === null || c.dateRemoved > date)
      );
    }),
    getChangesInRange: mock(async () => ({ additions: [], removals: [] })),
    getConstituentCount: mock(async (indexId: string, asOfDate?: string) => {
      if (asOfDate) {
        return constituents.filter(
          (c) =>
            c.indexId === indexId &&
            c.dateAdded <= asOfDate &&
            (c.dateRemoved === null || c.dateRemoved > asOfDate)
        ).length;
      }
      return constituents.filter((c) => c.indexId === indexId && c.dateRemoved === null).length;
    }),
  } as unknown as IndexConstituentsRepository;
}

function createMockTickerChangesRepo(): TickerChangesRepository {
  const changes: TickerChange[] = [
    // FB -> META rename in 2021
    {
      oldSymbol: "FB",
      newSymbol: "META",
      changeDate: "2021-10-28",
      changeType: "rename",
      reason: "Company rebrand to Meta Platforms",
      provider: "fmp",
    },
    // Google restructure
    {
      oldSymbol: "GOOG",
      newSymbol: "GOOGL",
      changeDate: "2014-04-03",
      changeType: "restructure",
      reason: "Class A/C split",
      provider: "fmp",
    },
  ];

  return {
    insert: mock(async () => {}),
    getChangesFromSymbol: mock(async (oldSymbol: string) => {
      return changes.filter((c) => c.oldSymbol === oldSymbol);
    }),
    getChangesToSymbol: mock(async (newSymbol: string) => {
      return changes.filter((c) => c.newSymbol === newSymbol);
    }),
    resolveToCurrentSymbol: mock(async (historicalSymbol: string) => {
      let current = historicalSymbol;
      const visited = new Set<string>();

      while (!visited.has(current)) {
        visited.add(current);
        const change = changes.find((c) => c.oldSymbol === current);
        if (!change) break;
        current = change.newSymbol;
      }

      return current;
    }),
    resolveToHistoricalSymbol: mock(async (currentSymbol: string, asOfDate: string) => {
      let historical = currentSymbol;
      const visited = new Set<string>();

      while (!visited.has(historical)) {
        visited.add(historical);
        const change = changes.find((c) => c.newSymbol === historical && c.changeDate > asOfDate);
        if (!change) break;
        historical = change.oldSymbol;
      }

      return historical;
    }),
    getChangesInRange: mock(async () => changes),
  } as unknown as TickerChangesRepository;
}

function createMockSnapshotsRepo(): UniverseSnapshotsRepository {
  const snapshots: UniverseSnapshot[] = [
    {
      snapshotDate: "2020-01-01",
      indexId: "SP500",
      tickers: ["AAPL", "MSFT", "FB", "GE"],
      tickerCount: 4,
      sourceVersion: "test",
      computedAt: "2020-01-01T00:00:00Z",
    },
  ];

  return {
    save: mock(async () => {}),
    get: mock(async (indexId: string, snapshotDate: string) => {
      return snapshots.find((s) => s.indexId === indexId && s.snapshotDate === snapshotDate) ?? null;
    }),
    getClosestBefore: mock(async (indexId: string, date: string) => {
      const matching = snapshots
        .filter((s) => s.indexId === indexId && s.snapshotDate <= date)
        .sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate));
      return matching[0] ?? null;
    }),
    listDates: mock(async (indexId: string) => {
      return snapshots.filter((s) => s.indexId === indexId).map((s) => s.snapshotDate);
    }),
    purgeExpired: mock(async () => 0),
  } as unknown as UniverseSnapshotsRepository;
}

// ============================================
// Tests
// ============================================

describe("PointInTimeUniverseResolver", () => {
  let resolver: PointInTimeUniverseResolver;
  let constituentsRepo: IndexConstituentsRepository;
  let tickerChangesRepo: TickerChangesRepository;
  let snapshotsRepo: UniverseSnapshotsRepository;

  beforeEach(() => {
    constituentsRepo = createMockConstituentsRepo();
    tickerChangesRepo = createMockTickerChangesRepo();
    snapshotsRepo = createMockSnapshotsRepo();

    const config: PointInTimeResolverConfig = {
      useCache: true,
      maxCacheAgeDays: 30,
      autoPopulate: false,
    };

    resolver = new PointInTimeUniverseResolver(
      constituentsRepo,
      tickerChangesRepo,
      snapshotsRepo,
      config
    );
  });

  describe("getUniverseAsOf", () => {
    it("should return cached snapshot if available", async () => {
      const result = await resolver.getUniverseAsOf("SP500", "2020-01-01");

      expect(result.fromCache).toBe(true);
      expect(result.symbols).toContain("AAPL");
      expect(result.symbols).toContain("MSFT");
      expect(result.symbols).toContain("FB"); // Before META rename
      expect(result.symbols).toContain("GE"); // Still in index in 2020
    });

    it("should resolve from constituent history when no cache", async () => {
      const result = await resolver.getUniverseAsOf("SP500", "2015-01-01");

      expect(result.fromCache).toBe(false);
      expect(result.symbols).toContain("AAPL");
      expect(result.symbols).toContain("MSFT");
      // META was added in 2013, but was called FB in 2015
      expect(result.symbols).toContain("FB"); // Historical ticker resolved
    });

    it("should exclude delisted stocks before their delist date", async () => {
      // Test for date before Enron delisting
      const result = await resolver.getUniverseAsOf("SP500", "2001-06-01");

      expect(result.symbols).toContain("ENRON");
    });

    it("should exclude delisted stocks after their delist date", async () => {
      // Test for date after Enron delisting
      const result = await resolver.getUniverseAsOf("SP500", "2002-01-01");

      expect(result.symbols).not.toContain("ENRON");
    });

    it("should exclude stocks removed from index after removal date", async () => {
      // GE was removed from S&P 500 on 2018-06-19
      const result = await resolver.getUniverseAsOf("SP500", "2019-01-01");

      expect(result.symbols).not.toContain("GE");
    });

    it("should include stocks removed from index before removal date", async () => {
      // GE was still in S&P 500 before 2018-06-19
      const result = await resolver.getUniverseAsOf("SP500", "2018-01-01");

      expect(result.symbols).toContain("GE");
    });
  });

  describe("wasInIndex", () => {
    it("should return true for current constituents", async () => {
      const result = await resolver.wasInIndex("SP500", "AAPL", "2024-01-01");
      expect(result).toBe(true);
    });

    it("should return false for stocks that were never in index", async () => {
      const result = await resolver.wasInIndex("SP500", "UNKNOWN", "2024-01-01");
      expect(result).toBe(false);
    });

    it("should return true for delisted stock before delist date", async () => {
      const result = await resolver.wasInIndex("SP500", "ENRON", "2001-01-01");
      expect(result).toBe(true);
    });

    it("should return false for delisted stock after delist date", async () => {
      const result = await resolver.wasInIndex("SP500", "ENRON", "2002-01-01");
      expect(result).toBe(false);
    });
  });

  describe("resolveHistoricalTicker", () => {
    it("should return FB for META before rename date", async () => {
      const result = await resolver.resolveHistoricalTicker("META", "2020-01-01");
      expect(result).toBe("FB");
    });

    it("should return META for META after rename date", async () => {
      const result = await resolver.resolveHistoricalTicker("META", "2022-01-01");
      expect(result).toBe("META");
    });

    it("should return same symbol when no changes", async () => {
      const result = await resolver.resolveHistoricalTicker("AAPL", "2020-01-01");
      expect(result).toBe("AAPL");
    });
  });

  describe("resolveCurrentTicker", () => {
    it("should resolve FB to META", async () => {
      const result = await resolver.resolveCurrentTicker("FB");
      expect(result).toBe("META");
    });

    it("should return same symbol when no changes", async () => {
      const result = await resolver.resolveCurrentTicker("AAPL");
      expect(result).toBe("AAPL");
    });
  });

  describe("validateDataCoverage", () => {
    it("should report coverage statistics", async () => {
      const result = await resolver.validateDataCoverage("SP500");

      expect(result.coverage.indexId).toBe("SP500");
      expect(result.coverage.constituentCount).toBeGreaterThan(0);
    });

    it("should report issues when constituent count differs from expected", async () => {
      const result = await resolver.validateDataCoverage("SP500");

      // Our mock has way fewer than 500 stocks
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });
});

describe("Survivorship Bias Prevention", () => {
  let resolver: PointInTimeUniverseResolver;

  beforeEach(() => {
    const constituentsRepo = createMockConstituentsRepo();
    const tickerChangesRepo = createMockTickerChangesRepo();
    const snapshotsRepo = createMockSnapshotsRepo();

    resolver = new PointInTimeUniverseResolver(
      constituentsRepo,
      tickerChangesRepo,
      snapshotsRepo,
      { useCache: false }
    );
  });

  it("should demonstrate survivorship bias without point-in-time", () => {
    // This test documents the importance of point-in-time data
    // Without it, backtests would incorrectly exclude failed companies
    // like Enron, leading to 1-4% annual return inflation

    // Example: If we used current S&P 500 constituents for a 2000 backtest:
    // - We would miss ENRON, which was a major S&P 500 stock
    // - We would miss GE, which was removed in 2018
    // - We would use META instead of FB

    expect(true).toBe(true); // Documenting the bias
  });

  it("should include historically delisted companies in historical universe", async () => {
    // Enron was in S&P 500 in 2000
    const year2000Universe = await resolver.getUniverseAsOf("SP500", "2000-06-01");
    expect(year2000Universe.symbols).toContain("ENRON");

    // But not in 2002 (delisted December 2001)
    const year2002Universe = await resolver.getUniverseAsOf("SP500", "2002-06-01");
    expect(year2002Universe.symbols).not.toContain("ENRON");
  });

  it("should track index changes accurately", async () => {
    // GE was in S&P 500 for over 100 years until 2018
    const year2017Universe = await resolver.getUniverseAsOf("SP500", "2017-06-01");
    expect(year2017Universe.symbols).toContain("GE");

    // GE was removed in June 2018
    const year2019Universe = await resolver.getUniverseAsOf("SP500", "2019-06-01");
    expect(year2019Universe.symbols).not.toContain("GE");
  });

  it("should handle ticker renames correctly", async () => {
    // FB renamed to META in October 2021
    const year2020Universe = await resolver.getUniverseAsOf("SP500", "2020-06-01");
    expect(year2020Universe.symbols).toContain("FB");
    expect(year2020Universe.symbols).not.toContain("META");

    // After rename
    const year2022Universe = await resolver.getUniverseAsOf("SP500", "2022-06-01");
    expect(year2022Universe.symbols).toContain("META");
    expect(year2022Universe.symbols).not.toContain("FB");
  });
});
