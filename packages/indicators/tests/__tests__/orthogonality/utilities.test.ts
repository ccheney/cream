/**
 * Utility Function Tests for Orthogonality Module
 */

import { describe, expect, test } from "bun:test";
import {
  checkOrthogonality,
  computeCorrelationMatrix,
  evaluateOrthogonality,
  isIndicatorOrthogonal,
  rankByOrthogonality,
} from "../../../src/synthesis/orthogonality.js";
import { generateCorrelated, generateIndicator, randn } from "./fixtures.js";

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
    const moderate = source.map((v) => 0.5 * v + 0.87 * randn());

    const result = checkOrthogonality({
      newIndicator: moderate,
      existingIndicators: { source },
      maxCorrelation: 0.7,
    });

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

    expect(matrix[0]![0]).toBe(1);
    expect(matrix[1]![1]).toBe(1);
    expect(matrix[2]![2]).toBe(1);

    expect(matrix[0]![1]).toBeCloseTo(matrix[1]![0]!, 10);

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
