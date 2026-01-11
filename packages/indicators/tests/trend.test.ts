/**
 * Trend Indicator Tests
 *
 * Tests for SMA, EMA, and MACD calculations.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import {
  calculateEMA,
  calculateMACD,
  calculateMultipleEMAs,
  calculateMultiplier,
  emaRequiredPeriods,
} from "../src/trend/ema.js";
import {
  calculateMultipleSMAs,
  calculateSMA,
  isDeathCross,
  isGoldenCross,
} from "../src/trend/sma.js";
import type { Candle } from "../src/types.js";
import { generateCandles, generateUptrend } from "./test-utils.js";

describe("SMA (Simple Moving Average)", () => {
  let candles: Candle[];

  beforeAll(() => {
    candles = generateCandles(250);
  });

  describe("calculateSMA", () => {
    it("should calculate SMA values", () => {
      const results = calculateSMA(candles, { period: 20 });
      expect(results.length).toBeGreaterThan(0);
    });

    it("should return correct number of results", () => {
      const results = calculateSMA(candles, { period: 20 });
      expect(results.length).toBe(candles.length - 20 + 1);
    });

    it("should calculate correct SMA for simple case", () => {
      const simpleCandles: Candle[] = [
        { timestamp: 1, open: 10, high: 11, low: 9, close: 10, volume: 100 },
        { timestamp: 2, open: 10, high: 11, low: 9, close: 20, volume: 100 },
        { timestamp: 3, open: 10, high: 11, low: 9, close: 30, volume: 100 },
      ];
      const results = calculateSMA(simpleCandles, { period: 3 });
      expect(results[0]!.ma).toBe(20); // (10 + 20 + 30) / 3
    });
  });

  describe("calculateMultipleSMAs", () => {
    it("should calculate multiple SMAs", () => {
      const results = calculateMultipleSMAs(candles, [20, 50, 200]);
      expect(results.size).toBe(3);
      expect(results.has(20)).toBe(true);
      expect(results.has(50)).toBe(true);
      expect(results.has(200)).toBe(true);
    });

    it("should skip periods with insufficient data", () => {
      const shortCandles = generateCandles(30);
      const results = calculateMultipleSMAs(shortCandles, [20, 50, 200]);
      expect(results.has(20)).toBe(true);
      expect(results.has(50)).toBe(false);
      expect(results.has(200)).toBe(false);
    });
  });

  describe("Golden/Death Cross", () => {
    it("should detect golden cross", () => {
      expect(isGoldenCross(48, 50, 52, 50)).toBe(true);
      expect(isGoldenCross(52, 50, 53, 50)).toBe(false);
    });

    it("should detect death cross", () => {
      expect(isDeathCross(52, 50, 48, 50)).toBe(true);
      expect(isDeathCross(48, 50, 47, 50)).toBe(false);
    });
  });
});

describe("EMA (Exponential Moving Average)", () => {
  let candles: Candle[];

  beforeAll(() => {
    candles = generateCandles(100);
  });

  describe("calculateMultiplier", () => {
    it("should calculate correct multiplier", () => {
      expect(calculateMultiplier(9)).toBeCloseTo(0.2, 5);
      expect(calculateMultiplier(12)).toBeCloseTo(2 / 13, 5);
      expect(calculateMultiplier(26)).toBeCloseTo(2 / 27, 5);
    });
  });

  describe("calculateEMA", () => {
    it("should calculate EMA values", () => {
      const results = calculateEMA(candles, { period: 21 });
      expect(results.length).toBeGreaterThan(0);
    });

    it("should be more responsive than SMA", () => {
      const uptrendCandles = generateUptrend(50);
      const ema = calculateEMA(uptrendCandles, { period: 20 });
      const sma = calculateSMA(uptrendCandles, { period: 20 });

      const lastEma = ema[ema.length - 1]!.ma;
      const lastSma = sma[sma.length - 1]!.ma;
      const lastClose = uptrendCandles[uptrendCandles.length - 1]!.close;

      expect(Math.abs(lastEma - lastClose)).toBeLessThan(Math.abs(lastSma - lastClose));
    });
  });

  describe("calculateMACD", () => {
    it("should calculate MACD values", () => {
      const results = calculateMACD(candles);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should have correct MACD values", () => {
      const results = calculateMACD(candles, 12, 26);
      for (const result of results) {
        expect(typeof result.macd).toBe("number");
        expect(result.timestamp).toBeGreaterThan(0);
      }
    });
  });

  describe("emaRequiredPeriods", () => {
    it("should return period from params", () => {
      expect(emaRequiredPeriods({ period: 21 })).toBe(21);
      expect(emaRequiredPeriods({ period: 9 })).toBe(9);
    });

    it("should use default period", () => {
      expect(emaRequiredPeriods()).toBe(21);
    });
  });

  describe("calculateMultipleEMAs", () => {
    it("should calculate multiple EMAs", () => {
      const results = calculateMultipleEMAs(candles, [9, 21, 50]);
      expect(results.size).toBe(3);
      expect(results.has(9)).toBe(true);
      expect(results.has(21)).toBe(true);
      expect(results.has(50)).toBe(true);
    });

    it("should skip periods with insufficient data", () => {
      const shortCandles = generateCandles(30);
      const results = calculateMultipleEMAs(shortCandles, [9, 21, 50, 100]);
      expect(results.has(9)).toBe(true);
      expect(results.has(21)).toBe(true);
      expect(results.has(50)).toBe(false);
      expect(results.has(100)).toBe(false);
    });

    it("should return correct EMA values for each period", () => {
      const results = calculateMultipleEMAs(candles, [9, 21]);
      const ema9 = results.get(9);
      const ema21 = results.get(21);
      expect(ema9).toBeDefined();
      expect(ema21).toBeDefined();
      expect(ema9!.length).toBeGreaterThan(ema21!.length); // 9 period starts earlier
    });
  });
});
