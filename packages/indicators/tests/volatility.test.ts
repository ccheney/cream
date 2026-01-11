/**
 * Volatility Indicator Tests
 *
 * Tests for ATR and Bollinger Bands calculations.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import type { Candle } from "../src/types.js";
import {
  calculateATR,
  calculateATRPositionSize,
  calculateATRStop,
  calculateTrueRange,
} from "../src/volatility/atr.js";
import {
  calculateBollingerBands,
  getBollingerSignal,
  isBollingerSqueeze,
  isTouchingLowerBand,
  isTouchingUpperBand,
} from "../src/volatility/bollinger.js";
import { generateCandles } from "./test-utils.js";

describe("ATR (Average True Range)", () => {
  let candles: Candle[];

  beforeAll(() => {
    candles = generateCandles(100);
  });

  describe("calculateTrueRange", () => {
    it("should calculate true range correctly", () => {
      const candle: Candle = {
        timestamp: 1,
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
      };
      const prevClose = 98;

      const tr = calculateTrueRange(candle, prevClose);
      // TR = max(H-L, |H-PC|, |L-PC|) = max(10, 7, 3) = 10
      expect(tr).toBe(10);
    });

    it("should handle gap up", () => {
      const candle: Candle = {
        timestamp: 1,
        open: 110,
        high: 115,
        low: 108,
        close: 112,
        volume: 1000,
      };
      const prevClose = 100;

      const tr = calculateTrueRange(candle, prevClose);
      // TR = max(H-L, |H-PC|, |L-PC|) = max(7, 15, 8) = 15
      expect(tr).toBe(15);
    });
  });

  describe("calculateATR", () => {
    it("should calculate ATR values", () => {
      const results = calculateATR(candles);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should return positive values", () => {
      const results = calculateATR(candles);
      for (const result of results) {
        expect(result.atr).toBeGreaterThan(0);
      }
    });
  });

  describe("ATR-based calculations", () => {
    it("should calculate ATR stop distance", () => {
      const stop = calculateATRStop(2.5, 2.0);
      expect(stop).toBe(5.0);
    });

    it("should calculate position size", () => {
      const size = calculateATRPositionSize(100000, 0.01, 2.5, 2.0, 50);
      // Risk = 100000 * 0.01 = 1000
      // Stop = 2.5 * 2 = 5
      // Size = 1000 / 5 = 200
      expect(size).toBe(200);
    });
  });
});

describe("Bollinger Bands", () => {
  let candles: Candle[];

  beforeAll(() => {
    candles = generateCandles(100);
  });

  describe("calculateBollingerBands", () => {
    it("should calculate Bollinger Bands", () => {
      const results = calculateBollingerBands(candles);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should have upper > middle > lower", () => {
      const results = calculateBollingerBands(candles);
      for (const result of results) {
        expect(result.upper).toBeGreaterThan(result.middle);
        expect(result.middle).toBeGreaterThan(result.lower);
      }
    });

    it("should calculate bandwidth correctly", () => {
      const results = calculateBollingerBands(candles);
      for (const result of results) {
        const expectedBandwidth = ((result.upper - result.lower) / result.middle) * 100;
        expect(result.bandwidth).toBeCloseTo(expectedBandwidth, 5);
      }
    });

    it("should calculate %B correctly", () => {
      const results = calculateBollingerBands(candles);
      for (const result of results) {
        expect(typeof result.percentB).toBe("number");
      }
    });
  });

  describe("Band signals", () => {
    it("should detect touching upper band", () => {
      expect(isTouchingUpperBand(105, 100)).toBe(true);
      expect(isTouchingUpperBand(95, 100)).toBe(false);
    });

    it("should detect touching lower band", () => {
      expect(isTouchingLowerBand(95, 100)).toBe(true);
      expect(isTouchingLowerBand(105, 100)).toBe(false);
    });

    it("should detect squeeze", () => {
      expect(isBollingerSqueeze(3.0)).toBe(true);
      expect(isBollingerSqueeze(5.0)).toBe(false);
    });

    it("should get correct signal from %B", () => {
      expect(getBollingerSignal(1.2)).toBe("overbought");
      expect(getBollingerSignal(-0.1)).toBe("oversold");
      expect(getBollingerSignal(0.5)).toBe("neutral");
    });
  });
});
