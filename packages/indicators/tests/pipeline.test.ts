/**
 * Indicator Pipeline Tests
 *
 * Tests for the unified indicator calculation pipeline.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import {
  calculateHistoricalIndicators,
  calculateIndicators,
  calculateMultiTimeframeIndicators,
  DEFAULT_PIPELINE_CONFIG,
  getRequiredWarmupPeriod,
} from "../src/pipeline.js";
import type { Candle, Timeframe } from "../src/types.js";
import { generateCandles } from "./test-utils.js";

describe("Indicator Pipeline", () => {
  let candles: Candle[];

  beforeAll(() => {
    candles = generateCandles(250);
  });

  describe("calculateIndicators", () => {
    it("should calculate all indicators", () => {
      const snapshot = calculateIndicators(candles, "1h");
      expect(snapshot).not.toBeNull();
      expect(snapshot!.values).toBeDefined();
    });

    it("should use correct naming convention", () => {
      const snapshot = calculateIndicators(candles, "1h");
      expect(snapshot!.values.rsi_14_1h).toBeDefined();
      expect(snapshot!.values.sma_20_1h).toBeDefined();
      expect(snapshot!.values.ema_9_1h).toBeDefined();
      expect(snapshot!.values.atr_14_1h).toBeDefined();
    });

    it("should calculate Bollinger Band components", () => {
      const snapshot = calculateIndicators(candles, "1h");
      expect(snapshot!.values.bb_upper_20_1h).toBeDefined();
      expect(snapshot!.values.bb_middle_20_1h).toBeDefined();
      expect(snapshot!.values.bb_lower_20_1h).toBeDefined();
      expect(snapshot!.values.bb_bandwidth_20_1h).toBeDefined();
      expect(snapshot!.values.bb_percentb_20_1h).toBeDefined();
    });

    it("should respect config options", () => {
      const snapshot = calculateIndicators(candles, "1h", {
        rsi: { enabled: true, period: 14 },
        sma: { enabled: false },
        ema: { enabled: false },
        atr: { enabled: false },
        bollinger: { enabled: false },
        volumeSma: { enabled: false },
        stochastic: { enabled: false },
      });

      expect(snapshot!.values.rsi_14_1h).toBeDefined();
      expect(snapshot!.values.sma_20_1h).toBeUndefined();
    });

    it("should return null for empty candles", () => {
      const snapshot = calculateIndicators([], "1h");
      expect(snapshot).toBeNull();
    });
  });

  describe("calculateMultiTimeframeIndicators", () => {
    it("should combine multiple timeframes", () => {
      const candlesByTimeframe = new Map<Timeframe, Candle[]>();
      candlesByTimeframe.set("1h", candles);
      candlesByTimeframe.set("4h", candles.slice(0, 100));

      const snapshot = calculateMultiTimeframeIndicators(candlesByTimeframe);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.values.rsi_14_1h).toBeDefined();
      expect(snapshot!.values.rsi_14_4h).toBeDefined();
    });

    it("should return null when all timeframes have empty candles", () => {
      const candlesByTimeframe = new Map<Timeframe, Candle[]>();
      candlesByTimeframe.set("1h", []);
      candlesByTimeframe.set("4h", []);

      const snapshot = calculateMultiTimeframeIndicators(candlesByTimeframe);
      expect(snapshot).toBeNull();
    });
  });

  describe("calculateHistoricalIndicators", () => {
    it("should calculate historical indicators", () => {
      const snapshots = calculateHistoricalIndicators(candles, "1h", DEFAULT_PIPELINE_CONFIG, 210);
      expect(snapshots.length).toBeGreaterThan(0);
      expect(snapshots[0]!.values).toBeDefined();
      expect(snapshots[0]!.timestamp).toBeGreaterThan(0);
    });

    it("should respect custom start index", () => {
      const snapshots = calculateHistoricalIndicators(candles, "1h", DEFAULT_PIPELINE_CONFIG, 220);
      expect(snapshots.length).toBe(candles.length - 220);
    });

    it("should return empty array when startIndex >= candles.length", () => {
      const snapshots = calculateHistoricalIndicators(candles, "1h", DEFAULT_PIPELINE_CONFIG, 300);
      expect(snapshots.length).toBe(0);
    });

    it("should use custom config", () => {
      const config = {
        rsi: { enabled: true, period: 14 },
        sma: { enabled: false },
        ema: { enabled: false },
        atr: { enabled: false },
        bollinger: { enabled: false },
        volumeSma: { enabled: false },
        stochastic: { enabled: false },
      };
      const snapshots = calculateHistoricalIndicators(candles, "1h", config, 20);
      expect(snapshots.length).toBeGreaterThan(0);
      expect(snapshots[0]!.values.rsi_14_1h).toBeDefined();
      expect(snapshots[0]!.values.sma_20_1h).toBeUndefined();
    });
  });

  describe("indicator catch blocks", () => {
    it("should handle RSI calculation failure gracefully", () => {
      const shortCandles = generateCandles(10);
      const snapshot = calculateIndicators(shortCandles, "1h", {
        rsi: { enabled: true, period: 14 },
        sma: { enabled: false },
        ema: { enabled: false },
        atr: { enabled: false },
        bollinger: { enabled: false },
        volumeSma: { enabled: false },
        stochastic: { enabled: false },
      });
      expect(snapshot).not.toBeNull();
      expect(snapshot!.values.rsi_14_1h).toBeNull();
    });

    it("should handle Stochastic calculation failure gracefully", () => {
      const shortCandles = generateCandles(10);
      const snapshot = calculateIndicators(shortCandles, "1h", {
        rsi: { enabled: false },
        sma: { enabled: false },
        ema: { enabled: false },
        atr: { enabled: false },
        bollinger: { enabled: false },
        volumeSma: { enabled: false },
        stochastic: { enabled: true, kPeriod: 14, dPeriod: 3, slow: true },
      });
      expect(snapshot).not.toBeNull();
      expect(snapshot!.values.stochastic_k_14_1h).toBeNull();
      expect(snapshot!.values.stochastic_d_3_1h).toBeNull();
    });

    it("should handle EMA calculation failure gracefully", () => {
      const shortCandles = generateCandles(5);
      const snapshot = calculateIndicators(shortCandles, "1h", {
        rsi: { enabled: false },
        sma: { enabled: false },
        ema: { enabled: true, periods: [50] },
        atr: { enabled: false },
        bollinger: { enabled: false },
        volumeSma: { enabled: false },
        stochastic: { enabled: false },
      });
      expect(snapshot).not.toBeNull();
      expect(snapshot!.values.ema_50_1h).toBeNull();
    });

    it("should handle ATR calculation failure gracefully", () => {
      const shortCandles = generateCandles(5);
      const snapshot = calculateIndicators(shortCandles, "1h", {
        rsi: { enabled: false },
        sma: { enabled: false },
        ema: { enabled: false },
        atr: { enabled: true, period: 14 },
        bollinger: { enabled: false },
        volumeSma: { enabled: false },
        stochastic: { enabled: false },
      });
      expect(snapshot).not.toBeNull();
      expect(snapshot!.values.atr_14_1h).toBeNull();
    });

    it("should handle Bollinger Bands calculation failure gracefully", () => {
      const shortCandles = generateCandles(5);
      const snapshot = calculateIndicators(shortCandles, "1h", {
        rsi: { enabled: false },
        sma: { enabled: false },
        ema: { enabled: false },
        atr: { enabled: false },
        bollinger: { enabled: true, period: 20, stdDev: 2 },
        volumeSma: { enabled: false },
        stochastic: { enabled: false },
      });
      expect(snapshot).not.toBeNull();
      expect(snapshot!.values.bb_upper_20_1h).toBeNull();
      expect(snapshot!.values.bb_middle_20_1h).toBeNull();
      expect(snapshot!.values.bb_lower_20_1h).toBeNull();
      expect(snapshot!.values.bb_bandwidth_20_1h).toBeNull();
      expect(snapshot!.values.bb_percentb_20_1h).toBeNull();
    });

    it("should handle Volume SMA calculation failure gracefully", () => {
      const shortCandles = generateCandles(5);
      const snapshot = calculateIndicators(shortCandles, "1h", {
        rsi: { enabled: false },
        sma: { enabled: false },
        ema: { enabled: false },
        atr: { enabled: false },
        bollinger: { enabled: false },
        volumeSma: { enabled: true, period: 20 },
        stochastic: { enabled: false },
      });
      expect(snapshot).not.toBeNull();
      expect(snapshot!.values.volume_sma_20_1h).toBeNull();
      expect(snapshot!.values.volume_ratio_20_1h).toBeNull();
    });

    it("should handle SMA calculation failure gracefully", () => {
      const shortCandles = generateCandles(5);
      const snapshot = calculateIndicators(shortCandles, "1h", {
        rsi: { enabled: false },
        sma: { enabled: true, periods: [50] },
        ema: { enabled: false },
        atr: { enabled: false },
        bollinger: { enabled: false },
        volumeSma: { enabled: false },
        stochastic: { enabled: false },
      });
      expect(snapshot).not.toBeNull();
      expect(snapshot!.values.sma_50_1h).toBeNull();
    });
  });

  describe("getRequiredWarmupPeriod", () => {
    it("should return correct warmup period", () => {
      const period = getRequiredWarmupPeriod(DEFAULT_PIPELINE_CONFIG);
      expect(period).toBeGreaterThanOrEqual(200);
    });

    it("should handle custom config", () => {
      const period = getRequiredWarmupPeriod({
        rsi: { enabled: true, period: 14 },
        sma: { enabled: false },
        ema: { enabled: false },
        atr: { enabled: false },
        bollinger: { enabled: false },
        volumeSma: { enabled: false },
        stochastic: { enabled: false },
      });
      expect(period).toBe(15);
    });
  });
});
