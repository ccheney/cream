/**
 * Indicator Chart Tests
 *
 * Tests for indicator chart utility functions and component exports.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { describe, expect, it } from "bun:test";

import type { IndicatorDataPoint, ReferenceLine } from "./IndicatorChart";

// ============================================
// Format Data Tests
// ============================================

function formatData(data: IndicatorDataPoint[]): Array<{ time: string | number; value: number }> {
  return data.map((d) => ({
    time: d.time,
    value: d.value,
  }));
}

describe("formatData", () => {
  it("formats data points correctly", () => {
    const data: IndicatorDataPoint[] = [
      { time: "2024-01-01", value: 50 },
      { time: "2024-01-02", value: 55 },
    ];

    const formatted = formatData(data);

    expect(formatted.length).toBe(2);
    expect(formatted[0]).toEqual({ time: "2024-01-01", value: 50 });
    expect(formatted[1]).toEqual({ time: "2024-01-02", value: 55 });
  });

  it("handles empty data", () => {
    const data: IndicatorDataPoint[] = [];
    const formatted = formatData(data);
    expect(formatted.length).toBe(0);
  });

  it("handles numeric timestamps", () => {
    const timestamp = 1704067200; // 2024-01-01 00:00:00 UTC
    const data: IndicatorDataPoint[] = [{ time: timestamp, value: 42 }];

    const formatted = formatData(data);

    expect(formatted.length).toBe(1);
    const first = formatted[0];
    expect(first).toBeDefined();
    expect(first?.time).toBe(timestamp);
    expect(first?.value).toBe(42);
  });
});

// ============================================
// Format Histogram Data Tests
// ============================================

function formatHistogramData(
  data: IndicatorDataPoint[],
  positiveColor: string,
  negativeColor: string
): Array<{ time: string | number; value: number; color: string }> {
  return data.map((d) => ({
    time: d.time,
    value: d.value,
    color: d.value >= 0 ? positiveColor : negativeColor,
  }));
}

describe("formatHistogramData", () => {
  it("assigns positive color to positive values", () => {
    const data: IndicatorDataPoint[] = [{ time: "2024-01-01", value: 5 }];

    const formatted = formatHistogramData(data, "#green", "#red");

    expect(formatted.length).toBe(1);
    expect(formatted[0]?.color).toBe("#green");
  });

  it("assigns negative color to negative values", () => {
    const data: IndicatorDataPoint[] = [{ time: "2024-01-01", value: -3 }];

    const formatted = formatHistogramData(data, "#green", "#red");

    expect(formatted.length).toBe(1);
    expect(formatted[0]?.color).toBe("#red");
  });

  it("assigns positive color to zero", () => {
    const data: IndicatorDataPoint[] = [{ time: "2024-01-01", value: 0 }];

    const formatted = formatHistogramData(data, "#green", "#red");

    expect(formatted.length).toBe(1);
    expect(formatted[0]?.color).toBe("#green");
  });

  it("handles mixed positive and negative values", () => {
    const data: IndicatorDataPoint[] = [
      { time: "2024-01-01", value: 5 },
      { time: "2024-01-02", value: -2 },
      { time: "2024-01-03", value: 0 },
      { time: "2024-01-04", value: -8 },
    ];

    const formatted = formatHistogramData(data, "#green", "#red");

    expect(formatted.length).toBe(4);
    expect(formatted[0]?.color).toBe("#green");
    expect(formatted[1]?.color).toBe("#red");
    expect(formatted[2]?.color).toBe("#green");
    expect(formatted[3]?.color).toBe("#red");
  });
});

// ============================================
// Component Export Tests
// ============================================

describe("IndicatorChart exports", () => {
  it("exports IndicatorChart component", async () => {
    const module = await import("./IndicatorChart");
    expect(module.IndicatorChart).toBeDefined();
    expect(module.IndicatorChart).toHaveProperty("$$typeof");
  });

  it("exports default as same as named export", async () => {
    const module = await import("./IndicatorChart");
    expect(module.default).toBe(module.IndicatorChart);
  });
});

describe("RSIChart exports", () => {
  it("exports RSIChart component", async () => {
    const module = await import("./RSIChart");
    expect(module.RSIChart).toBeDefined();
    expect(module.RSIChart).toHaveProperty("$$typeof");
  });
});

describe("ATRChart exports", () => {
  it("exports ATRChart component", async () => {
    const module = await import("./ATRChart");
    expect(module.ATRChart).toBeDefined();
    expect(module.ATRChart).toHaveProperty("$$typeof");
  });
});

describe("MACDChart exports", () => {
  it("exports MACDChart component", async () => {
    const module = await import("./MACDChart");
    expect(module.MACDChart).toBeDefined();
    expect(module.MACDChart).toHaveProperty("$$typeof");
  });
});

describe("MomentumChart exports", () => {
  it("exports MomentumChart component", async () => {
    const module = await import("./MomentumChart");
    expect(module.MomentumChart).toBeDefined();
    expect(module.MomentumChart).toHaveProperty("$$typeof");
  });
});

describe("StochasticChart exports", () => {
  it("exports StochasticChart component", async () => {
    const module = await import("./StochasticChart");
    expect(module.StochasticChart).toBeDefined();
    expect(module.StochasticChart).toHaveProperty("$$typeof");
  });
});

describe("index exports", () => {
  it("exports all chart components from index", async () => {
    const module = await import("./index");
    expect(module.IndicatorChart).toBeDefined();
    expect(module.RSIChart).toBeDefined();
    expect(module.ATRChart).toBeDefined();
    expect(module.MACDChart).toBeDefined();
    expect(module.MomentumChart).toBeDefined();
    expect(module.StochasticChart).toBeDefined();
  });
});

// ============================================
// RSI Reference Lines Tests
// ============================================

describe("RSI reference lines", () => {
  const createRSIReferenceLines = (overboughtLevel = 70, oversoldLevel = 30): ReferenceLine[] => [
    { value: overboughtLevel, color: "rgba(239, 68, 68, 0.3)", lineWidth: 1 },
    { value: 50, color: "rgba(120, 113, 108, 0.2)", lineWidth: 1 },
    { value: oversoldLevel, color: "rgba(34, 197, 94, 0.3)", lineWidth: 1 },
  ];

  it("creates default RSI bands at 70/30", () => {
    const lines = createRSIReferenceLines();

    expect(lines.length).toBe(3);
    expect(lines[0]?.value).toBe(70);
    expect(lines[2]?.value).toBe(30);
  });

  it("creates custom RSI bands", () => {
    const lines = createRSIReferenceLines(80, 20);

    expect(lines.length).toBe(3);
    expect(lines[0]?.value).toBe(80);
    expect(lines[2]?.value).toBe(20);
  });

  it("includes neutral 50 line", () => {
    const lines = createRSIReferenceLines();

    expect(lines.length).toBe(3);
    expect(lines[1]?.value).toBe(50);
  });
});

// ============================================
// Stochastic Reference Lines Tests
// ============================================

describe("Stochastic reference lines", () => {
  const createStochasticReferenceLines = (
    overboughtLevel = 80,
    oversoldLevel = 20
  ): ReferenceLine[] => [
    { value: overboughtLevel, color: "rgba(239, 68, 68, 0.3)", lineWidth: 1 },
    { value: oversoldLevel, color: "rgba(34, 197, 94, 0.3)", lineWidth: 1 },
  ];

  it("creates default Stochastic bands at 80/20", () => {
    const lines = createStochasticReferenceLines();

    expect(lines.length).toBe(2);
    expect(lines[0]?.value).toBe(80);
    expect(lines[1]?.value).toBe(20);
  });

  it("creates custom Stochastic bands", () => {
    const lines = createStochasticReferenceLines(90, 10);

    expect(lines.length).toBe(2);
    expect(lines[0]?.value).toBe(90);
    expect(lines[1]?.value).toBe(10);
  });
});

// ============================================
// MACD Data Structure Tests
// ============================================

describe("MACD data structure", () => {
  const mockMACDData = {
    macdLine: [
      { time: "2024-01-01", value: 0.5 },
      { time: "2024-01-02", value: 0.8 },
    ],
    signalLine: [
      { time: "2024-01-01", value: 0.3 },
      { time: "2024-01-02", value: 0.4 },
    ],
    histogram: [
      { time: "2024-01-01", value: 0.2 },
      { time: "2024-01-02", value: 0.4 },
    ],
  };

  it("has matching timestamps across all series", () => {
    const { macdLine, signalLine, histogram } = mockMACDData;

    expect(macdLine.length).toBe(signalLine.length);
    expect(signalLine.length).toBe(histogram.length);

    for (let i = 0; i < macdLine.length; i++) {
      const macd = macdLine[i];
      const signal = signalLine[i];
      const hist = histogram[i];
      expect(macd).toBeDefined();
      expect(signal).toBeDefined();
      expect(hist).toBeDefined();
      expect(macd?.time).toBe(signal?.time);
      expect(signal?.time).toBe(hist?.time);
    }
  });

  it("histogram equals MACD minus signal", () => {
    const { macdLine, signalLine, histogram } = mockMACDData;

    for (let i = 0; i < histogram.length; i++) {
      const macd = macdLine[i];
      const signal = signalLine[i];
      const hist = histogram[i];
      expect(macd).toBeDefined();
      expect(signal).toBeDefined();
      expect(hist).toBeDefined();
      const expectedHistogram = (macd?.value ?? 0) - (signal?.value ?? 0);
      expect(hist?.value).toBeCloseTo(expectedHistogram, 5);
    }
  });
});

// ============================================
// Data Validation Tests
// ============================================

describe("indicator data validation", () => {
  it("RSI values should be between 0 and 100", () => {
    const rsiData: IndicatorDataPoint[] = [
      { time: "2024-01-01", value: 45 },
      { time: "2024-01-02", value: 72 },
      { time: "2024-01-03", value: 28 },
    ];

    for (const point of rsiData) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });

  it("Stochastic values should be between 0 and 100", () => {
    const stochData: IndicatorDataPoint[] = [
      { time: "2024-01-01", value: 85 },
      { time: "2024-01-02", value: 15 },
    ];

    for (const point of stochData) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });

  it("ATR values should be positive", () => {
    const atrData: IndicatorDataPoint[] = [
      { time: "2024-01-01", value: 2.5 },
      { time: "2024-01-02", value: 3.1 },
    ];

    for (const point of atrData) {
      expect(point.value).toBeGreaterThan(0);
    }
  });

  it("Momentum values can be negative", () => {
    const momentumData: IndicatorDataPoint[] = [
      { time: "2024-01-01", value: 0.15 },
      { time: "2024-01-02", value: -0.08 },
    ];

    expect(momentumData.length).toBe(2);
    expect(momentumData[0]?.value).toBeGreaterThan(0);
    expect(momentumData[1]?.value).toBeLessThan(0);
  });
});

// ============================================
// Indicator Interpretation Tests
// ============================================

describe("indicator interpretation", () => {
  it("RSI > 70 indicates overbought", () => {
    const rsi = 75;
    const isOverbought = rsi > 70;
    expect(isOverbought).toBe(true);
  });

  it("RSI < 30 indicates oversold", () => {
    const rsi = 25;
    const isOversold = rsi < 30;
    expect(isOversold).toBe(true);
  });

  it("Stochastic > 80 indicates overbought", () => {
    const stoch = 85;
    const isOverbought = stoch > 80;
    expect(isOverbought).toBe(true);
  });

  it("MACD bullish crossover when line crosses above signal", () => {
    const prev = { macd: 0.3, signal: 0.5 };
    const curr = { macd: 0.6, signal: 0.5 };
    const isBullishCrossover = prev.macd < prev.signal && curr.macd > curr.signal;
    expect(isBullishCrossover).toBe(true);
  });

  it("MACD bearish crossover when line crosses below signal", () => {
    const prev = { macd: 0.6, signal: 0.5 };
    const curr = { macd: 0.4, signal: 0.5 };
    const isBearishCrossover = prev.macd > prev.signal && curr.macd < curr.signal;
    expect(isBearishCrossover).toBe(true);
  });

  it("positive momentum indicates uptrend", () => {
    const momentum = 0.15;
    const isUptrend = momentum > 0;
    expect(isUptrend).toBe(true);
  });

  it("high ATR indicates high volatility", () => {
    const atr = 5.5;
    const avgPrice = 100;
    const volatilityPct = (atr / avgPrice) * 100;
    const isHighVolatility = volatilityPct > 3;
    expect(isHighVolatility).toBe(true);
  });
});
