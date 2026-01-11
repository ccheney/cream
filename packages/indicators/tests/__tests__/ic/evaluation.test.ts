/**
 * Tests for IC evaluation and significance
 */

import { describe, expect, test } from "bun:test";
import { evaluateIC, isICSignificant } from "../../../src/synthesis/ic/index.js";

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
