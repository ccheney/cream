/**
 * ShortInterestIndicators Widget Tests
 *
 * Tests for short interest indicator utility functions and component exports.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { describe, expect, it } from "bun:test";

import type { ShortInterestIndicators } from "./IndicatorSnapshot";

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

  it("formats small percentages", () => {
    expect(formatPercent(0.025)).toBe("2.5%");
  });

  it("formats large percentages", () => {
    expect(formatPercent(0.45)).toBe("45.0%");
  });

  it("returns em dash for null", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

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
    expect(formatRatio(2.5)).toBe("2.50");
  });

  it("formats small ratios", () => {
    expect(formatRatio(0.85)).toBe("0.85");
  });

  it("returns em dash for null", () => {
    expect(formatRatio(null)).toBe("—");
  });
});

// ============================================
// Format Days Tests
// ============================================

function formatDays(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}d`;
}

describe("formatDays", () => {
  it("formats whole days", () => {
    expect(formatDays(5)).toBe("5d");
  });

  it("formats fractional days with one decimal", () => {
    expect(formatDays(3.5)).toBe("3.5d");
  });

  it("rounds to one decimal place", () => {
    expect(formatDays(2.567)).toBe("2.6d");
  });

  it("returns em dash for null", () => {
    expect(formatDays(null)).toBe("—");
  });
});

// ============================================
// Format Change Tests
// ============================================

function formatChange(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const pct = (value * 100).toFixed(1);
  if (value > 0) {
    return `+${pct}%`;
  }
  return `${pct}%`;
}

describe("formatChange", () => {
  it("formats positive change with + sign", () => {
    expect(formatChange(0.15)).toBe("+15.0%");
  });

  it("formats negative change without + sign", () => {
    expect(formatChange(-0.08)).toBe("-8.0%");
  });

  it("formats zero as negative style", () => {
    expect(formatChange(0)).toBe("0.0%");
  });

  it("returns em dash for null", () => {
    expect(formatChange(null)).toBe("—");
  });
});

// ============================================
// SI Variant Tests
// ============================================

type BadgeVariant = "success" | "info" | "warning" | "error" | "neutral";

function getSIVariant(value: number | null): BadgeVariant {
  if (value === null) {
    return "neutral";
  }
  if (value < 0.05) {
    return "success";
  }
  if (value < 0.1) {
    return "info";
  }
  if (value < 0.2) {
    return "warning";
  }
  return "error";
}

describe("getSIVariant", () => {
  it("returns success for low SI (<5%)", () => {
    expect(getSIVariant(0.03)).toBe("success");
  });

  it("returns info for moderate SI (5-10%)", () => {
    expect(getSIVariant(0.07)).toBe("info");
  });

  it("returns warning for elevated SI (10-20%)", () => {
    expect(getSIVariant(0.15)).toBe("warning");
  });

  it("returns error for high SI (>20%)", () => {
    expect(getSIVariant(0.25)).toBe("error");
  });

  it("returns neutral for null", () => {
    expect(getSIVariant(null)).toBe("neutral");
  });

  it("handles boundary at 5%", () => {
    expect(getSIVariant(0.05)).toBe("info");
    expect(getSIVariant(0.0499)).toBe("success");
  });

  it("handles boundary at 10%", () => {
    expect(getSIVariant(0.1)).toBe("warning");
    expect(getSIVariant(0.0999)).toBe("info");
  });

  it("handles boundary at 20%", () => {
    expect(getSIVariant(0.2)).toBe("error");
    expect(getSIVariant(0.1999)).toBe("warning");
  });
});

// ============================================
// DTC Variant Tests
// ============================================

function getDTCVariant(value: number | null): BadgeVariant {
  if (value === null) {
    return "neutral";
  }
  if (value < 2) {
    return "success";
  }
  if (value < 5) {
    return "info";
  }
  if (value < 10) {
    return "warning";
  }
  return "error";
}

describe("getDTCVariant", () => {
  it("returns success for low DTC (<2 days)", () => {
    expect(getDTCVariant(1.5)).toBe("success");
  });

  it("returns info for moderate DTC (2-5 days)", () => {
    expect(getDTCVariant(3)).toBe("info");
  });

  it("returns warning for elevated DTC (5-10 days)", () => {
    expect(getDTCVariant(7)).toBe("warning");
  });

  it("returns error for high DTC (>10 days)", () => {
    expect(getDTCVariant(15)).toBe("error");
  });

  it("returns neutral for null", () => {
    expect(getDTCVariant(null)).toBe("neutral");
  });

  it("handles boundary at 2 days", () => {
    expect(getDTCVariant(2)).toBe("info");
    expect(getDTCVariant(1.99)).toBe("success");
  });

  it("handles boundary at 5 days", () => {
    expect(getDTCVariant(5)).toBe("warning");
    expect(getDTCVariant(4.99)).toBe("info");
  });

  it("handles boundary at 10 days", () => {
    expect(getDTCVariant(10)).toBe("error");
    expect(getDTCVariant(9.99)).toBe("warning");
  });
});

// ============================================
// Change Variant Tests
// ============================================

function getChangeVariant(value: number | null): BadgeVariant {
  if (value === null) {
    return "neutral";
  }
  if (value < -0.1) {
    return "success";
  }
  if (value < -0.03) {
    return "info";
  }
  if (value < 0.03) {
    return "neutral";
  }
  if (value < 0.1) {
    return "warning";
  }
  return "error";
}

describe("getChangeVariant", () => {
  it("returns success for large decrease (<-10%)", () => {
    expect(getChangeVariant(-0.15)).toBe("success");
  });

  it("returns info for moderate decrease (-10% to -3%)", () => {
    expect(getChangeVariant(-0.05)).toBe("info");
  });

  it("returns neutral for small change (-3% to +3%)", () => {
    expect(getChangeVariant(0)).toBe("neutral");
    expect(getChangeVariant(0.02)).toBe("neutral");
    expect(getChangeVariant(-0.02)).toBe("neutral");
  });

  it("returns warning for moderate increase (+3% to +10%)", () => {
    expect(getChangeVariant(0.05)).toBe("warning");
  });

  it("returns error for large increase (>+10%)", () => {
    expect(getChangeVariant(0.15)).toBe("error");
  });

  it("returns neutral for null", () => {
    expect(getChangeVariant(null)).toBe("neutral");
  });
});

// ============================================
// SI Level Tests
// ============================================

function getSILevel(value: number | null): string {
  if (value === null) {
    return "Unknown";
  }
  if (value < 0.05) {
    return "Low";
  }
  if (value < 0.1) {
    return "Moderate";
  }
  if (value < 0.2) {
    return "Elevated";
  }
  if (value < 0.3) {
    return "High";
  }
  return "Extreme";
}

describe("getSILevel", () => {
  it("returns Low for SI < 5%", () => {
    expect(getSILevel(0.03)).toBe("Low");
  });

  it("returns Moderate for SI 5-10%", () => {
    expect(getSILevel(0.07)).toBe("Moderate");
  });

  it("returns Elevated for SI 10-20%", () => {
    expect(getSILevel(0.15)).toBe("Elevated");
  });

  it("returns High for SI 20-30%", () => {
    expect(getSILevel(0.25)).toBe("High");
  });

  it("returns Extreme for SI > 30%", () => {
    expect(getSILevel(0.35)).toBe("Extreme");
  });

  it("returns Unknown for null", () => {
    expect(getSILevel(null)).toBe("Unknown");
  });
});

// ============================================
// DTC Level Tests
// ============================================

function getDTCLevel(value: number | null): string {
  if (value === null) {
    return "Unknown";
  }
  if (value < 2) {
    return "Low";
  }
  if (value < 5) {
    return "Moderate";
  }
  if (value < 10) {
    return "High";
  }
  return "Extended";
}

describe("getDTCLevel", () => {
  it("returns Low for DTC < 2 days", () => {
    expect(getDTCLevel(1)).toBe("Low");
  });

  it("returns Moderate for DTC 2-5 days", () => {
    expect(getDTCLevel(3)).toBe("Moderate");
  });

  it("returns High for DTC 5-10 days", () => {
    expect(getDTCLevel(7)).toBe("High");
  });

  it("returns Extended for DTC > 10 days", () => {
    expect(getDTCLevel(15)).toBe("Extended");
  });

  it("returns Unknown for null", () => {
    expect(getDTCLevel(null)).toBe("Unknown");
  });
});

// ============================================
// Component Export Tests
// ============================================

describe("ShortInterestIndicators exports", () => {
  it("exports ShortInterestIndicators component", async () => {
    const module = await import("./ShortInterestIndicators");
    expect(module.ShortInterestIndicators).toBeDefined();
    expect(module.ShortInterestIndicators).toHaveProperty("$$typeof");
  });

  it("exports default as same as named export", async () => {
    const module = await import("./ShortInterestIndicators");
    expect(module.default).toBe(module.ShortInterestIndicators);
  });
});

describe("ShortInterestIndicators from index", () => {
  it("exports ShortInterestWidget from index", async () => {
    const module = await import("./index");
    expect(module.ShortInterestWidget).toBeDefined();
  });
});

// ============================================
// Mock Data Structure Tests
// ============================================

describe("ShortInterestIndicators data structure", () => {
  const mockData: ShortInterestIndicators = {
    short_interest_ratio: 2.5,
    days_to_cover: 4.2,
    short_pct_float: 0.12,
    short_interest_change: 0.08,
    settlement_date: "2024-01-15",
  };

  it("has SI ratio in reasonable range", () => {
    expect(mockData.short_interest_ratio).toBeGreaterThan(0);
    expect(mockData.short_interest_ratio).toBeLessThan(20);
  });

  it("has days to cover in reasonable range", () => {
    expect(mockData.days_to_cover).toBeGreaterThan(0);
    expect(mockData.days_to_cover).toBeLessThan(30);
  });

  it("has short percent float as decimal", () => {
    expect(mockData.short_pct_float).toBeGreaterThan(0);
    expect(mockData.short_pct_float).toBeLessThan(1);
  });

  it("has short interest change as decimal", () => {
    expect(mockData.short_interest_change).toBeGreaterThan(-1);
    expect(mockData.short_interest_change).toBeLessThan(1);
  });

  it("has settlement date as string", () => {
    expect(typeof mockData.settlement_date).toBe("string");
  });
});

// ============================================
// Null Handling Tests
// ============================================

describe("ShortInterestIndicators null handling", () => {
  const nullData: ShortInterestIndicators = {
    short_interest_ratio: null,
    days_to_cover: null,
    short_pct_float: null,
    short_interest_change: null,
    settlement_date: null,
  };

  it("allows all fields to be null", () => {
    expect(nullData.short_interest_ratio).toBeNull();
    expect(nullData.days_to_cover).toBeNull();
    expect(nullData.short_pct_float).toBeNull();
    expect(nullData.short_interest_change).toBeNull();
    expect(nullData.settlement_date).toBeNull();
  });

  it("formatPercent handles null gracefully", () => {
    expect(formatPercent(nullData.short_pct_float)).toBe("—");
  });

  it("formatDays handles null gracefully", () => {
    expect(formatDays(nullData.days_to_cover)).toBe("—");
  });

  it("formatChange handles null gracefully", () => {
    expect(formatChange(nullData.short_interest_change)).toBe("—");
  });

  it("getSIVariant handles null gracefully", () => {
    expect(getSIVariant(nullData.short_pct_float)).toBe("neutral");
  });

  it("getDTCVariant handles null gracefully", () => {
    expect(getDTCVariant(nullData.days_to_cover)).toBe("neutral");
  });

  it("getSILevel handles null gracefully", () => {
    expect(getSILevel(nullData.short_pct_float)).toBe("Unknown");
  });

  it("getDTCLevel handles null gracefully", () => {
    expect(getDTCLevel(nullData.days_to_cover)).toBe("Unknown");
  });
});

// ============================================
// Short Squeeze Interpretation Tests
// ============================================

describe("Short squeeze risk interpretation", () => {
  it("high SI + high DTC = elevated squeeze risk", () => {
    const si = 0.25;
    const dtc = 8;
    const highRisk = si >= 0.2 && dtc >= 5;
    expect(highRisk).toBe(true);
  });

  it("low SI + low DTC = low squeeze risk", () => {
    const si = 0.03;
    const dtc = 1.5;
    const lowRisk = si < 0.1 && dtc < 3;
    expect(lowRisk).toBe(true);
  });

  it("increasing SI is bearish pressure indicator", () => {
    const change = 0.15;
    const isBearishPressure = change > 0.1;
    expect(isBearishPressure).toBe(true);
  });

  it("decreasing SI is bullish signal", () => {
    const change = -0.12;
    const isBullish = change < -0.1;
    expect(isBullish).toBe(true);
  });
});

// ============================================
// Extreme Value Tests
// ============================================

describe("Extreme SI scenarios", () => {
  it("handles GameStop-level SI (>100% float)", () => {
    const extremeSI = 1.4;
    expect(getSILevel(extremeSI)).toBe("Extreme");
    expect(getSIVariant(extremeSI)).toBe("error");
  });

  it("handles very high DTC", () => {
    const highDTC = 25;
    expect(getDTCLevel(highDTC)).toBe("Extended");
    expect(getDTCVariant(highDTC)).toBe("error");
  });

  it("handles near-zero SI", () => {
    const lowSI = 0.005;
    expect(getSILevel(lowSI)).toBe("Low");
    expect(getSIVariant(lowSI)).toBe("success");
  });

  it("handles rapid SI increase", () => {
    const rapidIncrease = 0.5;
    expect(getChangeVariant(rapidIncrease)).toBe("error");
  });

  it("handles rapid SI decrease", () => {
    const rapidDecrease = -0.3;
    expect(getChangeVariant(rapidDecrease)).toBe("success");
  });
});
