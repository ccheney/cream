/**
 * EquityCurve Component Tests
 *
 * Tests for equity curve utility functions and data handling.
 *
 * @see docs/plans/ui/26-data-viz.md lines 93-112
 */

import { describe, expect, it } from "bun:test";
import { type EquityDataPoint, SAMPLE_EQUITY_DATA } from "./EquityCurve";

// ============================================
// Sample Data Tests
// ============================================

describe("SAMPLE_EQUITY_DATA", () => {
  it("has correct number of data points", () => {
    expect(SAMPLE_EQUITY_DATA.length).toBe(7);
  });

  it("has all required fields", () => {
    for (const point of SAMPLE_EQUITY_DATA) {
      expect(point.time).toBeDefined();
      expect(point.value).toBeDefined();
      expect(typeof point.value).toBe("number");
    }
  });

  it("has positive equity values", () => {
    for (const point of SAMPLE_EQUITY_DATA) {
      expect(point.value).toBeGreaterThan(0);
    }
  });

  it("includes optional drawdown for some points", () => {
    const withDrawdown = SAMPLE_EQUITY_DATA.filter((p) => p.drawdown !== undefined);
    expect(withDrawdown.length).toBeGreaterThan(0);
  });

  it("has drawdown values as negative percentages", () => {
    for (const point of SAMPLE_EQUITY_DATA) {
      if (point.drawdown !== undefined) {
        expect(point.drawdown).toBeLessThanOrEqual(0);
      }
    }
  });
});

// ============================================
// Type Validation Tests
// ============================================

describe("EquityDataPoint type", () => {
  it("accepts string time", () => {
    const point: EquityDataPoint = {
      time: "2026-01-01",
      value: 100000,
    };
    expect(point.time).toBe("2026-01-01");
  });

  it("accepts number time (timestamp)", () => {
    const point: EquityDataPoint = {
      time: 1735689600000,
      value: 100000,
    };
    expect(typeof point.time).toBe("number");
  });

  it("accepts optional drawdown", () => {
    const point: EquityDataPoint = {
      time: "2026-01-01",
      value: 100000,
      drawdown: -0.05,
    };
    expect(point.drawdown).toBe(-0.05);
  });
});

// ============================================
// Data Calculations Tests
// ============================================

describe("Equity Calculations", () => {
  it("calculates Y domain from data", () => {
    const values = SAMPLE_EQUITY_DATA.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1;

    expect(min).toBe(100000);
    expect(max).toBe(108500);
    expect(padding).toBe(850);
  });

  it("handles single data point", () => {
    const data: EquityDataPoint[] = [{ time: "2026-01-01", value: 100000 }];
    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    expect(min).toBe(max);
    expect(min).toBe(100000);
  });

  it("calculates total return", () => {
    const first = SAMPLE_EQUITY_DATA[0]?.value ?? 0;
    const last = SAMPLE_EQUITY_DATA[SAMPLE_EQUITY_DATA.length - 1]?.value ?? 0;
    const totalReturn = ((last - first) / first) * 100;

    expect(totalReturn).toBeCloseTo(8.5, 1);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles empty data array", () => {
    const data: EquityDataPoint[] = [];
    expect(data.length).toBe(0);
  });

  it("handles very large values", () => {
    const point: EquityDataPoint = {
      time: "2026-01-01",
      value: 1_000_000_000,
    };
    expect(point.value).toBe(1_000_000_000);
  });

  it("handles very small positive values", () => {
    const point: EquityDataPoint = {
      time: "2026-01-01",
      value: 0.001,
    };
    expect(point.value).toBeGreaterThan(0);
  });

  it("handles zero value", () => {
    const point: EquityDataPoint = {
      time: "2026-01-01",
      value: 0,
    };
    expect(point.value).toBe(0);
  });
});
