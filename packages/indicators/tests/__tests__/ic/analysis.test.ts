/**
 * Tests for full IC analysis
 */

import { describe, expect, test } from "bun:test";
import { analyzeIC } from "../../../src/synthesis/ic/index.js";
import { createPanelData } from "./fixtures.js";

describe("analyzeIC", () => {
  test("performs complete IC analysis", () => {
    const nTime = 50;
    const nAssets = 15;
    const { signals, returns: forwardReturns } = createPanelData(nTime, nAssets, {
      predictive: true,
    });

    const result = analyzeIC(signals, forwardReturns);

    expect(result.stats).toBeDefined();
    expect(result.icSeries).toHaveLength(nTime);
    expect(result.decay).toBeUndefined(); // Not requested
  });

  test("includes decay analysis when requested", () => {
    const nTime = 50;
    const nAssets = 15;
    const { signals, returns } = createPanelData(nTime, nAssets);

    const result = analyzeIC(signals, returns, {
      includeDecay: true,
      returns,
      horizons: [1, 5, 10],
    });

    expect(result.decay).toBeDefined();
    expect(result.decay?.horizons).toEqual([1, 5, 10]);
  });
});
