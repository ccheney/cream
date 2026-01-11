/**
 * Momentum Indicator Tests
 *
 * Tests for RSI and Stochastic Oscillator calculations.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import {
  calculateRSI,
  isOverbought,
  isOversold,
  RSI_DEFAULTS,
  rsiRequiredPeriods,
} from "../src/momentum/rsi.js";
import {
  calculateStochastic,
  isBearishCrossover,
  isBullishCrossover,
  stochasticRequiredPeriods,
} from "../src/momentum/stochastic.js";
import type { Candle } from "../src/types.js";
import { generateCandles } from "./test-utils.js";

describe("RSI (Relative Strength Index)", () => {
  let candles: Candle[];

  beforeAll(() => {
    candles = generateCandles(100);
  });

  describe("calculateRSI", () => {
    it("should calculate RSI values", () => {
      const results = calculateRSI(candles);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should return values between 0 and 100", () => {
      const results = calculateRSI(candles);
      for (const result of results) {
        expect(result.rsi).toBeGreaterThanOrEqual(0);
        expect(result.rsi).toBeLessThanOrEqual(100);
      }
    });

    it("should respect custom period", () => {
      const results = calculateRSI(candles, { period: 7 });
      expect(results.length).toBeGreaterThan(0);
    });

    it("should throw with insufficient data", () => {
      const shortCandles = generateCandles(10);
      expect(() => calculateRSI(shortCandles, { period: 14 })).toThrow();
    });

    it("should include timestamps", () => {
      const results = calculateRSI(candles);
      for (const result of results) {
        expect(result.timestamp).toBeGreaterThan(0);
      }
    });
  });

  describe("rsiRequiredPeriods", () => {
    it("should return period + 1", () => {
      expect(rsiRequiredPeriods({ period: 14 })).toBe(15);
      expect(rsiRequiredPeriods({ period: 7 })).toBe(8);
    });

    it("should use default period", () => {
      expect(rsiRequiredPeriods()).toBe(RSI_DEFAULTS.period + 1);
    });
  });

  describe("Overbought/Oversold", () => {
    it("should detect overbought", () => {
      expect(isOverbought(75)).toBe(true);
      expect(isOverbought(65)).toBe(false);
    });

    it("should detect oversold", () => {
      expect(isOversold(25)).toBe(true);
      expect(isOversold(35)).toBe(false);
    });

    it("should respect custom thresholds", () => {
      expect(isOverbought(75, 80)).toBe(false);
      expect(isOversold(25, 20)).toBe(false);
    });
  });
});

describe("Stochastic Oscillator", () => {
  let candles: Candle[];

  beforeAll(() => {
    candles = generateCandles(100);
  });

  describe("calculateStochastic", () => {
    it("should calculate Stochastic values", () => {
      const results = calculateStochastic(candles);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should return %K and %D between 0 and 100", () => {
      const results = calculateStochastic(candles);
      for (const result of results) {
        expect(result.k).toBeGreaterThanOrEqual(0);
        expect(result.k).toBeLessThanOrEqual(100);
        expect(result.d).toBeGreaterThanOrEqual(0);
        expect(result.d).toBeLessThanOrEqual(100);
      }
    });

    it("should calculate fast stochastic", () => {
      const results = calculateStochastic(candles, {
        kPeriod: 14,
        dPeriod: 3,
        slow: false,
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it("should throw with insufficient data", () => {
      const shortCandles = generateCandles(10);
      expect(() => calculateStochastic(shortCandles)).toThrow();
    });
  });

  describe("stochasticRequiredPeriods", () => {
    it("should calculate correct periods for slow stochastic", () => {
      const required = stochasticRequiredPeriods({
        kPeriod: 14,
        dPeriod: 3,
        slow: true,
      });
      expect(required).toBe(14 + 3 - 1 + 3 - 1);
    });

    it("should calculate correct periods for fast stochastic", () => {
      const required = stochasticRequiredPeriods({
        kPeriod: 14,
        dPeriod: 3,
        slow: false,
      });
      expect(required).toBe(14 + 3 - 1);
    });
  });

  describe("Crossover detection", () => {
    it("should detect bullish crossover", () => {
      expect(isBullishCrossover(20, 25, 26, 25)).toBe(true);
      expect(isBullishCrossover(30, 25, 26, 25)).toBe(false);
    });

    it("should detect bearish crossover", () => {
      expect(isBearishCrossover(30, 25, 24, 25)).toBe(true);
      expect(isBearishCrossover(20, 25, 24, 25)).toBe(false);
    });
  });
});
