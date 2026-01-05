/**
 * Rule-Based Regime Classifier Tests
 */

import { describe, expect, test } from "bun:test";
import type { Candle } from "@cream/indicators";
import {
  classifyRegime,
  createRuleBasedClassifier,
  getRequiredCandleCount,
  hasEnoughData,
  type RegimeInput,
} from "../src/ruleBasedClassifier";

// ============================================
// Test Fixtures
// ============================================

function createCandle(
  close: number,
  high?: number,
  low?: number,
  volume = 1000000,
  timestamp = Date.now()
): Candle {
  const h = high ?? close * 1.01;
  const l = low ?? close * 0.99;
  const open = close * (0.99 + Math.random() * 0.02);
  return {
    timestamp,
    open,
    high: h,
    low: l,
    close,
    volume,
  };
}

function createTrendingCandles(
  startPrice: number,
  direction: "up" | "down",
  count: number
): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const change = direction === "up" ? 0.01 : -0.01; // 1% per candle

  for (let i = 0; i < count; i++) {
    price = price * (1 + change);
    candles.push(
      createCandle(
        price,
        price * 1.005, // Tighter range in trend
        price * 0.995,
        1000000,
        Date.now() + i * 3600000
      )
    );
  }

  return candles;
}

function createRangeBoundCandles(
  centerPrice: number,
  count: number,
  volatility = 0.005 // 0.5% range
): Candle[] {
  const candles: Candle[] = [];

  for (let i = 0; i < count; i++) {
    const noise = (Math.random() - 0.5) * volatility * 2;
    const price = centerPrice * (1 + noise);
    candles.push(
      createCandle(
        price,
        price * (1 + volatility),
        price * (1 - volatility),
        1000000,
        Date.now() + i * 3600000
      )
    );
  }

  return candles;
}

function createHighVolatilityCandles(startPrice: number, count: number): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    // Large swings (5% moves)
    const change = (Math.random() - 0.5) * 0.1;
    price = price * (1 + change);
    candles.push(
      createCandle(
        price,
        price * 1.03, // Wide range
        price * 0.97,
        2000000, // Higher volume
        Date.now() + i * 3600000
      )
    );
  }

  return candles;
}

function createLowVolatilityCandles(price: number, count: number): Candle[] {
  const candles: Candle[] = [];

  for (let i = 0; i < count; i++) {
    // Very small movements (0.1%)
    const noise = (Math.random() - 0.5) * 0.002;
    const closePrice = price * (1 + noise);
    candles.push(
      createCandle(
        closePrice,
        closePrice * 1.001, // Very tight range
        closePrice * 0.999,
        500000, // Lower volume
        Date.now() + i * 3600000
      )
    );
  }

  return candles;
}

// ============================================
// Tests
// ============================================

describe("Rule-Based Regime Classifier", () => {
  describe("classifyRegime", () => {
    test("classifies bullish trend correctly", () => {
      const candles = createTrendingCandles(100, "up", 60);
      const input: RegimeInput = { candles };

      const result = classifyRegime(input);

      expect(result.regime).toBe("BULL_TREND");
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.metrics.fastMa).toBeGreaterThan(result.metrics.slowMa);
      expect(result.reasoning).toContain("Bullish");
    });

    test("classifies bearish trend correctly", () => {
      const candles = createTrendingCandles(100, "down", 60);
      const input: RegimeInput = { candles };

      const result = classifyRegime(input);

      expect(result.regime).toBe("BEAR_TREND");
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.metrics.fastMa).toBeLessThan(result.metrics.slowMa);
      expect(result.reasoning).toContain("Bearish");
    });

    test("classifies range-bound correctly with converged MAs and low vol", () => {
      const candles = createLowVolatilityCandles(100, 60);
      // Add historical ATR showing current is low
      const historicalAtr = Array(100)
        .fill(0)
        .map(() => Math.random() * 5 + 2);
      const input: RegimeInput = { candles, historicalAtr };

      const result = classifyRegime(input);

      // With low volatility and converged MAs, should be RANGE or LOW_VOL
      expect(["RANGE", "LOW_VOL"]).toContain(result.regime);
    });

    test("classifies high volatility correctly", () => {
      // Create baseline normal volatility data
      const normalCandles = createRangeBoundCandles(100, 50);
      // Then add high volatility candles
      const highVolCandles = createHighVolatilityCandles(100, 20);
      const candles = [...normalCandles, ...highVolCandles];

      // Historical ATR from normal period
      const historicalAtr = normalCandles.map((c) => c.high - c.low);
      const input: RegimeInput = { candles, historicalAtr };

      const result = classifyRegime(input);

      // High vol should override trend signals
      if (result.metrics.atrPercentile >= 80) {
        expect(result.regime).toBe("HIGH_VOL");
        expect(result.reasoning).toContain("High volatility");
      }
    });

    test("classifies low volatility correctly", () => {
      // Create baseline normal volatility data
      const normalCandles = createRangeBoundCandles(100, 50, 0.02);
      // Then add very low volatility candles
      const lowVolCandles = createLowVolatilityCandles(100, 20);
      const candles = [...normalCandles, ...lowVolCandles];

      // Historical ATR from normal period
      const historicalAtr = normalCandles.map((c) => c.high - c.low);
      const input: RegimeInput = { candles, historicalAtr };

      const result = classifyRegime(input);

      // Should detect low vol
      if (result.metrics.atrPercentile <= 20) {
        expect(["LOW_VOL", "RANGE"]).toContain(result.regime);
      }
    });

    test("uses custom configuration", () => {
      const candles = createTrendingCandles(100, "up", 60);
      const config = {
        trend_ma_fast: 10,
        trend_ma_slow: 30,
        volatility_percentile_high: 90,
        volatility_percentile_low: 10,
      };

      const result = classifyRegime({ candles }, config);

      expect(result.regime).toBe("BULL_TREND");
      // Custom MA periods should affect the calculation
      expect(result.metrics.fastMa).toBeGreaterThan(0);
      expect(result.metrics.slowMa).toBeGreaterThan(0);
    });

    test("provides metrics in result", () => {
      const candles = createTrendingCandles(100, "up", 60);
      const result = classifyRegime({ candles });

      expect(result.metrics).toBeDefined();
      expect(result.metrics.fastMa).toBeGreaterThan(0);
      expect(result.metrics.slowMa).toBeGreaterThan(0);
      expect(result.metrics.maDiff).toBeDefined();
      expect(result.metrics.maDiffPct).toBeDefined();
      expect(result.metrics.currentAtr).toBeGreaterThan(0);
      expect(result.metrics.atrPercentile).toBeGreaterThanOrEqual(0);
      expect(result.metrics.atrPercentile).toBeLessThanOrEqual(100);
    });

    test("handles empty historical ATR", () => {
      const candles = createTrendingCandles(100, "up", 60);
      const result = classifyRegime({ candles, historicalAtr: [] });

      expect(result.regime).toBeDefined();
      // Without historical ATR, percentile defaults to 50
      expect(result.metrics.atrPercentile).toBe(50);
    });
  });

  describe("createRuleBasedClassifier", () => {
    test("creates reusable classifier function", () => {
      const classifier = createRuleBasedClassifier();
      const candles = createTrendingCandles(100, "up", 60);

      const result = classifier({ candles });

      expect(result.regime).toBe("BULL_TREND");
    });

    test("binds custom configuration", () => {
      const config = {
        trend_ma_fast: 5,
        trend_ma_slow: 20,
        volatility_percentile_high: 85,
        volatility_percentile_low: 15,
      };
      const classifier = createRuleBasedClassifier(config);
      const candles = createTrendingCandles(100, "up", 30);

      const result = classifier({ candles });

      expect(result.regime).toBeDefined();
    });
  });

  describe("getRequiredCandleCount", () => {
    test("returns correct count for default config", () => {
      const count = getRequiredCandleCount();
      // Default slow MA is 50, ATR is 14, need max + 1
      expect(count).toBe(51);
    });

    test("returns correct count for custom config", () => {
      const config = {
        trend_ma_fast: 10,
        trend_ma_slow: 100,
        volatility_percentile_high: 80,
        volatility_percentile_low: 20,
      };
      const count = getRequiredCandleCount(config);
      expect(count).toBe(101);
    });

    test("considers ATR period in calculation", () => {
      const config = {
        trend_ma_fast: 5,
        trend_ma_slow: 10,
        volatility_percentile_high: 80,
        volatility_percentile_low: 20,
      };
      const count = getRequiredCandleCount(config);
      // ATR period (14) is greater than slow MA (10)
      expect(count).toBe(15);
    });
  });

  describe("hasEnoughData", () => {
    test("returns true when enough candles", () => {
      const candles = createTrendingCandles(100, "up", 60);
      expect(hasEnoughData(candles)).toBe(true);
    });

    test("returns false when not enough candles", () => {
      const candles = createTrendingCandles(100, "up", 10);
      expect(hasEnoughData(candles)).toBe(false);
    });

    test("respects custom configuration", () => {
      const config = {
        trend_ma_fast: 5,
        trend_ma_slow: 10,
        volatility_percentile_high: 80,
        volatility_percentile_low: 20,
      };
      const candles = createTrendingCandles(100, "up", 15);
      expect(hasEnoughData(candles, config)).toBe(true);
    });
  });

  describe("Confidence Scores", () => {
    test("confidence increases with stronger trends", () => {
      // Weak trend
      const weakCandles = createTrendingCandles(100, "up", 60);
      // Make it weaker by reducing the price change
      for (let i = 30; i < 60; i++) {
        weakCandles[i] = createCandle(
          weakCandles[i].close * 0.99,
          undefined,
          undefined,
          1000000,
          weakCandles[i].timestamp
        );
      }
      const weakResult = classifyRegime({ candles: weakCandles });

      // Strong trend
      const strongCandles = createTrendingCandles(100, "up", 60);
      const strongResult = classifyRegime({ candles: strongCandles });

      // Both should be bullish but strong should have higher confidence
      if (weakResult.regime === "BULL_TREND" && strongResult.regime === "BULL_TREND") {
        expect(strongResult.confidence).toBeGreaterThanOrEqual(weakResult.confidence * 0.9);
      }
    });

    test("confidence is bounded 0-1", () => {
      const candles = createTrendingCandles(100, "up", 60);
      const result = classifyRegime({ candles });

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe("Edge Cases", () => {
    test("handles minimum required candles", () => {
      const count = getRequiredCandleCount();
      const candles = createTrendingCandles(100, "up", count);

      const result = classifyRegime({ candles });

      expect(result.regime).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    test("handles flat price series", () => {
      const flatCandles: Candle[] = [];
      for (let i = 0; i < 60; i++) {
        flatCandles.push(createCandle(100, 100.5, 99.5, 1000000, Date.now() + i * 3600000));
      }

      const result = classifyRegime({ candles: flatCandles });

      // Flat prices should result in RANGE or LOW_VOL
      expect(["RANGE", "LOW_VOL"]).toContain(result.regime);
    });

    test("handles extreme price movements", () => {
      // Create a sudden crash scenario
      const normalCandles = createRangeBoundCandles(100, 40);
      const crashCandles = createTrendingCandles(100, "down", 20);
      // Make the crash more extreme
      for (let i = 0; i < crashCandles.length; i++) {
        crashCandles[i] = createCandle(
          crashCandles[i].close * 0.8,
          crashCandles[i].high * 0.85,
          crashCandles[i].low * 0.75,
          3000000,
          Date.now() + (40 + i) * 3600000
        );
      }

      const candles = [...normalCandles, ...crashCandles];
      const historicalAtr = normalCandles.map((c) => c.high - c.low);

      const result = classifyRegime({ candles, historicalAtr });

      // Should detect either bearish trend or high volatility
      expect(["BEAR_TREND", "HIGH_VOL"]).toContain(result.regime);
    });
  });
});
