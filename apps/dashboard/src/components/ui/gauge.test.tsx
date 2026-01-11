/**
 * Gauge Component Tests
 *
 * Tests for gauge utility functions and component exports.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { describe, expect, it } from "bun:test";

// ============================================
// Value to Angle Tests
// ============================================

// Arc angles: -120° to +120° (240° total sweep)
const START_ANGLE = -120;
const END_ANGLE = 120;
const SWEEP_ANGLE = END_ANGLE - START_ANGLE;

function valueToAngle(value: number, min: number, max: number): number {
  const normalizedValue = Math.max(min, Math.min(max, value));
  const percentage = (normalizedValue - min) / (max - min);
  return START_ANGLE + percentage * SWEEP_ANGLE;
}

describe("valueToAngle", () => {
  it("returns start angle for minimum value", () => {
    expect(valueToAngle(0, 0, 100)).toBe(-120);
  });

  it("returns end angle for maximum value", () => {
    expect(valueToAngle(100, 0, 100)).toBe(120);
  });

  it("returns middle angle for 50%", () => {
    expect(valueToAngle(50, 0, 100)).toBe(0);
  });

  it("clamps values below minimum", () => {
    expect(valueToAngle(-10, 0, 100)).toBe(-120);
  });

  it("clamps values above maximum", () => {
    expect(valueToAngle(150, 0, 100)).toBe(120);
  });

  it("handles custom min/max range", () => {
    // 25% of range 0-1 should be at -120 + 60 = -60
    expect(valueToAngle(0.25, 0, 1)).toBe(-60);
  });

  it("handles negative min values", () => {
    // 50% of range -50 to 50 (value 0) should be at angle 0
    expect(valueToAngle(0, -50, 50)).toBe(0);
  });
});

// ============================================
// Polar to Cartesian Tests
// ============================================

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

describe("polarToCartesian", () => {
  it("returns correct point at 0 degrees (top)", () => {
    const result = polarToCartesian(50, 50, 40, 0);
    expect(Math.round(result.x)).toBe(50);
    expect(Math.round(result.y)).toBe(10);
  });

  it("returns correct point at 90 degrees (right)", () => {
    const result = polarToCartesian(50, 50, 40, 90);
    expect(Math.round(result.x)).toBe(90);
    expect(Math.round(result.y)).toBe(50);
  });

  it("returns correct point at 180 degrees (bottom)", () => {
    const result = polarToCartesian(50, 50, 40, 180);
    expect(Math.round(result.x)).toBe(50);
    expect(Math.round(result.y)).toBe(90);
  });

  it("returns correct point at -90 degrees (left)", () => {
    const result = polarToCartesian(50, 50, 40, -90);
    expect(Math.round(result.x)).toBe(10);
    expect(Math.round(result.y)).toBe(50);
  });
});

// ============================================
// Zone Color Tests
// ============================================

interface GaugeZone {
  start: number;
  end: number;
  color: string;
  label?: string;
}

function getColorForValue(value: number, zones: GaugeZone[]): string {
  for (const zone of zones) {
    if (value >= zone.start && value < zone.end) {
      return zone.color;
    }
  }
  const lastZone = zones[zones.length - 1];
  if (lastZone && value >= lastZone.start) {
    return lastZone.color;
  }
  return "#78716C"; // Default stone-500
}

describe("getColorForValue", () => {
  const rsiZones: GaugeZone[] = [
    { start: 0, end: 30, color: "#22C55E", label: "Oversold" },
    { start: 30, end: 70, color: "#78716C", label: "Neutral" },
    { start: 70, end: 100, color: "#EF4444", label: "Overbought" },
  ];

  it("returns green for oversold RSI (< 30)", () => {
    expect(getColorForValue(25, rsiZones)).toBe("#22C55E");
  });

  it("returns stone for neutral RSI (30-70)", () => {
    expect(getColorForValue(50, rsiZones)).toBe("#78716C");
  });

  it("returns red for overbought RSI (> 70)", () => {
    expect(getColorForValue(85, rsiZones)).toBe("#EF4444");
  });

  it("handles boundary at 30", () => {
    expect(getColorForValue(30, rsiZones)).toBe("#78716C");
  });

  it("handles boundary at 70", () => {
    expect(getColorForValue(70, rsiZones)).toBe("#EF4444");
  });

  it("handles maximum value (100)", () => {
    expect(getColorForValue(100, rsiZones)).toBe("#EF4444");
  });

  it("handles minimum value (0)", () => {
    expect(getColorForValue(0, rsiZones)).toBe("#22C55E");
  });
});

describe("getColorForValue with stochastic zones", () => {
  const stochasticZones: GaugeZone[] = [
    { start: 0, end: 20, color: "#22C55E", label: "Oversold" },
    { start: 20, end: 80, color: "#78716C", label: "Neutral" },
    { start: 80, end: 100, color: "#EF4444", label: "Overbought" },
  ];

  it("returns green for oversold stochastic (< 20)", () => {
    expect(getColorForValue(15, stochasticZones)).toBe("#22C55E");
  });

  it("returns stone for neutral stochastic (20-80)", () => {
    expect(getColorForValue(50, stochasticZones)).toBe("#78716C");
  });

  it("returns red for overbought stochastic (> 80)", () => {
    expect(getColorForValue(90, stochasticZones)).toBe("#EF4444");
  });
});

describe("getColorForValue with percent B zones", () => {
  const percentBZones: GaugeZone[] = [
    { start: 0, end: 0.2, color: "#22C55E", label: "Below" },
    { start: 0.2, end: 0.8, color: "#78716C", label: "Within" },
    { start: 0.8, end: 1, color: "#EF4444", label: "Above" },
  ];

  it("returns green for below band (< 0.2)", () => {
    expect(getColorForValue(0.1, percentBZones)).toBe("#22C55E");
  });

  it("returns stone for within bands (0.2-0.8)", () => {
    expect(getColorForValue(0.5, percentBZones)).toBe("#78716C");
  });

  it("returns red for above band (> 0.8)", () => {
    expect(getColorForValue(0.9, percentBZones)).toBe("#EF4444");
  });
});

// ============================================
// Component Export Tests
// ============================================

describe("Gauge exports", () => {
  it("exports Gauge component", async () => {
    const module = await import("./gauge");
    expect(module.Gauge).toBeDefined();
    // memo-wrapped components are objects with $$typeof
    expect(module.Gauge).toHaveProperty("$$typeof");
  });

  it("exports default as same as named export", async () => {
    const module = await import("./gauge");
    expect(module.default).toBe(module.Gauge);
  });

  it("exports RSIGauge convenience component", async () => {
    const module = await import("./gauge");
    expect(module.RSIGauge).toBeDefined();
    expect(module.RSIGauge).toHaveProperty("$$typeof");
  });

  it("exports StochasticGauge convenience component", async () => {
    const module = await import("./gauge");
    expect(module.StochasticGauge).toBeDefined();
    expect(module.StochasticGauge).toHaveProperty("$$typeof");
  });

  it("exports PercentBGauge convenience component", async () => {
    const module = await import("./gauge");
    expect(module.PercentBGauge).toBeDefined();
    expect(module.PercentBGauge).toHaveProperty("$$typeof");
  });
});

// ============================================
// Arc Path Generation Tests
// ============================================

function describeArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(" ");
}

describe("describeArc", () => {
  it("generates valid SVG path string", () => {
    const path = describeArc(50, 50, 40, -120, 120);
    expect(path).toContain("M");
    expect(path).toContain("A");
  });

  it("uses large arc flag for arcs > 180 degrees", () => {
    const path = describeArc(50, 50, 40, -120, 120); // 240 degrees
    expect(path).toContain(" 1 "); // large arc flag = 1
  });

  it("uses small arc flag for arcs <= 180 degrees", () => {
    const path = describeArc(50, 50, 40, -90, 90); // 180 degrees
    expect(path).toContain(" 0 0 "); // large arc flag = 0
  });
});
