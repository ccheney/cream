/**
 * OptionsIndicators Widget Tests
 *
 * Tests for options indicator utility functions and component exports.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { describe, expect, it } from "bun:test";

import type { OptionsIndicators } from "./IndicatorSnapshot";

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
    expect(formatValue(0.85)).toBe("0.85");
  });

  it("formats with custom decimals", () => {
    expect(formatValue(1.2346, 3)).toBe("1.235");
  });

  it("returns em dash for null", () => {
    expect(formatValue(null)).toBe("—");
  });

  it("formats zero correctly", () => {
    expect(formatValue(0)).toBe("0.00");
  });
});

// ============================================
// Format IV Tests
// ============================================

function formatIV(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

describe("formatIV", () => {
  it("formats IV as percentage", () => {
    expect(formatIV(0.35)).toBe("35.0%");
  });

  it("formats low IV", () => {
    expect(formatIV(0.15)).toBe("15.0%");
  });

  it("formats high IV", () => {
    expect(formatIV(0.75)).toBe("75.0%");
  });

  it("returns em dash for null", () => {
    expect(formatIV(null)).toBe("—");
  });
});

// ============================================
// IV Variant Tests
// ============================================

function getIVVariant(value: number | null): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  if (value < 0.2) {
    return "success";
  }
  if (value < 0.35) {
    return "info";
  }
  if (value < 0.5) {
    return "warning";
  }
  return "error";
}

describe("getIVVariant", () => {
  it("returns success for low IV (<20%)", () => {
    expect(getIVVariant(0.15)).toBe("success");
  });

  it("returns info for normal IV (20-35%)", () => {
    expect(getIVVariant(0.28)).toBe("info");
  });

  it("returns warning for elevated IV (35-50%)", () => {
    expect(getIVVariant(0.42)).toBe("warning");
  });

  it("returns error for high IV (>50%)", () => {
    expect(getIVVariant(0.65)).toBe("error");
  });

  it("returns neutral for null", () => {
    expect(getIVVariant(null)).toBe("neutral");
  });

  it("handles boundary at 20%", () => {
    expect(getIVVariant(0.2)).toBe("info");
    expect(getIVVariant(0.19)).toBe("success");
  });

  it("handles boundary at 35%", () => {
    expect(getIVVariant(0.35)).toBe("warning");
    expect(getIVVariant(0.34)).toBe("info");
  });
});

// ============================================
// Skew Variant Tests
// ============================================

function getSkewVariant(
  value: number | null
): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  if (value < -0.1) {
    return "error";
  }
  if (value < -0.03) {
    return "warning";
  }
  if (value < 0.03) {
    return "neutral";
  }
  if (value < 0.1) {
    return "info";
  }
  return "success";
}

describe("getSkewVariant", () => {
  it("returns error for strong negative skew (< -10%)", () => {
    expect(getSkewVariant(-0.15)).toBe("error");
  });

  it("returns warning for moderate negative skew (-10% to -3%)", () => {
    expect(getSkewVariant(-0.05)).toBe("warning");
  });

  it("returns neutral for normal skew (-3% to +3%)", () => {
    expect(getSkewVariant(0)).toBe("neutral");
    expect(getSkewVariant(0.01)).toBe("neutral");
    expect(getSkewVariant(-0.02)).toBe("neutral");
  });

  it("returns info for positive skew (+3% to +10%)", () => {
    expect(getSkewVariant(0.05)).toBe("info");
  });

  it("returns success for strong positive skew (> +10%)", () => {
    expect(getSkewVariant(0.15)).toBe("success");
  });

  it("returns neutral for null", () => {
    expect(getSkewVariant(null)).toBe("neutral");
  });
});

// ============================================
// Put/Call Ratio Variant Tests
// ============================================

function getPCRVariant(value: number | null): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  if (value < 0.7) {
    return "success";
  }
  if (value < 1.0) {
    return "neutral";
  }
  if (value < 1.3) {
    return "warning";
  }
  return "error";
}

describe("getPCRVariant", () => {
  it("returns success for bullish PCR (< 0.7)", () => {
    expect(getPCRVariant(0.5)).toBe("success");
  });

  it("returns neutral for neutral PCR (0.7-1.0)", () => {
    expect(getPCRVariant(0.85)).toBe("neutral");
  });

  it("returns warning for elevated PCR (1.0-1.3)", () => {
    expect(getPCRVariant(1.15)).toBe("warning");
  });

  it("returns error for high PCR (> 1.3)", () => {
    expect(getPCRVariant(1.5)).toBe("error");
  });

  it("returns neutral for null", () => {
    expect(getPCRVariant(null)).toBe("neutral");
  });

  it("handles boundary at 0.7", () => {
    expect(getPCRVariant(0.7)).toBe("neutral");
    expect(getPCRVariant(0.69)).toBe("success");
  });

  it("handles boundary at 1.0", () => {
    expect(getPCRVariant(1.0)).toBe("warning");
    expect(getPCRVariant(0.99)).toBe("neutral");
  });
});

// ============================================
// VRP Variant Tests
// ============================================

function getVRPVariant(value: number | null): "success" | "info" | "warning" | "error" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  if (value < -0.05) {
    return "success";
  }
  if (value < 0.02) {
    return "neutral";
  }
  if (value < 0.08) {
    return "warning";
  }
  return "error";
}

describe("getVRPVariant", () => {
  it("returns success for negative VRP (options cheap)", () => {
    expect(getVRPVariant(-0.08)).toBe("success");
  });

  it("returns neutral for small VRP (-5% to +2%)", () => {
    expect(getVRPVariant(-0.02)).toBe("neutral");
    expect(getVRPVariant(0)).toBe("neutral");
    expect(getVRPVariant(0.01)).toBe("neutral");
  });

  it("returns warning for moderate VRP (+2% to +8%)", () => {
    expect(getVRPVariant(0.05)).toBe("warning");
  });

  it("returns error for high VRP (> +8%)", () => {
    expect(getVRPVariant(0.12)).toBe("error");
  });

  it("returns neutral for null", () => {
    expect(getVRPVariant(null)).toBe("neutral");
  });
});

// ============================================
// Format Greek Tests
// ============================================

function formatGreek(value: number | null, decimals = 2): string {
  if (value === null) {
    return "—";
  }
  const formatted = value.toFixed(decimals);
  return value > 0 ? `+${formatted}` : formatted;
}

describe("formatGreek", () => {
  it("formats positive greeks with + sign", () => {
    expect(formatGreek(0.5)).toBe("+0.50");
  });

  it("formats negative greeks without + sign", () => {
    expect(formatGreek(-0.3)).toBe("-0.30");
  });

  it("formats zero without + sign", () => {
    expect(formatGreek(0)).toBe("0.00");
  });

  it("returns em dash for null", () => {
    expect(formatGreek(null)).toBe("—");
  });

  it("formats with custom decimals", () => {
    expect(formatGreek(0.00125, 4)).toBe("+0.0013");
  });

  it("handles small gamma values", () => {
    expect(formatGreek(0.00156, 3)).toBe("+0.002");
  });
});

// ============================================
// Term Structure Detection Tests
// ============================================

function detectTermStructure(slope: number | null): "contango" | "backwardation" | "flat" | null {
  if (slope === null) {
    return null;
  }
  if (slope > 0.01) {
    return "contango";
  }
  if (slope < -0.01) {
    return "backwardation";
  }
  return "flat";
}

describe("detectTermStructure", () => {
  it("detects contango (positive slope)", () => {
    expect(detectTermStructure(0.05)).toBe("contango");
  });

  it("detects backwardation (negative slope)", () => {
    expect(detectTermStructure(-0.08)).toBe("backwardation");
  });

  it("detects flat structure (small slope)", () => {
    expect(detectTermStructure(0.005)).toBe("flat");
    expect(detectTermStructure(-0.005)).toBe("flat");
  });

  it("returns null for null slope", () => {
    expect(detectTermStructure(null)).toBeNull();
  });

  it("handles boundary at +1%", () => {
    expect(detectTermStructure(0.01)).toBe("flat");
    expect(detectTermStructure(0.011)).toBe("contango");
  });

  it("handles boundary at -1%", () => {
    expect(detectTermStructure(-0.01)).toBe("flat");
    expect(detectTermStructure(-0.011)).toBe("backwardation");
  });
});

// ============================================
// Component Export Tests
// ============================================

describe("OptionsIndicators exports", () => {
  it("exports OptionsIndicators component", async () => {
    const module = await import("./OptionsIndicators");
    expect(module.OptionsIndicators).toBeDefined();
    expect(module.OptionsIndicators).toHaveProperty("$$typeof");
  });

  it("exports default as same as named export", async () => {
    const module = await import("./OptionsIndicators");
    expect(module.default).toBe(module.OptionsIndicators);
  });
});

describe("OptionsIndicators from index", () => {
  it("exports OptionsIndicatorsWidget from index", async () => {
    const module = await import("./index");
    expect(module.OptionsIndicatorsWidget).toBeDefined();
  });
});

// ============================================
// Mock Data Structure Tests
// ============================================

describe("OptionsIndicators data structure", () => {
  const mockData: OptionsIndicators = {
    atm_iv: 0.32,
    iv_skew_25d: -0.04,
    iv_put_25d: 0.36,
    iv_call_25d: 0.3,
    put_call_ratio_volume: 0.85,
    put_call_ratio_oi: 0.92,
    term_structure_slope: 0.02,
    front_month_iv: 0.3,
    back_month_iv: 0.34,
    vrp: 0.04,
    realized_vol_20d: 0.28,
    net_delta: 1500,
    net_gamma: 0.025,
    net_theta: -250,
    net_vega: 8500,
  };

  it("has ATM IV in valid range (0-1)", () => {
    expect(mockData.atm_iv).toBeGreaterThanOrEqual(0);
    expect(mockData.atm_iv).toBeLessThanOrEqual(1);
  });

  it("has negative skew (puts more expensive)", () => {
    expect(mockData.iv_skew_25d).toBeLessThan(0);
    expect(mockData.iv_put_25d).toBeGreaterThan(mockData.iv_call_25d ?? 0);
  });

  it("has put/call ratios in reasonable range", () => {
    expect(mockData.put_call_ratio_volume).toBeGreaterThan(0);
    expect(mockData.put_call_ratio_oi).toBeGreaterThan(0);
  });

  it("has term structure showing contango (back > front)", () => {
    expect(mockData.back_month_iv).toBeGreaterThan(mockData.front_month_iv ?? 0);
    expect(mockData.term_structure_slope).toBeGreaterThan(0);
  });

  it("has positive VRP (IV > realized)", () => {
    expect(mockData.atm_iv).toBeGreaterThan(mockData.realized_vol_20d ?? 0);
    expect(mockData.vrp).toBeGreaterThan(0);
  });

  it("has Greeks with appropriate signs", () => {
    // Positive delta = net long exposure
    expect(mockData.net_delta).toBeGreaterThan(0);
    // Positive gamma = long gamma position
    expect(mockData.net_gamma).toBeGreaterThan(0);
    // Negative theta = paying time decay
    expect(mockData.net_theta).toBeLessThan(0);
    // Positive vega = long volatility
    expect(mockData.net_vega).toBeGreaterThan(0);
  });
});

// ============================================
// Null Handling Tests
// ============================================

describe("OptionsIndicators null handling", () => {
  const nullData: OptionsIndicators = {
    atm_iv: null,
    iv_skew_25d: null,
    iv_put_25d: null,
    iv_call_25d: null,
    put_call_ratio_volume: null,
    put_call_ratio_oi: null,
    term_structure_slope: null,
    front_month_iv: null,
    back_month_iv: null,
    vrp: null,
    realized_vol_20d: null,
    net_delta: null,
    net_gamma: null,
    net_theta: null,
    net_vega: null,
  };

  it("allows all fields to be null", () => {
    expect(nullData.atm_iv).toBeNull();
    expect(nullData.iv_skew_25d).toBeNull();
    expect(nullData.net_delta).toBeNull();
  });

  it("formatIV handles null gracefully", () => {
    expect(formatIV(nullData.atm_iv)).toBe("—");
  });

  it("formatGreek handles null gracefully", () => {
    expect(formatGreek(nullData.net_delta)).toBe("—");
  });

  it("getIVVariant handles null gracefully", () => {
    expect(getIVVariant(nullData.atm_iv)).toBe("neutral");
  });

  it("getPCRVariant handles null gracefully", () => {
    expect(getPCRVariant(nullData.put_call_ratio_volume)).toBe("neutral");
  });

  it("detectTermStructure handles null gracefully", () => {
    expect(detectTermStructure(nullData.term_structure_slope)).toBeNull();
  });
});

// ============================================
// VRP Calculation Tests
// ============================================

describe("VRP calculation", () => {
  it("VRP is positive when IV > realized", () => {
    const iv = 0.35;
    const realized = 0.28;
    const vrp = iv - realized;
    expect(vrp).toBeGreaterThan(0);
  });

  it("VRP is negative when IV < realized", () => {
    const iv = 0.25;
    const realized = 0.32;
    const vrp = iv - realized;
    expect(vrp).toBeLessThan(0);
  });

  it("VRP is near zero when IV matches realized", () => {
    const iv = 0.3;
    const realized = 0.3;
    const vrp = iv - realized;
    expect(Math.abs(vrp)).toBeLessThan(0.001);
  });
});
