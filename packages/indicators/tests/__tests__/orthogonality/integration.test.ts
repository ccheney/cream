/**
 * Integration Tests for Orthogonality Module
 */

import { describe, expect, test } from "bun:test";
import {
  checkOrthogonality,
  ORTHOGONALITY_DEFAULTS,
  orthogonalizeMultiple,
} from "../../../src/synthesis/orthogonality.js";
import { generateCorrelated, generateIndicator, randn } from "./fixtures.js";

describe("Integration Tests", () => {
  test("full workflow: check, evaluate, orthogonalize", () => {
    const n = 100;
    const existing = {
      momentum: generateIndicator(n),
      volatility: generateIndicator(n),
    };

    const candidate = existing.momentum.map(
      (v, i) => 0.7 * v + 0.3 * existing.volatility[i]! + 0.5 * randn()
    );

    const checkResult = checkOrthogonality({
      newIndicator: candidate,
      existingIndicators: existing,
    });

    if (!checkResult.isOrthogonal) {
      const orthogonalized = orthogonalizeMultiple(candidate, existing);

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

    indicators.ind1 = generateIndicator(n);

    const ind2 = generateIndicator(n);
    const check2 = checkOrthogonality({
      newIndicator: ind2,
      existingIndicators: indicators,
    });
    expect(check2.isOrthogonal).toBe(true);
    indicators.ind2 = ind2;

    const correlated = generateCorrelated(indicators.ind1, 0.9);
    const checkCorr = checkOrthogonality({
      newIndicator: correlated,
      existingIndicators: indicators,
    });
    expect(checkCorr.isOrthogonal).toBe(false);

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
