/**
 * Returns Transform Tests
 */

import { describe, expect, it } from "bun:test";
import {
  calculateMultiPeriodReturns,
  calculateReturns,
  calculateReturnsFromCandles,
  generateReturnOutputNames,
  logReturn,
  RETURNS_DEFAULTS,
  returnsRequiredPeriods,
  simpleReturn,
} from "../../../src/transforms/returns.js";
import { generateCandles, generateTimestamps, generateValues } from "./test-fixtures.js";

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
      expect(returnsRequiredPeriods()).toBe(21);
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
