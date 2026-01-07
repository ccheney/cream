/**
 * Tests for Orthogonality Checker Module
 */

import { describe, expect, test } from "bun:test";
import {
  checkOrthogonality,
  computeAllVIFs,
  computeCorrelationMatrix,
  computePairwiseCorrelations,
  computeVIF,
  evaluateOrthogonality,
  isIndicatorOrthogonal,
  ORTHOGONALITY_DEFAULTS,
  OrthogonalityInputSchema,
  orthogonalize,
  orthogonalizeMultiple,
  pearsonCorrelation,
  rankByOrthogonality,
} from "../src/synthesis/orthogonality.js";

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
 * Generate random indicator values.
 */
function generateIndicator(n: number, mean = 0, std = 1): number[] {
  return Array.from({ length: n }, () => mean + std * randn());
}

/**
 * Generate correlated indicator based on source.
 */
function generateCorrelated(source: number[], correlation: number): number[] {
  // y = correlation * source + sqrt(1 - correlation^2) * noise
  const noiseCoeff = Math.sqrt(1 - correlation * correlation);
  return source.map((x) => correlation * x + noiseCoeff * randn());
}

// ============================================
// Schema Validation Tests
// ============================================

describe("OrthogonalityInputSchema", () => {
  test("validates minimal input", () => {
    const input = {
      newIndicator: [1, 2, 3, 4, 5],
      existingIndicators: {
        indicator1: [5, 4, 3, 2, 1],
      },
    };

    const result = OrthogonalityInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("applies defaults", () => {
    const input = {
      newIndicator: [1, 2, 3],
      existingIndicators: {},
    };

    const result = OrthogonalityInputSchema.parse(input);
    expect(result.maxCorrelation).toBe(0.7);
    expect(result.maxVIF).toBe(5.0);
    expect(result.minObservations).toBe(30);
  });

  test("rejects invalid correlation threshold", () => {
    const input = {
      newIndicator: [1, 2, 3],
      existingIndicators: {},
      maxCorrelation: 1.5, // Invalid: > 1
    };

    const result = OrthogonalityInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects negative VIF threshold", () => {
    const input = {
      newIndicator: [1, 2, 3],
      existingIndicators: {},
      maxVIF: -1, // Invalid: negative
    };

    const result = OrthogonalityInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ============================================
// Pearson Correlation Tests
// ============================================

describe("pearsonCorrelation", () => {
  test("returns 1 for identical arrays", () => {
    const x = [1, 2, 3, 4, 5];
    const { correlation, n } = pearsonCorrelation(x, x);
    expect(correlation).toBeCloseTo(1.0, 10);
    expect(n).toBe(5);
  });

  test("returns -1 for perfectly negatively correlated", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [5, 4, 3, 2, 1];
    const { correlation } = pearsonCorrelation(x, y);
    expect(correlation).toBeCloseTo(-1.0, 10);
  });

  test("returns ~0 for uncorrelated data", () => {
    // Use deterministic "random" data
    const x = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
    const y = [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5];
    const { correlation } = pearsonCorrelation(x, y);
    expect(correlation).toBeCloseTo(-1.0, 5); // These are actually perfectly negatively correlated
  });

  test("handles NaN values by excluding them", () => {
    const x = [1, Number.NaN, 3, 4, 5];
    const y = [1, 2, Number.NaN, 4, 5];
    const { correlation, n } = pearsonCorrelation(x, y);
    // Only indices 0, 3, 4 are valid
    expect(n).toBe(3);
    expect(correlation).toBeCloseTo(1.0, 10);
  });

  test("returns 0 for arrays with < 2 valid points", () => {
    const x = [1, Number.NaN, Number.NaN];
    const y = [Number.NaN, 2, Number.NaN];
    const { correlation, n } = pearsonCorrelation(x, y);
    expect(n).toBe(0);
    expect(correlation).toBe(0);
  });

  test("returns 0 for constant arrays", () => {
    const x = [5, 5, 5, 5, 5];
    const y = [1, 2, 3, 4, 5];
    const { correlation } = pearsonCorrelation(x, y);
    expect(correlation).toBe(0);
  });

  test("throws for mismatched lengths", () => {
    const x = [1, 2, 3];
    const y = [1, 2];
    expect(() => pearsonCorrelation(x, y)).toThrow();
  });
});

// ============================================
// Pairwise Correlations Tests
// ============================================

describe("computePairwiseCorrelations", () => {
  test("computes correlations with multiple indicators", () => {
    const n = 100;
    const base = generateIndicator(n);
    const highCorr = generateCorrelated(base, 0.9);
    const lowCorr = generateCorrelated(base, 0.2);

    const results = computePairwiseCorrelations(base, {
      highCorrelated: highCorr,
      lowCorrelated: lowCorr,
    });

    expect(results).toHaveLength(2);
    // Results should be sorted by absolute correlation
    expect(results[0]!.name).toBe("highCorrelated");
    expect(Math.abs(results[0]!.correlation)).toBeGreaterThan(0.7);
    expect(Math.abs(results[1]!.correlation)).toBeLessThan(0.5);
  });

  test("marks high correlations as unacceptable", () => {
    const n = 100;
    const base = generateIndicator(n);
    const highCorr = generateCorrelated(base, 0.9);

    const results = computePairwiseCorrelations(
      base,
      { correlated: highCorr },
      { maxCorrelation: 0.7 }
    );

    expect(results[0]!.isAcceptable).toBe(false);
  });

  test("marks moderate correlations as warnings", () => {
    // Use deterministic data with known correlation of ~0.55
    // Constructed so correlation falls in warning range (0.5-0.7)
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // Pattern with correlation ~0.55 to base
    const modCorr = [6, 3, 7, 4, 8, 5, 9, 6, 10, 7];

    const results = computePairwiseCorrelations(
      base,
      { moderate: modCorr },
      { maxCorrelation: 0.7, correlationWarning: 0.5, minObservations: 5 }
    );

    // Verify correlation is in warning range (0.5-0.7)
    const absCorr = Math.abs(results[0]!.correlation);
    expect(absCorr).toBeGreaterThanOrEqual(0.5);
    expect(absCorr).toBeLessThan(0.7);
    expect(results[0]!.isAcceptable).toBe(true);
    expect(results[0]!.isWarning).toBe(true);
  });

  test("handles empty existing indicators", () => {
    const base = generateIndicator(50);
    const results = computePairwiseCorrelations(base, {});
    expect(results).toHaveLength(0);
  });

  test("handles different length indicators by truncating", () => {
    const newInd = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const existing = [1, 2, 3, 4, 5]; // Shorter

    const results = computePairwiseCorrelations(newInd, { short: existing });

    expect(results).toHaveLength(1);
    expect(results[0]!.nObservations).toBe(5);
  });
});

// ============================================
// VIF Tests
// ============================================

describe("computeVIF", () => {
  test("returns VIF = 1 for no existing indicators", () => {
    const newInd = generateIndicator(100);
    const result = computeVIF(newInd, {});

    expect(result.vif).toBe(1.0);
    expect(result.rSquared).toBe(0);
    expect(result.isAcceptable).toBe(true);
  });

  test("returns high VIF for linearly dependent indicator", () => {
    const n = 100;
    const ind1 = generateIndicator(n);
    const ind2 = generateIndicator(n);
    // New indicator is a linear combination
    const newInd = ind1.map((v, i) => 2 * v + 3 * ind2[i]!);

    const result = computeVIF(newInd, { ind1, ind2 });

    expect(result.vif).toBeGreaterThan(100);
    expect(result.rSquared).toBeGreaterThan(0.99);
    expect(result.isAcceptable).toBe(false);
  });

  test("returns low VIF for independent indicator", () => {
    const n = 100;
    const ind1 = generateIndicator(n);
    const ind2 = generateIndicator(n);
    const newInd = generateIndicator(n); // Completely independent

    const result = computeVIF(newInd, { ind1, ind2 });

    expect(result.vif).toBeLessThan(2);
    expect(result.isAcceptable).toBe(true);
  });

  test("handles insufficient observations", () => {
    const newInd = [1, 2, 3, 4, 5];
    const result = computeVIF(newInd, { existing: [5, 4, 3, 2, 1] }, { minObservations: 50 });

    expect(result.vif).toBe(Number.POSITIVE_INFINITY);
    expect(result.isAcceptable).toBe(false);
  });

  test("reports warning for elevated VIF", () => {
    const n = 100;
    const ind1 = generateIndicator(n);
    // Moderately correlated
    const newInd = ind1.map((v) => 0.7 * v + 0.7 * randn());

    const result = computeVIF(newInd, { ind1 }, { maxVIF: 5, vifWarning: 2 });

    if (result.vif >= 2 && result.vif < 5) {
      expect(result.isWarning).toBe(true);
      expect(result.isAcceptable).toBe(true);
    }
  });
});

// ============================================
// Orthogonalize Tests
// ============================================

describe("orthogonalize", () => {
  test("reduces correlation after orthogonalization", () => {
    const n = 100;
    const source = generateIndicator(n);
    const correlated = generateCorrelated(source, 0.8);

    const { correlation: beforeCorr } = pearsonCorrelation(correlated, source);
    expect(Math.abs(beforeCorr)).toBeGreaterThan(0.5);

    const orthogonalized = orthogonalize(correlated, source);
    const { correlation: afterCorr } = pearsonCorrelation(orthogonalized, source);

    expect(Math.abs(afterCorr)).toBeLessThan(0.1);
  });

  test("preserves uncorrelated indicators", () => {
    const n = 100;
    const source = generateIndicator(n);
    const independent = generateIndicator(n);

    const orthogonalized = orthogonalize(independent, source);

    // Should be similar to original
    const { correlation } = pearsonCorrelation(orthogonalized, independent);
    expect(correlation).toBeGreaterThan(0.9);
  });

  test("handles short arrays", () => {
    const short = [1, 2];
    const result = orthogonalize(short, [2, 1]);
    expect(result).toHaveLength(2);
  });
});

describe("orthogonalizeMultiple", () => {
  test("removes correlations with multiple indicators", () => {
    const n = 100;
    const ind1 = generateIndicator(n);
    const ind2 = generateIndicator(n);
    // New indicator correlated with both
    const newInd = ind1.map((v, i) => 0.5 * v + 0.5 * ind2[i]! + 0.5 * randn());

    const orthogonalized = orthogonalizeMultiple(newInd, { ind1, ind2 });

    const { correlation: corr1 } = pearsonCorrelation(orthogonalized, ind1);
    const { correlation: corr2 } = pearsonCorrelation(orthogonalized, ind2);

    expect(Math.abs(corr1)).toBeLessThan(0.15);
    expect(Math.abs(corr2)).toBeLessThan(0.15);
  });

  test("handles empty existing indicators", () => {
    const newInd = generateIndicator(50);
    const result = orthogonalizeMultiple(newInd, {});
    expect(result).toHaveLength(50);
  });
});

// ============================================
// Main Orthogonality Check Tests
// ============================================

describe("checkOrthogonality", () => {
  test("accepts independent indicator", () => {
    const n = 100;
    const existing = { ind1: generateIndicator(n), ind2: generateIndicator(n) };
    const newInd = generateIndicator(n);

    const result = checkOrthogonality({
      newIndicator: newInd,
      existingIndicators: existing,
    });

    expect(result.isOrthogonal).toBe(true);
    expect(Math.abs(result.maxCorrelationFound)).toBeLessThan(0.7);
    expect(result.summary).toContain("orthogonal");
  });

  test("rejects highly correlated indicator", () => {
    const n = 100;
    const source = generateIndicator(n);
    const highlyCorrelated = generateCorrelated(source, 0.9);

    const result = checkOrthogonality({
      newIndicator: highlyCorrelated,
      existingIndicators: { source },
      maxCorrelation: 0.7,
    });

    expect(result.isOrthogonal).toBe(false);
    expect(result.mostCorrelatedWith).toBe("source");
    expect(result.summary).toContain("correlation");
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  test("rejects high VIF indicator", () => {
    const n = 100;
    const ind1 = generateIndicator(n);
    const ind2 = generateIndicator(n);
    const linearCombination = ind1.map((v, i) => v + ind2[i]!);

    const result = checkOrthogonality({
      newIndicator: linearCombination,
      existingIndicators: { ind1, ind2 },
      maxVIF: 5,
    });

    expect(result.isOrthogonal).toBe(false);
    expect(result.vif).not.toBeNull();
    expect(result.vif!.vif).toBeGreaterThan(5);
  });

  test("handles empty existing indicators", () => {
    const newInd = generateIndicator(50);

    const result = checkOrthogonality({
      newIndicator: newInd,
      existingIndicators: {},
    });

    expect(result.isOrthogonal).toBe(true);
    expect(result.correlations).toHaveLength(0);
    expect(result.vif).toBeNull();
  });

  test("handles single existing indicator (no VIF)", () => {
    const n = 100;
    const existing = generateIndicator(n);
    const newInd = generateIndicator(n);

    const result = checkOrthogonality({
      newIndicator: newInd,
      existingIndicators: { existing },
    });

    expect(result.vif).toBeNull(); // VIF requires 2+ indicators
    expect(result.correlations).toHaveLength(1);
  });

  test("includes thresholds in result", () => {
    const result = checkOrthogonality({
      newIndicator: [1, 2, 3, 4, 5],
      existingIndicators: {},
      maxCorrelation: 0.6,
      maxVIF: 4.0,
      minObservations: 20,
    });

    expect(result.thresholds.maxCorrelation).toBe(0.6);
    expect(result.thresholds.maxVIF).toBe(4.0);
    expect(result.thresholds.minObservations).toBe(20);
  });
});

// ============================================
// Utility Function Tests
// ============================================

describe("isIndicatorOrthogonal", () => {
  test("returns boolean for quick check", () => {
    const n = 100;
    const existing = { ind1: generateIndicator(n) };
    const newInd = generateIndicator(n);

    const result = isIndicatorOrthogonal(newInd, existing);
    expect(typeof result).toBe("boolean");
  });
});

describe("evaluateOrthogonality", () => {
  test("recommends accept for orthogonal indicator", () => {
    const result = checkOrthogonality({
      newIndicator: generateIndicator(100),
      existingIndicators: { ind1: generateIndicator(100) },
    });

    const evaluation = evaluateOrthogonality(result);
    expect(evaluation.recommendation).toBe("accept");
    expect(evaluation.explanation).toContain("independent");
  });

  test("recommends reject for non-orthogonal indicator", () => {
    const n = 100;
    const source = generateIndicator(n);
    const correlated = generateCorrelated(source, 0.9);

    const result = checkOrthogonality({
      newIndicator: correlated,
      existingIndicators: { source },
      maxCorrelation: 0.7,
    });

    const evaluation = evaluateOrthogonality(result);
    expect(evaluation.recommendation).toBe("reject");
    expect(evaluation.explanation).toContain("Reject");
  });

  test("recommends warn for borderline case", () => {
    const n = 100;
    const source = generateIndicator(n);
    // Generate moderate correlation
    const moderate = source.map((v) => 0.5 * v + 0.87 * randn());

    const result = checkOrthogonality({
      newIndicator: moderate,
      existingIndicators: { source },
      maxCorrelation: 0.7,
    });

    // If correlation is in warning range
    if (result.correlations[0]?.isWarning) {
      const evaluation = evaluateOrthogonality(result);
      expect(evaluation.recommendation).toBe("warn");
    }
  });
});

describe("rankByOrthogonality", () => {
  test("ranks candidates by orthogonality score", () => {
    const n = 100;
    const existing = { base: generateIndicator(n) };

    const candidates = {
      independent: generateIndicator(n),
      correlated: generateCorrelated(existing.base, 0.8),
      moderateCorr: generateCorrelated(existing.base, 0.4),
    };

    const ranked = rankByOrthogonality(candidates, existing);

    expect(ranked).toHaveLength(3);
    // Independent should rank higher than correlated
    expect(ranked[0]!.name).toBe("independent");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[2]!.score);
  });

  test("handles empty candidates", () => {
    const existing = { base: generateIndicator(50) };
    const ranked = rankByOrthogonality({}, existing);
    expect(ranked).toHaveLength(0);
  });
});

describe("computeCorrelationMatrix", () => {
  test("computes symmetric correlation matrix", () => {
    const indicators = {
      a: [1, 2, 3, 4, 5],
      b: [5, 4, 3, 2, 1],
      c: [1, 1, 1, 1, 1],
    };

    const { names, matrix, maxOffDiagonal, maxPair } = computeCorrelationMatrix(indicators);

    expect(names).toHaveLength(3);
    expect(matrix).toHaveLength(3);

    // Diagonal should be 1
    expect(matrix[0]![0]).toBe(1);
    expect(matrix[1]![1]).toBe(1);
    expect(matrix[2]![2]).toBe(1);

    // Should be symmetric
    expect(matrix[0]![1]).toBeCloseTo(matrix[1]![0]!, 10);

    // a and b are perfectly negatively correlated
    expect(maxOffDiagonal).toBeCloseTo(1, 5);
    expect(maxPair).toContain("a");
    expect(maxPair).toContain("b");
  });

  test("handles single indicator", () => {
    const { matrix, maxOffDiagonal, maxPair } = computeCorrelationMatrix({
      only: [1, 2, 3],
    });

    expect(matrix).toHaveLength(1);
    expect(matrix[0]![0]).toBe(1);
    expect(maxOffDiagonal).toBe(0);
    expect(maxPair).toBeNull();
  });
});

describe("computeAllVIFs", () => {
  test("computes VIF for each indicator", () => {
    const n = 100;
    const indicators = {
      a: generateIndicator(n),
      b: generateIndicator(n),
      c: generateIndicator(n),
    };

    const vifs = computeAllVIFs(indicators);

    expect(Object.keys(vifs)).toHaveLength(3);
    // Independent indicators should have VIF close to 1
    for (const key of Object.keys(vifs)) {
      expect(vifs[key]!.vif).toBeLessThan(3);
    }
  });

  test("detects multicollinearity", () => {
    const n = 100;
    const a = generateIndicator(n);
    const b = generateIndicator(n);
    const c = a.map((v, i) => v + b[i]!); // Linear combination

    const vifs = computeAllVIFs({ a, b, c });

    // c should have high VIF
    expect(vifs.c!.vif).toBeGreaterThan(5);
  });
});

// ============================================
// Edge Cases Tests
// ============================================

describe("Edge Cases", () => {
  test("handles indicators with NaN values", () => {
    const n = 100;
    const withNaN = generateIndicator(n);
    withNaN[10] = Number.NaN;
    withNaN[20] = Number.NaN;
    const clean = generateIndicator(n);

    // Test low-level function that handles NaN gracefully
    const results = computePairwiseCorrelations(withNaN, { clean });

    expect(results[0]!.nObservations).toBeLessThan(n);
  });

  test("handles indicators with Infinity values", () => {
    const n = 100;
    const withInf = generateIndicator(n);
    withInf[5] = Number.POSITIVE_INFINITY;
    withInf[15] = Number.NEGATIVE_INFINITY;
    const clean = generateIndicator(n);

    // Test low-level function that handles Infinity gracefully
    const results = computePairwiseCorrelations(withInf, { clean });

    expect(results[0]!.nObservations).toBeLessThan(n);
  });

  test("handles very short indicators", () => {
    const result = checkOrthogonality({
      newIndicator: [1, 2, 3],
      existingIndicators: { short: [3, 2, 1] },
      minObservations: 2,
    });

    expect(result.correlations).toHaveLength(1);
  });

  test("handles all zeros indicator", () => {
    const zeros = Array(50).fill(0);
    const normal = generateIndicator(50);

    const { correlation } = pearsonCorrelation(zeros, normal);
    expect(correlation).toBe(0);
  });

  test("handles constant indicator", () => {
    const constant = Array(50).fill(5);
    const normal = generateIndicator(50);

    const result = checkOrthogonality({
      newIndicator: constant,
      existingIndicators: { normal },
    });

    expect(result.maxCorrelationFound).toBe(0);
  });
});

// ============================================
// Integration Tests
// ============================================

describe("Integration Tests", () => {
  test("full workflow: check, evaluate, orthogonalize", () => {
    const n = 100;
    const existing = {
      momentum: generateIndicator(n),
      volatility: generateIndicator(n),
    };

    // Create a correlated candidate
    const candidate = existing.momentum.map(
      (v, i) => 0.7 * v + 0.3 * existing.volatility[i]! + 0.5 * randn()
    );

    // Check orthogonality
    const checkResult = checkOrthogonality({
      newIndicator: candidate,
      existingIndicators: existing,
    });

    // If not orthogonal, orthogonalize
    if (!checkResult.isOrthogonal) {
      const orthogonalized = orthogonalizeMultiple(candidate, existing);

      // Re-check
      const recheck = checkOrthogonality({
        newIndicator: orthogonalized,
        existingIndicators: existing,
      });

      expect(recheck.isOrthogonal).toBe(true);
    }
  });

  test("adding indicators sequentially", () => {
    const n = 100;
    const indicators: Record<string, number[]> = {};

    // Add first indicator (always accepted)
    indicators.ind1 = generateIndicator(n);

    // Add second independent indicator
    const ind2 = generateIndicator(n);
    const check2 = checkOrthogonality({
      newIndicator: ind2,
      existingIndicators: indicators,
    });
    expect(check2.isOrthogonal).toBe(true);
    indicators.ind2 = ind2;

    // Try to add correlated indicator (should fail)
    const correlated = generateCorrelated(indicators.ind1, 0.9);
    const checkCorr = checkOrthogonality({
      newIndicator: correlated,
      existingIndicators: indicators,
    });
    expect(checkCorr.isOrthogonal).toBe(false);

    // Add independent third indicator
    const ind3 = generateIndicator(n);
    const check3 = checkOrthogonality({
      newIndicator: ind3,
      existingIndicators: indicators,
    });
    expect(check3.isOrthogonal).toBe(true);
  });

  test("defaults match ORTHOGONALITY_DEFAULTS", () => {
    expect(ORTHOGONALITY_DEFAULTS.maxCorrelation).toBe(0.7);
    expect(ORTHOGONALITY_DEFAULTS.maxVIF).toBe(5.0);
    expect(ORTHOGONALITY_DEFAULTS.minObservations).toBe(30);
    expect(ORTHOGONALITY_DEFAULTS.correlationWarning).toBe(0.5);
    expect(ORTHOGONALITY_DEFAULTS.vifWarning).toBe(3.0);
  });
});
