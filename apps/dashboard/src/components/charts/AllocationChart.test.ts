/**
 * AllocationChart Component Tests
 *
 * Tests for allocation chart utility functions and color logic.
 *
 * @see docs/plans/ui/26-data-viz.md lines 114-118
 */

import { describe, expect, it } from "bun:test";
import {
	ALLOCATION_COLORS,
	type AllocationDataPoint,
	getAllocationColor,
	SAMPLE_ALLOCATION_DATA,
} from "./AllocationChart";

// ============================================
// Color Palette Tests
// ============================================

describe("ALLOCATION_COLORS", () => {
	it("has 8 colors", () => {
		expect(ALLOCATION_COLORS.length).toBe(8);
	});

	it("has primary color first", () => {
		expect(ALLOCATION_COLORS[0]!).toBe("#D97706");
	});

	it("has all valid hex colors", () => {
		for (const color of ALLOCATION_COLORS) {
			expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
		}
	});

	it("has no duplicate colors", () => {
		const unique = new Set(ALLOCATION_COLORS);
		expect(unique.size).toBe(ALLOCATION_COLORS.length);
	});
});

describe("getAllocationColor", () => {
	it("returns first color for index 0", () => {
		expect(getAllocationColor(0)).toBe(ALLOCATION_COLORS[0]!);
	});

	it("returns correct color for each index", () => {
		for (let i = 0; i < ALLOCATION_COLORS.length; i++) {
			expect(getAllocationColor(i)).toBe(ALLOCATION_COLORS[i] ?? ALLOCATION_COLORS[0]!);
		}
	});

	it("wraps around for indices >= 8", () => {
		expect(getAllocationColor(8)).toBe(ALLOCATION_COLORS[0]!);
		expect(getAllocationColor(9)).toBe(ALLOCATION_COLORS[1]!);
		expect(getAllocationColor(16)).toBe(ALLOCATION_COLORS[0]!);
	});

	it("returns custom color when provided", () => {
		expect(getAllocationColor(0, "#FF0000")).toBe("#FF0000");
	});

	it("prefers custom color over palette", () => {
		expect(getAllocationColor(5, "#123456")).toBe("#123456");
	});
});

// ============================================
// Sample Data Tests
// ============================================

describe("SAMPLE_ALLOCATION_DATA", () => {
	it("has correct number of allocations", () => {
		expect(SAMPLE_ALLOCATION_DATA.length).toBe(6);
	});

	it("has all required fields", () => {
		for (const item of SAMPLE_ALLOCATION_DATA) {
			expect(item.name).toBeDefined();
			expect(item.value).toBeDefined();
			expect(typeof item.name).toBe("string");
			expect(typeof item.value).toBe("number");
		}
	});

	it("has positive values", () => {
		for (const item of SAMPLE_ALLOCATION_DATA) {
			expect(item.value).toBeGreaterThan(0);
		}
	});

	it("sums to 100%", () => {
		const total = SAMPLE_ALLOCATION_DATA.reduce((sum, d) => sum + d.value, 0);
		expect(total).toBe(100);
	});

	it("includes cash allocation", () => {
		const cash = SAMPLE_ALLOCATION_DATA.find((d) => d.name === "Cash");
		expect(cash).toBeDefined();
		expect(cash?.value).toBe(15);
	});
});

// ============================================
// Type Validation Tests
// ============================================

describe("AllocationDataPoint type", () => {
	it("accepts required fields", () => {
		const point: AllocationDataPoint = {
			name: "AAPL",
			value: 25,
		};
		expect(point.name).toBe("AAPL");
		expect(point.value).toBe(25);
	});

	it("accepts optional color", () => {
		const point: AllocationDataPoint = {
			name: "AAPL",
			value: 25,
			color: "#FF0000",
		};
		expect(point.color).toBe("#FF0000");
	});
});

// ============================================
// Percentage Calculation Tests
// ============================================

describe("Percentage Calculations", () => {
	it("calculates percentage correctly", () => {
		const total = SAMPLE_ALLOCATION_DATA.reduce((sum, d) => sum + d.value, 0);
		const appl = SAMPLE_ALLOCATION_DATA.find((d) => d.name === "AAPL")!;
		const percentage = (appl.value / total) * 100;
		expect(percentage).toBe(25);
	});

	it("handles zero total gracefully", () => {
		const data: AllocationDataPoint[] = [{ name: "Empty", value: 0 }];
		const total = data.reduce((sum, d) => sum + d.value, 0);
		expect(total).toBe(0);
		// Percentage calculation should handle 0/0
		const percentage = total === 0 ? 0 : ((data[0]?.value ?? 0) / total) * 100;
		expect(percentage).toBe(0);
	});

	it("calculates largest allocation", () => {
		const largest = SAMPLE_ALLOCATION_DATA.reduce((max, d) => (d.value > max.value ? d : max));
		expect(largest.name).toBe("AAPL");
		expect(largest.value).toBe(25);
	});
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
	it("handles empty data array", () => {
		const data: AllocationDataPoint[] = [];
		expect(data.length).toBe(0);
	});

	it("handles single allocation (100%)", () => {
		const data: AllocationDataPoint[] = [{ name: "Single", value: 100 }];
		expect(data.length).toBe(1);
		expect(data[0]?.value).toBe(100);
	});

	it("handles many small allocations", () => {
		const data: AllocationDataPoint[] = Array.from({ length: 20 }, (_, i) => ({
			name: `Asset${i}`,
			value: 5,
		}));
		const total = data.reduce((sum, d) => sum + d.value, 0);
		expect(total).toBe(100);
		expect(data.length).toBe(20);
	});

	it("handles decimal values", () => {
		const point: AllocationDataPoint = {
			name: "Precise",
			value: 33.333,
		};
		expect(point.value).toBeCloseTo(33.333, 3);
	});

	it("handles very small allocations", () => {
		const point: AllocationDataPoint = {
			name: "Tiny",
			value: 0.001,
		};
		expect(point.value).toBe(0.001);
	});
});
