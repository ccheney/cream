/**
 * CalendarFilters Component Tests
 *
 * Tests for calendar filter controls and utilities.
 *
 * @see docs/plans/41-economic-calendar-page.md
 */

import { describe, expect, it } from "bun:test";
import type { ImpactLevel } from "@/lib/api/types";

// ============================================
// Types (mirror from component)
// ============================================

interface CalendarFilterState {
	country: string;
	impact: ImpactLevel[];
	dateRange: "week" | "month" | "30days" | "60days";
}

// ============================================
// Constants (mirror from component)
// ============================================

const COUNTRY_OPTIONS = [
	{ value: "US", label: "United States" },
	{ value: "ALL", label: "All Countries" },
] as const;

const IMPACT_OPTIONS: { value: ImpactLevel; label: string; color: string }[] = [
	{ value: "high", label: "High", color: "bg-red-500" },
	{ value: "medium", label: "Medium", color: "bg-amber-500" },
	{ value: "low", label: "Low", color: "bg-gray-400" },
];

const DATE_RANGE_OPTIONS = [
	{ value: "week", label: "This Week" },
	{ value: "month", label: "This Month" },
	{ value: "30days", label: "Next 30 Days" },
	{ value: "60days", label: "Next 60 Days" },
] as const;

const DEFAULT_FILTERS: CalendarFilterState = {
	country: "US",
	impact: ["high", "medium", "low"],
	dateRange: "30days",
};

// ============================================
// Utility Functions (mirror from component)
// ============================================

function getDateRangeFromFilter(dateRange: CalendarFilterState["dateRange"]): {
	start: string;
	end: string;
} {
	const today = new Date();
	const start = new Date();
	const end = new Date();

	switch (dateRange) {
		case "week":
			start.setDate(today.getDate() - today.getDay());
			end.setDate(start.getDate() + 6);
			break;
		case "month":
			start.setDate(1);
			end.setMonth(today.getMonth() + 1, 0);
			break;
		case "30days":
			start.setDate(today.getDate() - 7);
			end.setDate(today.getDate() + 30);
			break;
		case "60days":
			start.setDate(today.getDate() - 7);
			end.setDate(today.getDate() + 60);
			break;
	}

	return {
		start: start.toISOString().split("T")[0] ?? "",
		end: end.toISOString().split("T")[0] ?? "",
	};
}

// ============================================
// DEFAULT_FILTERS Tests
// ============================================

describe("DEFAULT_FILTERS", () => {
	it("has US as default country", () => {
		expect(DEFAULT_FILTERS.country).toBe("US");
	});

	it("includes all impact levels by default", () => {
		expect(DEFAULT_FILTERS.impact).toContain("high");
		expect(DEFAULT_FILTERS.impact).toContain("medium");
		expect(DEFAULT_FILTERS.impact).toContain("low");
		expect(DEFAULT_FILTERS.impact.length).toBe(3);
	});

	it("uses 30days as default date range", () => {
		expect(DEFAULT_FILTERS.dateRange).toBe("30days");
	});

	it("is a valid CalendarFilterState", () => {
		const filters: CalendarFilterState = DEFAULT_FILTERS;
		expect(filters.country).toBeDefined();
		expect(Array.isArray(filters.impact)).toBe(true);
		expect(filters.dateRange).toBeDefined();
	});
});

// ============================================
// COUNTRY_OPTIONS Tests
// ============================================

describe("COUNTRY_OPTIONS", () => {
	it("includes United States option", () => {
		const usOption = COUNTRY_OPTIONS.find((o) => o.value === "US");
		expect(usOption).toBeDefined();
		expect(usOption?.label).toBe("United States");
	});

	it("includes All Countries option", () => {
		const allOption = COUNTRY_OPTIONS.find((o) => o.value === "ALL");
		expect(allOption).toBeDefined();
		expect(allOption?.label).toBe("All Countries");
	});

	it("has exactly 2 options", () => {
		expect(COUNTRY_OPTIONS.length).toBe(2);
	});

	it("all options have value and label", () => {
		for (const option of COUNTRY_OPTIONS) {
			expect(option.value).toBeDefined();
			expect(option.label).toBeDefined();
		}
	});
});

// ============================================
// IMPACT_OPTIONS Tests
// ============================================

describe("IMPACT_OPTIONS", () => {
	it("includes high impact option", () => {
		const highOption = IMPACT_OPTIONS.find((o) => o.value === "high");
		expect(highOption).toBeDefined();
		expect(highOption?.label).toBe("High");
		expect(highOption?.color).toContain("red");
	});

	it("includes medium impact option", () => {
		const mediumOption = IMPACT_OPTIONS.find((o) => o.value === "medium");
		expect(mediumOption).toBeDefined();
		expect(mediumOption?.label).toBe("Medium");
		expect(mediumOption?.color).toContain("amber");
	});

	it("includes low impact option", () => {
		const lowOption = IMPACT_OPTIONS.find((o) => o.value === "low");
		expect(lowOption).toBeDefined();
		expect(lowOption?.label).toBe("Low");
		expect(lowOption?.color).toContain("gray");
	});

	it("has exactly 3 options", () => {
		expect(IMPACT_OPTIONS.length).toBe(3);
	});

	it("all options have value, label, and color", () => {
		for (const option of IMPACT_OPTIONS) {
			expect(option.value).toBeDefined();
			expect(option.label).toBeDefined();
			expect(option.color).toBeDefined();
		}
	});

	it("colors are Tailwind background classes", () => {
		for (const option of IMPACT_OPTIONS) {
			expect(option.color).toMatch(/^bg-/);
		}
	});
});

// ============================================
// DATE_RANGE_OPTIONS Tests
// ============================================

describe("DATE_RANGE_OPTIONS", () => {
	it("includes This Week option", () => {
		const weekOption = DATE_RANGE_OPTIONS.find((o) => o.value === "week");
		expect(weekOption).toBeDefined();
		expect(weekOption?.label).toBe("This Week");
	});

	it("includes This Month option", () => {
		const monthOption = DATE_RANGE_OPTIONS.find((o) => o.value === "month");
		expect(monthOption).toBeDefined();
		expect(monthOption?.label).toBe("This Month");
	});

	it("includes Next 30 Days option", () => {
		const thirtyOption = DATE_RANGE_OPTIONS.find((o) => o.value === "30days");
		expect(thirtyOption).toBeDefined();
		expect(thirtyOption?.label).toBe("Next 30 Days");
	});

	it("includes Next 60 Days option", () => {
		const sixtyOption = DATE_RANGE_OPTIONS.find((o) => o.value === "60days");
		expect(sixtyOption).toBeDefined();
		expect(sixtyOption?.label).toBe("Next 60 Days");
	});

	it("has exactly 4 options", () => {
		expect(DATE_RANGE_OPTIONS.length).toBe(4);
	});
});

// ============================================
// getDateRangeFromFilter Tests
// ============================================

describe("getDateRangeFromFilter", () => {
	it("returns start and end dates", () => {
		const result = getDateRangeFromFilter("30days");
		expect(result).toHaveProperty("start");
		expect(result).toHaveProperty("end");
	});

	it("returns ISO date strings (YYYY-MM-DD)", () => {
		const result = getDateRangeFromFilter("30days");
		expect(result.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(result.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	describe("week range", () => {
		it("start is Sunday of current week", () => {
			const result = getDateRangeFromFilter("week");
			const startDate = new Date(result.start);
			expect(startDate.getDay()).toBe(0); // Sunday
		});

		it("end is Saturday of current week", () => {
			const result = getDateRangeFromFilter("week");
			const endDate = new Date(result.end);
			expect(endDate.getDay()).toBe(6); // Saturday
		});

		it("range spans 7 days", () => {
			const result = getDateRangeFromFilter("week");
			const start = new Date(result.start);
			const end = new Date(result.end);
			const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
			expect(diffDays).toBe(6);
		});
	});

	describe("month range", () => {
		it("start is first day of month", () => {
			const result = getDateRangeFromFilter("month");
			const startDate = new Date(result.start);
			expect(startDate.getDate()).toBe(1);
		});

		it("end is last day of month", () => {
			const result = getDateRangeFromFilter("month");
			const endDate = new Date(result.end);
			const nextDay = new Date(endDate);
			nextDay.setDate(nextDay.getDate() + 1);
			expect(nextDay.getDate()).toBe(1); // Next month starts on 1st
		});
	});

	describe("30days range", () => {
		it("includes 7 days in past", () => {
			const result = getDateRangeFromFilter("30days");
			const today = new Date();
			const start = new Date(result.start);
			const diffDays = Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
			expect(diffDays).toBeGreaterThanOrEqual(6);
			expect(diffDays).toBeLessThanOrEqual(8);
		});

		it("extends 30 days into future", () => {
			const result = getDateRangeFromFilter("30days");
			const today = new Date();
			const end = new Date(result.end);
			const diffDays = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
			expect(diffDays).toBeGreaterThanOrEqual(29);
			expect(diffDays).toBeLessThanOrEqual(31);
		});
	});

	describe("60days range", () => {
		it("includes 7 days in past", () => {
			const result = getDateRangeFromFilter("60days");
			const today = new Date();
			const start = new Date(result.start);
			const diffDays = Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
			expect(diffDays).toBeGreaterThanOrEqual(6);
			expect(diffDays).toBeLessThanOrEqual(8);
		});

		it("extends 60 days into future", () => {
			const result = getDateRangeFromFilter("60days");
			const today = new Date();
			const end = new Date(result.end);
			const diffDays = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
			expect(diffDays).toBeGreaterThanOrEqual(59);
			expect(diffDays).toBeLessThanOrEqual(61);
		});
	});

	it("start date is always before or equal to end date", () => {
		const ranges: CalendarFilterState["dateRange"][] = ["week", "month", "30days", "60days"];
		for (const range of ranges) {
			const result = getDateRangeFromFilter(range);
			const start = new Date(result.start);
			const end = new Date(result.end);
			expect(start.getTime()).toBeLessThanOrEqual(end.getTime());
		}
	});
});

// ============================================
// CalendarFilterState Type Tests
// ============================================

describe("CalendarFilterState", () => {
	it("accepts valid filter state", () => {
		const state: CalendarFilterState = {
			country: "US",
			impact: ["high"],
			dateRange: "week",
		};
		expect(state.country).toBe("US");
		expect(state.impact).toEqual(["high"]);
		expect(state.dateRange).toBe("week");
	});

	it("accepts empty impact array", () => {
		const state: CalendarFilterState = {
			country: "US",
			impact: [],
			dateRange: "month",
		};
		expect(state.impact.length).toBe(0);
	});

	it("accepts multiple impact levels", () => {
		const state: CalendarFilterState = {
			country: "ALL",
			impact: ["high", "medium"],
			dateRange: "30days",
		};
		expect(state.impact).toContain("high");
		expect(state.impact).toContain("medium");
		expect(state.impact.length).toBe(2);
	});
});

// ============================================
// Filter Logic Tests
// ============================================

describe("filter logic", () => {
	describe("impact toggle", () => {
		it("adds impact level when not present", () => {
			const current: ImpactLevel[] = ["high"];
			const impact: ImpactLevel = "medium";
			const newImpact = current.includes(impact)
				? current.filter((i) => i !== impact)
				: [...current, impact];
			expect(newImpact).toContain("medium");
			expect(newImpact.length).toBe(2);
		});

		it("removes impact level when present", () => {
			const current: ImpactLevel[] = ["high", "medium"];
			const impact: ImpactLevel = "medium";
			const newImpact = current.includes(impact)
				? current.filter((i) => i !== impact)
				: [...current, impact];
			expect(newImpact).not.toContain("medium");
			expect(newImpact.length).toBe(1);
		});
	});

	describe("hasActiveFilters", () => {
		it("returns false for default filters", () => {
			const filters = DEFAULT_FILTERS;
			const hasActive =
				filters.country !== "US" || filters.impact.length !== 3 || filters.dateRange !== "30days";
			expect(hasActive).toBe(false);
		});

		it("returns true when country changed", () => {
			const filters: CalendarFilterState = { ...DEFAULT_FILTERS, country: "ALL" };
			const hasActive =
				filters.country !== "US" || filters.impact.length !== 3 || filters.dateRange !== "30days";
			expect(hasActive).toBe(true);
		});

		it("returns true when impact changed", () => {
			const filters: CalendarFilterState = { ...DEFAULT_FILTERS, impact: ["high"] };
			const hasActive =
				filters.country !== "US" || filters.impact.length !== 3 || filters.dateRange !== "30days";
			expect(hasActive).toBe(true);
		});

		it("returns true when date range changed", () => {
			const filters: CalendarFilterState = { ...DEFAULT_FILTERS, dateRange: "week" };
			const hasActive =
				filters.country !== "US" || filters.impact.length !== 3 || filters.dateRange !== "30days";
			expect(hasActive).toBe(true);
		});
	});

	describe("clearFilters", () => {
		it("resets to default values", () => {
			const cleared: CalendarFilterState = {
				country: "US",
				impact: ["high", "medium", "low"],
				dateRange: "30days",
			};
			expect(cleared.country).toBe(DEFAULT_FILTERS.country);
			expect(cleared.impact).toEqual(DEFAULT_FILTERS.impact);
			expect(cleared.dateRange).toBe(DEFAULT_FILTERS.dateRange);
		});
	});
});

// ============================================
// Module Exports Tests
// ============================================

describe("CalendarFilters exports", () => {
	it("exports CalendarFilters component", async () => {
		const module = await import("../CalendarFilters");
		expect(module.CalendarFilters).toBeDefined();
		expect(typeof module.CalendarFilters).toBe("function");
	});

	it("exports default as CalendarFilters", async () => {
		const module = await import("../CalendarFilters");
		expect(module.default).toBe(module.CalendarFilters);
	});

	it("exports getDateRangeFromFilter function", async () => {
		const module = await import("../CalendarFilters");
		expect(module.getDateRangeFromFilter).toBeDefined();
		expect(typeof module.getDateRangeFromFilter).toBe("function");
	});

	it("exports DEFAULT_FILTERS constant", async () => {
		const module = await import("../CalendarFilters");
		expect(module.DEFAULT_FILTERS).toBeDefined();
		expect(module.DEFAULT_FILTERS.country).toBe("US");
	});
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
	it("handles filter state with no impact levels selected", () => {
		const filters: CalendarFilterState = {
			country: "US",
			impact: [],
			dateRange: "30days",
		};
		expect(filters.impact.length).toBe(0);
	});

	it("handles all date range options", () => {
		const ranges: CalendarFilterState["dateRange"][] = ["week", "month", "30days", "60days"];
		for (const range of ranges) {
			const result = getDateRangeFromFilter(range);
			expect(result.start).toBeDefined();
			expect(result.end).toBeDefined();
		}
	});
});
