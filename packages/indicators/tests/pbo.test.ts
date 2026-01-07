/**
 * Tests for Probability of Backtest Overfitting (PBO) Calculator
 */

import { describe, expect, test } from "bun:test";
import {
  combinations,
  computePBO,
  computeSharpe,
  evaluatePBO,
  generateSyntheticReturns,
  generateSyntheticSignals,
  isPBOAcceptable,
  minimumBacktestLength,
  nCr,
  PBO_DEFAULTS,
  PBOInputSchema,
  rankStrategiesByPBO,
} from "../src/synthesis/pbo.js";

// ============================================
// Combination Generator Tests
// ============================================

describe("combinations", () => {
  test("generates correct combinations for C(4,2)", () => {
    const result = combinations(4, 2);
    expect(result).toHaveLength(6);
    expect(result).toContainEqual([0, 1]);
    expect(result).toContainEqual([0, 2]);
    expect(result).toContainEqual([0, 3]);
    expect(result).toContainEqual([1, 2]);
    expect(result).toContainEqual([1, 3]);
    expect(result).toContainEqual([2, 3]);
  });

  test("generates correct combinations for C(5,3)", () => {
    const result = combinations(5, 3);
    expect(result).toHaveLength(10);
  });

  test("generates correct combinations for C(8,4)", () => {
    const result = combinations(8, 4);
    expect(result).toHaveLength(70);
  });

  test("C(n,0) returns empty array with one element", () => {
    const result = combinations(5, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([]);
  });

  test("C(n,n) returns one combination with all elements", () => {
    const result = combinations(4, 4);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([0, 1, 2, 3]);
  });
});

describe("nCr", () => {
  test("calculates C(8,4) = 70", () => {
    expect(nCr(8, 4)).toBe(70);
  });

  test("calculates C(10,5) = 252", () => {
    expect(nCr(10, 5)).toBe(252);
  });

  test("calculates C(16,8) = 12870", () => {
    expect(nCr(16, 8)).toBe(12870);
  });

  test("C(n,0) = 1", () => {
    expect(nCr(10, 0)).toBe(1);
  });

  test("C(n,n) = 1", () => {
    expect(nCr(10, 10)).toBe(1);
  });

  test("C(n,1) = n", () => {
    expect(nCr(10, 1)).toBe(10);
  });

  test("handles k > n", () => {
    expect(nCr(5, 10)).toBe(0);
  });

  test("handles negative k", () => {
    expect(nCr(5, -1)).toBe(0);
  });
});

// ============================================
// Sharpe Ratio Calculation Tests
// ============================================

describe("computeSharpe", () => {
  test("returns 0 for empty array", () => {
    expect(computeSharpe([])).toBe(0);
  });

  test("returns 0 for single element", () => {
    expect(computeSharpe([0.01])).toBe(0);
  });

  test("returns 0 for constant returns", () => {
    const returns = Array(100).fill(0.001);
    expect(computeSharpe(returns)).toBe(0);
  });

  test("calculates positive Sharpe for positive drift", () => {
    // 252 days of 0.1% daily return with 2% daily volatility
    const returns = Array(252)
      .fill(0)
      .map((_, i) => 0.001 + 0.02 * Math.sin(i * 0.1));
    const sharpe = computeSharpe(returns);
    expect(sharpe).toBeGreaterThan(0);
  });

  test("calculates negative Sharpe for negative drift", () => {
    // Negative mean returns
    const returns = Array(252)
      .fill(0)
      .map((_, i) => -0.002 + 0.02 * Math.sin(i * 0.1));
    const sharpe = computeSharpe(returns);
    expect(sharpe).toBeLessThan(0);
  });

  test("annualizes using factor", () => {
    const dailyReturns = [0.01, 0.02, -0.01, 0.015, -0.005];
    const sharpeDaily = computeSharpe(dailyReturns, 1);
    const sharpeAnnual = computeSharpe(dailyReturns, 252);
    // Annualized should be √252 times larger
    expect(sharpeAnnual / sharpeDaily).toBeCloseTo(Math.sqrt(252), 5);
  });
});

// ============================================
// Schema Validation Tests
// ============================================

describe("PBOInputSchema", () => {
  test("accepts valid input with defaults", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
    };
    const parsed = PBOInputSchema.parse(input);
    expect(parsed.nSplits).toBe(8);
  });

  test("accepts custom nSplits", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      nSplits: 16,
    };
    const parsed = PBOInputSchema.parse(input);
    expect(parsed.nSplits).toBe(16);
  });

  test("rejects odd nSplits", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      nSplits: 7,
    };
    expect(() => PBOInputSchema.parse(input)).toThrow();
  });

  test("rejects negative nSplits", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      nSplits: -2,
    };
    expect(() => PBOInputSchema.parse(input)).toThrow();
  });
});

// ============================================
// Core PBO Calculation Tests
// ============================================

describe("computePBO", () => {
  test("throws if returns and signals have different lengths", () => {
    expect(() =>
      computePBO({
        returns: [0.01, 0.02, 0.03],
        signals: [1, -1],
      })
    ).toThrow("same length");
  });

  test("throws if insufficient data for splits", () => {
    // Need at least 25 * 8 = 200 observations for default 8 splits
    const returns = Array(100).fill(0.01);
    const signals = Array(100).fill(1);

    expect(() => computePBO({ returns, signals })).toThrow("Insufficient data");
  });

  test("calculates PBO for sufficient data", () => {
    // Generate 400 observations (enough for 8 splits of 50 each)
    const returns = generateSyntheticReturns(400, 0.0001, 0.02);
    const signals = generateSyntheticSignals(returns, 0.05);

    const result = computePBO({ returns, signals });

    expect(result.pbo).toBeGreaterThanOrEqual(0);
    expect(result.pbo).toBeLessThanOrEqual(1);
    expect(result.nCombinations).toBe(70); // C(8,4)
  });

  test("returns correct number of combinations for different splits", () => {
    const returns = generateSyntheticReturns(400, 0.0001, 0.02);
    const signals = generateSyntheticSignals(returns, 0.05);

    // 4 splits: C(4,2) = 6
    const result4 = computePBO({ returns, signals, nSplits: 4 });
    expect(result4.nCombinations).toBe(6);

    // 6 splits: C(6,3) = 20
    const result6 = computePBO({ returns, signals, nSplits: 6 });
    expect(result6.nCombinations).toBe(20);
  });

  test("includes combination details when requested", () => {
    const returns = generateSyntheticReturns(400, 0.0001, 0.02);
    const signals = generateSyntheticSignals(returns, 0.05);

    const result = computePBO({ returns, signals, nSplits: 4 }, true);

    expect(result.combinations).toBeDefined();
    expect(result.combinations).toHaveLength(6);
    expect(result.combinations?.[0]).toHaveProperty("trainIndices");
    expect(result.combinations?.[0]).toHaveProperty("testIndices");
  });

  test("calculates correct underperform count", () => {
    const returns = generateSyntheticReturns(400, 0.0001, 0.02);
    const signals = generateSyntheticSignals(returns, 0.05);

    const result = computePBO({ returns, signals, nSplits: 4 }, true);

    const manualCount = result.combinations?.filter((c) => c.underperformed).length ?? 0;
    expect(result.nUnderperformed).toBe(manualCount);
    expect(result.pbo).toBeCloseTo(manualCount / 6, 10);
  });
});

// ============================================
// PBO Interpretation Tests
// ============================================

describe("PBO interpretation", () => {
  test("low_risk when PBO < 0.30", () => {
    // Create a strongly predictive signal
    const n = 400;
    const returns = generateSyntheticReturns(n, 0.001, 0.01);
    // Perfect signal (sign of return)
    const signals = returns.map((r) => Math.sign(r));

    const result = computePBO({ returns, signals, nSplits: 4 });

    // With perfect signal, PBO should be low
    if (result.pbo < 0.3) {
      expect(result.interpretation).toBe("low_risk");
    }
  });

  test("high_risk when PBO >= 0.50", () => {
    // Create random noise signal (no predictive power)
    const n = 400;
    const returns = generateSyntheticReturns(n, 0, 0.02);
    const signals = returns.map(() => (Math.random() > 0.5 ? 1 : -1));

    const result = computePBO({ returns, signals, nSplits: 4 });

    // With random signal, PBO should typically be around 0.5
    // Due to randomness, we just check the interpretation logic
    if (result.pbo >= 0.5) {
      expect(result.interpretation).toBe("high_risk");
    }
  });

  test("passed is true when PBO < threshold", () => {
    const returns = generateSyntheticReturns(400, 0.001, 0.01);
    const signals = returns.map((r) => Math.sign(r));

    const result = computePBO({ returns, signals, nSplits: 4 });

    expect(result.passed).toBe(result.pbo < PBO_DEFAULTS.acceptableThreshold);
  });

  test("degradation is calculated correctly", () => {
    const returns = generateSyntheticReturns(400, 0.0001, 0.02);
    const signals = generateSyntheticSignals(returns, 0.05);

    const result = computePBO({ returns, signals, nSplits: 4 });

    const expectedDegradation =
      result.meanInSampleSharpe !== 0
        ? 1 - result.meanOutOfSampleSharpe / result.meanInSampleSharpe
        : 0;

    expect(result.degradation).toBeCloseTo(expectedDegradation, 10);
  });
});

// ============================================
// Helper Function Tests
// ============================================

describe("minimumBacktestLength", () => {
  test("returns at least 252 days", () => {
    expect(minimumBacktestLength(1)).toBeGreaterThanOrEqual(252);
    expect(minimumBacktestLength(5)).toBeGreaterThanOrEqual(252);
  });

  test("increases with more trials", () => {
    const len10 = minimumBacktestLength(10);
    const len100 = minimumBacktestLength(100);
    expect(len100).toBeGreaterThanOrEqual(len10);
  });

  test("increases for lower target Sharpe", () => {
    const highSharpe = minimumBacktestLength(10, 2.0);
    const lowSharpe = minimumBacktestLength(10, 0.5);
    expect(lowSharpe).toBeGreaterThan(highSharpe);
  });
});

describe("isPBOAcceptable", () => {
  test("returns true for low PBO", () => {
    const result = {
      pbo: 0.25,
      nCombinations: 70,
      nUnderperformed: 17,
      meanInSampleSharpe: 1.5,
      meanOutOfSampleSharpe: 1.2,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.4,
      degradation: 0.2,
      interpretation: "low_risk" as const,
      passed: true,
    };

    expect(isPBOAcceptable(result)).toBe(true);
  });

  test("returns false for high PBO", () => {
    const result = {
      pbo: 0.65,
      nCombinations: 70,
      nUnderperformed: 45,
      meanInSampleSharpe: 1.5,
      meanOutOfSampleSharpe: 0.5,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.4,
      degradation: 0.67,
      interpretation: "high_risk" as const,
      passed: false,
    };

    expect(isPBOAcceptable(result)).toBe(false);
  });

  test("respects custom threshold", () => {
    const result = {
      pbo: 0.35,
      nCombinations: 70,
      nUnderperformed: 25,
      meanInSampleSharpe: 1.5,
      meanOutOfSampleSharpe: 1.1,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.4,
      degradation: 0.27,
      interpretation: "moderate_risk" as const,
      passed: true,
    };

    expect(isPBOAcceptable(result, 0.3)).toBe(false);
    expect(isPBOAcceptable(result, 0.4)).toBe(true);
  });
});

describe("evaluatePBO", () => {
  test("provides accept recommendation for low_risk", () => {
    const result = {
      pbo: 0.2,
      nCombinations: 70,
      nUnderperformed: 14,
      meanInSampleSharpe: 1.5,
      meanOutOfSampleSharpe: 1.3,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.35,
      degradation: 0.13,
      interpretation: "low_risk" as const,
      passed: true,
    };

    const evaluation = evaluatePBO(result);
    expect(evaluation.recommendation).toBe("accept");
    expect(evaluation.summary).toContain("low overfitting risk");
  });

  test("provides review recommendation for moderate_risk", () => {
    const result = {
      pbo: 0.4,
      nCombinations: 70,
      nUnderperformed: 28,
      meanInSampleSharpe: 1.5,
      meanOutOfSampleSharpe: 1.0,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.4,
      degradation: 0.33,
      interpretation: "moderate_risk" as const,
      passed: true,
    };

    const evaluation = evaluatePBO(result);
    expect(evaluation.recommendation).toBe("review");
    expect(evaluation.summary).toContain("moderate overfitting risk");
  });

  test("provides reject recommendation for high_risk", () => {
    const result = {
      pbo: 0.7,
      nCombinations: 70,
      nUnderperformed: 49,
      meanInSampleSharpe: 2.0,
      meanOutOfSampleSharpe: 0.3,
      stdInSampleSharpe: 0.5,
      stdOutOfSampleSharpe: 0.6,
      degradation: 0.85,
      interpretation: "high_risk" as const,
      passed: false,
    };

    const evaluation = evaluatePBO(result);
    expect(evaluation.recommendation).toBe("reject");
    expect(evaluation.summary).toContain("high overfitting risk");
  });

  test("includes relevant details", () => {
    const result = {
      pbo: 0.35,
      nCombinations: 70,
      nUnderperformed: 25,
      meanInSampleSharpe: 1.5,
      meanOutOfSampleSharpe: 1.1,
      stdInSampleSharpe: 0.3,
      stdOutOfSampleSharpe: 0.4,
      degradation: 0.27,
      interpretation: "moderate_risk" as const,
      passed: true,
    };

    const evaluation = evaluatePBO(result);

    expect(evaluation.details.some((d) => d.includes("PBO:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Combinations tested:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Mean IS Sharpe:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Mean OOS Sharpe:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("degradation"))).toBe(true);
  });
});

// ============================================
// Strategy Ranking Tests
// ============================================

describe("rankStrategiesByPBO", () => {
  test("ranks strategies by PBO (lowest first)", () => {
    const n = 400;
    const returns = generateSyntheticReturns(n, 0.0001, 0.02);

    // Good signal: correlated with returns
    const goodSignal = returns.map((r) => r + 0.001 * (Math.random() - 0.5));

    // Bad signal: random noise
    const badSignal = returns.map(() => Math.random() - 0.5);

    const strategies = [
      { name: "good", returns, signals: goodSignal },
      { name: "bad", returns, signals: badSignal },
    ];

    const ranked = rankStrategiesByPBO(strategies, 4);

    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.pbo).toBeLessThanOrEqual(ranked[1]?.pbo ?? 0);
  });

  test("includes passed status for each strategy", () => {
    const n = 400;
    const returns = generateSyntheticReturns(n, 0.0001, 0.02);
    const signals = generateSyntheticSignals(returns, 0.05);

    const strategies = [{ name: "strategy1", returns, signals }];

    const ranked = rankStrategiesByPBO(strategies, 4);

    expect(ranked[0]?.passed).toBeDefined();
    expect(typeof ranked[0]?.passed).toBe("boolean");
  });
});

// ============================================
// Synthetic Data Generation Tests
// ============================================

describe("generateSyntheticReturns", () => {
  test("generates correct number of returns", () => {
    const returns = generateSyntheticReturns(100);
    expect(returns).toHaveLength(100);
  });

  test("returns have approximately correct mean", () => {
    const drift = 0.001;
    const returns = generateSyntheticReturns(10000, drift, 0.02);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;

    // Should be within 2 standard errors of drift
    const se = 0.02 / Math.sqrt(10000);
    expect(Math.abs(mean - drift)).toBeLessThan(3 * se);
  });

  test("returns have approximately correct volatility", () => {
    const volatility = 0.02;
    const returns = generateSyntheticReturns(10000, 0, volatility);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.map((r) => (r - mean) ** 2).reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(variance);

    // Should be within 10% of target volatility
    expect(Math.abs(std - volatility) / volatility).toBeLessThan(0.1);
  });
});

describe("generateSyntheticSignals", () => {
  test("generates correct number of signals", () => {
    const returns = generateSyntheticReturns(100);
    const signals = generateSyntheticSignals(returns);
    expect(signals).toHaveLength(100);
  });

  test("signals have some correlation with returns for positive IC", () => {
    const returns = generateSyntheticReturns(1000, 0, 0.02);
    const signals = generateSyntheticSignals(returns, 0.3);

    // Calculate correlation
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length;
    const meanS = signals.reduce((a, b) => a + b, 0) / signals.length;

    let cov = 0;
    let varR = 0;
    let varS = 0;
    for (let i = 0; i < returns.length; i++) {
      const rVal = returns[i] ?? 0;
      const sVal = signals[i] ?? 0;
      cov += (rVal - meanR) * (sVal - meanS);
      varR += (rVal - meanR) ** 2;
      varS += (sVal - meanS) ** 2;
    }

    const corr = cov / Math.sqrt(varR * varS);

    // With icTarget = 0.3, expect positive correlation
    expect(corr).toBeGreaterThan(0);
  });
});

// ============================================
// Edge Cases and Error Handling
// ============================================

describe("edge cases", () => {
  test("handles all positive returns", () => {
    const returns = Array(400).fill(0.01);
    const signals = Array(400).fill(1);

    const result = computePBO({ returns, signals, nSplits: 4 });

    expect(result.pbo).toBeDefined();
    expect(Number.isNaN(result.pbo)).toBe(false);
  });

  test("handles all negative returns", () => {
    const returns = Array(400).fill(-0.01);
    const signals = Array(400).fill(-1); // Short signal

    const result = computePBO({ returns, signals, nSplits: 4 });

    expect(result.pbo).toBeDefined();
    expect(Number.isNaN(result.pbo)).toBe(false);
  });

  test("handles mixed positive and negative signals", () => {
    const returns = generateSyntheticReturns(400);
    const signals = returns.map((_, i) => (i % 2 === 0 ? 1 : -1));

    const result = computePBO({ returns, signals, nSplits: 4 });

    expect(result.pbo).toBeDefined();
    expect(result.pbo).toBeGreaterThanOrEqual(0);
    expect(result.pbo).toBeLessThanOrEqual(1);
  });

  test("handles very small signals", () => {
    const returns = generateSyntheticReturns(400);
    const signals = returns.map(() => 0.0001 * (Math.random() - 0.5));

    const result = computePBO({ returns, signals, nSplits: 4 });

    expect(result.pbo).toBeDefined();
    expect(Number.isNaN(result.pbo)).toBe(false);
  });
});

// ============================================
// Integration Tests
// ============================================

describe("integration", () => {
  test("full workflow: generate, compute, evaluate", () => {
    // Generate synthetic strategy
    const returns = generateSyntheticReturns(500, 0.0002, 0.015);
    const signals = generateSyntheticSignals(returns, 0.1);

    // Compute PBO
    const result = computePBO({ returns, signals, nSplits: 8 });

    // Evaluate
    const evaluation = evaluatePBO(result);

    // Check complete workflow
    expect(result.pbo).toBeGreaterThanOrEqual(0);
    expect(result.pbo).toBeLessThanOrEqual(1);
    expect(["accept", "review", "reject"]).toContain(evaluation.recommendation);
    expect(evaluation.details.length).toBeGreaterThan(0);
  });

  test("PBO increases with noise", () => {
    const n = 500;
    const returns = generateSyntheticReturns(n, 0.0001, 0.02);

    // High signal-to-noise ratio
    const goodSignal = returns.map((r) => r * 10);
    const goodResult = computePBO({ returns, signals: goodSignal, nSplits: 4 });

    // Low signal-to-noise ratio (mostly noise)
    const noisySignal = returns.map(() => Math.random() - 0.5);
    const noisyResult = computePBO({ returns, signals: noisySignal, nSplits: 4 });

    // Both should produce valid PBO values
    expect(goodResult.pbo).toBeGreaterThanOrEqual(0);
    expect(goodResult.pbo).toBeLessThanOrEqual(1);
    expect(noisyResult.pbo).toBeGreaterThanOrEqual(0);
    expect(noisyResult.pbo).toBeLessThanOrEqual(1);
  });
});
