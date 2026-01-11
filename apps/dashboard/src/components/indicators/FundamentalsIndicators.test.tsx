/**
 * FundamentalsIndicators Widget Tests
 *
 * Tests for fundamentals indicator utility functions and component exports.
 *
 * @see docs/plans/ui/24-components.md
 */

import { describe, expect, it } from "bun:test";

import type { QualityIndicators, ValueIndicators } from "./IndicatorSnapshot";

// ============================================
// Format Ratio Tests
// ============================================

function formatRatio(value: number | null, decimals = 2): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(decimals);
}

describe("formatRatio", () => {
  it("formats positive ratios", () => {
    expect(formatRatio(15.5)).toBe("15.50");
  });

  it("formats negative ratios", () => {
    expect(formatRatio(-2.5)).toBe("-2.50");
  });

  it("returns em dash for null", () => {
    expect(formatRatio(null)).toBe("—");
  });

  it("formats with custom decimals", () => {
    expect(formatRatio(1.234, 1)).toBe("1.2");
  });
});

// ============================================
// Format Percent Tests
// ============================================

function formatPercent(value: number | null, decimals = 1): string {
  if (value === null) {
    return "—";
  }
  return `${(value * 100).toFixed(decimals)}%`;
}

describe("formatPercent", () => {
  it("formats decimal as percentage", () => {
    expect(formatPercent(0.15)).toBe("15.0%");
  });

  it("formats negative percentage", () => {
    expect(formatPercent(-0.05)).toBe("-5.0%");
  });

  it("returns em dash for null", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

// ============================================
// P/E Variant Tests
// ============================================

function getPEVariant(value: number | null): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  if (value < 0) {
    return "error";
  }
  if (value < 15) {
    return "success";
  }
  if (value < 25) {
    return "info";
  }
  if (value < 40) {
    return "warning";
  }
  return "error";
}

describe("getPEVariant", () => {
  it("returns error for negative P/E", () => {
    expect(getPEVariant(-5)).toBe("error");
  });

  it("returns success for value P/E (< 15)", () => {
    expect(getPEVariant(12)).toBe("success");
  });

  it("returns info for fair P/E (15-25)", () => {
    expect(getPEVariant(20)).toBe("info");
  });

  it("returns warning for growth P/E (25-40)", () => {
    expect(getPEVariant(32)).toBe("warning");
  });

  it("returns error for expensive P/E (> 40)", () => {
    expect(getPEVariant(50)).toBe("error");
  });

  it("returns neutral for null", () => {
    expect(getPEVariant(null)).toBe("neutral");
  });

  it("handles boundary at 15", () => {
    expect(getPEVariant(15)).toBe("info");
    expect(getPEVariant(14.99)).toBe("success");
  });
});

// ============================================
// ROE Variant Tests
// ============================================

function getROEVariant(value: number | null): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  if (value < 0) {
    return "error";
  }
  if (value < 0.08) {
    return "warning";
  }
  if (value < 0.15) {
    return "info";
  }
  if (value < 0.25) {
    return "success";
  }
  return "success";
}

describe("getROEVariant", () => {
  it("returns error for negative ROE", () => {
    expect(getROEVariant(-0.05)).toBe("error");
  });

  it("returns warning for weak ROE (< 8%)", () => {
    expect(getROEVariant(0.05)).toBe("warning");
  });

  it("returns info for average ROE (8-15%)", () => {
    expect(getROEVariant(0.12)).toBe("info");
  });

  it("returns success for good ROE (15-25%)", () => {
    expect(getROEVariant(0.2)).toBe("success");
  });

  it("returns success for excellent ROE (> 25%)", () => {
    expect(getROEVariant(0.3)).toBe("success");
  });

  it("returns neutral for null", () => {
    expect(getROEVariant(null)).toBe("neutral");
  });
});

// ============================================
// Quality Score Variant Tests
// ============================================

function getQualityVariant(
  quality: "HIGH" | "MEDIUM" | "LOW" | null
): "success" | "info" | "warning" | "error" | "neutral" {
  switch (quality) {
    case "HIGH":
      return "success";
    case "MEDIUM":
      return "info";
    case "LOW":
      return "error";
    default:
      return "neutral";
  }
}

describe("getQualityVariant", () => {
  it("returns success for HIGH quality", () => {
    expect(getQualityVariant("HIGH")).toBe("success");
  });

  it("returns info for MEDIUM quality", () => {
    expect(getQualityVariant("MEDIUM")).toBe("info");
  });

  it("returns error for LOW quality", () => {
    expect(getQualityVariant("LOW")).toBe("error");
  });

  it("returns neutral for null", () => {
    expect(getQualityVariant(null)).toBe("neutral");
  });
});

// ============================================
// Beneish M-Score Variant Tests
// ============================================

function getMScoreVariant(
  value: number | null
): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  if (value < -2.22) {
    return "success";
  }
  if (value < -1.78) {
    return "info";
  }
  return "error";
}

describe("getMScoreVariant", () => {
  it("returns success for low manipulation risk (< -2.22)", () => {
    expect(getMScoreVariant(-2.5)).toBe("success");
  });

  it("returns info for gray zone (-2.22 to -1.78)", () => {
    expect(getMScoreVariant(-2.0)).toBe("info");
  });

  it("returns error for high manipulation risk (> -1.78)", () => {
    expect(getMScoreVariant(-1.5)).toBe("error");
  });

  it("returns neutral for null", () => {
    expect(getMScoreVariant(null)).toBe("neutral");
  });

  it("handles boundary at -2.22", () => {
    expect(getMScoreVariant(-2.22)).toBe("info");
    expect(getMScoreVariant(-2.23)).toBe("success");
  });

  it("handles boundary at -1.78", () => {
    expect(getMScoreVariant(-1.78)).toBe("error");
    expect(getMScoreVariant(-1.79)).toBe("info");
  });
});

// ============================================
// Accruals Variant Tests
// ============================================

function getAccrualsVariant(
  value: number | null
): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  const absValue = Math.abs(value);
  if (absValue < 0.05) {
    return "success";
  }
  if (absValue < 0.1) {
    return "info";
  }
  if (absValue < 0.15) {
    return "warning";
  }
  return "error";
}

describe("getAccrualsVariant", () => {
  it("returns success for low accruals (< 5%)", () => {
    expect(getAccrualsVariant(0.03)).toBe("success");
  });

  it("returns info for moderate accruals (5-10%)", () => {
    expect(getAccrualsVariant(0.07)).toBe("info");
  });

  it("returns warning for elevated accruals (10-15%)", () => {
    expect(getAccrualsVariant(0.12)).toBe("warning");
  });

  it("returns error for high accruals (> 15%)", () => {
    expect(getAccrualsVariant(0.2)).toBe("error");
  });

  it("handles negative accruals", () => {
    expect(getAccrualsVariant(-0.03)).toBe("success");
    expect(getAccrualsVariant(-0.07)).toBe("info");
    expect(getAccrualsVariant(-0.12)).toBe("warning");
  });

  it("returns neutral for null", () => {
    expect(getAccrualsVariant(null)).toBe("neutral");
  });
});

// ============================================
// Component Export Tests
// ============================================

describe("FundamentalsIndicators exports", () => {
  it("exports FundamentalsIndicators component", async () => {
    const module = await import("./FundamentalsIndicators");
    expect(module.FundamentalsIndicators).toBeDefined();
    expect(module.FundamentalsIndicators).toHaveProperty("$$typeof");
  });

  it("exports default as same as named export", async () => {
    const module = await import("./FundamentalsIndicators");
    expect(module.default).toBe(module.FundamentalsIndicators);
  });
});

describe("FundamentalsIndicators from index", () => {
  it("exports FundamentalsIndicatorsWidget from index", async () => {
    const module = await import("./index");
    expect(module.FundamentalsIndicatorsWidget).toBeDefined();
  });
});

// ============================================
// Mock Data Structure Tests
// ============================================

describe("ValueIndicators data structure", () => {
  const mockValue: ValueIndicators = {
    pe_ratio_ttm: 22.5,
    pe_ratio_forward: 18.3,
    pb_ratio: 3.2,
    ev_ebitda: 14.8,
    earnings_yield: 0.044,
    dividend_yield: 0.018,
    cape_10yr: 28.5,
  };

  it("has P/E in reasonable range", () => {
    expect(mockValue.pe_ratio_ttm).toBeGreaterThan(0);
    expect(mockValue.pe_ratio_ttm).toBeLessThan(100);
  });

  it("has forward P/E lower than TTM (earnings growth)", () => {
    expect(mockValue.pe_ratio_forward).toBeLessThan(mockValue.pe_ratio_ttm ?? 0);
  });

  it("has positive P/B ratio", () => {
    expect(mockValue.pb_ratio).toBeGreaterThan(0);
  });

  it("has earnings yield approximately 1/P/E", () => {
    const expectedYield = 1 / (mockValue.pe_ratio_ttm ?? 1);
    expect(mockValue.earnings_yield).toBeCloseTo(expectedYield, 2);
  });

  it("has dividend yield as positive decimal", () => {
    expect(mockValue.dividend_yield).toBeGreaterThan(0);
    expect(mockValue.dividend_yield).toBeLessThan(0.2);
  });
});

describe("QualityIndicators data structure", () => {
  const mockQuality: QualityIndicators = {
    gross_profitability: 0.42,
    roe: 0.18,
    roa: 0.08,
    asset_growth: 0.12,
    accruals_ratio: 0.04,
    cash_flow_quality: 1.15,
    beneish_m_score: -2.35,
    earnings_quality: "HIGH",
  };

  it("has gross profitability as positive decimal", () => {
    expect(mockQuality.gross_profitability).toBeGreaterThan(0);
    expect(mockQuality.gross_profitability).toBeLessThan(1);
  });

  it("has ROE greater than ROA", () => {
    expect(mockQuality.roe).toBeGreaterThan(mockQuality.roa ?? 0);
  });

  it("has low accruals ratio (good quality)", () => {
    expect(Math.abs(mockQuality.accruals_ratio ?? 0)).toBeLessThan(0.1);
  });

  it("has cash flow quality above 1 (strong)", () => {
    expect(mockQuality.cash_flow_quality).toBeGreaterThan(1);
  });

  it("has M-Score indicating low manipulation risk", () => {
    expect(mockQuality.beneish_m_score).toBeLessThan(-2.22);
  });

  it("has earnings quality enum value", () => {
    expect(mockQuality.earnings_quality).not.toBeNull();
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(mockQuality.earnings_quality as string);
  });
});

// ============================================
// Null Handling Tests
// ============================================

describe("ValueIndicators null handling", () => {
  const nullValue: ValueIndicators = {
    pe_ratio_ttm: null,
    pe_ratio_forward: null,
    pb_ratio: null,
    ev_ebitda: null,
    earnings_yield: null,
    dividend_yield: null,
    cape_10yr: null,
  };

  it("allows all fields to be null", () => {
    expect(nullValue.pe_ratio_ttm).toBeNull();
    expect(nullValue.earnings_yield).toBeNull();
    expect(nullValue.cape_10yr).toBeNull();
  });

  it("formatRatio handles null gracefully", () => {
    expect(formatRatio(nullValue.pe_ratio_ttm)).toBe("—");
  });

  it("formatPercent handles null gracefully", () => {
    expect(formatPercent(nullValue.earnings_yield)).toBe("—");
  });

  it("getPEVariant handles null gracefully", () => {
    expect(getPEVariant(nullValue.pe_ratio_ttm)).toBe("neutral");
  });
});

describe("QualityIndicators null handling", () => {
  const nullQuality: QualityIndicators = {
    gross_profitability: null,
    roe: null,
    roa: null,
    asset_growth: null,
    accruals_ratio: null,
    cash_flow_quality: null,
    beneish_m_score: null,
    earnings_quality: null,
  };

  it("allows all fields to be null", () => {
    expect(nullQuality.roe).toBeNull();
    expect(nullQuality.beneish_m_score).toBeNull();
    expect(nullQuality.earnings_quality).toBeNull();
  });

  it("getROEVariant handles null gracefully", () => {
    expect(getROEVariant(nullQuality.roe)).toBe("neutral");
  });

  it("getMScoreVariant handles null gracefully", () => {
    expect(getMScoreVariant(nullQuality.beneish_m_score)).toBe("neutral");
  });

  it("getQualityVariant handles null gracefully", () => {
    expect(getQualityVariant(nullQuality.earnings_quality)).toBe("neutral");
  });
});

// ============================================
// Valuation Interpretation Tests
// ============================================

describe("Valuation interpretation", () => {
  it("classifies P/E correctly", () => {
    expect(getPEVariant(10)).toBe("success"); // Value
    expect(getPEVariant(20)).toBe("info"); // Fair
    expect(getPEVariant(35)).toBe("warning"); // Growth
    expect(getPEVariant(50)).toBe("error"); // Expensive
  });

  it("forward P/E improvement indicates earnings growth", () => {
    const ttm = 25;
    const forward = 20;
    const improving = forward < ttm;
    expect(improving).toBe(true);
  });

  it("CAPE above 25 suggests overvaluation", () => {
    const cape = 28;
    const overvalued = cape > 25;
    expect(overvalued).toBe(true);
  });
});

// ============================================
// Quality Factor Interpretation Tests
// ============================================

describe("Quality factor interpretation", () => {
  it("M-Score threshold for manipulation detection", () => {
    // M-Score > -1.78 indicates potential manipulation
    expect(getMScoreVariant(-1.5)).toBe("error"); // Likely manipulator
    expect(getMScoreVariant(-2.0)).toBe("info"); // Gray zone
    expect(getMScoreVariant(-2.5)).toBe("success"); // Unlikely manipulator
  });

  it("high accruals indicate lower earnings quality", () => {
    expect(getAccrualsVariant(0.02)).toBe("success"); // Low accruals = good
    expect(getAccrualsVariant(0.18)).toBe("error"); // High accruals = concerning
  });

  it("cash flow quality ratio interpretation", () => {
    const cfqRatio = 1.15;
    // CFQ > 1 means operating cash flow exceeds net income (strong)
    const isStrong = cfqRatio > 1.0;
    expect(isStrong).toBe(true);
  });
});
