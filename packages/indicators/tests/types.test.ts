/**
 * Types and Validation Tests
 */

import { describe, expect, it } from "bun:test";
import { IndicatorError, validateCandleCount } from "../src/types.js";
import { generateCandles } from "./test-utils.js";

describe("Types", () => {
  describe("validateCandleCount", () => {
    it("should not throw when enough candles", () => {
      const candles = generateCandles(20);
      expect(() => validateCandleCount("Test", candles, 20)).not.toThrow();
    });

    it("should throw IndicatorError when insufficient candles", () => {
      const candles = generateCandles(10);
      expect(() => validateCandleCount("Test", candles, 20)).toThrow(IndicatorError);
    });

    it("should include indicator name in error", () => {
      const candles = generateCandles(5);
      try {
        validateCandleCount("MyIndicator", candles, 10);
      } catch (error) {
        expect(error).toBeInstanceOf(IndicatorError);
        expect((error as IndicatorError).indicator).toBe("MyIndicator");
        expect((error as IndicatorError).candles).toBe(5);
        expect((error as IndicatorError).required).toBe(10);
      }
    });
  });
});
