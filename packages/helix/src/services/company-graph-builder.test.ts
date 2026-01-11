/**
 * Company Graph Builder Tests
 *
 * Tests for the CompanyGraphBuilder service including:
 * - Sector/industry peer detection
 * - Correlation-based relationship detection
 * - Supply chain edge building
 * - Market cap bucketing
 */

import { describe, expect, test } from "bun:test";
import {
  type CompanyData,
  type CorrelationPair,
  calculateCorrelation,
  calculateReturns,
  getMarketCapBucket,
  type SupplyChainRelationship,
} from "./company-graph-builder.js";

// ============================================
// Market Cap Bucket Tests
// ============================================

describe("getMarketCapBucket", () => {
  test("returns MEGA for market cap >= 200B", () => {
    expect(getMarketCapBucket(200_000_000_000)).toBe("MEGA");
    expect(getMarketCapBucket(500_000_000_000)).toBe("MEGA");
  });

  test("returns LARGE for market cap >= 10B and < 200B", () => {
    expect(getMarketCapBucket(10_000_000_000)).toBe("LARGE");
    expect(getMarketCapBucket(50_000_000_000)).toBe("LARGE");
    expect(getMarketCapBucket(199_999_999_999)).toBe("LARGE");
  });

  test("returns MID for market cap >= 2B and < 10B", () => {
    expect(getMarketCapBucket(2_000_000_000)).toBe("MID");
    expect(getMarketCapBucket(5_000_000_000)).toBe("MID");
    expect(getMarketCapBucket(9_999_999_999)).toBe("MID");
  });

  test("returns SMALL for market cap >= 300M and < 2B", () => {
    expect(getMarketCapBucket(300_000_000)).toBe("SMALL");
    expect(getMarketCapBucket(1_000_000_000)).toBe("SMALL");
    expect(getMarketCapBucket(1_999_999_999)).toBe("SMALL");
  });

  test("returns MICRO for market cap < 300M", () => {
    expect(getMarketCapBucket(100_000_000)).toBe("MICRO");
    expect(getMarketCapBucket(299_999_999)).toBe("MICRO");
  });

  test("returns SMALL for undefined market cap", () => {
    expect(getMarketCapBucket(undefined)).toBe("SMALL");
  });
});

// ============================================
// Correlation Calculation Tests
// ============================================

describe("calculateReturns", () => {
  test("calculates daily returns from prices", () => {
    const prices = [100, 102, 101, 105];
    const returns = calculateReturns(prices);

    expect(returns.length).toBe(3);
    expect(returns[0]).toBeCloseTo(0.02, 4);
    expect(returns[1]).toBeCloseTo(-0.0098, 4);
    expect(returns[2]).toBeCloseTo(0.0396, 4);
  });

  test("handles single price (returns empty array)", () => {
    const returns = calculateReturns([100]);
    expect(returns).toEqual([]);
  });

  test("handles empty prices", () => {
    const returns = calculateReturns([]);
    expect(returns).toEqual([]);
  });

  test("skips zero or negative previous prices", () => {
    const prices = [0, 100, 102];
    const returns = calculateReturns(prices);
    expect(returns.length).toBe(1);
    expect(returns[0]).toBeCloseTo(0.02, 4);
  });
});

describe("calculateCorrelation", () => {
  test("returns 1.0 for perfectly correlated series", () => {
    const returnsA = [0.01, 0.02, -0.01, 0.03];
    const returnsB = [0.01, 0.02, -0.01, 0.03];
    const correlation = calculateCorrelation(returnsA, returnsB);
    expect(correlation).toBeCloseTo(1.0, 4);
  });

  test("returns -1.0 for perfectly negatively correlated series", () => {
    const returnsA = [0.01, 0.02, -0.01, 0.03];
    const returnsB = [-0.01, -0.02, 0.01, -0.03];
    const correlation = calculateCorrelation(returnsA, returnsB);
    expect(correlation).toBeCloseTo(-1.0, 4);
  });

  test("returns 0 for uncorrelated series", () => {
    const returnsA = [0.01, -0.01, 0.01, -0.01];
    const returnsB = [0.01, 0.01, -0.01, -0.01];
    const correlation = calculateCorrelation(returnsA, returnsB);
    expect(Math.abs(correlation)).toBeLessThan(0.01);
  });

  test("returns 0 for series of different lengths", () => {
    const returnsA = [0.01, 0.02, -0.01];
    const returnsB = [0.01, 0.02];
    const correlation = calculateCorrelation(returnsA, returnsB);
    expect(correlation).toBe(0);
  });

  test("returns 0 for series with less than 2 elements", () => {
    expect(calculateCorrelation([0.01], [0.02])).toBe(0);
    expect(calculateCorrelation([], [])).toBe(0);
  });

  test("returns 0 for constant series (no variance)", () => {
    const returnsA = [0.01, 0.01, 0.01];
    const returnsB = [0.02, 0.03, 0.01];
    const correlation = calculateCorrelation(returnsA, returnsB);
    expect(correlation).toBe(0);
  });

  test("calculates correlation for typical stock returns", () => {
    const nvda = [0.05, -0.02, 0.03, 0.01, -0.01];
    const amd = [0.04, -0.015, 0.025, 0.008, -0.012];
    const correlation = calculateCorrelation(nvda, amd);
    expect(correlation).toBeGreaterThan(0.9);
  });
});

// ============================================
// Company Data Transformation Tests
// ============================================

describe("CompanyData grouping", () => {
  const companies: CompanyData[] = [
    { symbol: "AAPL", name: "Apple", sector: "Technology", industry: "Consumer Electronics" },
    { symbol: "MSFT", name: "Microsoft", sector: "Technology", industry: "Software" },
    { symbol: "NVDA", name: "NVIDIA", sector: "Technology", industry: "Semiconductors" },
    { symbol: "AMD", name: "AMD", sector: "Technology", industry: "Semiconductors" },
    { symbol: "JPM", name: "JPMorgan", sector: "Financial Services", industry: "Banks" },
    {
      symbol: "GS",
      name: "Goldman Sachs",
      sector: "Financial Services",
      industry: "Investment Banking",
    },
  ];

  test("companies can be grouped by sector", () => {
    const sectorGroups = new Map<string, CompanyData[]>();
    for (const company of companies) {
      const sector = company.sector ?? "Unknown";
      const existing = sectorGroups.get(sector) ?? [];
      existing.push(company);
      sectorGroups.set(sector, existing);
    }

    expect(sectorGroups.get("Technology")?.length).toBe(4);
    expect(sectorGroups.get("Financial Services")?.length).toBe(2);
  });

  test("companies can be grouped by industry", () => {
    const industryGroups = new Map<string, CompanyData[]>();
    for (const company of companies) {
      const industry = company.industry ?? "Unknown";
      const existing = industryGroups.get(industry) ?? [];
      existing.push(company);
      industryGroups.set(industry, existing);
    }

    expect(industryGroups.get("Semiconductors")?.length).toBe(2);
    expect(industryGroups.get("Consumer Electronics")?.length).toBe(1);
    expect(industryGroups.get("Banks")?.length).toBe(1);
  });
});

// ============================================
// Correlation Pair Tests
// ============================================

describe("CorrelationPair filtering", () => {
  const pairs: CorrelationPair[] = [
    { symbolA: "NVDA", symbolB: "AMD", correlation: 0.85, lookbackDays: 252 },
    { symbolA: "AAPL", symbolB: "MSFT", correlation: 0.72, lookbackDays: 252 },
    { symbolA: "JPM", symbolB: "GS", correlation: 0.78, lookbackDays: 252 },
    { symbolA: "AAPL", symbolB: "JPM", correlation: 0.45, lookbackDays: 252 },
    { symbolA: "SPY", symbolB: "QQQ", correlation: 0.92, lookbackDays: 252 },
  ];

  test("filters pairs above minimum correlation threshold", () => {
    const minCorrelation = 0.7;
    const filtered = pairs.filter((p) => Math.abs(p.correlation) >= minCorrelation);
    expect(filtered.length).toBe(4);
    expect(filtered.every((p) => Math.abs(p.correlation) >= minCorrelation)).toBe(true);
  });

  test("sorts pairs by absolute correlation", () => {
    const sorted = pairs.toSorted((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    expect(sorted[0]?.symbolA).toBe("SPY");
    expect(sorted[0]?.correlation).toBe(0.92);
    expect(sorted[1]?.symbolA).toBe("NVDA");
    expect(sorted[1]?.correlation).toBe(0.85);
  });
});

// ============================================
// Supply Chain Relationship Tests
// ============================================

describe("SupplyChainRelationship validation", () => {
  const relationships: SupplyChainRelationship[] = [
    {
      sourceSymbol: "AAPL",
      targetSymbol: "TSM",
      dependencyType: "SUPPLIER",
      strength: 0.9,
      source: "SEC_10K",
    },
    {
      sourceSymbol: "AAPL",
      targetSymbol: "QCOM",
      dependencyType: "SUPPLIER",
      strength: 0.7,
      source: "FMP",
    },
    {
      sourceSymbol: "NVDA",
      targetSymbol: "TSM",
      dependencyType: "SUPPLIER",
      strength: 0.95,
      source: "SEC_10K",
    },
  ];

  test("all relationships have valid dependency types", () => {
    const validTypes = ["SUPPLIER", "CUSTOMER", "PARTNER"];
    expect(relationships.every((r) => validTypes.includes(r.dependencyType))).toBe(true);
  });

  test("strength values are within 0-1 range", () => {
    expect(relationships.every((r) => r.strength >= 0 && r.strength <= 1)).toBe(true);
  });

  test("can filter by dependency type", () => {
    const suppliers = relationships.filter((r) => r.dependencyType === "SUPPLIER");
    expect(suppliers.length).toBe(3);
  });

  test("can find companies dependent on a specific company", () => {
    const tsmDependents = relationships.filter((r) => r.targetSymbol === "TSM");
    expect(tsmDependents.length).toBe(2);
    expect(tsmDependents.map((r) => r.sourceSymbol)).toContain("AAPL");
    expect(tsmDependents.map((r) => r.sourceSymbol)).toContain("NVDA");
  });
});
