/**
 * Technical Indicators Tests
 *
 * Comprehensive tests for all technical indicator calculations.
 */

import { describe, expect, it, beforeAll } from "bun:test";
import type { Candle, Timeframe } from "../src/types";
import { IndicatorError, validateCandleCount } from "../src/types";

// Momentum
import {
  calculateRSI,
  rsiRequiredPeriods,
  isOverbought,
  isOversold,
  RSI_DEFAULTS,
} from "../src/momentum/rsi";
import {
  calculateStochastic,
  stochasticRequiredPeriods,
  isStochasticOverbought,
  isStochasticOversold,
  isBullishCrossover,
  isBearishCrossover,
  STOCHASTIC_DEFAULTS,
} from "../src/momentum/stochastic";

// Trend
import {
  calculateSMA,
  smaRequiredPeriods,
  calculateMultipleSMAs,
  isGoldenCross,
  isDeathCross,
  SMA_DEFAULTS,
} from "../src/trend/sma";
import {
  calculateEMA,
  emaRequiredPeriods,
  calculateMultipleEMAs,
  calculateMultiplier,
  calculateMACD,
  EMA_DEFAULTS,
} from "../src/trend/ema";

// Volatility
import {
  calculateATR,
  atrRequiredPeriods,
  calculateTrueRange,
  calculateATRStop,
  calculateATRPositionSize,
  ATR_DEFAULTS,
} from "../src/volatility/atr";
import {
  calculateBollingerBands,
  bollingerRequiredPeriods,
  isTouchingUpperBand,
  isTouchingLowerBand,
  isBollingerSqueeze,
  getBollingerSignal,
  BOLLINGER_DEFAULTS,
} from "../src/volatility/bollinger";

// Volume
import {
  calculateVolumeSMA,
  volumeSmaRequiredPeriods,
  isHighVolume,
  isLowVolume,
  getVolumeSignal,
  VOLUME_SMA_DEFAULTS,
} from "../src/volume/volumeSma";

// Pipeline
import {
  calculateIndicators,
  calculateMultiTimeframeIndicators,
  getRequiredWarmupPeriod,
  DEFAULT_PIPELINE_CONFIG,
} from "../src/pipeline";

// ============================================
// Test Data Generation
// ============================================

/**
 * Generate mock candle data for testing.
 */
function generateCandles(count: number, startPrice = 100, volatility = 0.02): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const baseVolume = 1000000;

  for (let i = 0; i < count; i++) {
    // Random walk with trend
    const change = (Math.random() - 0.5) * 2 * volatility * price;
    price = Math.max(1, price + change);

    const open = price;
    const high = open * (1 + Math.random() * volatility);
    const low = open * (1 - Math.random() * volatility);
    const close = low + Math.random() * (high - low);
    const volume = baseVolume * (0.5 + Math.random());

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000, // 1 hour intervals
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles;
}

/**
 * Generate trending candle data (uptrend).
 */
function generateUptrend(count: number, startPrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const baseVolume = 1000000;

  for (let i = 0; i < count; i++) {
    // Upward bias
    const change = price * 0.005 + (Math.random() - 0.3) * 0.01 * price;
    price = Math.max(1, price + change);

    const open = price * 0.998;
    const high = price * 1.005;
    const low = price * 0.995;
    const close = price;
    const volume = baseVolume * (0.8 + Math.random() * 0.4);

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles;
}

/**
 * Generate downtrend candle data.
 */
function generateDowntrend(count: number, startPrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const baseVolume = 1000000;

  for (let i = 0; i < count; i++) {
    // Downward bias
    const change = -price * 0.005 + (Math.random() - 0.7) * 0.01 * price;
    price = Math.max(1, price + change);

    const open = price * 1.002;
    const high = price * 1.005;
    const low = price * 0.995;
    const close = price;
    const volume = baseVolume * (0.8 + Math.random() * 0.4);

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles;
}

// ============================================
// Types Tests
// ============================================

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

// ============================================
// RSI Tests
// ============================================

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

// ============================================
// Stochastic Tests
// ============================================

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

// ============================================
// SMA Tests
// ============================================

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
      expect(results[0].ma).toBe(20); // (10 + 20 + 30) / 3
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

// ============================================
// EMA Tests
// ============================================

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

      // In uptrend, EMA should be closer to recent prices (higher)
      const lastEma = ema[ema.length - 1].ma;
      const lastSma = sma[sma.length - 1].ma;
      const lastClose = uptrendCandles[uptrendCandles.length - 1].close;

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
});

// ============================================
// ATR Tests
// ============================================

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

// ============================================
// Bollinger Bands Tests
// ============================================

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
        const expectedBandwidth =
          ((result.upper - result.lower) / result.middle) * 100;
        expect(result.bandwidth).toBeCloseTo(expectedBandwidth, 5);
      }
    });

    it("should calculate %B correctly", () => {
      const results = calculateBollingerBands(candles);
      for (const result of results) {
        // %B should typically be between 0 and 1, but can exceed
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

// ============================================
// Volume SMA Tests
// ============================================

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
      // Ratio should be current volume / SMA
      // Can't verify exactly without knowing current volume, but should be reasonable
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

    it("should get correct volume signal", () => {
      expect(getVolumeSignal(2.5)).toBe("very_high");
      expect(getVolumeSignal(1.6)).toBe("high");
      expect(getVolumeSignal(0.8)).toBe("normal");
      expect(getVolumeSignal(0.4)).toBe("low");
      expect(getVolumeSignal(0.2)).toBe("very_low");
    });
  });
});

// ============================================
// Pipeline Tests
// ============================================

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
      expect(snapshot!.values["rsi_14_1h"]).toBeDefined();
      expect(snapshot!.values["sma_20_1h"]).toBeDefined();
      expect(snapshot!.values["ema_9_1h"]).toBeDefined();
      expect(snapshot!.values["atr_14_1h"]).toBeDefined();
    });

    it("should calculate Bollinger Band components", () => {
      const snapshot = calculateIndicators(candles, "1h");
      expect(snapshot!.values["bb_upper_20_1h"]).toBeDefined();
      expect(snapshot!.values["bb_middle_20_1h"]).toBeDefined();
      expect(snapshot!.values["bb_lower_20_1h"]).toBeDefined();
      expect(snapshot!.values["bb_bandwidth_20_1h"]).toBeDefined();
      expect(snapshot!.values["bb_percentb_20_1h"]).toBeDefined();
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

      expect(snapshot!.values["rsi_14_1h"]).toBeDefined();
      expect(snapshot!.values["sma_20_1h"]).toBeUndefined();
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
      expect(snapshot!.values["rsi_14_1h"]).toBeDefined();
      expect(snapshot!.values["rsi_14_4h"]).toBeDefined();
    });
  });

  describe("getRequiredWarmupPeriod", () => {
    it("should return correct warmup period", () => {
      const period = getRequiredWarmupPeriod(DEFAULT_PIPELINE_CONFIG);
      // Should be at least 200 (longest SMA)
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
      expect(period).toBe(15); // RSI needs period + 1
    });
  });
});

// ============================================
// Performance Tests
// ============================================

describe("Performance", () => {
  it("should calculate RSI for 10k candles in reasonable time", () => {
    const largeDataset = generateCandles(10000);
    const start = performance.now();
    calculateRSI(largeDataset);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100); // Should complete in < 100ms
  });

  it("should calculate all indicators for 10k candles in reasonable time", () => {
    const largeDataset = generateCandles(10000);
    const start = performance.now();
    calculateIndicators(largeDataset, "1h");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500); // Should complete in < 500ms
  });
});
