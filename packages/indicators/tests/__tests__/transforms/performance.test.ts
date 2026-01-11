/**
 * Transform Performance Tests
 */

import { describe, expect, it } from "bun:test";
import { calculatePercentileRank } from "../../../src/transforms/percentileRank.js";
import { calculateMultiPeriodReturns } from "../../../src/transforms/returns.js";
import { calculateZScore } from "../../../src/transforms/zscore.js";
import { generateTimestamps, generateValues } from "./test-fixtures.js";

describe("Transform Performance", () => {
  it("should calculate returns for 10k values quickly", () => {
    const values = generateValues(10000);
    const timestamps = generateTimestamps(10000);

    const start = performance.now();
    calculateMultiPeriodReturns(values, timestamps, { periods: [1, 5, 20] });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it("should calculate z-scores for 10k values quickly", () => {
    const values = generateValues(10000);
    const timestamps = generateTimestamps(10000);

    const start = performance.now();
    calculateZScore(values, timestamps, { lookback: 100, minSamples: 20 });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
  });

  it("should calculate percentile ranks for 10k values quickly", () => {
    const values = generateValues(10000);
    const timestamps = generateTimestamps(10000);

    const start = performance.now();
    calculatePercentileRank(values, timestamps, { lookback: 252, minSamples: 50 });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1000);
  });
});
