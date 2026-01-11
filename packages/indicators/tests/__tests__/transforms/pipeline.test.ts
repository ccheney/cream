/**
 * Transform Pipeline Tests
 */

import { beforeAll, describe, expect, it } from "bun:test";
import {
  applyTransforms,
  applyTransformsToIndicators,
  DEFAULT_TRANSFORM_CONFIG,
  getTransformWarmupPeriod,
} from "../../../src/transforms/pipeline.js";
import type { Candle } from "../../../src/types.js";
import { generateCandles, generateTimestamps, generateValues } from "./test-fixtures.js";

describe("Transform Pipeline", () => {
  let candles: Candle[];

  beforeAll(() => {
    candles = generateCandles(100);
  });

  describe("applyTransforms", () => {
    it("should apply all enabled transforms", () => {
      const snapshot = applyTransforms(candles, "1h", DEFAULT_TRANSFORM_CONFIG);

      expect(snapshot).not.toBeNull();
      expect(snapshot!.values).toBeDefined();
    });

    it("should calculate returns", () => {
      const snapshot = applyTransforms(candles, "1h", {
        returns: { enabled: true, params: { periods: [1, 5, 20] } },
      });

      expect(snapshot!.values.return_1_1h).toBeDefined();
      expect(snapshot!.values.return_5_1h).toBeDefined();
      expect(snapshot!.values.return_20_1h).toBeDefined();
    });

    it("should calculate z-scores", () => {
      const snapshot = applyTransforms(candles, "1h", {
        zscore: { enabled: true, params: { lookback: 20 }, applyTo: ["close"] },
      });

      expect(snapshot!.values.close_zscore_1h).toBeDefined();
    });

    it("should handle empty candles", () => {
      const snapshot = applyTransforms([], "1h");
      expect(snapshot).toBeNull();
    });

    it("should calculate percentile ranks", () => {
      const snapshot = applyTransforms(candles, "1h", {
        percentileRank: { enabled: true, params: { lookback: 50, minSamples: 10 } },
      });

      expect(snapshot).not.toBeNull();
      expect(snapshot!.values.close_pct_1h).toBeDefined();
    });

    it("should calculate volatility scale", () => {
      const snapshot = applyTransforms(candles, "1h", {
        volatilityScale: {
          enabled: true,
          params: { volatilityPeriod: 20, targetVolatility: 0.15 },
        },
      });

      expect(snapshot).not.toBeNull();
      expect(snapshot!.values.close_volscale_1h).toBeDefined();
      expect(snapshot!.values.volatility_1h).toBeDefined();
      expect(snapshot!.values.scale_factor_1h).toBeDefined();
    });

    it("should handle insufficient data for returns gracefully", () => {
      const shortCandles = generateCandles(2);
      const snapshot = applyTransforms(shortCandles, "1h", {
        returns: { enabled: true, params: { periods: [1, 5, 20] } },
      });

      expect(snapshot).not.toBeNull();
    });

    it("should handle insufficient data for zscore gracefully", () => {
      const shortCandles = generateCandles(3);
      const snapshot = applyTransforms(shortCandles, "1h", {
        zscore: { enabled: true, params: { lookback: 20, minSamples: 5 }, applyTo: ["close"] },
      });

      expect(snapshot).not.toBeNull();
    });

    it("should handle insufficient data for percentile rank gracefully", () => {
      const shortCandles = generateCandles(3);
      const snapshot = applyTransforms(shortCandles, "1h", {
        percentileRank: { enabled: true, params: { lookback: 50, minSamples: 10 } },
      });

      expect(snapshot).not.toBeNull();
    });

    it("should handle insufficient data for volatility scale gracefully", () => {
      const shortCandles = generateCandles(5);
      const snapshot = applyTransforms(shortCandles, "1h", {
        volatilityScale: {
          enabled: true,
          params: { volatilityPeriod: 20 },
        },
      });

      expect(snapshot).not.toBeNull();
    });
  });

  describe("getTransformWarmupPeriod", () => {
    it("should return correct warmup period", () => {
      const period = getTransformWarmupPeriod({
        returns: { enabled: true, params: { periods: [1, 5, 20] } },
        zscore: { enabled: true, params: { lookback: 100 } },
      });

      expect(period).toBe(100);
    });

    it("should handle all transforms", () => {
      const period = getTransformWarmupPeriod({
        returns: { enabled: true, params: { periods: [1, 5, 20] } },
        zscore: { enabled: true, params: { lookback: 20 } },
        percentileRank: { enabled: true, params: { lookback: 252 } },
        volatilityScale: { enabled: true, params: { volatilityPeriod: 20 } },
      });

      expect(period).toBe(252);
    });
  });

  describe("applyTransformsToIndicators", () => {
    it("should apply z-scores to matching indicator values", () => {
      const indicatorValues = new Map<string, number[]>();
      indicatorValues.set("rsi_14_1h", generateValues(100));
      indicatorValues.set("stochastic_k_1h", generateValues(100));

      const timestamps = generateTimestamps(100);

      const output = applyTransformsToIndicators(indicatorValues, timestamps, "1h", {
        zscore: { enabled: true, params: { lookback: 20, minSamples: 5 }, applyTo: ["rsi"] },
      });

      expect(output.rsi_14_1h_zscore).toBeDefined();
    });

    it("should apply percentile ranks to matching indicator values", () => {
      const indicatorValues = new Map<string, number[]>();
      indicatorValues.set("rsi_14_1h", generateValues(100));
      indicatorValues.set("volume_ratio_1h", generateValues(100));

      const timestamps = generateTimestamps(100);

      const output = applyTransformsToIndicators(indicatorValues, timestamps, "1h", {
        percentileRank: {
          enabled: true,
          params: { lookback: 50, minSamples: 10 },
          applyTo: ["rsi", "volume"],
        },
      });

      expect(output.rsi_14_1h_pct).toBeDefined();
      expect(output.volume_ratio_1h_pct).toBeDefined();
    });

    it("should handle insufficient data with no output for zscore", () => {
      const indicatorValues = new Map<string, number[]>();
      indicatorValues.set("rsi_14_1h", [50]);

      const timestamps = generateTimestamps(1);

      const output = applyTransformsToIndicators(indicatorValues, timestamps, "1h", {
        zscore: { enabled: true, params: { lookback: 20, minSamples: 5 }, applyTo: ["rsi"] },
      });

      expect(output.rsi_14_1h_zscore).toBeUndefined();
    });

    it("should handle insufficient data with no output for percentile rank", () => {
      const indicatorValues = new Map<string, number[]>();
      indicatorValues.set("rsi_14_1h", [50]);

      const timestamps = generateTimestamps(1);

      const output = applyTransformsToIndicators(indicatorValues, timestamps, "1h", {
        percentileRank: {
          enabled: true,
          params: { lookback: 50, minSamples: 10 },
          applyTo: ["rsi"],
        },
      });

      expect(output.rsi_14_1h_pct).toBeUndefined();
    });

    it("should return empty output when no transforms enabled", () => {
      const indicatorValues = new Map<string, number[]>();
      indicatorValues.set("rsi_14_1h", generateValues(100));

      const timestamps = generateTimestamps(100);

      const output = applyTransformsToIndicators(indicatorValues, timestamps, "1h", {});

      expect(Object.keys(output).length).toBe(0);
    });
  });
});
