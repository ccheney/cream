/**
 * Orthogonalization Tests for Orthogonality Module
 */

import { describe, expect, test } from "bun:test";
import {
  orthogonalize,
  orthogonalizeMultiple,
  pearsonCorrelation,
} from "../../../src/synthesis/orthogonality.js";
import { generateCorrelated, generateIndicator, randn } from "./fixtures.js";

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
