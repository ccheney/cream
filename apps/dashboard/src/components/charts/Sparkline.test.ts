/**
 * Sparkline Component Tests
 *
 * Tests for sparkline path generation and color logic.
 *
 * @see docs/plans/ui/26-data-viz.md lines 129-135
 */

import { describe, expect, it } from "bun:test";
import { CHART_COLORS } from "@/lib/chart-config";
import { generatePath, getColor, getLastPoint, getTrendColor } from "./Sparkline.js";

// ============================================
// Color Tests
// ============================================

describe("getColor", () => {
  it("returns profit color for 'profit'", () => {
    expect(getColor("profit")).toBe(CHART_COLORS.profit);
  });

  it("returns loss color for 'loss'", () => {
    expect(getColor("loss")).toBe(CHART_COLORS.loss);
  });

  it("returns primary color for 'primary'", () => {
    expect(getColor("primary")).toBe(CHART_COLORS.primary);
  });

  it("returns text color for 'neutral'", () => {
    expect(getColor("neutral")).toBe(CHART_COLORS.text);
  });

  it("returns custom color as-is", () => {
    expect(getColor("#FF0000")).toBe("#FF0000");
  });
});

describe("getTrendColor", () => {
  it("returns 'profit' when last > first", () => {
    expect(getTrendColor([10, 15, 20])).toBe("profit");
  });

  it("returns 'loss' when last < first", () => {
    expect(getTrendColor([20, 15, 10])).toBe("loss");
  });

  it("returns 'neutral' when last === first", () => {
    expect(getTrendColor([10, 15, 10])).toBe("neutral");
  });

  it("returns 'neutral' for empty data", () => {
    expect(getTrendColor([])).toBe("neutral");
  });

  it("returns 'neutral' for single value", () => {
    expect(getTrendColor([10])).toBe("neutral");
  });
});

// ============================================
// Path Generation Tests
// ============================================

describe("generatePath", () => {
  it("returns empty string for empty data", () => {
    expect(generatePath([], 80, 24)).toBe("");
  });

  it("returns horizontal line for single value", () => {
    const path = generatePath([10], 80, 24);
    expect(path).toContain("M 0");
    expect(path).toContain("L 80");
  });

  it("returns valid path for multiple values", () => {
    const path = generatePath([10, 20, 15, 25], 80, 24);
    expect(path).toContain("M");
    expect(path).toContain("C"); // Contains curve commands
  });

  it("starts at left edge", () => {
    const path = generatePath([10, 20], 80, 24);
    expect(path.startsWith("M 2")).toBe(true); // Starts at padding
  });

  it("handles all same values (flat line)", () => {
    const path = generatePath([10, 10, 10], 80, 24);
    expect(path).toContain("M");
    expect(path).toContain("C");
  });

  it("respects width parameter", () => {
    const path1 = generatePath([10, 20], 80, 24);
    const path2 = generatePath([10, 20], 160, 24);
    // Paths should be different due to different widths
    expect(path1).not.toBe(path2);
  });

  it("respects height parameter", () => {
    const path1 = generatePath([10, 20], 80, 24);
    const path2 = generatePath([10, 20], 80, 48);
    // Paths should be different due to different heights
    expect(path1).not.toBe(path2);
  });
});

// ============================================
// Last Point Tests
// ============================================

describe("getLastPoint", () => {
  it("returns null for empty data", () => {
    expect(getLastPoint([], 80, 24)).toBeNull();
  });

  it("returns coordinates for single value", () => {
    const point = getLastPoint([10], 80, 24);
    expect(point).not.toBeNull();
    expect(point?.x).toBeDefined();
    expect(point?.y).toBeDefined();
  });

  it("returns coordinates near right edge", () => {
    const point = getLastPoint([10, 20], 80, 24);
    expect(point).not.toBeNull();
    expect(point?.x).toBeGreaterThan(70); // Near right edge
  });

  it("y is lower for higher values", () => {
    const point1 = getLastPoint([10, 10], 80, 24);
    const point2 = getLastPoint([10, 20], 80, 24);
    // Higher value = lower y (SVG coordinate system)
    expect(point2?.y ?? 0).toBeLessThan(point1?.y ?? 0);
  });

  it("returns valid coordinates for all same values", () => {
    const point = getLastPoint([10, 10, 10], 80, 24);
    expect(point).not.toBeNull();
    // Should return valid y within height bounds
    expect(point?.y).toBeGreaterThanOrEqual(0);
    expect(point?.y).toBeLessThanOrEqual(24);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles negative values", () => {
    const path = generatePath([-10, -5, -15], 80, 24);
    expect(path).toContain("M");
    expect(path).toContain("C");
  });

  it("handles mixed positive and negative", () => {
    const path = generatePath([-10, 0, 10], 80, 24);
    expect(path).toContain("M");
    expect(path).toContain("C");
  });

  it("handles very large numbers", () => {
    const path = generatePath([1000000, 2000000, 1500000], 80, 24);
    expect(path).toContain("M");
    expect(path).toContain("C");
  });

  it("handles very small differences", () => {
    const path = generatePath([10.001, 10.002, 10.003], 80, 24);
    expect(path).toContain("M");
    expect(path).toContain("C");
  });

  it("handles many data points", () => {
    const data = Array.from({ length: 100 }, (_, i) => Math.sin(i / 10) * 50);
    const path = generatePath(data, 80, 24);
    expect(path).toContain("M");
    expect(path).toContain("C");
  });
});
