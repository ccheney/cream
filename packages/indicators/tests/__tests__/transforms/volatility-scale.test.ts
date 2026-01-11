/**
 * Volatility Scale Transform Tests
 */

import { describe, expect, it } from "bun:test";
import { simpleReturn } from "../../../src/transforms/returns.js";
import {
  calculateMultipleVolatilityScales,
  calculatePositionMultiplier,
  calculateRollingVolatility,
  calculateScaleFactor,
  calculateVolatilityScale,
  getVolatilityRegime,
  VOLATILITY_SCALE_DEFAULTS,
  volatilityScaleRequiredPeriods,
} from "../../../src/transforms/volatilityScale.js";
import { generateReturnsFromPrices, generateTimestamps, generateValues } from "./test-fixtures.js";

describe("Volatility Scale Transform", () => {
  describe("calculateRollingVolatility", () => {
    it("should calculate rolling volatility", () => {
      const prices = generateValues(50);
      const actualReturns = generateReturnsFromPrices(prices);

      const volatilities = calculateRollingVolatility(actualReturns, 20);
      expect(volatilities.length).toBe(actualReturns.length - 19);

      for (const vol of volatilities) {
        expect(vol).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("calculateScaleFactor", () => {
    it("should calculate correct scale factor", () => {
      expect(calculateScaleFactor(0.15, 0.15)).toBeCloseTo(1, 5);
      expect(calculateScaleFactor(0.1, 0.15)).toBeCloseTo(1.5, 5);
      expect(calculateScaleFactor(0.3, 0.15)).toBeCloseTo(0.5, 5);
    });

    it("should apply min volatility floor", () => {
      const scaleFactor = calculateScaleFactor(0.001, 0.15, 0.01, 3.0);
      expect(scaleFactor).toBe(3.0);

      const uncappedScale = calculateScaleFactor(0.001, 0.15, 0.01, 100);
      expect(uncappedScale).toBe(15);
    });

    it("should cap scale factor", () => {
      const scaleFactor = calculateScaleFactor(0.01, 0.15, 0.01, 3.0);
      expect(scaleFactor).toBe(3.0);
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
      expect(calculatePositionMultiplier(0.15, 0.15)).toBeCloseTo(1, 5);
      expect(calculatePositionMultiplier(0.075, 0.15)).toBeCloseTo(2, 5);
      expect(calculatePositionMultiplier(0.3, 0.15)).toBeCloseTo(0.5, 5);
    });

    it("should return 1.0 when current volatility is zero or negative", () => {
      expect(calculatePositionMultiplier(0, 0.15)).toBe(1.0);
      expect(calculatePositionMultiplier(-0.1, 0.15)).toBe(1.0);
    });

    it("should respect min and max multiplier bounds", () => {
      expect(calculatePositionMultiplier(1.0, 0.15, 0.25, 2.0)).toBe(0.25);
      expect(calculatePositionMultiplier(0.05, 0.15, 0.25, 2.0)).toBe(2.0);
    });
  });

  describe("volatilityScaleRequiredPeriods", () => {
    it("should return volatility period from params", () => {
      expect(volatilityScaleRequiredPeriods({ volatilityPeriod: 20, targetVolatility: 0.15 })).toBe(
        20
      );
      expect(volatilityScaleRequiredPeriods({ volatilityPeriod: 50, targetVolatility: 0.2 })).toBe(
        50
      );
    });

    it("should use default parameters", () => {
      expect(volatilityScaleRequiredPeriods()).toBe(20);
    });
  });

  describe("calculateMultipleVolatilityScales", () => {
    it("should calculate volatility scales for multiple inputs", () => {
      const prices = generateValues(50);
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push(simpleReturn(prices[i]!, prices[i - 1]!));
      }
      const timestamps = generateTimestamps(50);

      const inputsMap = new Map<string, number[]>();
      inputsMap.set("rsi", generateValues(49));
      inputsMap.set("volume", generateValues(49));

      const results = calculateMultipleVolatilityScales(
        inputsMap,
        returns,
        timestamps.slice(1),
        VOLATILITY_SCALE_DEFAULTS
      );

      expect(results.size).toBe(2);
      expect(results.has("rsi")).toBe(true);
      expect(results.has("volume")).toBe(true);
      expect(results.get("rsi")!.length).toBeGreaterThan(0);
      expect(results.get("volume")!.length).toBeGreaterThan(0);
    });

    it("should return empty results when insufficient data", () => {
      const inputsMap = new Map<string, number[]>();
      inputsMap.set("rsi", generateValues(10));

      const results = calculateMultipleVolatilityScales(
        inputsMap,
        generateValues(5),
        generateTimestamps(10),
        { volatilityPeriod: 20, targetVolatility: 0.15 }
      );

      expect(results.get("rsi")!.length).toBe(0);
    });
  });
});
