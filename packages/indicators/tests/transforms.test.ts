/**
 * Normalization Transforms Tests
 *
 * Comprehensive tests for feature engineering transforms.
 */

import { beforeAll, describe, expect, it } from "bun:test";
// Percentile Rank
import {
  calculateMultiplePercentileRanks,
  calculatePercentileOfValue,
  calculatePercentileRank,
  getPercentileSignal,
  getQuintile,
  getRegimeSignal,
  isExtreme,
  percentileRankRequiredPeriods,
} from "../src/transforms/percentileRank";
// Pipeline
import {
  applyTransforms,
  applyTransformsToIndicators,
  DEFAULT_TRANSFORM_CONFIG,
  getTransformWarmupPeriod,
} from "../src/transforms/pipeline";
// Returns
import {
  calculateMultiPeriodReturns,
  calculateReturns,
  calculateReturnsFromCandles,
  generateReturnOutputNames,
  logReturn,
  RETURNS_DEFAULTS,
  returnsRequiredPeriods,
  simpleReturn,
} from "../src/transforms/returns";
// Volatility Scale
import {
  calculatePositionMultiplier,
  calculateRollingVolatility,
  calculateScaleFactor,
  calculateVolatilityScale,
  getVolatilityRegime,
  VOLATILITY_SCALE_DEFAULTS,
} from "../src/transforms/volatilityScale";
// Z-Score
import {
  calculateMean,
  calculateMultipleZScores,
  calculateStdDev,
  calculateZScore,
  getZScoreSignal,
  isSignificant,
  meanReversionSignal,
  zscoreRequiredPeriods,
} from "../src/transforms/zscore";
import type { Candle } from "../src/types";

// ============================================
// Test Data Generation
// ============================================

function generateValues(count: number, start = 100, drift = 0.001, volatility = 0.02): number[] {
  const values: number[] = [start];

  for (let i = 1; i < count; i++) {
    const change = drift + (Math.random() - 0.5) * 2 * volatility;
    values.push(values[i - 1]! * (1 + change));
  }

  return values;
}

function generateTimestamps(count: number): number[] {
  const timestamps: number[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    timestamps.push(now - (count - i) * 3600000);
  }

  return timestamps;
}

function generateCandles(count: number, startPrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.04;
    price = Math.max(1, price * (1 + change));

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price * 0.998,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 1000000 * (0.5 + Math.random()),
    });
  }

  return candles;
}

// ============================================
// Returns Tests
// ============================================

describe("Returns Transform", () => {
  describe("simpleReturn", () => {
    it("should calculate correct simple return", () => {
      expect(simpleReturn(110, 100)).toBeCloseTo(0.1, 5);
      expect(simpleReturn(90, 100)).toBeCloseTo(-0.1, 5);
      expect(simpleReturn(100, 100)).toBeCloseTo(0, 5);
    });

    it("should handle zero previous price", () => {
      expect(simpleReturn(100, 0)).toBe(0);
    });
  });

  describe("logReturn", () => {
    it("should calculate correct log return", () => {
      expect(logReturn(110, 100)).toBeCloseTo(Math.log(1.1), 5);
      expect(logReturn(90, 100)).toBeCloseTo(Math.log(0.9), 5);
    });

    it("should handle edge cases", () => {
      expect(logReturn(100, 0)).toBe(0);
      expect(logReturn(0, 100)).toBe(0);
    });
  });

  describe("calculateReturns", () => {
    it("should calculate returns for a period", () => {
      const values = [100, 105, 110, 115, 120];
      const timestamps = generateTimestamps(5);

      const results = calculateReturns(values, timestamps, 1);
      expect(results.length).toBe(4);
      expect(results[0]!.return).toBeCloseTo(0.05, 5);
    });

    it("should handle different periods", () => {
      const values = generateValues(50);
      const timestamps = generateTimestamps(50);

      const results1 = calculateReturns(values, timestamps, 1);
      const results5 = calculateReturns(values, timestamps, 5);
      const results20 = calculateReturns(values, timestamps, 20);

      expect(results1.length).toBe(49);
      expect(results5.length).toBe(45);
      expect(results20.length).toBe(30);
    });
  });

  describe("calculateMultiPeriodReturns", () => {
    it("should calculate returns for multiple periods", () => {
      const values = generateValues(50);
      const timestamps = generateTimestamps(50);

      const results = calculateMultiPeriodReturns(values, timestamps, {
        periods: [1, 5, 20],
        logReturns: false,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.returns[1]).toBeDefined();
      expect(results[0]!.returns[5]).toBeDefined();
      expect(results[0]!.returns[20]).toBeDefined();
    });
  });

  describe("calculateReturnsFromCandles", () => {
    it("should calculate returns from candle data", () => {
      const candles = generateCandles(50);

      const results = calculateReturnsFromCandles(candles, RETURNS_DEFAULTS);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("returnsRequiredPeriods", () => {
    it("should return max period + 1", () => {
      expect(returnsRequiredPeriods({ periods: [1, 5, 20], logReturns: false })).toBe(21);
      expect(returnsRequiredPeriods()).toBe(21); // default [1, 5, 20]
    });
  });

  describe("generateReturnOutputNames", () => {
    it("should generate output names with timeframe", () => {
      const names = generateReturnOutputNames([1, 5, 20], "return", "1h");

      expect(names.get(1)).toBe("return_1_1h");
      expect(names.get(5)).toBe("return_5_1h");
      expect(names.get(20)).toBe("return_20_1h");
    });

    it("should generate output names without timeframe", () => {
      const names = generateReturnOutputNames([1, 5], "return");

      expect(names.get(1)).toBe("return_1");
      expect(names.get(5)).toBe("return_5");
    });
  });
});

// ============================================
// Z-Score Tests
// ============================================

describe("Z-Score Transform", () => {
  describe("calculateMean", () => {
    it("should calculate correct mean", () => {
      expect(calculateMean([1, 2, 3, 4, 5])).toBe(3);
      expect(calculateMean([10, 20, 30])).toBe(20);
    });

    it("should handle empty array", () => {
      expect(calculateMean([])).toBe(0);
    });
  });

  describe("calculateStdDev", () => {
    it("should calculate correct standard deviation", () => {
      // [2, 4, 4, 4, 5, 5, 7, 9] has mean=5, stddev=2
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      expect(calculateStdDev(values)).toBeCloseTo(2, 1);
    });

    it("should handle single value", () => {
      expect(calculateStdDev([5])).toBe(0);
    });
  });

  describe("calculateZScore", () => {
    it("should calculate z-scores", () => {
      const values = generateValues(50);
      const timestamps = generateTimestamps(50);

      const results = calculateZScore(values, timestamps, {
        lookback: 20,
        minSamples: 5,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it("should produce bounded z-scores", () => {
      // Create random walk data (more realistic than linear)
      const values = generateValues(100);
      const timestamps = generateTimestamps(100);

      const results = calculateZScore(values, timestamps, {
        lookback: 20,
        minSamples: 5,
      });

      // Z-scores should be bounded (rarely exceed ±3)
      const zscores = results.map((r) => r.zscore);
      const extremeCount = zscores.filter((z) => Math.abs(z) > 4).length;
      expect(extremeCount).toBeLessThan(zscores.length * 0.05); // Less than 5% extreme
    });
  });

  describe("Z-Score signals", () => {
    it("should detect significant values", () => {
      expect(isSignificant(2.5)).toBe(true);
      expect(isSignificant(-2.5)).toBe(true);
      expect(isSignificant(1.5)).toBe(false);
    });

    it("should get correct signal", () => {
      expect(getZScoreSignal(3.5)).toBe("extremely_high");
      expect(getZScoreSignal(2.5)).toBe("high");
      expect(getZScoreSignal(0)).toBe("neutral");
      expect(getZScoreSignal(-2.5)).toBe("low");
      expect(getZScoreSignal(-3.5)).toBe("extremely_low");
    });

    it("should detect mean reversion signals", () => {
      expect(meanReversionSignal(2.5)).toBe("short");
      expect(meanReversionSignal(-2.5)).toBe("long");
      expect(meanReversionSignal(0)).toBeNull();
    });
  });

  describe("calculateMultipleZScores", () => {
    it("should calculate z-scores for multiple inputs", () => {
      const inputsMap = new Map<string, number[]>();
      inputsMap.set("rsi", generateValues(100));
      inputsMap.set("volume", generateValues(100));

      const timestamps = generateTimestamps(100);

      const results = calculateMultipleZScores(inputsMap, timestamps, {
        lookback: 20,
        minSamples: 5,
      });

      expect(results.size).toBe(2);
      expect(results.get("rsi")).toBeDefined();
      expect(results.get("volume")).toBeDefined();
      expect(results.get("rsi")!.length).toBeGreaterThan(0);
    });
  });

  describe("zscoreRequiredPeriods", () => {
    it("should return minSamples from params", () => {
      expect(zscoreRequiredPeriods({ lookback: 20, minSamples: 10 })).toBe(10);
    });

    it("should return default when no params provided", () => {
      expect(zscoreRequiredPeriods()).toBe(5);
    });
  });
});

// ============================================
// Percentile Rank Tests
// ============================================

describe("Percentile Rank Transform", () => {
  describe("calculatePercentileOfValue", () => {
    it("should calculate correct percentile", () => {
      const sample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      // 5 is at 50th percentile (5 values <= 5 out of 10)
      expect(calculatePercentileOfValue(5, sample)).toBe(50);

      // 10 is at 100th percentile
      expect(calculatePercentileOfValue(10, sample)).toBe(100);

      // 1 is at 10th percentile
      expect(calculatePercentileOfValue(1, sample)).toBe(10);
    });

    it("should handle empty sample", () => {
      expect(calculatePercentileOfValue(5, [])).toBe(50);
    });
  });

  describe("calculatePercentileRank", () => {
    it("should calculate percentile ranks", () => {
      const values = generateValues(100);
      const timestamps = generateTimestamps(100);

      const results = calculatePercentileRank(values, timestamps, {
        lookback: 50,
        minSamples: 10,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it("should return values between 0 and 100", () => {
      const values = generateValues(100);
      const timestamps = generateTimestamps(100);

      const results = calculatePercentileRank(values, timestamps, {
        lookback: 50,
        minSamples: 10,
      });

      for (const result of results) {
        expect(result.percentile).toBeGreaterThanOrEqual(0);
        expect(result.percentile).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("Percentile signals", () => {
    it("should get correct quintile", () => {
      expect(getQuintile(10)).toBe(0);
      expect(getQuintile(30)).toBe(1);
      expect(getQuintile(50)).toBe(2);
      expect(getQuintile(70)).toBe(3);
      expect(getQuintile(90)).toBe(4);
    });

    it("should get correct signal", () => {
      expect(getPercentileSignal(5)).toBe("extreme_low");
      expect(getPercentileSignal(20)).toBe("low");
      expect(getPercentileSignal(50)).toBe("neutral");
      expect(getPercentileSignal(80)).toBe("high");
      expect(getPercentileSignal(95)).toBe("extreme_high");
    });

    it("should detect extreme values", () => {
      expect(isExtreme(5)).toBe(true);
      expect(isExtreme(95)).toBe(true);
      expect(isExtreme(50)).toBe(false);
    });

    it("should get correct regime signal", () => {
      expect(getRegimeSignal(5)).toBe("very_low");
      expect(getRegimeSignal(25)).toBe("low");
      expect(getRegimeSignal(50)).toBe("normal");
      expect(getRegimeSignal(75)).toBe("high");
      expect(getRegimeSignal(95)).toBe("very_high");
    });
  });

  describe("calculateMultiplePercentileRanks", () => {
    it("should calculate percentile ranks for multiple inputs", () => {
      const inputsMap = new Map<string, number[]>();
      inputsMap.set("rsi", generateValues(100));
      inputsMap.set("volume", generateValues(100));

      const timestamps = generateTimestamps(100);

      const results = calculateMultiplePercentileRanks(inputsMap, timestamps, {
        lookback: 50,
        minSamples: 10,
      });

      expect(results.size).toBe(2);
      expect(results.get("rsi")).toBeDefined();
      expect(results.get("volume")).toBeDefined();
      expect(results.get("rsi")!.length).toBeGreaterThan(0);
    });
  });

  describe("percentileRankRequiredPeriods", () => {
    it("should return minSamples from params", () => {
      expect(percentileRankRequiredPeriods({ lookback: 50, minSamples: 20 })).toBe(20);
    });

    it("should return default when no params provided", () => {
      expect(percentileRankRequiredPeriods()).toBe(10);
    });
  });
});

// ============================================
// Volatility Scale Tests
// ============================================

describe("Volatility Scale Transform", () => {
  describe("calculateRollingVolatility", () => {
    it("should calculate rolling volatility", () => {
      const _returns = generateValues(50)
        .slice(1)
        .map((v, i, _arr) => (i === 0 ? 0 : (v - generateValues(50)[i]!) / generateValues(50)[i]!));

      // Generate actual returns
      const prices = generateValues(50);
      const actualReturns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        actualReturns.push(simpleReturn(prices[i]!, prices[i - 1]!));
      }

      const volatilities = calculateRollingVolatility(actualReturns, 20);
      expect(volatilities.length).toBe(actualReturns.length - 19);

      for (const vol of volatilities) {
        expect(vol).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("calculateScaleFactor", () => {
    it("should calculate correct scale factor", () => {
      // If current vol = target vol, scale factor = 1
      expect(calculateScaleFactor(0.15, 0.15)).toBeCloseTo(1, 5);

      // If current vol < target vol, scale factor > 1
      expect(calculateScaleFactor(0.1, 0.15)).toBeCloseTo(1.5, 5);

      // If current vol > target vol, scale factor < 1
      expect(calculateScaleFactor(0.3, 0.15)).toBeCloseTo(0.5, 5);
    });

    it("should apply min volatility floor", () => {
      // Very low volatility should hit floor
      // Without max cap, it would be 15 (0.15 / 0.01)
      // With default maxScaleFactor of 3.0, it's capped
      const scaleFactor = calculateScaleFactor(0.001, 0.15, 0.01, 3.0);
      expect(scaleFactor).toBe(3.0); // Capped at max

      // Without max cap, we get full scale
      const uncappedScale = calculateScaleFactor(0.001, 0.15, 0.01, 100);
      expect(uncappedScale).toBe(15); // 0.15 / 0.01
    });

    it("should cap scale factor", () => {
      const scaleFactor = calculateScaleFactor(0.01, 0.15, 0.01, 3.0);
      expect(scaleFactor).toBe(3.0); // Capped at max
    });
  });

  describe("calculateVolatilityScale", () => {
    it("should calculate volatility-scaled values", () => {
      const prices = generateValues(50);
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push(simpleReturn(prices[i]!, prices[i - 1]!));
      }
      const timestamps = generateTimestamps(50);

      const results = calculateVolatilityScale(
        prices.slice(1),
        returns,
        timestamps.slice(1),
        VOLATILITY_SCALE_DEFAULTS
      );

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.scaleFactor).toBeGreaterThan(0);
        expect(result.volatility).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Volatility regime", () => {
    it("should detect correct regime", () => {
      expect(getVolatilityRegime(0.05, 0.15)).toBe("very_low");
      expect(getVolatilityRegime(0.1, 0.15)).toBe("low");
      expect(getVolatilityRegime(0.15, 0.15)).toBe("normal");
      expect(getVolatilityRegime(0.25, 0.15)).toBe("high");
      expect(getVolatilityRegime(0.4, 0.15)).toBe("very_high");
    });

    it("should calculate position multiplier", () => {
      // Equal volatility = 1x
      expect(calculatePositionMultiplier(0.15, 0.15)).toBeCloseTo(1, 5);

      // Lower volatility = higher multiplier (up to max)
      expect(calculatePositionMultiplier(0.075, 0.15)).toBeCloseTo(2, 5);

      // Higher volatility = lower multiplier (down to min)
      expect(calculatePositionMultiplier(0.3, 0.15)).toBeCloseTo(0.5, 5);
    });
  });
});

// ============================================
// Pipeline Tests
// ============================================

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

      // Should still return a snapshot but some values may be missing
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

      expect(period).toBe(100); // Largest of 20 and 100
    });

    it("should handle all transforms", () => {
      const period = getTransformWarmupPeriod({
        returns: { enabled: true, params: { periods: [1, 5, 20] } },
        zscore: { enabled: true, params: { lookback: 20 } },
        percentileRank: { enabled: true, params: { lookback: 252 } },
        volatilityScale: { enabled: true, params: { volatilityPeriod: 20 } },
      });

      expect(period).toBe(252); // Percentile rank has longest lookback
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
      indicatorValues.set("rsi_14_1h", [50]); // Too few values - no results but no exception

      const timestamps = generateTimestamps(1);

      const output = applyTransformsToIndicators(indicatorValues, timestamps, "1h", {
        zscore: { enabled: true, params: { lookback: 20, minSamples: 5 }, applyTo: ["rsi"] },
      });

      // With insufficient data, results.length === 0, so no value is set
      expect(output.rsi_14_1h_zscore).toBeUndefined();
    });

    it("should handle insufficient data with no output for percentile rank", () => {
      const indicatorValues = new Map<string, number[]>();
      indicatorValues.set("rsi_14_1h", [50]); // Too few values

      const timestamps = generateTimestamps(1);

      const output = applyTransformsToIndicators(indicatorValues, timestamps, "1h", {
        percentileRank: {
          enabled: true,
          params: { lookback: 50, minSamples: 10 },
          applyTo: ["rsi"],
        },
      });

      // With insufficient data, results.length === 0, so no value is set
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

// ============================================
// Z-Score vs Percentile Rank Comparison
// ============================================

describe("Z-Score vs Percentile Rank", () => {
  it("should handle normal data similarly", () => {
    // Generate normal-ish data
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
    // Create data with an outlier
    const values = generateValues(100);
    values[50] = values[50]! * 10; // Add extreme outlier

    const timestamps = generateTimestamps(100);

    const zscores = calculateZScore(values, timestamps, { lookback: 50, minSamples: 10 });
    const percentiles = calculatePercentileRank(values, timestamps, {
      lookback: 50,
      minSamples: 10,
    });

    // Z-score at outlier should be very high
    const outlierZscore = zscores.find((r) => r.timestamp === timestamps[50])?.zscore ?? 0;
    expect(Math.abs(outlierZscore)).toBeGreaterThan(3);

    // Percentile at outlier should be capped at 100
    const outlierPercentile =
      percentiles.find((r) => r.timestamp === timestamps[50])?.percentile ?? 0;
    expect(outlierPercentile).toBeLessThanOrEqual(100);
  });
});

// ============================================
// Performance Tests
// ============================================

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

    expect(elapsed).toBeLessThan(1000); // Percentile rank is O(n*lookback)
  });
});
