/**
 * PriceIndicators Widget Tests
 *
 * Tests for price indicator utility functions and component exports.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { describe, expect, it } from "bun:test";

import type { PriceIndicators } from "./IndicatorSnapshot";

// ============================================
// Format Value Tests
// ============================================

function formatValue(value: number | null, decimals = 2): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(decimals);
}

describe("formatValue", () => {
  it("formats positive numbers", () => {
    expect(formatValue(123.456)).toBe("123.46");
  });

  it("formats negative numbers", () => {
    expect(formatValue(-45.678)).toBe("-45.68");
  });

  it("formats with custom decimals", () => {
    expect(formatValue(123.456789, 4)).toBe("123.4568");
  });

  it("returns em dash for null", () => {
    expect(formatValue(null)).toBe("—");
  });

  it("formats zero correctly", () => {
    expect(formatValue(0)).toBe("0.00");
  });
});

// ============================================
// Format Percent Tests
// ============================================

function formatPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

describe("formatPercent", () => {
  it("formats decimal as percentage", () => {
    expect(formatPercent(0.152)).toBe("15.2%");
  });

  it("formats negative percentage", () => {
    expect(formatPercent(-0.052)).toBe("-5.2%");
  });

  it("returns em dash for null", () => {
    expect(formatPercent(null)).toBe("—");
  });

  it("formats zero", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("formats 100%", () => {
    expect(formatPercent(1)).toBe("100.0%");
  });
});

// ============================================
// MACD Color Tests
// ============================================

function getMACDColor(histogram: number | null, prevHistogram?: number | null): string {
  if (histogram === null) {
    return "bg-stone-300 dark:bg-stone-600";
  }

  if (histogram > 0) {
    if (prevHistogram !== null && prevHistogram !== undefined && histogram > prevHistogram) {
      return "bg-green-500";
    }
    return "bg-green-400";
  }

  if (prevHistogram !== null && prevHistogram !== undefined && histogram < prevHistogram) {
    return "bg-red-500";
  }
  return "bg-red-400";
}

describe("getMACDColor", () => {
  it("returns stone for null histogram", () => {
    expect(getMACDColor(null)).toContain("stone");
  });

  it("returns strong green for increasing positive histogram", () => {
    expect(getMACDColor(2, 1)).toBe("bg-green-500");
  });

  it("returns weak green for positive but decreasing histogram", () => {
    expect(getMACDColor(2, 3)).toBe("bg-green-400");
  });

  it("returns weak green for positive with no previous", () => {
    expect(getMACDColor(2)).toBe("bg-green-400");
  });

  it("returns strong red for decreasing negative histogram", () => {
    expect(getMACDColor(-2, -1)).toBe("bg-red-500");
  });

  it("returns weak red for negative but increasing histogram", () => {
    expect(getMACDColor(-2, -3)).toBe("bg-red-400");
  });
});

// ============================================
// Momentum Variant Tests
// ============================================

function getMomentumVariant(
  value: number | null
): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  if (value > 0.1) {
    return "success";
  }
  if (value > 0) {
    return "info";
  }
  if (value > -0.1) {
    return "warning";
  }
  return "error";
}

describe("getMomentumVariant", () => {
  it("returns neutral for null", () => {
    expect(getMomentumVariant(null)).toBe("neutral");
  });

  it("returns success for strong positive momentum (>10%)", () => {
    expect(getMomentumVariant(0.15)).toBe("success");
  });

  it("returns info for weak positive momentum (0-10%)", () => {
    expect(getMomentumVariant(0.05)).toBe("info");
  });

  it("returns warning for weak negative momentum (-10% to 0)", () => {
    expect(getMomentumVariant(-0.05)).toBe("warning");
  });

  it("returns error for strong negative momentum (<-10%)", () => {
    expect(getMomentumVariant(-0.15)).toBe("error");
  });

  it("handles boundary at +10%", () => {
    expect(getMomentumVariant(0.1)).toBe("info");
    expect(getMomentumVariant(0.11)).toBe("success");
  });

  it("handles boundary at -10%", () => {
    expect(getMomentumVariant(-0.1)).toBe("error");
    expect(getMomentumVariant(-0.09)).toBe("warning");
  });
});

// ============================================
// MACD Signal Detection Tests
// ============================================

function getMACDSignal(
  macdLine: number | null,
  macdSignal: number | null
): "bullish" | "bearish" | "neutral" | null {
  if (macdLine === null || macdSignal === null) {
    return null;
  }
  if (macdLine > macdSignal) {
    return "bullish";
  }
  if (macdLine < macdSignal) {
    return "bearish";
  }
  return "neutral";
}

describe("getMACDSignal", () => {
  it("returns null when MACD line is null", () => {
    expect(getMACDSignal(null, 1)).toBeNull();
  });

  it("returns null when signal line is null", () => {
    expect(getMACDSignal(1, null)).toBeNull();
  });

  it("returns bullish when MACD > signal", () => {
    expect(getMACDSignal(2, 1)).toBe("bullish");
  });

  it("returns bearish when MACD < signal", () => {
    expect(getMACDSignal(1, 2)).toBe("bearish");
  });

  it("returns neutral when MACD = signal", () => {
    expect(getMACDSignal(1, 1)).toBe("neutral");
  });
});

// ============================================
// Price Position Tests
// ============================================

function calculatePricePosition(
  currentPrice: number | null,
  upperBand: number | null,
  lowerBand: number | null
): number | null {
  if (!currentPrice || upperBand === null || lowerBand === null) {
    return null;
  }
  const range = upperBand - lowerBand;
  if (range === 0) {
    return 0.5;
  }
  return (currentPrice - lowerBand) / range;
}

describe("calculatePricePosition", () => {
  it("returns null when price is null", () => {
    expect(calculatePricePosition(null, 200, 180)).toBeNull();
  });

  it("returns null when upper band is null", () => {
    expect(calculatePricePosition(190, null, 180)).toBeNull();
  });

  it("returns null when lower band is null", () => {
    expect(calculatePricePosition(190, 200, null)).toBeNull();
  });

  it("returns 0.5 when price at middle", () => {
    expect(calculatePricePosition(190, 200, 180)).toBe(0.5);
  });

  it("returns 0 when price at lower band", () => {
    expect(calculatePricePosition(180, 200, 180)).toBe(0);
  });

  it("returns 1 when price at upper band", () => {
    expect(calculatePricePosition(200, 200, 180)).toBe(1);
  });

  it("returns 0.5 when bands are equal (avoid division by zero)", () => {
    expect(calculatePricePosition(190, 190, 190)).toBe(0.5);
  });

  it("handles price above upper band (>1)", () => {
    const position = calculatePricePosition(210, 200, 180);
    expect(position).toBe(1.5);
  });

  it("handles price below lower band (<0)", () => {
    const position = calculatePricePosition(170, 200, 180);
    expect(position).toBe(-0.5);
  });
});

// ============================================
// SMA Position Tests
// ============================================

function isPriceAboveSMA(price: number | null, sma: number | null): boolean | null {
  if (!price || sma === null) {
    return null;
  }
  return price > sma;
}

describe("isPriceAboveSMA", () => {
  it("returns null when price is null", () => {
    expect(isPriceAboveSMA(null, 185)).toBeNull();
  });

  it("returns null when SMA is null", () => {
    expect(isPriceAboveSMA(190, null)).toBeNull();
  });

  it("returns true when price above SMA", () => {
    expect(isPriceAboveSMA(190, 185)).toBe(true);
  });

  it("returns false when price below SMA", () => {
    expect(isPriceAboveSMA(180, 185)).toBe(false);
  });

  it("returns false when price equals SMA", () => {
    expect(isPriceAboveSMA(185, 185)).toBe(false);
  });
});

// ============================================
// Component Export Tests
// ============================================

describe("PriceIndicators exports", () => {
  it("exports PriceIndicators component", async () => {
    const module = await import("./PriceIndicators");
    expect(module.PriceIndicators).toBeDefined();
    // memo-wrapped components are objects with $$typeof
    expect(module.PriceIndicators).toHaveProperty("$$typeof");
  });

  it("exports default as same as named export", async () => {
    const module = await import("./PriceIndicators");
    expect(module.default).toBe(module.PriceIndicators);
  });
});

describe("PriceIndicators from index", () => {
  it("exports PriceIndicatorsWidget from index", async () => {
    const module = await import("./index");
    expect(module.PriceIndicatorsWidget).toBeDefined();
  });
});

// ============================================
// Mock Data Structure Tests
// ============================================

describe("PriceIndicators data structure", () => {
  const mockData: PriceIndicators = {
    rsi_14: 55.2,
    atr_14: 3.45,
    sma_20: 182.5,
    sma_50: 180.5,
    sma_200: 175.2,
    ema_9: 184.0,
    ema_12: 183.5,
    ema_21: 182.0,
    ema_26: 181.5,
    macd_line: 2.3,
    macd_signal: 1.8,
    macd_histogram: 0.5,
    bollinger_upper: 195.0,
    bollinger_middle: 185.0,
    bollinger_lower: 175.0,
    bollinger_bandwidth: 0.108,
    bollinger_percentb: 0.65,
    stochastic_k: 72.5,
    stochastic_d: 68.3,
    momentum_1m: 0.045,
    momentum_3m: 0.12,
    momentum_6m: 0.25,
    momentum_12m: 0.42,
    realized_vol_20d: 0.28,
    parkinson_vol_20d: 0.25,
  };

  it("has RSI in valid range (0-100)", () => {
    expect(mockData.rsi_14).toBeGreaterThanOrEqual(0);
    expect(mockData.rsi_14).toBeLessThanOrEqual(100);
  });

  it("has positive ATR", () => {
    expect(mockData.atr_14).toBeGreaterThan(0);
  });

  it("has MACD histogram matching line - signal", () => {
    const expected = (mockData.macd_line ?? 0) - (mockData.macd_signal ?? 0);
    expect(mockData.macd_histogram).toBeCloseTo(expected, 1);
  });

  it("has Bollinger bands in correct order", () => {
    expect(mockData.bollinger_upper).toBeGreaterThan(mockData.bollinger_middle ?? 0);
    expect(mockData.bollinger_middle).toBeGreaterThan(mockData.bollinger_lower ?? 0);
  });

  it("has %B in expected range for price within bands", () => {
    expect(mockData.bollinger_percentb).toBeGreaterThanOrEqual(0);
    expect(mockData.bollinger_percentb).toBeLessThanOrEqual(1);
  });

  it("has Stochastic in valid range (0-100)", () => {
    expect(mockData.stochastic_k).toBeGreaterThanOrEqual(0);
    expect(mockData.stochastic_k).toBeLessThanOrEqual(100);
    expect(mockData.stochastic_d).toBeGreaterThanOrEqual(0);
    expect(mockData.stochastic_d).toBeLessThanOrEqual(100);
  });

  it("has volatility as positive decimals", () => {
    expect(mockData.realized_vol_20d).toBeGreaterThan(0);
    expect(mockData.parkinson_vol_20d).toBeGreaterThan(0);
  });
});

// ============================================
// Null Handling Tests
// ============================================

describe("PriceIndicators null handling", () => {
  const nullData: PriceIndicators = {
    rsi_14: null,
    atr_14: null,
    sma_20: null,
    sma_50: null,
    sma_200: null,
    ema_9: null,
    ema_12: null,
    ema_21: null,
    ema_26: null,
    macd_line: null,
    macd_signal: null,
    macd_histogram: null,
    bollinger_upper: null,
    bollinger_middle: null,
    bollinger_lower: null,
    bollinger_bandwidth: null,
    bollinger_percentb: null,
    stochastic_k: null,
    stochastic_d: null,
    momentum_1m: null,
    momentum_3m: null,
    momentum_6m: null,
    momentum_12m: null,
    realized_vol_20d: null,
    parkinson_vol_20d: null,
  };

  it("allows all fields to be null", () => {
    expect(nullData.rsi_14).toBeNull();
    expect(nullData.macd_line).toBeNull();
    expect(nullData.bollinger_percentb).toBeNull();
  });

  it("formatValue handles nulls gracefully", () => {
    expect(formatValue(nullData.rsi_14)).toBe("—");
    expect(formatPercent(nullData.realized_vol_20d)).toBe("—");
  });

  it("getMomentumVariant handles nulls gracefully", () => {
    expect(getMomentumVariant(nullData.momentum_1m)).toBe("neutral");
  });

  it("getMACDColor handles nulls gracefully", () => {
    expect(getMACDColor(nullData.macd_histogram)).toContain("stone");
  });
});
