/**
 * Paper Trading Validation Tests
 *
 * Tests for paper trading runner that validates indicators in live market conditions.
 */

import { describe, expect, test } from "bun:test";

import {
  aggregatePaperTradingResults,
  type BacktestedMetrics,
  calculateRealizedMetrics,
  canEvaluatePaperTrading,
  daysUntilEvaluation,
  determinePaperTradingAction,
  evaluatePaperTrading,
  PAPER_TRADING_DEFAULTS,
  type PaperSignal,
  type PaperTradingConfig,
  tradingDaysBetween,
} from "../src/synthesis/paperTrading/index.js";

// ============================================
// Test Helpers
// ============================================

function generateSignals(
  n: number,
  startDate: string,
  options: {
    correlation?: number;
    symbolCount?: number;
  } = {}
): PaperSignal[] {
  const { correlation = 0.5, symbolCount = 10 } = options;
  const signals: PaperSignal[] = [];
  const symbols = Array.from({ length: symbolCount }, (_, i) => `SYM${i}`);

  const start = new Date(startDate);

  for (let day = 0; day < n; day++) {
    const current = new Date(start);
    current.setDate(current.getDate() + day);

    // Skip weekends
    if (current.getDay() === 0 || current.getDay() === 6) {
      continue;
    }

    const dateStr = current.toISOString().split("T")[0]!;

    for (const symbol of symbols) {
      // Generate signal
      const signal = Math.random() * 2 - 1;

      // Generate correlated outcome
      const noise = Math.random() * 2 - 1;
      const outcome = correlation * signal + (1 - Math.abs(correlation)) * noise * 0.02;

      signals.push({
        date: dateStr,
        symbol,
        signal,
        outcome,
      });
    }
  }

  return signals;
}

function generateProfitableSignals(n: number, startDate: string): PaperSignal[] {
  const signals: PaperSignal[] = [];
  const start = new Date(startDate);
  const symbols = ["AAPL", "MSFT", "GOOGL"];

  for (let day = 0; day < n; day++) {
    const current = new Date(start);
    current.setDate(current.getDate() + day);

    if (current.getDay() === 0 || current.getDay() === 6) {
      continue;
    }

    const dateStr = current.toISOString().split("T")[0]!;

    for (const symbol of symbols) {
      // Profitable signal with positive correlation
      const signal = Math.random() > 0.5 ? 0.8 : -0.8;
      const outcome = signal * (0.01 + Math.random() * 0.02); // 1-3% move in right direction

      signals.push({
        date: dateStr,
        symbol,
        signal,
        outcome,
      });
    }
  }

  return signals;
}

function generateUnprofitableSignals(n: number, startDate: string): PaperSignal[] {
  const signals: PaperSignal[] = [];
  const start = new Date(startDate);
  const symbols = ["SPY", "QQQ"];

  for (let day = 0; day < n; day++) {
    const current = new Date(start);
    current.setDate(current.getDate() + day);

    if (current.getDay() === 0 || current.getDay() === 6) {
      continue;
    }

    const dateStr = current.toISOString().split("T")[0]!;

    for (const symbol of symbols) {
      // Unprofitable - signal direction opposite to outcome
      const signal = Math.random() > 0.5 ? 0.8 : -0.8;
      const outcome = -signal * (0.02 + Math.random() * 0.03); // Wrong direction

      signals.push({
        date: dateStr,
        symbol,
        signal,
        outcome,
      });
    }
  }

  return signals;
}

// ============================================
// Tests
// ============================================

describe("tradingDaysBetween", () => {
  test("calculates weekdays between dates", () => {
    // Monday to Friday (5 weekdays)
    const days = tradingDaysBetween("2024-01-08", "2024-01-12");
    expect(days).toBe(5);
  });

  test("excludes weekends", () => {
    // Monday to next Monday (5 weekdays, skips Sat/Sun)
    const days = tradingDaysBetween("2024-01-08", "2024-01-15");
    expect(days).toBe(6); // Mon-Fri + Mon
  });

  test("handles same day", () => {
    const days = tradingDaysBetween("2024-01-08", "2024-01-08");
    expect(days).toBe(1);
  });

  test("returns 0 for end before start", () => {
    const days = tradingDaysBetween("2024-01-15", "2024-01-08");
    expect(days).toBe(0);
  });

  test("handles full month", () => {
    // January 2024 has 23 trading days (31 days - 8 weekend days)
    const days = tradingDaysBetween("2024-01-01", "2024-01-31");
    expect(days).toBe(23);
  });
});

describe("calculateRealizedMetrics", () => {
  test("calculates metrics from profitable signals", () => {
    const signals = generateProfitableSignals(45, "2024-01-01");
    const metrics = calculateRealizedMetrics(signals);

    expect(metrics.sharpe).toBeGreaterThan(0);
    expect(metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(metrics.hitRate).toBeGreaterThan(0.5); // Should be profitable
    expect(metrics.totalSignals).toBe(signals.length);
    expect(metrics.signalsWithOutcomes).toBe(signals.length);
  });

  test("calculates metrics from unprofitable signals", () => {
    const signals = generateUnprofitableSignals(45, "2024-01-01");
    const metrics = calculateRealizedMetrics(signals);

    expect(metrics.sharpe).toBeLessThan(0);
    expect(metrics.hitRate).toBeLessThan(0.5);
  });

  test("handles empty signals", () => {
    const metrics = calculateRealizedMetrics([]);

    expect(metrics.sharpe).toBe(0);
    expect(metrics.maxDrawdown).toBe(0);
    expect(metrics.icMean).toBe(0);
    expect(metrics.hitRate).toBe(0);
    expect(metrics.totalSignals).toBe(0);
  });

  test("handles signals without outcomes", () => {
    const signals: PaperSignal[] = [
      { date: "2024-01-02", symbol: "AAPL", signal: 0.5, outcome: null },
      { date: "2024-01-02", symbol: "MSFT", signal: -0.5, outcome: null },
    ];

    const metrics = calculateRealizedMetrics(signals);

    expect(metrics.totalSignals).toBe(2);
    expect(metrics.signalsWithOutcomes).toBe(0);
    expect(metrics.sharpe).toBe(0);
  });

  test("calculates average daily turnover", () => {
    const signals = generateSignals(10, "2024-01-01", { symbolCount: 5 });
    const metrics = calculateRealizedMetrics(signals);

    expect(metrics.avgDailyTurnover).toBeGreaterThan(0);
  });
});

describe("evaluatePaperTrading", () => {
  const backtested: BacktestedMetrics = {
    sharpe: 1.5,
    maxDrawdown: 0.1,
    icMean: 0.05,
    icir: 0.8,
  };

  const config: PaperTradingConfig = {
    indicatorId: "test-indicator",
    startDate: "2024-01-01T00:00:00.000Z",
    minimumDays: 30,
    sharpeTolerance: 0.7,
    maxDrawdownMultiplier: 2.0,
  };

  test("returns in_progress for insufficient days", () => {
    const signals = generateProfitableSignals(15, "2024-01-01");
    const endDate = "2024-01-20T00:00:00.000Z";

    const result = evaluatePaperTrading(config, signals, backtested, endDate);

    expect(result.status).toBe("in_progress");
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("trading days");
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  test("passes with good performance", () => {
    const signals = generateProfitableSignals(60, "2024-01-01");
    const endDate = "2024-03-15T00:00:00.000Z";

    const result = evaluatePaperTrading(config, signals, backtested, endDate);

    expect(result.daysTraded).toBeGreaterThanOrEqual(30);
    expect(result.sharpeRatio).toBeGreaterThanOrEqual(0);
    expect(result.drawdownRatio).toBeGreaterThanOrEqual(0);
  });

  test("fails with poor performance", () => {
    const signals = generateUnprofitableSignals(60, "2024-01-01");
    const endDate = "2024-03-15T00:00:00.000Z";

    // Use generous backtested metrics that real performance won't match
    const goodBacktest: BacktestedMetrics = {
      sharpe: 2.0,
      maxDrawdown: 0.05,
    };

    const result = evaluatePaperTrading(config, signals, goodBacktest, endDate);

    expect(result.status).toBe("failed");
    expect(result.passed).toBe(false);
    expect(result.failureReason).toBeDefined();
  });

  test("includes backtested and realized metrics", () => {
    const signals = generateSignals(60, "2024-01-01");
    const endDate = "2024-03-15T00:00:00.000Z";

    const result = evaluatePaperTrading(config, signals, backtested, endDate);

    expect(result.backtested).toEqual(backtested);
    expect(result.realized).toBeDefined();
    expect(result.realized.sharpe).toBeDefined();
    expect(result.realized.maxDrawdown).toBeDefined();
  });

  test("calculates correct ratios", () => {
    const signals = generateProfitableSignals(60, "2024-01-01");
    const endDate = "2024-03-15T00:00:00.000Z";

    const result = evaluatePaperTrading(config, signals, backtested, endDate);

    // Sharpe ratio should be realized / backtested
    const expectedSharpeRatio = result.realized.sharpe / backtested.sharpe;
    expect(Math.abs(result.sharpeRatio - expectedSharpeRatio)).toBeLessThan(0.001);
  });
});

describe("canEvaluatePaperTrading", () => {
  test("returns false for insufficient days", () => {
    const signals = generateSignals(10, "2024-01-01");

    const canEvaluate = canEvaluatePaperTrading("2024-01-01", "2024-01-15", signals, 30);

    expect(canEvaluate).toBe(false);
  });

  test("returns true with sufficient days and outcomes", () => {
    const signals = generateSignals(60, "2024-01-01");

    const canEvaluate = canEvaluatePaperTrading("2024-01-01", "2024-03-15", signals, 30);

    expect(canEvaluate).toBe(true);
  });

  test("returns false without outcomes", () => {
    const signals: PaperSignal[] = Array.from({ length: 100 }, (_, i) => ({
      date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
      symbol: "AAPL",
      signal: 0.5,
      outcome: null,
    }));

    const canEvaluate = canEvaluatePaperTrading("2024-01-01", "2024-03-15", signals, 30);

    expect(canEvaluate).toBe(false);
  });
});

describe("determinePaperTradingAction", () => {
  test("recommends promote for passed", () => {
    const result = {
      indicatorId: "test",
      startDate: "2024-01-01",
      endDate: "2024-02-15",
      daysTraded: 35,
      backtested: { sharpe: 1.5, maxDrawdown: 0.1 },
      realized: {
        sharpe: 1.4,
        maxDrawdown: 0.12,
        icMean: 0.04,
        icir: 0.7,
        totalSignals: 350,
        signalsWithOutcomes: 350,
        hitRate: 0.55,
        avgDailyTurnover: 10,
      },
      sharpeRatio: 0.93,
      drawdownRatio: 1.2,
      passed: true,
      status: "passed" as const,
      recommendations: ["Ready for production"],
    };

    const action = determinePaperTradingAction(result);

    expect(action.action).toBe("promote");
    expect(action.confidence).toBe("high");
  });

  test("recommends continue for in_progress", () => {
    const result = {
      indicatorId: "test",
      startDate: "2024-01-01",
      endDate: "2024-01-20",
      daysTraded: 15,
      backtested: { sharpe: 1.5, maxDrawdown: 0.1 },
      realized: {
        sharpe: 0,
        maxDrawdown: 0,
        icMean: 0,
        icir: 0,
        totalSignals: 0,
        signalsWithOutcomes: 0,
        hitRate: 0,
        avgDailyTurnover: 0,
      },
      sharpeRatio: 0,
      drawdownRatio: 0,
      passed: false,
      status: "in_progress" as const,
      failureReason: "Only 15 trading days",
      recommendations: ["Continue paper trading"],
    };

    const action = determinePaperTradingAction(result);

    expect(action.action).toBe("continue");
    expect(action.confidence).toBe("low");
  });

  test("recommends retire for significant failure", () => {
    const result = {
      indicatorId: "test",
      startDate: "2024-01-01",
      endDate: "2024-02-15",
      daysTraded: 35,
      backtested: { sharpe: 1.5, maxDrawdown: 0.1 },
      realized: {
        sharpe: 0.3,
        maxDrawdown: 0.35,
        icMean: 0.01,
        icir: 0.2,
        totalSignals: 350,
        signalsWithOutcomes: 350,
        hitRate: 0.48,
        avgDailyTurnover: 10,
      },
      sharpeRatio: 0.2,
      drawdownRatio: 3.5,
      passed: false,
      status: "failed" as const,
      failureReason: "Sharpe ratio too low",
      recommendations: ["Consider retirement"],
    };

    const action = determinePaperTradingAction(result);

    expect(action.action).toBe("retire");
    expect(action.confidence).toBe("high");
  });

  test("recommends review for marginal failure", () => {
    const result = {
      indicatorId: "test",
      startDate: "2024-01-01",
      endDate: "2024-02-15",
      daysTraded: 35,
      backtested: { sharpe: 1.5, maxDrawdown: 0.1 },
      realized: {
        sharpe: 1.0,
        maxDrawdown: 0.18,
        icMean: 0.03,
        icir: 0.5,
        totalSignals: 350,
        signalsWithOutcomes: 350,
        hitRate: 0.52,
        avgDailyTurnover: 10,
      },
      sharpeRatio: 0.67, // Just below 0.7 threshold
      drawdownRatio: 1.8,
      passed: false,
      status: "failed" as const,
      failureReason: "Sharpe ratio marginally low",
      recommendations: ["Consider parameter adjustments"],
    };

    const action = determinePaperTradingAction(result);

    expect(action.action).toBe("review");
    expect(action.confidence).toBe("medium");
  });
});

describe("daysUntilEvaluation", () => {
  test("calculates remaining days", () => {
    const days = daysUntilEvaluation("2024-01-01", "2024-01-15", 30);

    // About 15 trading days completed, need 15 more
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThan(30);
  });

  test("returns 0 when evaluation ready", () => {
    const days = daysUntilEvaluation("2024-01-01", "2024-03-01", 30);

    expect(days).toBe(0);
  });

  test("uses default minimum days", () => {
    const days = daysUntilEvaluation("2024-01-01", "2024-01-05");

    expect(days).toBeGreaterThan(0);
  });
});

describe("aggregatePaperTradingResults", () => {
  test("aggregates multiple results", () => {
    const results = [
      {
        indicatorId: "ind1",
        startDate: "2024-01-01",
        endDate: "2024-02-15",
        daysTraded: 35,
        backtested: { sharpe: 1.5, maxDrawdown: 0.1 },
        realized: {
          sharpe: 1.4,
          maxDrawdown: 0.12,
          icMean: 0.04,
          icir: 0.7,
          totalSignals: 350,
          signalsWithOutcomes: 350,
          hitRate: 0.55,
          avgDailyTurnover: 10,
        },
        sharpeRatio: 0.93,
        drawdownRatio: 1.2,
        passed: true,
        status: "passed" as const,
        recommendations: [],
      },
      {
        indicatorId: "ind2",
        startDate: "2024-01-01",
        endDate: "2024-02-15",
        daysTraded: 35,
        backtested: { sharpe: 1.5, maxDrawdown: 0.1 },
        realized: {
          sharpe: 0.5,
          maxDrawdown: 0.25,
          icMean: 0.02,
          icir: 0.3,
          totalSignals: 350,
          signalsWithOutcomes: 350,
          hitRate: 0.48,
          avgDailyTurnover: 10,
        },
        sharpeRatio: 0.33,
        drawdownRatio: 2.5,
        passed: false,
        status: "failed" as const,
        failureReason: "Poor performance",
        recommendations: [],
      },
      {
        indicatorId: "ind3",
        startDate: "2024-01-15",
        endDate: "2024-01-25",
        daysTraded: 8,
        backtested: { sharpe: 1.5, maxDrawdown: 0.1 },
        realized: {
          sharpe: 0,
          maxDrawdown: 0,
          icMean: 0,
          icir: 0,
          totalSignals: 80,
          signalsWithOutcomes: 80,
          hitRate: 0.5,
          avgDailyTurnover: 10,
        },
        sharpeRatio: 0,
        drawdownRatio: 0,
        passed: false,
        status: "in_progress" as const,
        failureReason: "Insufficient days",
        recommendations: [],
      },
    ];

    const aggregate = aggregatePaperTradingResults(results);

    expect(aggregate.total).toBe(3);
    expect(aggregate.passed).toBe(1);
    expect(aggregate.failed).toBe(1);
    expect(aggregate.inProgress).toBe(1);
    expect(aggregate.passRate).toBe(0.5); // 1 passed out of 2 completed
    expect(aggregate.avgSharpeRatio).toBeCloseTo(0.63, 2); // (0.93 + 0.33) / 2
  });

  test("handles empty results", () => {
    const aggregate = aggregatePaperTradingResults([]);

    expect(aggregate.total).toBe(0);
    expect(aggregate.passRate).toBe(0);
  });

  test("handles all in-progress", () => {
    const results = [
      {
        indicatorId: "ind1",
        startDate: "2024-01-01",
        endDate: "2024-01-10",
        daysTraded: 7,
        backtested: { sharpe: 1.5, maxDrawdown: 0.1 },
        realized: {
          sharpe: 0,
          maxDrawdown: 0,
          icMean: 0,
          icir: 0,
          totalSignals: 70,
          signalsWithOutcomes: 70,
          hitRate: 0.5,
          avgDailyTurnover: 10,
        },
        sharpeRatio: 0,
        drawdownRatio: 0,
        passed: false,
        status: "in_progress" as const,
        recommendations: [],
      },
    ];

    const aggregate = aggregatePaperTradingResults(results);

    expect(aggregate.inProgress).toBe(1);
    expect(aggregate.passRate).toBe(0); // No completed results
  });
});

describe("Edge Cases", () => {
  test("handles zero backtested sharpe", () => {
    const backtested: BacktestedMetrics = {
      sharpe: 0,
      maxDrawdown: 0.1,
    };

    const config: PaperTradingConfig = {
      indicatorId: "test",
      startDate: "2024-01-01T00:00:00.000Z",
    };

    const signals = generateSignals(60, "2024-01-01");
    const result = evaluatePaperTrading(config, signals, backtested, "2024-03-15T00:00:00.000Z");

    expect(result.sharpeRatio).toBe(0);
  });

  test("handles zero backtested drawdown", () => {
    const backtested: BacktestedMetrics = {
      sharpe: 1.5,
      maxDrawdown: 0,
    };

    const config: PaperTradingConfig = {
      indicatorId: "test",
      startDate: "2024-01-01T00:00:00.000Z",
    };

    const signals = generateSignals(60, "2024-01-01");
    const result = evaluatePaperTrading(config, signals, backtested, "2024-03-15T00:00:00.000Z");

    expect(result.drawdownRatio).toBe(0);
  });

  test("handles single signal", () => {
    const signals: PaperSignal[] = [
      { date: "2024-01-02", symbol: "AAPL", signal: 0.5, outcome: 0.02 },
    ];

    const metrics = calculateRealizedMetrics(signals);

    expect(metrics.totalSignals).toBe(1);
    expect(metrics.signalsWithOutcomes).toBe(1);
  });

  test("handles all signals same value", () => {
    const signals: PaperSignal[] = Array.from({ length: 50 }, () => ({
      date: "2024-01-02",
      symbol: "AAPL",
      signal: 1.0,
      outcome: 0.01,
    }));

    const metrics = calculateRealizedMetrics(signals);

    // With identical values, correlation is undefined (0)
    expect(metrics.hitRate).toBe(1); // All correct direction
  });
});

describe("Integration with PAPER_TRADING_DEFAULTS", () => {
  test("uses default minimum days", () => {
    expect(PAPER_TRADING_DEFAULTS.minimumDays).toBe(30);
  });

  test("uses default sharpe tolerance", () => {
    expect(PAPER_TRADING_DEFAULTS.sharpeTolerance).toBe(0.7);
  });

  test("uses default drawdown multiplier", () => {
    expect(PAPER_TRADING_DEFAULTS.maxDrawdownMultiplier).toBe(2.0);
  });
});
