/**
 * Gauge Component Tests
 *
 * Tests for semi-circular gauge SVG generation and color logic.
 *
 * @see docs/plans/ui/26-data-viz.md lines 153-159
 */

import { describe, expect, it } from "bun:test";
import {
	DEFAULT_THRESHOLDS,
	degreesToRadians,
	describeArc,
	GAUGE_COLORS,
	getGaugeColor,
	polarToCartesian,
	valueToAngle,
} from "./Gauge";

// ============================================
// Constants Tests
// ============================================

describe("DEFAULT_THRESHOLDS", () => {
	it("has comfortable threshold at 60", () => {
		expect(DEFAULT_THRESHOLDS.comfortable).toBe(60);
	});

	it("has warning threshold at 80", () => {
		expect(DEFAULT_THRESHOLDS.warning).toBe(80);
	});

	it("has critical threshold at 100", () => {
		expect(DEFAULT_THRESHOLDS.critical).toBe(100);
	});
});

describe("GAUGE_COLORS", () => {
	it("has track color", () => {
		expect(GAUGE_COLORS.track).toBe("#E7E5E4");
	});

	it("has comfortable color (stone-400)", () => {
		expect(GAUGE_COLORS.comfortable).toBe("#78716C");
	});

	it("has warning color (amber)", () => {
		expect(GAUGE_COLORS.warning).toBe("#D97706");
	});

	it("has critical color (red)", () => {
		expect(GAUGE_COLORS.critical).toBe("#EF4444");
	});
});

// ============================================
// Color Logic Tests
// ============================================

describe("getGaugeColor", () => {
	it("returns comfortable color for 0%", () => {
		expect(getGaugeColor(0, DEFAULT_THRESHOLDS)).toBe(GAUGE_COLORS.comfortable);
	});

	it("returns comfortable color for 30%", () => {
		expect(getGaugeColor(30, DEFAULT_THRESHOLDS)).toBe(GAUGE_COLORS.comfortable);
	});

	it("returns comfortable color for 59%", () => {
		expect(getGaugeColor(59, DEFAULT_THRESHOLDS)).toBe(GAUGE_COLORS.comfortable);
	});

	it("returns warning color for 60%", () => {
		expect(getGaugeColor(60, DEFAULT_THRESHOLDS)).toBe(GAUGE_COLORS.warning);
	});

	it("returns warning color for 70%", () => {
		expect(getGaugeColor(70, DEFAULT_THRESHOLDS)).toBe(GAUGE_COLORS.warning);
	});

	it("returns warning color for 79%", () => {
		expect(getGaugeColor(79, DEFAULT_THRESHOLDS)).toBe(GAUGE_COLORS.warning);
	});

	it("returns critical color for 80%", () => {
		expect(getGaugeColor(80, DEFAULT_THRESHOLDS)).toBe(GAUGE_COLORS.critical);
	});

	it("returns critical color for 90%", () => {
		expect(getGaugeColor(90, DEFAULT_THRESHOLDS)).toBe(GAUGE_COLORS.critical);
	});

	it("returns critical color for 100%", () => {
		expect(getGaugeColor(100, DEFAULT_THRESHOLDS)).toBe(GAUGE_COLORS.critical);
	});

	it("handles custom thresholds", () => {
		const customThresholds = { comfortable: 30, warning: 50, critical: 100 };
		expect(getGaugeColor(25, customThresholds)).toBe(GAUGE_COLORS.comfortable);
		expect(getGaugeColor(35, customThresholds)).toBe(GAUGE_COLORS.warning);
		expect(getGaugeColor(55, customThresholds)).toBe(GAUGE_COLORS.critical);
	});
});

// ============================================
// Angle Conversion Tests
// ============================================

describe("degreesToRadians", () => {
	it("converts 0 degrees to 0 radians", () => {
		expect(degreesToRadians(0)).toBe(0);
	});

	it("converts 180 degrees to PI radians", () => {
		expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 10);
	});

	it("converts 90 degrees to PI/2 radians", () => {
		expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2, 10);
	});

	it("converts 360 degrees to 2*PI radians", () => {
		expect(degreesToRadians(360)).toBeCloseTo(2 * Math.PI, 10);
	});

	it("handles negative degrees", () => {
		expect(degreesToRadians(-90)).toBeCloseTo(-Math.PI / 2, 10);
	});
});

describe("valueToAngle", () => {
	it("converts 0 to -120 degrees", () => {
		expect(valueToAngle(0, 100)).toBe(-120);
	});

	it("converts 100 to +120 degrees", () => {
		expect(valueToAngle(100, 100)).toBe(120);
	});

	it("converts 50 to 0 degrees (middle)", () => {
		expect(valueToAngle(50, 100)).toBe(0);
	});

	it("clamps negative values to -120", () => {
		expect(valueToAngle(-10, 100)).toBe(-120);
	});

	it("clamps values above max to +120", () => {
		expect(valueToAngle(150, 100)).toBe(120);
	});

	it("handles custom max values", () => {
		expect(valueToAngle(50, 200)).toBe(-60); // 25% of range
		expect(valueToAngle(100, 200)).toBe(0); // 50% of range
	});
});

// ============================================
// SVG Path Generation Tests
// ============================================

describe("polarToCartesian", () => {
	it("returns correct point for 0 degrees", () => {
		const point = polarToCartesian(50, 50, 40, 0);
		expect(point.x).toBeCloseTo(90, 10); // 50 + 40*cos(0)
		expect(point.y).toBeCloseTo(50, 10); // 50 + 40*sin(0)
	});

	it("returns correct point for 90 degrees", () => {
		const point = polarToCartesian(50, 50, 40, 90);
		expect(point.x).toBeCloseTo(50, 10); // 50 + 40*cos(90)
		expect(point.y).toBeCloseTo(90, 10); // 50 + 40*sin(90)
	});

	it("returns correct point for 180 degrees", () => {
		const point = polarToCartesian(50, 50, 40, 180);
		expect(point.x).toBeCloseTo(10, 10); // 50 + 40*cos(180)
		expect(point.y).toBeCloseTo(50, 10); // 50 + 40*sin(180)
	});

	it("handles different center coordinates", () => {
		const point = polarToCartesian(100, 100, 50, 0);
		expect(point.x).toBeCloseTo(150, 10);
		expect(point.y).toBeCloseTo(100, 10);
	});
});

describe("describeArc", () => {
	it("returns valid SVG path string", () => {
		const path = describeArc(50, 50, 40, -120, 120);
		expect(path).toContain("M");
		expect(path).toContain("A");
	});

	it("creates arc from start to end", () => {
		const path = describeArc(50, 50, 40, -120, 120);
		// Path should start with M (move to)
		expect(path.startsWith("M")).toBe(true);
		// Path should contain arc command
		expect(path).toContain("A 40 40");
	});

	it("handles small arcs (< 180 degrees)", () => {
		const path = describeArc(50, 50, 40, 0, 90);
		// Should use small arc flag (0)
		expect(path).toContain("0 0");
	});

	it("handles large arcs (> 180 degrees)", () => {
		const path = describeArc(50, 50, 40, -120, 120);
		// 240 degrees is > 180, should use large arc flag (1)
		expect(path).toContain("1 0");
	});

	it("produces different paths for different radii", () => {
		const path1 = describeArc(50, 50, 30, -120, 120);
		const path2 = describeArc(50, 50, 40, -120, 120);
		expect(path1).not.toBe(path2);
	});
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
	it("valueToAngle handles zero max gracefully", () => {
		// Division by zero case - should clamp to max
		const angle = valueToAngle(50, 0);
		// When max is 0, value/max would be Infinity, clamped to 1
		expect(angle).toBe(120);
	});

	it("getGaugeColor handles values above 100", () => {
		expect(getGaugeColor(150, DEFAULT_THRESHOLDS)).toBe(GAUGE_COLORS.critical);
	});

	it("getGaugeColor handles negative values", () => {
		expect(getGaugeColor(-10, DEFAULT_THRESHOLDS)).toBe(GAUGE_COLORS.comfortable);
	});

	it("polarToCartesian handles zero radius", () => {
		const point = polarToCartesian(50, 50, 0, 45);
		expect(point.x).toBeCloseTo(50, 10);
		expect(point.y).toBeCloseTo(50, 10);
	});

	it("describeArc handles same start and end angle", () => {
		const path = describeArc(50, 50, 40, 0, 0);
		expect(path).toContain("M");
		expect(path).toContain("A");
	});
});

// ============================================
// Integration Tests
// ============================================

describe("Full Gauge Flow", () => {
	it("converts value to angle to path correctly", () => {
		const value = 75;
		const max = 100;
		const angle = valueToAngle(value, max);

		// 75% = 0.75, maps to -120 + 0.75*240 = 60 degrees
		expect(angle).toBe(60);

		// Create arc from start to this angle
		const path = describeArc(50, 50, 40, -120, angle);
		expect(path).toContain("M");
		expect(path).toContain("A");
	});

	it("color transitions correctly through thresholds", () => {
		const colors: string[] = [];
		for (let i = 0; i <= 100; i += 10) {
			colors.push(getGaugeColor(i, DEFAULT_THRESHOLDS));
		}

		// 0-50: comfortable (6 values: 0,10,20,30,40,50)
		expect(colors.slice(0, 6).every((c) => c === GAUGE_COLORS.comfortable)).toBe(true);
		// 60-70: warning (2 values: 60,70)
		expect(colors.slice(6, 8).every((c) => c === GAUGE_COLORS.warning)).toBe(true);
		// 80-100: critical (3 values: 80,90,100)
		expect(colors.slice(8, 11).every((c) => c === GAUGE_COLORS.critical)).toBe(true);
	});
});
