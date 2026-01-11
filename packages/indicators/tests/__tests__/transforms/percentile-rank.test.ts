/**
 * Percentile Rank Transform Tests
 */

import { describe, expect, it } from "bun:test";
import {
  calculateMultiplePercentileRanks,
  calculatePercentileOfValue,
  calculatePercentileRank,
  getPercentileSignal,
  getQuintile,
  getRegimeSignal,
  isExtreme,
  percentileRankRequiredPeriods,
} from "../../../src/transforms/percentileRank.js";
import { generateTimestamps, generateValues } from "./test-fixtures.js";

describe("Percentile Rank Transform", () => {
  describe("calculatePercentileOfValue", () => {
    it("should calculate correct percentile", () => {
      const sample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      expect(calculatePercentileOfValue(5, sample)).toBe(50);
      expect(calculatePercentileOfValue(10, sample)).toBe(100);
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
