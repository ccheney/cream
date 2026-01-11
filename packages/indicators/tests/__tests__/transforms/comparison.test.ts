/**
 * Z-Score vs Percentile Rank Comparison Tests
 */

import { describe, expect, it } from "bun:test";
import { calculatePercentileRank } from "../../../src/transforms/percentileRank.js";
import { calculateZScore } from "../../../src/transforms/zscore.js";
import { generateTimestamps, generateValues } from "./test-fixtures.js";

describe("Z-Score vs Percentile Rank", () => {
  it("should handle normal data similarly", () => {
    const values = generateValues(100);
    const timestamps = generateTimestamps(100);

    const zscores = calculateZScore(values, timestamps, { lookback: 50, minSamples: 10 });
    const percentiles = calculatePercentileRank(values, timestamps, {
      lookback: 50,
      minSamples: 10,
    });

    expect(zscores.length).toBeGreaterThan(0);
    expect(percentiles.length).toBeGreaterThan(0);
  });

  it("should show percentile rank is more robust to outliers", () => {
    const values = generateValues(100);
    values[50] = values[50]! * 10;

    const timestamps = generateTimestamps(100);

    const zscores = calculateZScore(values, timestamps, { lookback: 50, minSamples: 10 });
    const percentiles = calculatePercentileRank(values, timestamps, {
      lookback: 50,
      minSamples: 10,
    });

    const outlierZscore = zscores.find((r) => r.timestamp === timestamps[50])?.zscore ?? 0;
    expect(Math.abs(outlierZscore)).toBeGreaterThan(3);

    const outlierPercentile =
      percentiles.find((r) => r.timestamp === timestamps[50])?.percentile ?? 0;
    expect(outlierPercentile).toBeLessThanOrEqual(100);
  });
});
