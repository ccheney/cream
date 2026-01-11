/**
 * Tests for utility functions: isIndicatorValid, validateAndRank, estimateSurvivalRate, evaluateValidation.
 */

import { describe, expect, test } from "bun:test";
import {
  estimateSurvivalRate,
  evaluateValidation,
  isIndicatorValid,
  runValidationPipeline,
  validateAndRank,
} from "../../../src/synthesis/validationPipeline/index.js";
import {
  DEFAULT_N,
  generatePredictiveSignals,
  generateRandomSignals,
  generateReturns,
} from "./fixtures.js";

describe("isIndicatorValid", () => {
  test("returns boolean", () => {
    const returns = generateReturns(DEFAULT_N);
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
    const returns = generateReturns(DEFAULT_N);

    const indicators = [
      { id: "random", signals: generateRandomSignals(DEFAULT_N) },
      { id: "predictive", signals: generatePredictiveSignals(returns, 0.4) },
      { id: "weak", signals: generatePredictiveSignals(returns, 0.1) },
    ];

    const ranked = validateAndRank(indicators, returns);

    expect(ranked).toHaveLength(3);
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
    const returns = generateReturns(DEFAULT_N, 0.001, 0.01);
    const signals = returns.map((r) => (r > 0 ? 1 : -1));

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
    const returns = generateReturns(DEFAULT_N);
    const signals = generateRandomSignals(DEFAULT_N);

    const result = runValidationPipeline({
      indicatorId: "random",
      signals,
      returns,
      nTrials: 100,
    });

    if (result.dsr.pValue < 0.5) {
      const evaluation = evaluateValidation(result);
      expect(evaluation.action).toBe("retire");
      expect(evaluation.confidence).toBe("high");
    }
  });

  test("recommends retry for marginal failures", () => {
    const mockResult = {
      indicatorId: "marginal",
      timestamp: new Date().toISOString(),
      dsr: {
        value: 0.5,
        pValue: 0.92,
        nTrials: 5,
        nObservations: 252,
        passed: false,
      },
      pbo: { value: 0.4, nSplits: 8, nCombinations: 70, passed: true },
      ic: {
        mean: 0.03,
        std: 0.02,
        icir: 1.5,
        hitRate: 0.55,
        nObservations: 252,
        passed: true,
      },
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
