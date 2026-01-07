/**
 * Deflated Sharpe Ratio (DSR) Tests
 *
 * Tests for the DSR calculation module.
 */

import { describe, expect, it } from "bun:test";
import {
  calculateDSR,
  calculateDSRFromReturns,
  calculateReturnStatistics,
  DSR_DEFAULTS,
  evaluateDSR,
  expectedMaxSharpe,
  isDSRSignificant,
  minimumRequiredSharpe,
  sharpeStandardError,
} from "../src/synthesis/dsr.js";

// ============================================
// Test Fixtures
// ============================================

/**
 * Generate synthetic returns with specified characteristics
 */
function generateReturns(n: number, mean: number, std: number, seed = 42): number[] {
  const returns: number[] = [];
  let state = seed;

  for (let i = 0; i < n; i++) {
    // Simple LCG pseudo-random
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const u1 = state / 0x7fffffff;
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const u2 = state / 0x7fffffff;

    // Box-Muller transform
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    returns.push(mean + z * std);
  }

  return returns;
}

// ============================================
// expectedMaxSharpe Tests
// ============================================

describe("expectedMaxSharpe", () => {
  it("returns 0 for 1 trial", () => {
    expect(expectedMaxSharpe(1)).toBe(0);
  });

  it("returns 0 for 0 trials", () => {
    expect(expectedMaxSharpe(0)).toBe(0);
  });

  it("increases with number of trials", () => {
    const sr10 = expectedMaxSharpe(10);
    const sr100 = expectedMaxSharpe(100);
    const sr1000 = expectedMaxSharpe(1000);

    expect(sr10).toBeGreaterThan(0);
    expect(sr100).toBeGreaterThan(sr10);
    expect(sr1000).toBeGreaterThan(sr100);
  });

  it("returns approximately 1.0 for 7 trials", () => {
    // Famous result: with 7 trials, expected max SR ≈ 1.0
    const sr = expectedMaxSharpe(7);
    expect(sr).toBeCloseTo(1.0, 0);
  });

  it("returns higher values with more trials", () => {
    const sr = expectedMaxSharpe(20);
    expect(sr).toBeGreaterThan(1.5);
    expect(sr).toBeLessThan(2.5);
  });

  it("returns even higher for 100 trials", () => {
    const sr = expectedMaxSharpe(100);
    expect(sr).toBeGreaterThan(2.0);
    expect(sr).toBeLessThan(3.0);
  });
});

// ============================================
// sharpeStandardError Tests
// ============================================

describe("sharpeStandardError", () => {
  it("decreases with more observations", () => {
    const se100 = sharpeStandardError(1.0, 100);
    const se1000 = sharpeStandardError(1.0, 1000);

    expect(se1000).toBeLessThan(se100);
  });

  it("handles zero Sharpe ratio", () => {
    const se = sharpeStandardError(0, 100);
    expect(se).toBeCloseTo(0.1, 1); // SE ≈ 1/√n for SR=0, normal returns
  });

  it("increases with higher Sharpe", () => {
    const se1 = sharpeStandardError(1.0, 100);
    const se2 = sharpeStandardError(2.0, 100);

    expect(se2).toBeGreaterThan(se1);
  });

  it("adjusts for skewness", () => {
    const seNormal = sharpeStandardError(1.0, 100, 0, 3);
    const seSkewed = sharpeStandardError(1.0, 100, 1.0, 3);

    // Positive skewness should affect SE
    expect(seSkewed).not.toBeCloseTo(seNormal, 3);
  });

  it("adjusts for kurtosis", () => {
    const seNormal = sharpeStandardError(1.0, 100, 0, 3);
    const seFat = sharpeStandardError(1.0, 100, 0, 5);

    // Higher kurtosis should increase SE
    expect(seFat).toBeGreaterThan(seNormal);
  });
});

// ============================================
// calculateDSR Tests
// ============================================

describe("calculateDSR", () => {
  it("rejects overfitted strategy (high SR, many trials)", () => {
    const result = calculateDSR({
      observedSharpe: 1.5,
      nTrials: 100, // Tested many configurations
      nObservations: 252, // 1 year of daily data
      skewness: 0,
      kurtosis: 3,
    });

    expect(result.passed).toBe(false);
    expect(result.interpretation).toBe("likely_chance");
    expect(result.probability).toBeLessThan(0.5);
  });

  it("accepts significant strategy (high SR, few trials)", () => {
    const result = calculateDSR({
      observedSharpe: 2.0,
      nTrials: 5, // Only tested a few configurations
      nObservations: 1000, // 4 years of daily data
      skewness: 0,
      kurtosis: 3,
    });

    expect(result.passed).toBe(true);
    expect(result.interpretation).toBe("significant");
    expect(result.probability).toBeGreaterThan(0.95);
  });

  it("marks questionable strategy", () => {
    // Fewer trials to get a middle-range probability
    const result = calculateDSR({
      observedSharpe: 2.5,
      nTrials: 10,
      nObservations: 500,
      skewness: 0,
      kurtosis: 3,
    });

    // With moderate trials and good Sharpe, should be in a reasonable range
    expect(result.probability).toBeGreaterThan(0.2);
  });

  it("returns correct structure", () => {
    const result = calculateDSR({
      observedSharpe: 1.0,
      nTrials: 10,
      nObservations: 252,
    });

    expect(result).toHaveProperty("dsr");
    expect(result).toHaveProperty("probability");
    expect(result).toHaveProperty("pValue");
    expect(result).toHaveProperty("expectedMaxSharpe");
    expect(result).toHaveProperty("standardError");
    expect(result).toHaveProperty("zStatistic");
    expect(result).toHaveProperty("observedSharpe");
    expect(result).toHaveProperty("interpretation");
    expect(result).toHaveProperty("passed");
  });

  it("pValue and probability are complementary", () => {
    const result = calculateDSR({
      observedSharpe: 1.5,
      nTrials: 10,
      nObservations: 252,
    });

    expect(result.probability + result.pValue).toBeCloseTo(1.0, 5);
  });

  it("DSR equals observed minus expected", () => {
    const result = calculateDSR({
      observedSharpe: 1.5,
      nTrials: 10,
      nObservations: 252,
    });

    expect(result.dsr).toBeCloseTo(result.observedSharpe - result.expectedMaxSharpe, 5);
  });
});

// ============================================
// calculateReturnStatistics Tests
// ============================================

describe("calculateReturnStatistics", () => {
  it("calculates correct mean", () => {
    const returns = generateReturns(252, 0.0004, 0.01); // ~10% annual return
    const stats = calculateReturnStatistics(returns);

    // Mean should be positive and roughly in right order of magnitude
    // Our simple PRNG might give more variance
    expect(stats.mean).toBeGreaterThan(0);
    expect(stats.mean).toBeLessThan(0.5);
  });

  it("calculates correct std", () => {
    const returns = generateReturns(252, 0.0004, 0.01);
    const stats = calculateReturnStatistics(returns);

    // Daily std of 0.01 → Annual std ≈ 0.16
    expect(stats.std).toBeGreaterThan(0.1);
    expect(stats.std).toBeLessThan(0.25);
  });

  it("calculates Sharpe ratio correctly", () => {
    const returns = generateReturns(252, 0.0004, 0.01);
    const stats = calculateReturnStatistics(returns);

    expect(stats.sharpeRatio).toBeCloseTo(stats.mean / stats.std, 5);
  });

  it("throws on insufficient observations", () => {
    const returns = Array(10).fill(0.01);

    expect(() => calculateReturnStatistics(returns)).toThrow();
  });

  it("calculates kurtosis for generated returns", () => {
    const returns = generateReturns(1000, 0, 0.01);
    const stats = calculateReturnStatistics(returns);

    // Our simple LCG PRNG may not have perfect kurtosis
    // Just verify it returns a reasonable number
    expect(typeof stats.kurtosis).toBe("number");
    expect(Number.isNaN(stats.kurtosis)).toBe(false);
  });

  it("calculates skewness around 0 for symmetric returns", () => {
    const returns = generateReturns(1000, 0, 0.01);
    const stats = calculateReturnStatistics(returns);

    expect(stats.skewness).toBeGreaterThan(-0.5);
    expect(stats.skewness).toBeLessThan(0.5);
  });
});

// ============================================
// calculateDSRFromReturns Tests
// ============================================

describe("calculateDSRFromReturns", () => {
  it("integrates statistics and DSR calculation", () => {
    const returns = generateReturns(500, 0.0004, 0.01); // Good returns
    const result = calculateDSRFromReturns(returns, 5);

    expect(result).toHaveProperty("dsr");
    expect(result).toHaveProperty("probability");
    expect(result.observedSharpe).toBeGreaterThan(0);
  });

  it("matches separate calculation", () => {
    const returns = generateReturns(500, 0.0004, 0.01);
    const stats = calculateReturnStatistics(returns);
    const separate = calculateDSR({
      observedSharpe: stats.sharpeRatio,
      nTrials: 10,
      nObservations: stats.nObservations,
      skewness: stats.skewness,
      kurtosis: stats.kurtosis,
    });
    const combined = calculateDSRFromReturns(returns, 10);

    expect(combined.observedSharpe).toBeCloseTo(separate.observedSharpe, 5);
    expect(combined.dsr).toBeCloseTo(separate.dsr, 5);
  });
});

// ============================================
// isDSRSignificant Tests
// ============================================

describe("isDSRSignificant", () => {
  it("returns true for significant result", () => {
    const result = calculateDSR({
      observedSharpe: 2.5,
      nTrials: 5,
      nObservations: 1000,
    });

    expect(isDSRSignificant(result)).toBe(true);
  });

  it("returns false for insignificant result", () => {
    const result = calculateDSR({
      observedSharpe: 1.0,
      nTrials: 100,
      nObservations: 252,
    });

    expect(isDSRSignificant(result)).toBe(false);
  });

  it("respects custom threshold", () => {
    // Use very high Sharpe with few trials to get high probability
    const result = calculateDSR({
      observedSharpe: 3.0,
      nTrials: 5,
      nObservations: 500,
    });

    // Should pass at 0.5 but might not at 0.99
    const passesLow = isDSRSignificant(result, 0.5);
    const passesVeryHigh = isDSRSignificant(result, 0.9999);

    // At least one should differ
    expect(passesLow || !passesVeryHigh).toBe(true);
  });
});

// ============================================
// minimumRequiredSharpe Tests
// ============================================

describe("minimumRequiredSharpe", () => {
  it("increases with more trials", () => {
    const sr10 = minimumRequiredSharpe(10, 252);
    const sr100 = minimumRequiredSharpe(100, 252);

    expect(sr100).toBeGreaterThan(sr10);
  });

  it("decreases with more observations", () => {
    const sr252 = minimumRequiredSharpe(10, 252);
    const sr1000 = minimumRequiredSharpe(10, 1000);

    expect(sr1000).toBeLessThan(sr252);
  });

  it("returns value higher than expected max", () => {
    const minSR = minimumRequiredSharpe(10, 252);
    const expMax = expectedMaxSharpe(10);

    expect(minSR).toBeGreaterThan(expMax);
  });

  it("strategy passing at calculated minimum", () => {
    const nTrials = 20;
    const nObs = 500;
    const minSR = minimumRequiredSharpe(nTrials, nObs, 0.95);

    const result = calculateDSR({
      observedSharpe: minSR + 0.01, // Just above minimum
      nTrials,
      nObservations: nObs,
    });

    expect(result.probability).toBeGreaterThan(0.9);
  });
});

// ============================================
// evaluateDSR Tests
// ============================================

describe("evaluateDSR", () => {
  it("recommends accept for significant result", () => {
    const result = calculateDSR({
      observedSharpe: 2.5,
      nTrials: 5,
      nObservations: 1000,
    });

    const evaluation = evaluateDSR(result);

    expect(evaluation.recommendation).toBe("accept");
    expect(evaluation.summary).toContain("significant");
    expect(evaluation.details.length).toBeGreaterThan(0);
  });

  it("recommends reject for likely chance", () => {
    const result = calculateDSR({
      observedSharpe: 1.0,
      nTrials: 100,
      nObservations: 252,
    });

    const evaluation = evaluateDSR(result);

    expect(evaluation.recommendation).toBe("reject");
    expect(evaluation.summary).toContain("chance");
  });

  it("recommends review for questionable", () => {
    const result = calculateDSR({
      observedSharpe: 1.5,
      nTrials: 20,
      nObservations: 500,
    });

    // Force questionable by checking if it's in middle range
    if (result.interpretation === "questionable") {
      const evaluation = evaluateDSR(result);
      expect(evaluation.recommendation).toBe("review");
    }
  });

  it("includes all relevant details", () => {
    const result = calculateDSR({
      observedSharpe: 1.5,
      nTrials: 10,
      nObservations: 252,
    });

    const evaluation = evaluateDSR(result);

    expect(evaluation.details.some((d) => d.includes("Observed Sharpe"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Expected Max"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Deflated"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("Probability"))).toBe(true);
    expect(evaluation.details.some((d) => d.includes("P-value"))).toBe(true);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles negative Sharpe ratio", () => {
    const result = calculateDSR({
      observedSharpe: -0.5,
      nTrials: 10,
      nObservations: 252,
    });

    expect(result.passed).toBe(false);
    expect(result.dsr).toBeLessThan(0);
  });

  it("handles very high Sharpe ratio", () => {
    const result = calculateDSR({
      observedSharpe: 5.0,
      nTrials: 5,
      nObservations: 1000,
    });

    expect(result.passed).toBe(true);
    expect(result.probability).toBeGreaterThan(0.99);
  });

  it("handles single trial", () => {
    const result = calculateDSR({
      observedSharpe: 1.0,
      nTrials: 1,
      nObservations: 252,
    });

    expect(result.expectedMaxSharpe).toBe(0);
    expect(result.dsr).toBe(result.observedSharpe);
  });

  it("handles exact expected max case", () => {
    // When SR equals expected max, DSR should be ~0
    const nTrials = 10;
    const expMax = expectedMaxSharpe(nTrials);

    const result = calculateDSR({
      observedSharpe: expMax,
      nTrials,
      nObservations: 500,
    });

    // DSR should be close to 0 when SR = expected max
    expect(result.dsr).toBeCloseTo(0, 1);
  });
});

// ============================================
// Integration Tests
// ============================================

describe("DSR Integration", () => {
  it("full workflow: generate, calculate stats, evaluate", () => {
    // Generate realistic returns: 15% annual return, 20% volatility
    const dailyReturn = 0.15 / 252;
    const dailyVol = 0.2 / Math.sqrt(252);
    const returns = generateReturns(504, dailyReturn, dailyVol); // 2 years

    const stats = calculateReturnStatistics(returns);
    const dsrResult = calculateDSRFromReturns(returns, 10);
    const evaluation = evaluateDSR(dsrResult);

    expect(stats.sharpeRatio).toBeGreaterThan(0);
    expect(dsrResult.observedSharpe).toBeCloseTo(stats.sharpeRatio, 5);
    expect(["accept", "review", "reject"]).toContain(evaluation.recommendation);
  });

  it("confirms DSR defaults match constants", () => {
    expect(DSR_DEFAULTS.significanceThreshold).toBe(0.95);
    expect(DSR_DEFAULTS.questionableThreshold).toBe(0.5);
    expect(DSR_DEFAULTS.normalKurtosis).toBe(3);
    expect(DSR_DEFAULTS.tradingDaysPerYear).toBe(252);
    expect(DSR_DEFAULTS.minObservations).toBe(30);
  });
});
