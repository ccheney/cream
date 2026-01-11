/**
 * Tests for IC decay analysis
 */

import { describe, expect, test } from "bun:test";
import { analyzeICDecay } from "../../../src/synthesis/ic/index.js";
import { createPanelData } from "./fixtures.js";

describe("analyzeICDecay", () => {
  test("finds optimal horizon", () => {
    // Create data where IC peaks at horizon 5
    const { signals, returns } = createPanelData(100, 20);

    const result = analyzeICDecay(signals, returns, [1, 5, 10]);

    expect(result.horizons).toEqual([1, 5, 10]);
    expect(Object.keys(result.icByHorizon)).toHaveLength(3);
    expect(result.optimalHorizon).toBeGreaterThan(0);
    expect(typeof result.optimalIC).toBe("number");
  });

  test("calculates IC for each horizon", () => {
    const { signals, returns } = createPanelData(50, 15, { predictive: true });

    const result = analyzeICDecay(signals, returns, [1, 5]);

    expect(result.icByHorizon["1"]).toBeDefined();
    expect(result.icByHorizon["5"]).toBeDefined();
  });
});
