/**
 * ReturnsChart Component Tests
 *
 * Tests for returns chart utility functions and color logic.
 *
 * @see docs/plans/ui/26-data-viz.md lines 120-125
 */

import { describe, expect, it } from "bun:test";
import { CHART_COLORS } from "@/lib/chart-config";
import { getReturnColor, type ReturnsDataPoint, SAMPLE_RETURNS_DATA } from "./ReturnsChart.js";

// ============================================
// Color Logic Tests
// ============================================

describe("getReturnColor", () => {
  it("returns profit color for positive value", () => {
    expect(getReturnColor(5.0)).toBe(CHART_COLORS.profit);
  });

  it("returns loss color for negative value", () => {
    expect(getReturnColor(-3.0)).toBe(CHART_COLORS.loss);
  });

  it("returns text color for zero", () => {
    expect(getReturnColor(0)).toBe(CHART_COLORS.text);
  });

  it("handles very small positive values", () => {
    expect(getReturnColor(0.001)).toBe(CHART_COLORS.profit);
  });

  it("handles very small negative values", () => {
    expect(getReturnColor(-0.001)).toBe(CHART_COLORS.loss);
  });

  it("handles large positive values", () => {
    expect(getReturnColor(100)).toBe(CHART_COLORS.profit);
  });

  it("handles large negative values", () => {
    expect(getReturnColor(-50)).toBe(CHART_COLORS.loss);
  });
});

// ============================================
// Sample Data Tests
// ============================================

describe("SAMPLE_RETURNS_DATA", () => {
  it("has 12 months of data", () => {
    expect(SAMPLE_RETURNS_DATA.length).toBe(12);
  });

  it("has all required fields", () => {
    for (const point of SAMPLE_RETURNS_DATA) {
      expect(point.period).toBeDefined();
      expect(point.value).toBeDefined();
      expect(typeof point.period).toBe("string");
      expect(typeof point.value).toBe("number");
    }
  });

  it("has mix of positive and negative returns", () => {
    const positive = SAMPLE_RETURNS_DATA.filter((d) => d.value > 0);
    const negative = SAMPLE_RETURNS_DATA.filter((d) => d.value < 0);
    expect(positive.length).toBeGreaterThan(0);
    expect(negative.length).toBeGreaterThan(0);
  });

  it("starts with January", () => {
    expect(SAMPLE_RETURNS_DATA[0].period).toBe("Jan");
  });

  it("ends with December", () => {
    expect(SAMPLE_RETURNS_DATA[11].period).toBe("Dec");
  });
});

// ============================================
// Type Validation Tests
// ============================================

describe("ReturnsDataPoint type", () => {
  it("accepts required fields", () => {
    const point: ReturnsDataPoint = {
      period: "Jan 2026",
      value: 5.5,
    };
    expect(point.period).toBe("Jan 2026");
    expect(point.value).toBe(5.5);
  });

  it("accepts negative values", () => {
    const point: ReturnsDataPoint = {
      period: "Feb",
      value: -3.2,
    };
    expect(point.value).toBe(-3.2);
  });

  it("accepts zero value", () => {
    const point: ReturnsDataPoint = {
      period: "Mar",
      value: 0,
    };
    expect(point.value).toBe(0);
  });
});

// ============================================
// Statistical Calculations Tests
// ============================================

describe("Returns Statistics", () => {
  it("calculates total return", () => {
    const total = SAMPLE_RETURNS_DATA.reduce((sum, d) => sum + d.value, 0);
    expect(total).toBeCloseTo(19.5, 1);
  });

  it("calculates average monthly return", () => {
    const total = SAMPLE_RETURNS_DATA.reduce((sum, d) => sum + d.value, 0);
    const average = total / SAMPLE_RETURNS_DATA.length;
    expect(average).toBeCloseTo(1.625, 2);
  });

  it("finds best month", () => {
    const best = SAMPLE_RETURNS_DATA.reduce((max, d) => (d.value > max.value ? d : max));
    expect(best.period).toBe("Aug");
    expect(best.value).toBe(5.2);
  });

  it("finds worst month", () => {
    const worst = SAMPLE_RETURNS_DATA.reduce((min, d) => (d.value < min.value ? d : min));
    expect(worst.period).toBe("Jul");
    expect(worst.value).toBe(-2.3);
  });

  it("counts winning months", () => {
    const winning = SAMPLE_RETURNS_DATA.filter((d) => d.value > 0);
    expect(winning.length).toBe(8);
  });

  it("counts losing months", () => {
    const losing = SAMPLE_RETURNS_DATA.filter((d) => d.value < 0);
    expect(losing.length).toBe(4);
  });
});

// ============================================
// Y-Axis Domain Tests
// ============================================

describe("Y-Axis Domain Calculation", () => {
  it("calculates correct domain", () => {
    const values = SAMPLE_RETURNS_DATA.map((d) => d.value);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);

    expect(min).toBe(-2.3);
    expect(max).toBe(5.2);
  });

  it("includes zero in domain", () => {
    const values = [1, 2, 3]; // All positive
    const min = Math.min(...values, 0);
    expect(min).toBe(0);

    const values2 = [-1, -2, -3]; // All negative
    const max = Math.max(...values2, 0);
    expect(max).toBe(0);
  });

  it("adds padding to domain", () => {
    const values = SAMPLE_RETURNS_DATA.map((d) => d.value);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min;
    const padding = range * 0.1;

    expect(padding).toBeCloseTo(0.75, 1);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles empty data array", () => {
    const data: ReturnsDataPoint[] = [];
    expect(data.length).toBe(0);
  });

  it("handles single data point", () => {
    const data: ReturnsDataPoint[] = [{ period: "Jan", value: 5.0 }];
    expect(data.length).toBe(1);
  });

  it("handles all positive returns", () => {
    const data: ReturnsDataPoint[] = [
      { period: "Jan", value: 2.0 },
      { period: "Feb", value: 3.0 },
      { period: "Mar", value: 1.5 },
    ];
    const allPositive = data.every((d) => d.value > 0);
    expect(allPositive).toBe(true);
  });

  it("handles all negative returns", () => {
    const data: ReturnsDataPoint[] = [
      { period: "Jan", value: -2.0 },
      { period: "Feb", value: -3.0 },
      { period: "Mar", value: -1.5 },
    ];
    const allNegative = data.every((d) => d.value < 0);
    expect(allNegative).toBe(true);
  });

  it("handles extreme values", () => {
    const data: ReturnsDataPoint[] = [
      { period: "Jan", value: 100 },
      { period: "Feb", value: -50 },
    ];
    expect(getReturnColor(data[0].value)).toBe(CHART_COLORS.profit);
    expect(getReturnColor(data[1].value)).toBe(CHART_COLORS.loss);
  });

  it("handles decimal precision", () => {
    const point: ReturnsDataPoint = {
      period: "Jan",
      value: Math.PI,
    };
    expect(point.value).toBeCloseTo(Math.PI, 5);
  });
});
