/**
 * Volume Indicator Tests
 *
 * Tests for Volume SMA calculations and volume signals.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import type { Candle } from "../src/types.js";
import {
  calculateVolumeSMA,
  getVolumeSignal,
  isHighVolume,
  isLowVolume,
  isVeryHighVolume,
  isVolumeConfirmed,
  isVolumeDivergence,
  volumeSmaRequiredPeriods,
} from "../src/volume/volumeSma.js";
import { generateCandles } from "./test-utils.js";

describe("Volume SMA", () => {
  let candles: Candle[];

  beforeAll(() => {
    candles = generateCandles(100);
  });

  describe("calculateVolumeSMA", () => {
    it("should calculate Volume SMA", () => {
      const results = calculateVolumeSMA(candles);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should return positive values", () => {
      const results = calculateVolumeSMA(candles);
      for (const result of results) {
        expect(result.volumeSma).toBeGreaterThan(0);
        expect(result.volumeRatio).toBeGreaterThan(0);
      }
    });

    it("should calculate volume ratio correctly", () => {
      const results = calculateVolumeSMA(candles);
      for (const result of results) {
        expect(result.volumeRatio).toBeGreaterThan(0);
        expect(result.volumeRatio).toBeLessThan(10); // Reasonable upper bound
      }
    });
  });

  describe("Volume signals", () => {
    it("should detect high volume", () => {
      expect(isHighVolume(2.0)).toBe(true);
      expect(isHighVolume(1.0)).toBe(false);
    });

    it("should detect low volume", () => {
      expect(isLowVolume(0.3)).toBe(true);
      expect(isLowVolume(0.8)).toBe(false);
    });

    it("should detect very high volume", () => {
      expect(isVeryHighVolume(2.5)).toBe(true);
      expect(isVeryHighVolume(1.8)).toBe(false);
      expect(isVeryHighVolume(2.0)).toBe(true);
    });

    it("should get correct volume signal", () => {
      expect(getVolumeSignal(2.5)).toBe("very_high");
      expect(getVolumeSignal(1.6)).toBe("high");
      expect(getVolumeSignal(0.8)).toBe("normal");
      expect(getVolumeSignal(0.4)).toBe("low");
      expect(getVolumeSignal(0.2)).toBe("very_low");
    });
  });

  describe("volumeSmaRequiredPeriods", () => {
    it("should return period from params", () => {
      expect(volumeSmaRequiredPeriods({ period: 20 })).toBe(20);
      expect(volumeSmaRequiredPeriods({ period: 50 })).toBe(50);
    });

    it("should use default period", () => {
      expect(volumeSmaRequiredPeriods()).toBe(20);
    });
  });

  describe("Volume confirmation and divergence", () => {
    it("should detect volume confirmed moves", () => {
      expect(isVolumeConfirmed(0.05, 2.0)).toBe(true);
      expect(isVolumeConfirmed(-0.03, 1.8)).toBe(true);
      expect(isVolumeConfirmed(0.05, 1.0)).toBe(false);
      expect(isVolumeConfirmed(-0.03, 0.8)).toBe(false);
    });

    it("should detect volume divergence", () => {
      expect(isVolumeDivergence(0.03, 0.02, 0.5)).toBe(true);
      expect(isVolumeDivergence(-0.05, 0.02, 0.8)).toBe(true);
      expect(isVolumeDivergence(0.01, 0.02, 0.5)).toBe(false);
      expect(isVolumeDivergence(0.03, 0.02, 1.5)).toBe(false);
    });
  });
});
