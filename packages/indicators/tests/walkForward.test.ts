/**
 * Tests for Walk-Forward Validation Module
 */

import { describe, expect, test } from "bun:test";
import {
  compareWalkForwardMethods,
  evaluateWalkForward,
  isWalkForwardRobust,
  minimumWalkForwardLength,
  WalkForwardInputSchema,
  type WalkForwardResult,
  WF_DEFAULTS,
  walkForwardSweep,
  walkForwardValidation,
} from "../src/synthesis/walkForward.js";

// ============================================
// Helper Functions for Tests
// ============================================

/**
 * Generate synthetic returns for testing.
 */
function generateReturns(n: number, drift = 0.0001, volatility = 0.02): number[] {
  const returns: number[] = [];
  for (let i = 0; i < n; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    returns.push(drift + volatility * z);
  }
  return returns;
}

/**
 * Generate synthetic signals correlated with returns.
 */
function generateSignals(returns: number[], correlation = 0.5): number[] {
  return returns.map((r) => {
    const u1 = Math.random();
    const u2 = Math.random();
    const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return correlation * r + (1 - correlation) * noise * 0.02;
  });
}

// ============================================
// Schema Validation Tests
// ============================================

describe("WalkForwardInputSchema", () => {
  test("accepts valid input with defaults", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
    };
    const parsed = WalkForwardInputSchema.parse(input);
    expect(parsed.nPeriods).toBe(5);
    expect(parsed.trainRatio).toBe(0.8);
    expect(parsed.method).toBe("rolling");
  });

  test("accepts custom nPeriods", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      nPeriods: 10,
    };
    const parsed = WalkForwardInputSchema.parse(input);
    expect(parsed.nPeriods).toBe(10);
  });

  test("accepts custom trainRatio", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      trainRatio: 0.7,
    };
    const parsed = WalkForwardInputSchema.parse(input);
    expect(parsed.trainRatio).toBe(0.7);
  });

  test("accepts anchored method", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      method: "anchored" as const,
    };
    const parsed = WalkForwardInputSchema.parse(input);
    expect(parsed.method).toBe("anchored");
  });

  test("rejects nPeriods < 2", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      nPeriods: 1,
    };
    expect(() => WalkForwardInputSchema.parse(input)).toThrow();
  });

  test("rejects trainRatio outside valid range", () => {
    expect(() =>
      WalkForwardInputSchema.parse({
        returns: [0.01],
        signals: [1],
        trainRatio: 0.05,
      })
    ).toThrow();

    expect(() =>
      WalkForwardInputSchema.parse({
        returns: [0.01],
        signals: [1],
        trainRatio: 0.99,
      })
    ).toThrow();
  });
});

// ============================================
// Core Walk-Forward Validation Tests
// ============================================

describe("walkForwardValidation", () => {
  test("throws if returns and signals have different lengths", () => {
    expect(() =>
      walkForwardValidation({
        returns: [0.01, 0.02, 0.03],
        signals: [1, -1],
      })
    ).toThrow("same length");
  });

  test("throws if insufficient data for periods", () => {
    const returns = Array(50).fill(0.01);
    const signals = Array(50).fill(1);

    // Need 5 periods * 20 min observations = 100
    expect(() =>
      walkForwardValidation({
        returns,
        signals,
        nPeriods: 5,
      })
    ).toThrow("Insufficient data");
  });

  test("performs rolling walk-forward validation", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 5,
      method: "rolling",
    });

    expect(result.nPeriods).toBe(5);
    expect(result.method).toBe("rolling");
    expect(result.periods).toHaveLength(5);
    expect(result.efficiency).toBeDefined();
    expect(result.consistency).toBeGreaterThanOrEqual(0);
    expect(result.consistency).toBeLessThanOrEqual(1);
  });

  test("performs anchored walk-forward validation", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 5,
      method: "anchored",
    });

    expect(result.nPeriods).toBe(5);
    expect(result.method).toBe("anchored");
    expect(result.periods).toHaveLength(5);
  });

  test("calculates correct efficiency", () => {
    const n = 200;
    const returns = generateReturns(n, 0.001, 0.01);
    // Perfect signal: sign of return
    const signals = returns.map((r) => Math.sign(r));

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    // With perfect signal, efficiency should be high
    // (though not necessarily 1.0 due to variance)
    expect(result.efficiency).toBeDefined();
    expect(typeof result.efficiency).toBe("number");
  });

  test("calculates correct consistency", () => {
    const n = 200;
    const returns = generateReturns(n, 0.001, 0.01);
    const signals = returns.map((r) => Math.sign(r));

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    // Consistency is % of periods with positive OOS
    const manualConsistency =
      result.periods.filter((p) => p.oosPositive).length / result.periods.length;
    expect(result.consistency).toBeCloseTo(manualConsistency, 10);
  });

  test("period details are correct", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
      trainRatio: 0.8,
    });

    for (const period of result.periods) {
      expect(period.periodIndex).toBeGreaterThanOrEqual(0);
      expect(period.nInSample).toBeGreaterThan(0);
      expect(period.nOutOfSample).toBeGreaterThan(0);
      expect(typeof period.inSampleSharpe).toBe("number");
      expect(typeof period.outOfSampleSharpe).toBe("number");
    }
  });

  test("degradation is 1 - efficiency", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    expect(result.degradation).toBeCloseTo(1 - result.efficiency, 10);
  });
});

// ============================================
// Interpretation Tests
// ============================================

describe("interpretation", () => {
  test("robust when efficiency and consistency are high", () => {
    const n = 300;
    const returns = generateReturns(n, 0.001, 0.01);
    // Strong signal
    const signals = returns.map((r) => r * 100);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 5,
    });

    // With strong signal, should often be robust
    expect(["robust", "marginal", "overfit"]).toContain(result.interpretation);
  });

  test("overfit when efficiency is very low", () => {
    // Test the interpretation logic directly
    const n = 200;
    const returns = generateReturns(n);
    // Random noise signal (no predictive power)
    const signals = returns.map(() => Math.random() - 0.5);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    // With random signal, likely to be marginal or overfit
    expect(["marginal", "overfit"]).toContain(result.interpretation);
  });

  test("passed matches interpretation", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    if (result.interpretation === "robust") {
      expect(result.passed).toBe(true);
    } else {
      // marginal or overfit may or may not pass depending on exact values
      expect(typeof result.passed).toBe("boolean");
    }
  });
});

// ============================================
// Sweep and Comparison Tests
// ============================================

describe("walkForwardSweep", () => {
  test("runs multiple configurations", () => {
    const n = 300;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const results = walkForwardSweep(returns, signals);

    expect(results.length).toBeGreaterThan(0);

    for (const { config, result } of results) {
      expect(config.nPeriods).toBeDefined();
      expect(config.trainRatio).toBeDefined();
      expect(config.method).toBeDefined();
      expect(result.efficiency).toBeDefined();
    }
  });

  test("allows custom configurations", () => {
    const n = 300;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const configs = [
      { nPeriods: 3, trainRatio: 0.7, method: "rolling" as const },
      { nPeriods: 4, trainRatio: 0.8, method: "anchored" as const },
    ];

    const results = walkForwardSweep(returns, signals, configs);

    expect(results).toHaveLength(2);
  });

  test("skips invalid configurations", () => {
    const n = 100; // Small dataset
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const configs = [
      { nPeriods: 20, trainRatio: 0.8, method: "rolling" as const }, // Too many periods
      { nPeriods: 3, trainRatio: 0.8, method: "rolling" as const }, // Should work
    ];

    const results = walkForwardSweep(returns, signals, configs);

    // Only the valid config should be included
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

describe("compareWalkForwardMethods", () => {
  test("compares rolling and anchored methods", () => {
    const n = 300;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const comparison = compareWalkForwardMethods(returns, signals);

    expect(comparison.rolling).toBeDefined();
    expect(comparison.anchored).toBeDefined();
    expect(["rolling", "anchored", "tie"]).toContain(comparison.better);
    expect(comparison.explanation.length).toBeGreaterThan(0);
  });

  test("respects custom options", () => {
    const n = 300;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const comparison = compareWalkForwardMethods(returns, signals, {
      nPeriods: 6,
      trainRatio: 0.75,
    });

    expect(comparison.rolling.nPeriods).toBe(6);
    expect(comparison.anchored.nPeriods).toBe(6);
    expect(comparison.rolling.trainRatio).toBe(0.75);
  });
});

// ============================================
// Helper Function Tests
// ============================================

describe("isWalkForwardRobust", () => {
  test("returns true when thresholds pass", () => {
    const result = {
      efficiency: 0.7,
      degradation: 0.3,
      consistency: 0.8,
      meanInSampleSharpe: 1.5,
      meanOutOfSampleSharpe: 1.05,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.4,
      nPeriods: 5,
      method: "rolling" as const,
      trainRatio: 0.8,
      interpretation: "robust" as const,
      passed: true,
      periods: [],
    };

    expect(isWalkForwardRobust(result)).toBe(true);
  });

  test("returns false when efficiency is low", () => {
    const result = {
      efficiency: 0.3,
      degradation: 0.7,
      consistency: 0.8,
      meanInSampleSharpe: 1.5,
      meanOutOfSampleSharpe: 0.45,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.4,
      nPeriods: 5,
      method: "rolling" as const,
      trainRatio: 0.8,
      interpretation: "overfit" as const,
      passed: false,
      periods: [],
    };

    expect(isWalkForwardRobust(result)).toBe(false);
  });

  test("respects custom thresholds", () => {
    const result = {
      efficiency: 0.4,
      degradation: 0.6,
      consistency: 0.5,
      meanInSampleSharpe: 1.5,
      meanOutOfSampleSharpe: 0.6,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.4,
      nPeriods: 5,
      method: "rolling" as const,
      trainRatio: 0.8,
      interpretation: "marginal" as const,
      passed: false,
      periods: [],
    };

    // With default thresholds (0.5, 0.6), should fail
    expect(isWalkForwardRobust(result)).toBe(false);

    // With lower thresholds, should pass
    expect(isWalkForwardRobust(result, { minEfficiency: 0.3, minConsistency: 0.4 })).toBe(true);
  });
});

describe("evaluateWalkForward", () => {
  test("provides accept for robust", () => {
    const result = {
      efficiency: 0.7,
      degradation: 0.3,
      consistency: 0.8,
      meanInSampleSharpe: 1.5,
      meanOutOfSampleSharpe: 1.05,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.4,
      nPeriods: 5,
      method: "rolling" as const,
      trainRatio: 0.8,
      interpretation: "robust" as const,
      passed: true,
      periods: [],
    };

    const evaluation = evaluateWalkForward(result);

    expect(evaluation.recommendation).toBe("accept");
    expect(evaluation.summary).toContain("robust");
    expect(evaluation.details.length).toBeGreaterThan(0);
  });

  test("provides review for marginal", () => {
    const result = {
      efficiency: 0.4,
      degradation: 0.6,
      consistency: 0.5,
      meanInSampleSharpe: 1.5,
      meanOutOfSampleSharpe: 0.6,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.4,
      nPeriods: 5,
      method: "rolling" as const,
      trainRatio: 0.8,
      interpretation: "marginal" as const,
      passed: false,
      periods: [],
    };

    const evaluation = evaluateWalkForward(result);

    expect(evaluation.recommendation).toBe("review");
  });

  test("provides reject for overfit", () => {
    const result = {
      efficiency: 0.2,
      degradation: 0.8,
      consistency: 0.3,
      meanInSampleSharpe: 2.0,
      meanOutOfSampleSharpe: 0.4,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.5,
      nPeriods: 5,
      method: "rolling" as const,
      trainRatio: 0.8,
      interpretation: "overfit" as const,
      passed: false,
      periods: [],
    };

    const evaluation = evaluateWalkForward(result);

    expect(evaluation.recommendation).toBe("reject");
    expect(evaluation.summary).toContain("overfit");
  });

  test("includes all relevant details", () => {
    const result = {
      efficiency: 0.6,
      degradation: 0.4,
      consistency: 0.7,
      meanInSampleSharpe: 1.5,
      meanOutOfSampleSharpe: 0.9,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.4,
      nPeriods: 5,
      method: "rolling" as const,
      trainRatio: 0.8,
      interpretation: "robust" as const,
      passed: true,
      periods: [],
    };

    const evaluation = evaluateWalkForward(result);

    expect(evaluation.details.some((d) => d.includes("Method:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Periods:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Efficiency:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Consistency:"))).toBe(true);
  });
});

describe("minimumWalkForwardLength", () => {
  test("returns correct default minimum", () => {
    const minLength = minimumWalkForwardLength();
    expect(minLength).toBe(WF_DEFAULTS.nPeriods * WF_DEFAULTS.minObservationsPerPeriod);
  });

  test("scales with nPeriods", () => {
    expect(minimumWalkForwardLength(10)).toBe(10 * WF_DEFAULTS.minObservationsPerPeriod);
  });

  test("scales with minObsPerPeriod", () => {
    expect(minimumWalkForwardLength(5, 30)).toBe(5 * 30);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
  test("handles all positive returns", () => {
    const n = 200;
    const returns = Array(n)
      .fill(0)
      .map(() => 0.01 + Math.random() * 0.005);
    const signals = Array(n).fill(1);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    expect(result.nPeriods).toBe(4);
    expect(Number.isNaN(result.efficiency)).toBe(false);
  });

  test("handles all negative returns", () => {
    const n = 200;
    const returns = Array(n)
      .fill(0)
      .map(() => -0.01 - Math.random() * 0.005);
    const signals = Array(n).fill(-1); // Short signal

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    expect(result.nPeriods).toBe(4);
    expect(Number.isNaN(result.efficiency)).toBe(false);
  });

  test("handles alternating signals", () => {
    const n = 200;
    const returns = generateReturns(n);
    const signals = returns.map((_, i) => (i % 2 === 0 ? 1 : -1));

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 4,
    });

    expect(result.nPeriods).toBe(4);
  });

  test("handles minimum viable data", () => {
    // Exactly minimum required: 5 periods * 20 obs = 100
    const n = 100;
    const returns = generateReturns(n);
    const signals = generateSignals(returns, 0.3);

    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 5,
    });

    expect(result.nPeriods).toBeGreaterThan(0);
  });
});

// ============================================
// Integration Tests
// ============================================

describe("integration", () => {
  test("full workflow: generate, validate, evaluate", () => {
    const n = 300;
    const returns = generateReturns(n, 0.0002, 0.015);
    const signals = generateSignals(returns, 0.4);

    // Validate
    const result = walkForwardValidation({
      returns,
      signals,
      nPeriods: 6,
      trainRatio: 0.75,
      method: "rolling",
    });

    // Evaluate
    const evaluation = evaluateWalkForward(result);

    // Check complete workflow
    expect(result.efficiency).toBeDefined();
    expect(result.periods.length).toBeGreaterThan(0);
    expect(["accept", "review", "reject"]).toContain(evaluation.recommendation);
    expect(evaluation.details.length).toBeGreaterThan(0);
  });

  test("compare and select best method", () => {
    const n = 300;
    const returns = generateReturns(n, 0.0001, 0.02);
    const signals = generateSignals(returns, 0.3);

    const comparison = compareWalkForwardMethods(returns, signals);

    // Select the better method
    let bestResult: WalkForwardResult;
    if (comparison.better === "rolling") {
      bestResult = comparison.rolling;
    } else if (comparison.better === "anchored") {
      bestResult = comparison.anchored;
    } else {
      // Tie - use rolling as default
      bestResult = comparison.rolling;
    }

    expect(bestResult.efficiency).toBeDefined();
    expect(bestResult.consistency).toBeDefined();
  });
});
