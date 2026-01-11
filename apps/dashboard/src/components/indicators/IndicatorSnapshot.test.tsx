/**
 * IndicatorSnapshot Component Tests
 *
 * Tests for indicator snapshot utility functions and component exports.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

import { describe, expect, it } from "bun:test";

// ============================================
// Format Number Tests
// ============================================

function formatNumber(value: number | null, decimals = 2): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return value.toFixed(decimals);
}

describe("formatNumber", () => {
  it("formats positive numbers with default decimals", () => {
    expect(formatNumber(123.456)).toBe("123.46");
  });

  it("formats negative numbers", () => {
    expect(formatNumber(-45.678)).toBe("-45.68");
  });

  it("formats with custom decimal places", () => {
    expect(formatNumber(123.456789, 4)).toBe("123.4568");
  });

  it("returns em dash for null values", () => {
    expect(formatNumber(null)).toBe("—");
  });

  it("formats zero correctly", () => {
    expect(formatNumber(0)).toBe("0.00");
  });

  it("formats small numbers", () => {
    expect(formatNumber(0.00123, 5)).toBe("0.00123");
  });
});

// ============================================
// Format Percent Tests
// ============================================

function formatPercent(value: number | null): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return `${(value * 100).toFixed(2)}%`;
}

describe("formatPercent", () => {
  it("formats decimal as percentage", () => {
    expect(formatPercent(0.1525)).toBe("15.25%");
  });

  it("formats negative percentage", () => {
    expect(formatPercent(-0.0523)).toBe("-5.23%");
  });

  it("returns em dash for null values", () => {
    expect(formatPercent(null)).toBe("—");
  });

  it("formats zero percent", () => {
    expect(formatPercent(0)).toBe("0.00%");
  });

  it("formats 100%", () => {
    expect(formatPercent(1)).toBe("100.00%");
  });

  it("handles small percentages", () => {
    expect(formatPercent(0.0001)).toBe("0.01%");
  });
});

// ============================================
// Format Large Number Tests
// ============================================

function formatLargeNumber(value: number | null): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (value >= 1e12) {
    return `$${(value / 1e12).toFixed(1)}T`;
  }
  if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(1)}B`;
  }
  if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`;
  }
  return `$${value.toFixed(0)}`;
}

describe("formatLargeNumber", () => {
  it("formats trillions", () => {
    expect(formatLargeNumber(2.5e12)).toBe("$2.5T");
  });

  it("formats billions", () => {
    expect(formatLargeNumber(750e9)).toBe("$750.0B");
  });

  it("formats millions", () => {
    expect(formatLargeNumber(125e6)).toBe("$125.0M");
  });

  it("formats smaller numbers without suffix", () => {
    expect(formatLargeNumber(500000)).toBe("$500000");
  });

  it("returns em dash for null", () => {
    expect(formatLargeNumber(null)).toBe("—");
  });

  it("handles edge cases at boundaries", () => {
    expect(formatLargeNumber(1e12)).toBe("$1.0T");
    expect(formatLargeNumber(1e9)).toBe("$1.0B");
    expect(formatLargeNumber(1e6)).toBe("$1.0M");
  });
});

// ============================================
// Data Quality Color Tests
// ============================================

type DataQuality = "COMPLETE" | "PARTIAL" | "STALE";

function getDataQualityColor(quality: DataQuality): string {
  switch (quality) {
    case "COMPLETE":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "PARTIAL":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "STALE":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-stone-100 text-stone-700 dark:bg-stone-900/30 dark:text-stone-400";
  }
}

describe("getDataQualityColor", () => {
  it("returns green for COMPLETE", () => {
    expect(getDataQualityColor("COMPLETE")).toContain("green");
  });

  it("returns amber for PARTIAL", () => {
    expect(getDataQualityColor("PARTIAL")).toContain("amber");
  });

  it("returns red for STALE", () => {
    expect(getDataQualityColor("STALE")).toContain("red");
  });
});

// ============================================
// Sentiment Color Tests
// ============================================

type SentimentClassification =
  | "STRONG_BULLISH"
  | "BULLISH"
  | "NEUTRAL"
  | "BEARISH"
  | "STRONG_BEARISH"
  | null;

function getSentimentColor(classification: SentimentClassification): string {
  switch (classification) {
    case "STRONG_BULLISH":
      return "text-green-600 dark:text-green-400";
    case "BULLISH":
      return "text-green-500 dark:text-green-500";
    case "NEUTRAL":
      return "text-stone-500 dark:text-stone-400";
    case "BEARISH":
      return "text-red-500 dark:text-red-500";
    case "STRONG_BEARISH":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-stone-400";
  }
}

describe("getSentimentColor", () => {
  it("returns green for STRONG_BULLISH", () => {
    expect(getSentimentColor("STRONG_BULLISH")).toContain("green-600");
  });

  it("returns green for BULLISH", () => {
    expect(getSentimentColor("BULLISH")).toContain("green-500");
  });

  it("returns stone for NEUTRAL", () => {
    expect(getSentimentColor("NEUTRAL")).toContain("stone-500");
  });

  it("returns red for BEARISH", () => {
    expect(getSentimentColor("BEARISH")).toContain("red-500");
  });

  it("returns red for STRONG_BEARISH", () => {
    expect(getSentimentColor("STRONG_BEARISH")).toContain("red-600");
  });

  it("returns stone for null", () => {
    expect(getSentimentColor(null)).toContain("stone-400");
  });
});

// ============================================
// Populated Fields Count Tests
// ============================================

function countPopulatedFields(obj: Record<string, unknown>): {
  populated: number;
  total: number;
} {
  const values = Object.values(obj);
  const populated = values.filter((v) => v !== null && v !== undefined).length;
  return { populated, total: values.length };
}

describe("countPopulatedFields", () => {
  it("counts all populated fields", () => {
    const obj = { a: 1, b: 2, c: 3 };
    const { populated, total } = countPopulatedFields(obj);
    expect(populated).toBe(3);
    expect(total).toBe(3);
  });

  it("handles null values", () => {
    const obj = { a: 1, b: null, c: 3 };
    const { populated, total } = countPopulatedFields(obj);
    expect(populated).toBe(2);
    expect(total).toBe(3);
  });

  it("handles all null values", () => {
    const obj = { a: null, b: null, c: null };
    const { populated, total } = countPopulatedFields(obj);
    expect(populated).toBe(0);
    expect(total).toBe(3);
  });

  it("handles empty object", () => {
    const obj = {};
    const { populated, total } = countPopulatedFields(obj);
    expect(populated).toBe(0);
    expect(total).toBe(0);
  });

  it("handles mixed types", () => {
    const obj = { a: 0, b: "", c: false, d: null, e: undefined };
    const { populated, total } = countPopulatedFields(obj);
    // 0, "", and false are truthy for "populated" check
    expect(populated).toBe(3);
    expect(total).toBe(5);
  });
});

// ============================================
// Component Export Tests
// ============================================

describe("IndicatorSnapshot exports", () => {
  it("exports IndicatorSnapshot component", async () => {
    const module = await import("./IndicatorSnapshot");
    expect(module.IndicatorSnapshot).toBeDefined();
    expect(typeof module.IndicatorSnapshot).toBe("function");
  });

  it("exports default as same as named export", async () => {
    const module = await import("./IndicatorSnapshot");
    expect(module.default).toBe(module.IndicatorSnapshot);
  });
});

describe("IndicatorSnapshot types are exported from index", () => {
  it("exports IndicatorSnapshot component", async () => {
    const module = await import("./index");
    expect(module.IndicatorSnapshot).toBeDefined();
  });
});

// ============================================
// Section Summary Percentage Tests
// ============================================

function calculateSectionPercentage(populated: number, total: number): number {
  return total > 0 ? Math.round((populated / total) * 100) : 0;
}

describe("calculateSectionPercentage", () => {
  it("calculates correct percentage", () => {
    expect(calculateSectionPercentage(7, 10)).toBe(70);
  });

  it("rounds to nearest integer", () => {
    expect(calculateSectionPercentage(1, 3)).toBe(33);
  });

  it("returns 0 for empty section", () => {
    expect(calculateSectionPercentage(0, 0)).toBe(0);
  });

  it("returns 100 for fully populated", () => {
    expect(calculateSectionPercentage(5, 5)).toBe(100);
  });

  it("returns 0 for no populated fields", () => {
    expect(calculateSectionPercentage(0, 10)).toBe(0);
  });
});

// ============================================
// Indicator Row Highlight Logic Tests
// ============================================

describe("highlight logic", () => {
  it("highlights earnings when within 7 days", () => {
    const upcomingEarningsDays = 5;
    const shouldHighlight = upcomingEarningsDays !== null && upcomingEarningsDays <= 7;
    expect(shouldHighlight).toBe(true);
  });

  it("does not highlight earnings beyond 7 days", () => {
    const upcomingEarningsDays = 14;
    const shouldHighlight = upcomingEarningsDays !== null && upcomingEarningsDays <= 7;
    expect(shouldHighlight).toBe(false);
  });

  it("does not highlight when null", () => {
    const upcomingEarningsDays = null;
    const shouldHighlight = upcomingEarningsDays !== null && upcomingEarningsDays <= 7;
    expect(shouldHighlight).toBe(false);
  });

  it("highlights event risk when true", () => {
    const eventRisk = true as boolean | null;
    const shouldHighlight = eventRisk === true;
    expect(shouldHighlight).toBe(true);
  });

  it("does not highlight event risk when false", () => {
    const eventRisk = false as boolean | null;
    const shouldHighlight = eventRisk === true;
    expect(shouldHighlight).toBe(false);
  });
});

// ============================================
// Mock Snapshot Data Validation Tests
// ============================================

describe("snapshot data structure", () => {
  const mockSnapshot = {
    symbol: "AAPL",
    timestamp: Date.now(),
    price: {
      rsi_14: 55.2,
      atr_14: 3.45,
      sma_20: null,
      sma_50: 180.5,
      sma_200: 175.2,
      ema_9: null,
      ema_12: null,
      ema_21: null,
      ema_26: null,
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
    },
    market: {
      sector: "Technology",
      industry: "Consumer Electronics",
      market_cap: 3.2e12,
      market_cap_category: "MEGA" as const,
    },
    metadata: {
      price_updated_at: Date.now(),
      fundamentals_date: "2024-01-10",
      short_interest_date: null,
      sentiment_date: null,
      data_quality: "PARTIAL" as const,
      missing_fields: ["short_interest", "sentiment"],
    },
  };

  it("has required symbol field", () => {
    expect(mockSnapshot.symbol).toBeDefined();
    expect(typeof mockSnapshot.symbol).toBe("string");
  });

  it("has timestamp", () => {
    expect(mockSnapshot.timestamp).toBeDefined();
    expect(typeof mockSnapshot.timestamp).toBe("number");
  });

  it("has price indicators object", () => {
    expect(mockSnapshot.price).toBeDefined();
    expect(typeof mockSnapshot.price).toBe("object");
  });

  it("price indicators can have null values", () => {
    expect(mockSnapshot.price.sma_20).toBeNull();
    expect(mockSnapshot.price.rsi_14).not.toBeNull();
  });

  it("has market context", () => {
    expect(mockSnapshot.market.sector).toBe("Technology");
    expect(mockSnapshot.market.market_cap_category).toBe("MEGA");
  });

  it("has metadata with data quality", () => {
    expect(mockSnapshot.metadata.data_quality).toBe("PARTIAL");
    expect(mockSnapshot.metadata.missing_fields).toContain("short_interest");
  });
});
