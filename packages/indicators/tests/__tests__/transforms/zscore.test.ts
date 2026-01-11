/**
 * Z-Score Transform Tests
 */

import { describe, expect, it } from "bun:test";
import {
  calculateMean,
  calculateMultipleZScores,
  calculateStdDev,
  calculateZScore,
  getZScoreSignal,
  isSignificant,
  meanReversionSignal,
  zscoreRequiredPeriods,
} from "../../../src/transforms/zscore.js";
import { generateTimestamps, generateValues } from "./test-fixtures.js";

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
      const values = generateValues(100);
      const timestamps = generateTimestamps(100);

      const results = calculateZScore(values, timestamps, {
        lookback: 20,
        minSamples: 5,
      });

      const zscores = results.map((r) => r.zscore);
      const extremeCount = zscores.filter((z) => Math.abs(z) > 4).length;
      expect(extremeCount).toBeLessThan(zscores.length * 0.05);
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
