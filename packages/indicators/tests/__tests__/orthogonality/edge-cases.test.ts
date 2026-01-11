/**
 * Edge Cases Tests for Orthogonality Module
 */

import { describe, expect, test } from "bun:test";
import {
  checkOrthogonality,
  computePairwiseCorrelations,
  pearsonCorrelation,
} from "../../../src/synthesis/orthogonality.js";
import { generateIndicator } from "./fixtures.js";

describe("Edge Cases", () => {
  test("handles indicators with NaN values", () => {
    const n = 100;
    const withNaN = generateIndicator(n);
    withNaN[10] = Number.NaN;
    withNaN[20] = Number.NaN;
    const clean = generateIndicator(n);

    const results = computePairwiseCorrelations(withNaN, { clean });

    expect(results[0]!.nObservations).toBeLessThan(n);
  });

  test("handles indicators with Infinity values", () => {
    const n = 100;
    const withInf = generateIndicator(n);
    withInf[5] = Number.POSITIVE_INFINITY;
    withInf[15] = Number.NEGATIVE_INFINITY;
    const clean = generateIndicator(n);

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
