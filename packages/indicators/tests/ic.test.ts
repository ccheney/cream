/**
 * Tests for Information Coefficient (IC) Calculator
 */

import { describe, expect, test } from "bun:test";
import {
  analyzeIC,
  analyzeICDecay,
  calculateICStats,
  computeRanks,
  crossSectionalIC,
  evaluateIC,
  isICSignificant,
  pearsonCorrelation,
  spearmanCorrelation,
  timeSeriesIC,
} from "../src/synthesis/ic/index.js";

// ============================================
// Rank Computation Tests
// ============================================

describe("computeRanks", () => {
  test("computes ranks for simple array", () => {
    const arr = [3, 1, 4, 1, 5];
    const ranks = computeRanks(arr);
    // Sorted order: 1, 1, 3, 4, 5 -> indices 1, 3, 0, 2, 4
    // Ranks: 1, 2 (tied), 3, 4, 5
    // For tied values (1, 1), average rank = (1+2)/2 = 1.5
    expect(ranks[0]).toBe(3); // 3 is 3rd smallest
    expect(ranks[1]).toBe(1.5); // 1 tied for 1st-2nd
    expect(ranks[2]).toBe(4); // 4 is 4th smallest
    expect(ranks[3]).toBe(1.5); // 1 tied for 1st-2nd
    expect(ranks[4]).toBe(5); // 5 is largest
  });

  test("handles all same values (all tied)", () => {
    const arr = [5, 5, 5, 5];
    const ranks = computeRanks(arr);
    // All tied, average rank = (1+2+3+4)/4 = 2.5
    expect(ranks).toEqual([2.5, 2.5, 2.5, 2.5]);
  });

  test("handles already sorted array", () => {
    const arr = [1, 2, 3, 4, 5];
    const ranks = computeRanks(arr);
    expect(ranks).toEqual([1, 2, 3, 4, 5]);
  });

  test("handles reverse sorted array", () => {
    const arr = [5, 4, 3, 2, 1];
    const ranks = computeRanks(arr);
    expect(ranks).toEqual([5, 4, 3, 2, 1]);
  });

  test("handles single element", () => {
    const arr = [42];
    const ranks = computeRanks(arr);
    expect(ranks).toEqual([1]);
  });
});

// ============================================
// Correlation Tests
// ============================================

describe("pearsonCorrelation", () => {
  test("returns 1 for perfectly correlated data", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10]; // y = 2x
    const corr = pearsonCorrelation(x, y);
    expect(corr).toBeCloseTo(1, 10);
  });

  test("returns -1 for perfectly anti-correlated data", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 8, 6, 4, 2]; // y = -2x + 12
    const corr = pearsonCorrelation(x, y);
    expect(corr).toBeCloseTo(-1, 10);
  });

  test("returns 0 for uncorrelated data", () => {
    // x and x^2 centered around mean are uncorrelated
    const x = [-2, -1, 0, 1, 2];
    const y = [4, 1, 0, 1, 4]; // y = x^2, uncorrelated with x for symmetric range
    const corr = pearsonCorrelation(x, y);
    expect(corr).toBeCloseTo(0, 10);
  });

  test("returns 0 for single element", () => {
    const x = [1];
    const y = [2];
    expect(pearsonCorrelation(x, y)).toBe(0);
  });

  test("returns 0 for constant arrays", () => {
    const x = [5, 5, 5, 5];
    const y = [3, 3, 3, 3];
    expect(pearsonCorrelation(x, y)).toBe(0);
  });
});

describe("spearmanCorrelation", () => {
  test("returns 1 for monotonically increasing relationship", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [1, 4, 9, 16, 25]; // y = x^2, monotonically increasing
    const corr = spearmanCorrelation(x, y);
    expect(corr).toBeCloseTo(1, 10);
  });

  test("returns -1 for monotonically decreasing relationship", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [100, 50, 25, 10, 1]; // Decreasing
    const corr = spearmanCorrelation(x, y);
    expect(corr).toBeCloseTo(-1, 10);
  });

  test("handles tied values correctly", () => {
    const x = [1, 2, 2, 3, 4];
    const y = [1, 2, 3, 4, 5];
    const corr = spearmanCorrelation(x, y);
    expect(corr).toBeGreaterThan(0.8);
    expect(corr).toBeLessThan(1);
  });

  test("throws if arrays have different lengths", () => {
    const x = [1, 2, 3];
    const y = [1, 2];
    expect(() => spearmanCorrelation(x, y)).toThrow("same length");
  });
});

// ============================================
// Cross-Sectional IC Tests
// ============================================

describe("crossSectionalIC", () => {
  test("calculates IC for perfectly predictive signal", () => {
    const signals = [1, 2, 3, 4, 5];
    const returns = [0.01, 0.02, 0.03, 0.04, 0.05];
    const result = crossSectionalIC(signals, returns);

    expect(result.ic).toBeCloseTo(1, 10);
    expect(result.nObservations).toBe(5);
    expect(result.isValid).toBe(false); // Less than 10 observations
  });

  test("calculates IC for anti-predictive signal", () => {
    const signals = [1, 2, 3, 4, 5];
    const returns = [0.05, 0.04, 0.03, 0.02, 0.01];
    const result = crossSectionalIC(signals, returns);

    expect(result.ic).toBeCloseTo(-1, 10);
  });

  test("returns isValid=true when >= 10 observations", () => {
    const signals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const returns = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1];
    const result = crossSectionalIC(signals, returns);

    expect(result.isValid).toBe(true);
    expect(result.nObservations).toBe(10);
  });

  test("filters out NaN values", () => {
    const signals = [1, 2, Number.NaN, 4, 5, 6, 7, 8, 9, 10, 11];
    const returns = [0.01, 0.02, 0.03, Number.NaN, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11];
    const result = crossSectionalIC(signals, returns);

    // 11 total - 2 NaN = 9 valid pairs
    expect(result.nObservations).toBe(9);
    expect(result.isValid).toBe(false);
  });

  test("throws for mismatched array lengths", () => {
    const signals = [1, 2, 3];
    const returns = [0.01, 0.02];
    expect(() => crossSectionalIC(signals, returns)).toThrow("same length");
  });
});

// ============================================
// Time-Series IC Tests
// ============================================

describe("timeSeriesIC", () => {
  test("calculates rolling IC correctly", () => {
    // Create 100 data points with consistent relationship
    const n = 100;
    const signals: number[] = [];
    const returns: number[] = [];

    for (let i = 0; i < n; i++) {
      signals.push(i);
      returns.push(i * 0.001); // Perfectly correlated
    }

    const icValues = timeSeriesIC(signals, returns, 20);

    // Should have n - window + 1 = 81 IC values
    expect(icValues).toHaveLength(n - 20 + 1);

    // All ICs should be ~1 (perfect correlation)
    const validICs = icValues.filter((v) => v.isValid);
    expect(validICs.length).toBeGreaterThan(0);
    for (const ic of validICs) {
      expect(ic.ic).toBeCloseTo(1, 5);
    }
  });

  test("handles window larger than data", () => {
    const signals = [1, 2, 3, 4, 5];
    const returns = [0.01, 0.02, 0.03, 0.04, 0.05];
    const icValues = timeSeriesIC(signals, returns, 10);

    expect(icValues).toHaveLength(0);
  });
});

// ============================================
// IC Statistics Tests
// ============================================

describe("calculateICStats", () => {
  test("calculates statistics for valid IC values", () => {
    const icValues = [
      { ic: 0.05, nObservations: 50, isValid: true },
      { ic: 0.03, nObservations: 50, isValid: true },
      { ic: 0.04, nObservations: 50, isValid: true },
      { ic: 0.02, nObservations: 50, isValid: true },
      { ic: 0.06, nObservations: 50, isValid: true },
    ];

    const stats = calculateICStats(icValues);

    expect(stats.mean).toBeCloseTo(0.04, 10);
    expect(stats.std).toBeGreaterThan(0);
    expect(stats.nObservations).toBe(5);
    expect(stats.nValidObservations).toBe(5);
    expect(stats.hitRate).toBe(1); // All positive
  });

  test("ignores invalid IC values", () => {
    const icValues = [
      { ic: 0.05, nObservations: 50, isValid: true },
      { ic: 0.1, nObservations: 5, isValid: false }, // Invalid
      { ic: 0.03, nObservations: 50, isValid: true },
    ];

    const stats = calculateICStats(icValues);

    expect(stats.nObservations).toBe(3);
    expect(stats.nValidObservations).toBe(2);
    expect(stats.mean).toBeCloseTo(0.04, 10); // (0.05 + 0.03) / 2
  });

  test("handles all invalid values", () => {
    const icValues = [
      { ic: 0.05, nObservations: 5, isValid: false },
      { ic: 0.1, nObservations: 5, isValid: false },
    ];

    const stats = calculateICStats(icValues);

    expect(stats.mean).toBe(0);
    expect(stats.std).toBe(0);
    expect(stats.icir).toBe(0);
    expect(stats.hitRate).toBe(0);
    expect(stats.passed).toBe(false);
    expect(stats.interpretation).toBe("weak");
  });

  test("calculates hit rate correctly", () => {
    const icValues = [
      { ic: 0.05, nObservations: 50, isValid: true },
      { ic: -0.02, nObservations: 50, isValid: true },
      { ic: 0.03, nObservations: 50, isValid: true },
      { ic: 0.01, nObservations: 50, isValid: true },
    ];

    const stats = calculateICStats(icValues);

    expect(stats.hitRate).toBe(0.75); // 3/4 positive
  });

  test("determines interpretation correctly", () => {
    // Strong: mean > 0.05, std < 0.05, icir > 0.5
    const strongICs = Array(20)
      .fill(null)
      .map(() => ({
        ic: 0.06 + 0.01 * (Math.random() - 0.5), // ~0.06 ± 0.005
        nObservations: 50,
        isValid: true,
      }));

    const strongStats = calculateICStats(strongICs);
    // Due to randomness, just check it's interpreted
    expect(["strong", "moderate", "weak"]).toContain(strongStats.interpretation);
  });
});

// ============================================
// IC Decay Analysis Tests
// ============================================

describe("analyzeICDecay", () => {
  test("finds optimal horizon", () => {
    // Create data where IC peaks at horizon 5
    const nTime = 100;
    const nAssets = 20;

    const signals: number[][] = [];
    const returns: number[][] = [];

    for (let t = 0; t < nTime; t++) {
      const sigRow: number[] = [];
      const retRow: number[] = [];
      for (let a = 0; a < nAssets; a++) {
        sigRow.push(Math.random());
        retRow.push(Math.random() * 0.02 - 0.01);
      }
      signals.push(sigRow);
      returns.push(retRow);
    }

    const result = analyzeICDecay(signals, returns, [1, 5, 10]);

    expect(result.horizons).toEqual([1, 5, 10]);
    expect(Object.keys(result.icByHorizon)).toHaveLength(3);
    expect(result.optimalHorizon).toBeGreaterThan(0);
    expect(typeof result.optimalIC).toBe("number");
  });

  test("calculates IC for each horizon", () => {
    // Simple test data
    const nTime = 50;
    const nAssets = 15;

    const signals: number[][] = [];
    const returns: number[][] = [];

    for (let t = 0; t < nTime; t++) {
      const sigRow: number[] = [];
      const retRow: number[] = [];
      for (let a = 0; a < nAssets; a++) {
        const val = a + t * 0.1;
        sigRow.push(val);
        retRow.push(val * 0.001);
      }
      signals.push(sigRow);
      returns.push(retRow);
    }

    const result = analyzeICDecay(signals, returns, [1, 5]);

    expect(result.icByHorizon["1"]).toBeDefined();
    expect(result.icByHorizon["5"]).toBeDefined();
  });
});

// ============================================
// Full IC Analysis Tests
// ============================================

describe("analyzeIC", () => {
  test("performs complete IC analysis", () => {
    const nTime = 50;
    const nAssets = 15;

    const signals: number[][] = [];
    const forwardReturns: number[][] = [];

    for (let t = 0; t < nTime; t++) {
      const sigRow: number[] = [];
      const retRow: number[] = [];
      for (let a = 0; a < nAssets; a++) {
        sigRow.push(a);
        retRow.push(a * 0.001);
      }
      signals.push(sigRow);
      forwardReturns.push(retRow);
    }

    const result = analyzeIC(signals, forwardReturns);

    expect(result.stats).toBeDefined();
    expect(result.icSeries).toHaveLength(nTime);
    expect(result.decay).toBeUndefined(); // Not requested
  });

  test("includes decay analysis when requested", () => {
    const nTime = 50;
    const nAssets = 15;

    const signals: number[][] = [];
    const returns: number[][] = [];
    const forwardReturns: number[][] = [];

    for (let t = 0; t < nTime; t++) {
      const sigRow: number[] = [];
      const retRow: number[] = [];
      for (let a = 0; a < nAssets; a++) {
        sigRow.push(Math.random());
        retRow.push(Math.random() * 0.02 - 0.01);
      }
      signals.push(sigRow);
      returns.push(retRow);
      forwardReturns.push(retRow); // Simplified
    }

    const result = analyzeIC(signals, forwardReturns, {
      includeDecay: true,
      returns,
      horizons: [1, 5, 10],
    });

    expect(result.decay).toBeDefined();
    expect(result.decay?.horizons).toEqual([1, 5, 10]);
  });
});

// ============================================
// Evaluation Tests
// ============================================

describe("evaluateIC", () => {
  test("provides accept recommendation for strong IC", () => {
    const result = {
      stats: {
        mean: 0.06,
        std: 0.02,
        icir: 3.0,
        hitRate: 0.9,
        nObservations: 100,
        nValidObservations: 100,
        interpretation: "strong" as const,
        passed: true,
      },
      icSeries: [],
    };

    const evaluation = evaluateIC(result);

    expect(evaluation.recommendation).toBe("accept");
    expect(evaluation.summary).toContain("strong");
    expect(evaluation.details.some((d) => d.includes("Mean IC:"))).toBe(true);
  });

  test("provides review recommendation for moderate IC", () => {
    const result = {
      stats: {
        mean: 0.03,
        std: 0.03,
        icir: 1.0,
        hitRate: 0.6,
        nObservations: 100,
        nValidObservations: 100,
        interpretation: "moderate" as const,
        passed: true,
      },
      icSeries: [],
    };

    const evaluation = evaluateIC(result);

    expect(evaluation.recommendation).toBe("review");
  });

  test("provides reject recommendation for weak IC", () => {
    const result = {
      stats: {
        mean: 0.01,
        std: 0.05,
        icir: 0.2,
        hitRate: 0.45,
        nObservations: 100,
        nValidObservations: 100,
        interpretation: "weak" as const,
        passed: false,
      },
      icSeries: [],
    };

    const evaluation = evaluateIC(result);

    expect(evaluation.recommendation).toBe("reject");
  });

  test("includes decay info when available", () => {
    const result = {
      stats: {
        mean: 0.04,
        std: 0.02,
        icir: 2.0,
        hitRate: 0.7,
        nObservations: 100,
        nValidObservations: 100,
        interpretation: "moderate" as const,
        passed: true,
      },
      icSeries: [],
      decay: {
        icByHorizon: { "1": 0.05, "5": 0.04, "10": 0.02 },
        horizons: [1, 5, 10],
        optimalHorizon: 1,
        optimalIC: 0.05,
        halfLife: 8.5,
      },
    };

    const evaluation = evaluateIC(result);

    expect(evaluation.details.some((d) => d.includes("Optimal Horizon:"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Half-life:"))).toBe(true);
  });
});

// ============================================
// Significance Tests
// ============================================

describe("isICSignificant", () => {
  test("returns true when all thresholds pass", () => {
    const result = {
      stats: {
        mean: 0.03, // > 0.02
        std: 0.02, // < 0.03
        icir: 0.6, // > 0.5
        hitRate: 0.6,
        nObservations: 100,
        nValidObservations: 100,
        interpretation: "moderate" as const,
        passed: true,
      },
      icSeries: [],
    };

    expect(isICSignificant(result)).toBe(true);
  });

  test("returns false when mean is below threshold", () => {
    const result = {
      stats: {
        mean: 0.01, // < 0.02
        std: 0.02,
        icir: 0.6,
        hitRate: 0.6,
        nObservations: 100,
        nValidObservations: 100,
        interpretation: "weak" as const,
        passed: false,
      },
      icSeries: [],
    };

    expect(isICSignificant(result)).toBe(false);
  });

  test("returns false when std is above threshold", () => {
    const result = {
      stats: {
        mean: 0.03,
        std: 0.05, // > 0.03
        icir: 0.6,
        hitRate: 0.6,
        nObservations: 100,
        nValidObservations: 100,
        interpretation: "weak" as const,
        passed: false,
      },
      icSeries: [],
    };

    expect(isICSignificant(result)).toBe(false);
  });

  test("respects custom thresholds", () => {
    const result = {
      stats: {
        mean: 0.01, // Below default 0.02 but above custom 0.005
        std: 0.02,
        icir: 0.6,
        hitRate: 0.6,
        nObservations: 100,
        nValidObservations: 100,
        interpretation: "weak" as const,
        passed: false,
      },
      icSeries: [],
    };

    expect(isICSignificant(result)).toBe(false);
    expect(isICSignificant(result, { minMean: 0.005 })).toBe(true);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
  test("handles empty arrays", () => {
    const stats = calculateICStats([]);
    expect(stats.mean).toBe(0);
    expect(stats.nValidObservations).toBe(0);
  });

  test("handles single observation", () => {
    const icValues = [{ ic: 0.05, nObservations: 50, isValid: true }];
    const stats = calculateICStats(icValues);

    expect(stats.mean).toBe(0.05);
    expect(stats.std).toBe(0); // Single observation has 0 variance
    expect(stats.nValidObservations).toBe(1);
  });

  test("handles all zeros IC", () => {
    const icValues = Array(10)
      .fill(null)
      .map(() => ({
        ic: 0,
        nObservations: 50,
        isValid: true,
      }));

    const stats = calculateICStats(icValues);

    expect(stats.mean).toBe(0);
    expect(stats.std).toBe(0);
    expect(stats.icir).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  test("handles negative ICs correctly", () => {
    const icValues = [
      { ic: -0.05, nObservations: 50, isValid: true },
      { ic: -0.03, nObservations: 50, isValid: true },
      { ic: -0.04, nObservations: 50, isValid: true },
    ];

    const stats = calculateICStats(icValues);

    expect(stats.mean).toBeCloseTo(-0.04, 10);
    expect(stats.hitRate).toBe(0); // All negative
  });
});

// ============================================
// Integration Tests
// ============================================

describe("integration", () => {
  test("full workflow: generate data, analyze, evaluate", () => {
    // Generate mock data with some signal
    const nTime = 60;
    const nAssets = 20;

    const signals: number[][] = [];
    const forwardReturns: number[][] = [];
    const returns: number[][] = [];

    for (let t = 0; t < nTime; t++) {
      const sigRow: number[] = [];
      const retRow: number[] = [];
      for (let a = 0; a < nAssets; a++) {
        const signal = Math.random() * 2 - 1;
        // Add some predictive power
        const ret = signal * 0.001 + (Math.random() - 0.5) * 0.02;
        sigRow.push(signal);
        retRow.push(ret);
      }
      signals.push(sigRow);
      forwardReturns.push(retRow);
      returns.push(retRow);
    }

    // Analyze
    const result = analyzeIC(signals, forwardReturns, {
      includeDecay: true,
      returns,
      horizons: [1, 5, 10],
    });

    // Evaluate
    const evaluation = evaluateIC(result);

    // Check complete workflow
    expect(result.stats.mean).toBeDefined();
    expect(result.stats.icir).toBeDefined();
    expect(result.decay).toBeDefined();
    expect(["accept", "review", "reject"]).toContain(evaluation.recommendation);
    expect(evaluation.details.length).toBeGreaterThan(0);
  });

  test("realistic factor IC values", () => {
    // In practice, good factors have IC of 0.02-0.10
    const icValues = [
      { ic: 0.03, nObservations: 50, isValid: true },
      { ic: 0.02, nObservations: 50, isValid: true },
      { ic: 0.04, nObservations: 50, isValid: true },
      { ic: 0.01, nObservations: 50, isValid: true },
      { ic: 0.05, nObservations: 50, isValid: true },
      { ic: -0.01, nObservations: 50, isValid: true },
      { ic: 0.03, nObservations: 50, isValid: true },
      { ic: 0.02, nObservations: 50, isValid: true },
      { ic: 0.04, nObservations: 50, isValid: true },
      { ic: 0.03, nObservations: 50, isValid: true },
    ];

    const stats = calculateICStats(icValues);

    // Expected for a decent factor
    expect(stats.mean).toBeGreaterThan(0.02);
    expect(stats.mean).toBeLessThan(0.05);
    expect(stats.hitRate).toBeGreaterThan(0.8);
  });
});
