import { describe, expect, test } from "bun:test";
import {
  type Candle,
  type DataSourceMetadata,
  type FillRecord,
  type PerformanceMetrics,
  type VersionRegistry,
  checkLookAheadBias,
  compareFillModels,
  comparePerformanceMetrics,
  compareVersionRegistries,
  runParityValidation,
  validateAdjustedData,
  validateDataConsistency,
} from "./parity";

describe("compareVersionRegistries", () => {
  test("returns match when registries are identical", () => {
    const registry: VersionRegistry = {
      createdAt: "2026-01-04T00:00:00Z",
      environment: "BACKTEST",
      indicators: {
        sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
        rsi: { id: "rsi", version: "2.1.0", introducedAt: "2026-01-01T00:00:00Z" },
      },
    };

    const result = compareVersionRegistries(registry, {
      ...registry,
      environment: "LIVE",
    });

    expect(result.match).toBe(true);
    expect(result.mismatches).toHaveLength(0);
    expect(result.missingFromLive).toHaveLength(0);
    expect(result.missingFromBacktest).toHaveLength(0);
  });

  test("detects version mismatches", () => {
    const backtest: VersionRegistry = {
      createdAt: "2026-01-04T00:00:00Z",
      environment: "BACKTEST",
      indicators: {
        sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
      },
    };

    const live: VersionRegistry = {
      createdAt: "2026-01-04T00:00:00Z",
      environment: "LIVE",
      indicators: {
        sma: { id: "sma", version: "2.0.0", introducedAt: "2026-01-01T00:00:00Z" },
      },
    };

    const result = compareVersionRegistries(backtest, live);

    expect(result.match).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]).toEqual({
      indicatorId: "sma",
      backtestVersion: "1.0.0",
      liveVersion: "2.0.0",
    });
  });

  test("detects missing indicators from live", () => {
    const backtest: VersionRegistry = {
      createdAt: "2026-01-04T00:00:00Z",
      environment: "BACKTEST",
      indicators: {
        sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
        atr: { id: "atr", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
      },
    };

    const live: VersionRegistry = {
      createdAt: "2026-01-04T00:00:00Z",
      environment: "LIVE",
      indicators: {
        sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
      },
    };

    const result = compareVersionRegistries(backtest, live);

    expect(result.match).toBe(false);
    expect(result.missingFromLive).toContain("atr");
  });

  test("detects indicators missing from backtest", () => {
    const backtest: VersionRegistry = {
      createdAt: "2026-01-04T00:00:00Z",
      environment: "BACKTEST",
      indicators: {
        sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
      },
    };

    const live: VersionRegistry = {
      createdAt: "2026-01-04T00:00:00Z",
      environment: "LIVE",
      indicators: {
        sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
        macd: { id: "macd", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
      },
    };

    const result = compareVersionRegistries(backtest, live);

    expect(result.match).toBe(false);
    expect(result.missingFromBacktest).toContain("macd");
  });
});

describe("checkLookAheadBias", () => {
  test("passes for valid sequential candles", () => {
    const candles: Candle[] = [
      { timestamp: "2026-01-04T09:00:00Z", open: 100, high: 105, low: 99, close: 103, volume: 1000 },
      { timestamp: "2026-01-04T10:00:00Z", open: 103, high: 108, low: 102, close: 107, volume: 1200 },
      { timestamp: "2026-01-04T11:00:00Z", open: 107, high: 110, low: 105, close: 108, volume: 1100 },
    ];

    const result = checkLookAheadBias(candles, "2026-01-04T12:00:00Z");

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("detects future data", () => {
    const candles: Candle[] = [
      { timestamp: "2026-01-04T09:00:00Z", open: 100, high: 105, low: 99, close: 103, volume: 1000 },
      { timestamp: "2026-01-04T10:00:00Z", open: 103, high: 108, low: 102, close: 107, volume: 1200 },
      { timestamp: "2026-01-04T12:00:00Z", open: 107, high: 110, low: 105, close: 108, volume: 1100 }, // Future!
    ];

    const result = checkLookAheadBias(candles, "2026-01-04T11:00:00Z");

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.type).toBe("future_data");
  });

  test("detects non-sequential timestamps", () => {
    const candles: Candle[] = [
      { timestamp: "2026-01-04T10:00:00Z", open: 100, high: 105, low: 99, close: 103, volume: 1000 },
      { timestamp: "2026-01-04T09:00:00Z", open: 103, high: 108, low: 102, close: 107, volume: 1200 }, // Out of order
      { timestamp: "2026-01-04T11:00:00Z", open: 107, high: 110, low: 105, close: 108, volume: 1100 },
    ];

    const result = checkLookAheadBias(candles, "2026-01-04T12:00:00Z");

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.type === "non_sequential")).toBe(true);
  });
});

describe("validateAdjustedData", () => {
  test("passes for properly adjusted data", () => {
    const prices = [
      {
        timestamp: "2026-01-04T00:00:00Z",
        price: 200,
        adjustedPrice: 100,
        splitFactor: 2,
      },
    ];

    const result = validateAdjustedData(prices);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("detects unadjusted data", () => {
    const prices = [
      {
        timestamp: "2026-01-04T00:00:00Z",
        price: 200,
        adjustedPrice: 200, // Should be 100 after 2:1 split
        splitFactor: 2,
      },
    ];

    const result = validateAdjustedData(prices);

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.type === "unadjusted")).toBe(true);
  });
});

describe("compareFillModels", () => {
  test("returns high match score for similar fills", () => {
    const backtestFills: FillRecord[] = [
      {
        orderId: "order-1",
        symbol: "AAPL",
        side: "buy",
        requestedQty: 100,
        filledQty: 100,
        requestedPrice: 150,
        fillPrice: 150.05,
        orderType: "limit",
        slippageBps: 3,
      },
    ];

    const liveFills: FillRecord[] = [
      {
        orderId: "order-1",
        symbol: "AAPL",
        side: "buy",
        requestedQty: 100,
        filledQty: 100,
        requestedPrice: 150,
        fillPrice: 150.08,
        orderType: "limit",
        slippageBps: 5,
      },
    ];

    const result = compareFillModels(backtestFills, liveFills);

    expect(result.matchScore).toBeGreaterThanOrEqual(0.8);
    expect(result.totalFills).toBe(1);
    expect(result.matchedFills).toBe(1);
  });

  test("detects slippage discrepancies", () => {
    const backtestFills: FillRecord[] = [
      {
        orderId: "order-1",
        symbol: "AAPL",
        side: "buy",
        requestedQty: 100,
        filledQty: 100,
        orderType: "market",
        slippageBps: 2,
      },
    ];

    const liveFills: FillRecord[] = [
      {
        orderId: "order-1",
        symbol: "AAPL",
        side: "buy",
        requestedQty: 100,
        filledQty: 100,
        orderType: "market",
        slippageBps: 50, // Much higher slippage
      },
    ];

    const result = compareFillModels(backtestFills, liveFills);

    expect(result.discrepancies.length).toBeGreaterThan(0);
    expect(result.stats.avgSlippageLive).toBeGreaterThan(result.stats.avgSlippageBacktest);
  });

  test("calculates fill rates correctly", () => {
    const backtestFills: FillRecord[] = [
      { orderId: "1", symbol: "AAPL", side: "buy", requestedQty: 100, filledQty: 100, orderType: "limit" },
      { orderId: "2", symbol: "AAPL", side: "buy", requestedQty: 100, filledQty: 0, orderType: "limit" },
    ];

    const liveFills: FillRecord[] = [
      { orderId: "1", symbol: "AAPL", side: "buy", requestedQty: 100, filledQty: 100, orderType: "limit" },
      { orderId: "2", symbol: "AAPL", side: "buy", requestedQty: 100, filledQty: 100, orderType: "limit" },
    ];

    const result = compareFillModels(backtestFills, liveFills);

    expect(result.stats.fillRateBacktest).toBe(0.5);
    expect(result.stats.fillRateLive).toBe(1);
  });
});

describe("comparePerformanceMetrics", () => {
  const baseMetrics: PerformanceMetrics = {
    sharpeRatio: 1.5,
    sortinoRatio: 2.0,
    calmarRatio: 1.2,
    maxDrawdownPct: 10,
    totalReturnPct: 25,
    winRatePct: 55,
    winLossRatio: 1.8,
    tradeCount: 100,
    periodDays: 365,
  };

  test("approves when metrics are within tolerance", () => {
    const liveMetrics: PerformanceMetrics = {
      ...baseMetrics,
      sharpeRatio: 1.45, // -3% difference
      totalReturnPct: 24, // -4% difference
    };

    const result = comparePerformanceMetrics(baseMetrics, liveMetrics);

    expect(result.withinTolerance).toBe(true);
    expect(result.recommendation).toBe("APPROVE");
    expect(result.parityScore).toBeGreaterThan(0.8);
  });

  test("investigates when some metrics diverge", () => {
    const liveMetrics: PerformanceMetrics = {
      ...baseMetrics,
      sharpeRatio: 1.0, // -33% difference
      maxDrawdownPct: 15, // +50% difference
    };

    const result = comparePerformanceMetrics(baseMetrics, liveMetrics);

    expect(result.recommendation).toBe("INVESTIGATE");
  });

  test("rejects when many metrics diverge significantly", () => {
    const liveMetrics: PerformanceMetrics = {
      sharpeRatio: 0.5, // -67%
      sortinoRatio: 0.8, // -60%
      calmarRatio: 0.4, // -67%
      maxDrawdownPct: 25, // +150%
      totalReturnPct: 5, // -80%
      winRatePct: 40, // -27%
      winLossRatio: 0.8, // -56%
      tradeCount: 50, // -50%
      periodDays: 365,
    };

    const result = comparePerformanceMetrics(baseMetrics, liveMetrics);

    expect(result.recommendation).toBe("REJECT");
    expect(result.parityScore).toBeLessThan(0.7);
  });
});

describe("validateDataConsistency", () => {
  test("passes for consistent data sources", () => {
    const historical: DataSourceMetadata = {
      provider: "polygon",
      feedType: "historical",
      adjusted: true,
      startDate: "2025-01-01T00:00:00Z",
      endDate: "2025-12-31T23:59:59Z",
      symbols: ["AAPL", "MSFT", "GOOGL"],
    };

    const realtime: DataSourceMetadata = {
      provider: "polygon",
      feedType: "realtime",
      adjusted: true,
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-01-04T00:00:00Z",
      symbols: ["AAPL", "MSFT", "GOOGL"],
    };

    const result = validateDataConsistency(historical, realtime);

    expect(result.consistent).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test("warns about provider mismatch", () => {
    const historical: DataSourceMetadata = {
      provider: "polygon",
      feedType: "historical",
      adjusted: true,
      startDate: "2025-01-01T00:00:00Z",
      endDate: "2025-12-31T23:59:59Z",
      symbols: ["AAPL"],
    };

    const realtime: DataSourceMetadata = {
      provider: "databento",
      feedType: "realtime",
      adjusted: true,
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-01-04T00:00:00Z",
      symbols: ["AAPL"],
    };

    const result = validateDataConsistency(historical, realtime);

    expect(result.issues.some((i) => i.type === "provider_mismatch")).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  test("fails on adjustment mismatch", () => {
    const historical: DataSourceMetadata = {
      provider: "polygon",
      feedType: "historical",
      adjusted: false, // Not adjusted!
      startDate: "2025-01-01T00:00:00Z",
      endDate: "2025-12-31T23:59:59Z",
      symbols: ["AAPL"],
    };

    const realtime: DataSourceMetadata = {
      provider: "polygon",
      feedType: "realtime",
      adjusted: true,
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-01-04T00:00:00Z",
      symbols: ["AAPL"],
    };

    const result = validateDataConsistency(historical, realtime);

    expect(result.consistent).toBe(false);
    expect(result.issues.some((i) => i.type === "adjustment_mismatch")).toBe(true);
  });

  test("warns about survivorship bias", () => {
    const historical: DataSourceMetadata = {
      provider: "polygon",
      feedType: "historical",
      adjusted: true,
      startDate: "2025-01-01T00:00:00Z",
      endDate: "2025-12-31T23:59:59Z",
      symbols: ["AAPL", "MSFT"], // Missing delisted symbol
    };

    const realtime: DataSourceMetadata = {
      provider: "polygon",
      feedType: "realtime",
      adjusted: true,
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-01-04T00:00:00Z",
      symbols: ["AAPL", "MSFT"],
    };

    const result = validateDataConsistency(historical, realtime, ["LEHM"]); // Delisted symbol

    expect(result.issues.some((i) => i.type === "survivorship_bias")).toBe(true);
  });
});

describe("runParityValidation", () => {
  test("approves when all checks pass", () => {
    const result = runParityValidation({
      backtestRegistry: {
        createdAt: "2026-01-04T00:00:00Z",
        environment: "BACKTEST",
        indicators: {
          sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
        },
      },
      liveRegistry: {
        createdAt: "2026-01-04T00:00:00Z",
        environment: "LIVE",
        indicators: {
          sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
        },
      },
      candles: [
        { timestamp: "2026-01-04T09:00:00Z", open: 100, high: 105, low: 99, close: 103, volume: 1000 },
      ],
      decisionTimestamp: "2026-01-04T10:00:00Z",
    });

    expect(result.passed).toBe(true);
    expect(result.recommendation).toBe("APPROVE_FOR_LIVE");
    expect(result.blockingIssues).toHaveLength(0);
  });

  test("blocks on version mismatches", () => {
    const result = runParityValidation({
      backtestRegistry: {
        createdAt: "2026-01-04T00:00:00Z",
        environment: "BACKTEST",
        indicators: {
          sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
        },
      },
      liveRegistry: {
        createdAt: "2026-01-04T00:00:00Z",
        environment: "LIVE",
        indicators: {
          sma: { id: "sma", version: "2.0.0", introducedAt: "2026-01-01T00:00:00Z" },
        },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.recommendation).toBe("NOT_READY");
    expect(result.blockingIssues.length).toBeGreaterThan(0);
  });

  test("blocks on look-ahead bias", () => {
    const result = runParityValidation({
      candles: [
        { timestamp: "2026-01-04T12:00:00Z", open: 100, high: 105, low: 99, close: 103, volume: 1000 },
      ],
      decisionTimestamp: "2026-01-04T10:00:00Z", // Decision before candle!
    });

    expect(result.passed).toBe(false);
    expect(result.recommendation).toBe("NOT_READY");
    expect(result.blockingIssues.some((i) => i.includes("Look-ahead"))).toBe(true);
  });

  test("needs investigation when fill model diverges", () => {
    const result = runParityValidation({
      backtestFills: [
        { orderId: "1", symbol: "AAPL", side: "buy", requestedQty: 100, filledQty: 100, orderType: "market", slippageBps: 2 },
      ],
      liveFills: [
        { orderId: "1", symbol: "AAPL", side: "buy", requestedQty: 100, filledQty: 100, orderType: "market", slippageBps: 30 },
      ],
    });

    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("records validation timestamp", () => {
    const before = new Date().toISOString();
    const result = runParityValidation({});
    const after = new Date().toISOString();

    expect(result.validatedAt >= before).toBe(true);
    expect(result.validatedAt <= after).toBe(true);
  });
});
