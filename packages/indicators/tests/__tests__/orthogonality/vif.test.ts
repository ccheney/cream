/**
 * VIF (Variance Inflation Factor) Tests for Orthogonality Module
 */

import { describe, expect, test } from "bun:test";
import { computeAllVIFs, computeVIF } from "../../../src/synthesis/orthogonality.js";
import { generateIndicator, randn } from "./fixtures.js";

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
    const newInd = generateIndicator(n);

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
    const newInd = ind1.map((v) => 0.7 * v + 0.7 * randn());

    const result = computeVIF(newInd, { ind1 }, { maxVIF: 5, vifWarning: 2 });

    if (result.vif >= 2 && result.vif < 5) {
      expect(result.isWarning).toBe(true);
      expect(result.isAcceptable).toBe(true);
    }
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
    for (const key of Object.keys(vifs)) {
      expect(vifs[key]!.vif).toBeLessThan(3);
    }
  });

  test("detects multicollinearity", () => {
    const n = 100;
    const a = generateIndicator(n);
    const b = generateIndicator(n);
    const c = a.map((v, i) => v + b[i]!);

    const vifs = computeAllVIFs({ a, b, c });

    expect(vifs.c!.vif).toBeGreaterThan(5);
  });
});
