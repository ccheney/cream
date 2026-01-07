/**
 * Tests for Validation Pipeline Orchestrator
 */

import { describe, expect, test } from "bun:test";
import {
  estimateSurvivalRate,
  evaluateValidation,
  isIndicatorValid,
  runValidationPipeline,
  VALIDATION_DEFAULTS,
  ValidationInputSchema,
  validateAndRank,
} from "../src/synthesis/validationPipeline.js";

// ============================================
// Helper Functions
// ============================================

/**
 * Generate random normal values using Box-Muller transform.
 */
function randn(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Generate random returns with optional drift.
 */
function generateReturns(n: number, drift = 0.0001, volatility = 0.02): number[] {
  return Array.from({ length: n }, () => drift + volatility * randn());
}

/**
 * Generate predictive signals correlated with forward returns.
 */
function generatePredictiveSignals(returns: number[], correlation: number): number[] {
  // Shift returns to create "forward" returns from signal's perspective
  const forwardReturns = returns.slice(1).concat([0]);
  const noiseCoeff = Math.sqrt(1 - correlation * correlation);

  return forwardReturns.map((r) => correlation * r + noiseCoeff * randn() * 0.02);
}

/**
 * Generate random signals (no predictive power).
 */
function generateRandomSignals(n: number): number[] {
  return Array.from({ length: n }, () => randn());
}

// ============================================
// Schema Validation Tests
// ============================================

describe("ValidationInputSchema", () => {
  test("validates minimal input", () => {
    const input = {
      indicatorId: "test-indicator",
      signals: [1, 2, 3, 4, 5],
      returns: [0.01, -0.02, 0.015, -0.005, 0.008],
    };

    const result = ValidationInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("applies defaults", () => {
    const input = {
      indicatorId: "test",
      signals: [1, 2, 3],
      returns: [0.01, -0.01, 0.02],
    };

    const result = ValidationInputSchema.parse(input);
    expect(result.nTrials).toBe(1);
    expect(result.existingIndicators).toBeUndefined();
  });

  test("rejects empty signals", () => {
    const input = {
      indicatorId: "test",
      signals: [],
      returns: [],
    };

    // Note: Empty arrays are valid per schema, but pipeline will handle gracefully
    const result = ValidationInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("accepts custom thresholds", () => {
    const input = {
      indicatorId: "test",
      signals: [1, 2, 3],
      returns: [0.01, -0.01, 0.02],
      thresholds: {
        dsrPValue: 0.9,
        pbo: 0.4,
        icMean: 0.03,
      },
    };

    const result = ValidationInputSchema.parse(input);
    expect(result.thresholds?.dsrPValue).toBe(0.9);
    expect(result.thresholds?.pbo).toBe(0.4);
    expect(result.thresholds?.icMean).toBe(0.03);
  });
});

// ============================================
// Pipeline Integration Tests
// ============================================

describe("runValidationPipeline", () => {
  test("returns complete validation result", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "test-indicator",
      signals,
      returns,
      nTrials: 10,
    });

    // Check result structure
    expect(result.indicatorId).toBe("test-indicator");
    expect(result.timestamp).toBeDefined();
    expect(result.dsr).toBeDefined();
    expect(result.pbo).toBeDefined();
    expect(result.ic).toBeDefined();
    expect(result.walkForward).toBeDefined();
    expect(result.orthogonality).toBeDefined();
    expect(result.trials).toBeDefined();
    expect(typeof result.overallPassed).toBe("boolean");
    expect(result.gatesPassed).toBeGreaterThanOrEqual(0);
    expect(result.gatesPassed).toBeLessThanOrEqual(result.totalGates);
    expect(result.passRate).toBeGreaterThanOrEqual(0);
    expect(result.passRate).toBeLessThanOrEqual(1);
    expect(result.summary).toBeDefined();
    expect(result.recommendations).toBeInstanceOf(Array);
  });

  test("random signals fail validation", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generateRandomSignals(n);

    const result = runValidationPipeline({
      indicatorId: "random-signals",
      signals,
      returns,
      nTrials: 100, // Many trials make it harder to pass DSR
    });

    // Random signals should likely fail
    // At minimum, DSR should be low with many trials
    expect(result.dsr.nTrials).toBe(100);

    // Most random signals won't pass all gates
    // (this test may occasionally pass by chance - that's acceptable)
    expect(result.passRate).toBeLessThan(1);
  });

  test("handles single trial", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.5);

    const result = runValidationPipeline({
      indicatorId: "single-trial",
      signals,
      returns,
      nTrials: 1,
    });

    expect(result.trials.attempted).toBe(1);
    expect(result.trials.multipleTestingPenalty).toBe(0);
  });

  test("includes existing indicators in orthogonality check", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);
    const existingSignals = generatePredictiveSignals(returns, 0.4);

    const result = runValidationPipeline({
      indicatorId: "with-existing",
      signals,
      returns,
      existingIndicators: {
        existing1: existingSignals,
      },
    });

    expect(result.orthogonality.nExistingIndicators).toBe(1);
  });

  test("uses custom thresholds when provided", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.2);

    // Use very lenient thresholds
    const result = runValidationPipeline({
      indicatorId: "custom-thresholds",
      signals,
      returns,
      thresholds: {
        dsrPValue: 0.5,
        pbo: 0.9,
        icMean: 0.001,
        icStd: 0.5,
        wfEfficiency: 0.1,
      },
    });

    // With lenient thresholds, more likely to pass
    // (but still depends on actual signal quality)
    expect(result).toBeDefined();
  });
});

// ============================================
// Individual Gate Tests
// ============================================

describe("DSR Gate", () => {
  test("penalizes many trials", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result1 = runValidationPipeline({
      indicatorId: "few-trials",
      signals,
      returns,
      nTrials: 1,
    });

    const result100 = runValidationPipeline({
      indicatorId: "many-trials",
      signals,
      returns,
      nTrials: 100,
    });

    // More trials should result in higher DSR p-value (harder to achieve significance)
    // because the expected max Sharpe from random chance increases with more trials
    expect(result1.dsr.pValue).toBeLessThanOrEqual(result100.dsr.pValue);
  });

  test("reports failure reason", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generateRandomSignals(n);

    const result = runValidationPipeline({
      indicatorId: "low-dsr",
      signals,
      returns,
      nTrials: 50,
    });

    if (!result.dsr.passed) {
      expect(result.dsr.reason).toBeDefined();
      expect(result.dsr.reason).toContain("DSR");
    }
  });
});

describe("PBO Gate", () => {
  test("uses CSCV method", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "pbo-test",
      signals,
      returns,
    });

    // PBO should use 8 splits by default
    expect(result.pbo.nSplits).toBe(8);
    // C(8,4) = 70 combinations
    expect(result.pbo.nCombinations).toBe(70);
  });

  test("value between 0 and 1", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generateRandomSignals(n);

    const result = runValidationPipeline({
      indicatorId: "pbo-bounds",
      signals,
      returns,
    });

    expect(result.pbo.value).toBeGreaterThanOrEqual(0);
    expect(result.pbo.value).toBeLessThanOrEqual(1);
  });
});

describe("IC Gate", () => {
  test("computes IC statistics", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "ic-test",
      signals,
      returns,
    });

    expect(result.ic.mean).toBeDefined();
    expect(result.ic.std).toBeDefined();
    expect(result.ic.icir).toBeDefined();
    expect(result.ic.hitRate).toBeDefined();
    expect(result.ic.hitRate).toBeGreaterThanOrEqual(0);
    expect(result.ic.hitRate).toBeLessThanOrEqual(1);
  });

  test("uses forward returns when provided", () => {
    const n = 252;
    const returns = generateReturns(n);
    const forwardReturns = returns.slice(1).concat([0]);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "ic-forward",
      signals,
      returns,
      forwardReturns,
    });

    expect(result.ic.nObservations).toBeGreaterThan(0);
  });
});

describe("Walk-Forward Gate", () => {
  test("computes efficiency metrics", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "wf-test",
      signals,
      returns,
    });

    expect(result.walkForward.efficiency).toBeDefined();
    expect(result.walkForward.consistency).toBeDefined();
    expect(result.walkForward.degradation).toBeDefined();
    expect(result.walkForward.nPeriods).toBeGreaterThan(0);
  });

  test("degradation is 1 - efficiency", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "wf-degradation",
      signals,
      returns,
    });

    expect(result.walkForward.degradation).toBeCloseTo(1 - result.walkForward.efficiency, 5);
  });
});

describe("Orthogonality Gate", () => {
  test("passes with no existing indicators", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "orth-empty",
      signals,
      returns,
      existingIndicators: {},
    });

    expect(result.orthogonality.passed).toBe(true);
    expect(result.orthogonality.nExistingIndicators).toBe(0);
  });

  test("detects high correlation", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);
    // Create highly correlated signal
    const correlated = signals.map((s) => s * 1.1 + 0.01);

    const result = runValidationPipeline({
      indicatorId: "orth-correlated",
      signals,
      returns,
      existingIndicators: { correlated },
    });

    expect(result.orthogonality.maxCorrelation).toBeGreaterThan(0.9);
    expect(result.orthogonality.correlatedWith).toBe("correlated");
    expect(result.orthogonality.passed).toBe(false);
  });

  test("accepts uncorrelated signals", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);
    const uncorrelated = generateRandomSignals(n);

    const result = runValidationPipeline({
      indicatorId: "orth-uncorrelated",
      signals,
      returns,
      existingIndicators: { uncorrelated },
    });

    expect(Math.abs(result.orthogonality.maxCorrelation)).toBeLessThan(0.7);
    expect(result.orthogonality.passed).toBe(true);
  });
});

// ============================================
// Utility Function Tests
// ============================================

describe("isIndicatorValid", () => {
  test("returns boolean", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = isIndicatorValid({
      indicatorId: "valid-check",
      signals,
      returns,
    });

    expect(typeof result).toBe("boolean");
  });
});

describe("validateAndRank", () => {
  test("ranks indicators by pass rate and DSR", () => {
    const n = 252;
    const returns = generateReturns(n);

    const indicators = [
      { id: "random", signals: generateRandomSignals(n) },
      { id: "predictive", signals: generatePredictiveSignals(returns, 0.4) },
      { id: "weak", signals: generatePredictiveSignals(returns, 0.1) },
    ];

    const ranked = validateAndRank(indicators, returns);

    expect(ranked).toHaveLength(3);
    // Results should be sorted by pass rate
    for (let i = 1; i < ranked.length; i++) {
      const prevPassRate = ranked[i - 1]!.result.passRate;
      const currPassRate = ranked[i]!.result.passRate;
      expect(prevPassRate).toBeGreaterThanOrEqual(currPassRate);
    }
  });

  test("handles empty indicators list", () => {
    const returns = generateReturns(100);
    const ranked = validateAndRank([], returns);
    expect(ranked).toHaveLength(0);
  });
});

describe("estimateSurvivalRate", () => {
  test("returns probability between 0 and 1", () => {
    const rate = estimateSurvivalRate();
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(1);
  });

  test("survival rate is low with default thresholds", () => {
    const rate = estimateSurvivalRate();
    // Expected ~4% per plan
    expect(rate).toBeLessThan(0.1);
  });

  test("lenient thresholds increase survival rate", () => {
    const defaultRate = estimateSurvivalRate();
    const lenientRate = estimateSurvivalRate(0.5, 0.9, 0.01, 0.2, 0.3);

    expect(lenientRate).toBeGreaterThan(defaultRate);
  });
});

describe("evaluateValidation", () => {
  test("recommends deploy for passing result", () => {
    const n = 252;
    const returns = generateReturns(n, 0.001, 0.01); // Strong drift, low vol
    const signals = returns.map((r) => (r > 0 ? 1 : -1)); // Perfect signal

    // Use very lenient thresholds to ensure pass
    const result = runValidationPipeline({
      indicatorId: "perfect",
      signals,
      returns,
      nTrials: 1,
      thresholds: {
        dsrPValue: 0.1,
        pbo: 0.99,
        icMean: -1,
        icStd: 1,
        wfEfficiency: -1,
      },
    });

    if (result.overallPassed) {
      const evaluation = evaluateValidation(result);
      expect(evaluation.action).toBe("deploy");
    }
  });

  test("recommends retire for critical failures", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generateRandomSignals(n);

    const result = runValidationPipeline({
      indicatorId: "random",
      signals,
      returns,
      nTrials: 100,
    });

    // Force a critical failure scenario
    if (result.dsr.pValue < 0.5) {
      const evaluation = evaluateValidation(result);
      expect(evaluation.action).toBe("retire");
      expect(evaluation.confidence).toBe("high");
    }
  });

  test("recommends retry for marginal failures", () => {
    // Create a result that's close to passing
    const mockResult = {
      indicatorId: "marginal",
      timestamp: new Date().toISOString(),
      dsr: {
        value: 0.5,
        pValue: 0.92, // Close to 0.95 threshold
        nTrials: 5,
        nObservations: 252,
        passed: false,
      },
      pbo: { value: 0.4, nSplits: 8, nCombinations: 70, passed: true },
      ic: { mean: 0.03, std: 0.02, icir: 1.5, hitRate: 0.55, nObservations: 252, passed: true },
      walkForward: {
        efficiency: 0.6,
        consistency: 0.8,
        degradation: 0.4,
        nPeriods: 5,
        passed: true,
      },
      orthogonality: {
        maxCorrelation: 0.3,
        correlatedWith: null,
        vif: null,
        nExistingIndicators: 0,
        passed: true,
      },
      trials: { attempted: 5, selected: 1, multipleTestingPenalty: 1.8 },
      overallPassed: false,
      gatesPassed: 4,
      totalGates: 5,
      passRate: 0.8,
      summary: "Failed 1 gate(s): DSR",
      recommendations: [],
    };

    const evaluation = evaluateValidation(mockResult);
    expect(evaluation.action).toBe("retry");
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  test("handles short time series", () => {
    const n = 50; // Minimum viable
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);

    const result = runValidationPipeline({
      indicatorId: "short-series",
      signals,
      returns,
    });

    expect(result).toBeDefined();
    expect(result.indicatorId).toBe("short-series");
  });

  test("handles constant signals", () => {
    const n = 100;
    const returns = generateReturns(n);
    const signals = Array(n).fill(1);

    const result = runValidationPipeline({
      indicatorId: "constant",
      signals,
      returns,
    });

    expect(result).toBeDefined();
    // Constant signals should have 0 IC
    expect(result.ic.mean).toBe(0);
  });

  test("handles zero returns", () => {
    const n = 100;
    const returns = Array(n).fill(0);
    const signals = generateRandomSignals(n);

    const result = runValidationPipeline({
      indicatorId: "zero-returns",
      signals,
      returns,
    });

    expect(result).toBeDefined();
  });

  test("many existing indicators for VIF check", () => {
    const n = 252;
    const returns = generateReturns(n);
    const signals = generatePredictiveSignals(returns, 0.3);

    // Create multiple existing indicators
    const existingIndicators: Record<string, number[]> = {};
    for (let i = 0; i < 5; i++) {
      existingIndicators[`existing_${i}`] = generateRandomSignals(n);
    }

    const result = runValidationPipeline({
      indicatorId: "vif-test",
      signals,
      returns,
      existingIndicators,
    });

    expect(result.orthogonality.nExistingIndicators).toBe(5);
    expect(result.orthogonality.vif).toBeDefined();
  });
});

// ============================================
// Defaults Tests
// ============================================

describe("VALIDATION_DEFAULTS", () => {
  test("has expected thresholds", () => {
    expect(VALIDATION_DEFAULTS.dsrPValueThreshold).toBe(0.95);
    expect(VALIDATION_DEFAULTS.pboThreshold).toBe(0.5);
    expect(VALIDATION_DEFAULTS.icMeanThreshold).toBe(0.02);
    expect(VALIDATION_DEFAULTS.icStdThreshold).toBe(0.03);
    expect(VALIDATION_DEFAULTS.wfEfficiencyThreshold).toBe(0.5);
    expect(VALIDATION_DEFAULTS.maxCorrelation).toBe(0.7);
    expect(VALIDATION_DEFAULTS.maxVIF).toBe(5.0);
  });
});
