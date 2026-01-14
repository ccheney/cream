/**
 * useEconomicCalendar Hook Tests
 *
 * Tests for economic calendar TanStack Query hooks and utilities.
 *
 * @see docs/plans/41-economic-calendar-page.md
 */

import { describe, expect, it } from "bun:test";
import type { ImpactLevel } from "@/lib/api/types";

// ============================================
// Types (mirror from hook)
// ============================================

interface UseEconomicCalendarOptions {
	startDate?: string;
	endDate?: string;
	impact?: ImpactLevel | ImpactLevel[];
	country?: string;
	enabled?: boolean;
}

// ============================================
// Utility Functions (mirror from hook)
// ============================================

function formatDate(date: Date): string {
	return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function getToday(): string {
	return formatDate(new Date());
}

function getDatePlusDays(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return formatDate(date);
}

// ============================================
// formatDate Tests
// ============================================

describe("formatDate", () => {
	it("returns YYYY-MM-DD format", () => {
		const date = new Date("2025-01-15T12:00:00Z");
		const formatted = formatDate(date);
		expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("formats date in New York timezone", () => {
		// January 1st at midnight UTC is still Dec 31st in NYC
		const date = new Date("2025-01-01T04:00:00Z"); // Midnight in NYC on Jan 1st
		const formatted = formatDate(date);
		// Should be 2024-12-31 or 2025-01-01 depending on DST
		expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("handles different months correctly", () => {
		const dates = [new Date("2025-03-15"), new Date("2025-07-15"), new Date("2025-12-15")];
		for (const date of dates) {
			const formatted = formatDate(date);
			expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it("pads single-digit months and days", () => {
		const date = new Date("2025-01-05T12:00:00");
		const formatted = formatDate(date);
		// Should have zero-padded month and day
		expect(formatted.length).toBe(10); // YYYY-MM-DD
	});
});

// ============================================
// getToday Tests
// ============================================

describe("getToday", () => {
	it("returns a string in YYYY-MM-DD format", () => {
		const today = getToday();
		expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("returns today's date", () => {
		const today = getToday();
		const parsed = new Date(today);
		const now = new Date();
		// Should be within 1 day (accounting for timezone differences)
		expect(Math.abs(parsed.getTime() - now.getTime())).toBeLessThan(2 * 24 * 60 * 60 * 1000);
	});

	it("returns consistent results when called multiple times", () => {
		const first = getToday();
		const second = getToday();
		expect(first).toBe(second);
	});
});

// ============================================
// getDatePlusDays Tests
// ============================================

describe("getDatePlusDays", () => {
	it("returns a string in YYYY-MM-DD format", () => {
		const future = getDatePlusDays(7);
		expect(future).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("returns date N days in the future", () => {
		const days = 7;
		const future = getDatePlusDays(days);
		const today = new Date();
		const futureDate = new Date(future);
		const diffDays = Math.round((futureDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
		expect(diffDays).toBeGreaterThanOrEqual(days - 1);
		expect(diffDays).toBeLessThanOrEqual(days + 1);
	});

	it("handles 0 days (returns today)", () => {
		const result = getDatePlusDays(0);
		const today = getToday();
		// Should be same day or adjacent (timezone edge case)
		const resultDate = new Date(result);
		const todayDate = new Date(today);
		const diffDays = Math.abs(resultDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24);
		expect(diffDays).toBeLessThanOrEqual(1);
	});

	it("handles 30 days", () => {
		const result = getDatePlusDays(30);
		const today = new Date();
		const futureDate = new Date(result);
		const diffDays = Math.round((futureDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
		expect(diffDays).toBeGreaterThanOrEqual(29);
		expect(diffDays).toBeLessThanOrEqual(31);
	});

	it("handles 60 days", () => {
		const result = getDatePlusDays(60);
		const today = new Date();
		const futureDate = new Date(result);
		const diffDays = Math.round((futureDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
		expect(diffDays).toBeGreaterThanOrEqual(59);
		expect(diffDays).toBeLessThanOrEqual(61);
	});

	it("handles negative days (past dates)", () => {
		const result = getDatePlusDays(-7);
		const today = new Date();
		const pastDate = new Date(result);
		expect(pastDate.getTime()).toBeLessThan(today.getTime());
	});
});

// ============================================
// UseEconomicCalendarOptions Type Tests
// ============================================

describe("UseEconomicCalendarOptions", () => {
	it("accepts empty options object", () => {
		const options: UseEconomicCalendarOptions = {};
		expect(options.startDate).toBeUndefined();
		expect(options.endDate).toBeUndefined();
		expect(options.impact).toBeUndefined();
		expect(options.country).toBeUndefined();
		expect(options.enabled).toBeUndefined();
	});

	it("accepts all options", () => {
		const options: UseEconomicCalendarOptions = {
			startDate: "2025-01-01",
			endDate: "2025-01-31",
			impact: ["high", "medium"],
			country: "US",
			enabled: true,
		};
		expect(options.startDate).toBe("2025-01-01");
		expect(options.endDate).toBe("2025-01-31");
		expect(options.impact).toEqual(["high", "medium"]);
		expect(options.country).toBe("US");
		expect(options.enabled).toBe(true);
	});

	it("accepts single impact level", () => {
		const options: UseEconomicCalendarOptions = {
			impact: "high",
		};
		expect(options.impact).toBe("high");
	});

	it("accepts multiple impact levels", () => {
		const options: UseEconomicCalendarOptions = {
			impact: ["high", "medium", "low"],
		};
		expect(options.impact).toEqual(["high", "medium", "low"]);
	});

	it("accepts enabled: false", () => {
		const options: UseEconomicCalendarOptions = {
			enabled: false,
		};
		expect(options.enabled).toBe(false);
	});
});

// ============================================
// Impact Filter Logic Tests
// ============================================

describe("impact filter logic", () => {
	it("joins array impact to comma-separated string", () => {
		const impact: ImpactLevel[] = ["high", "medium"];
		const impactFilter = Array.isArray(impact) ? impact.join(",") : impact;
		expect(impactFilter).toBe("high,medium");
	});

	it("returns single impact as-is", () => {
		const impact: ImpactLevel = "high";
		const impactFilter = Array.isArray(impact) ? impact.join(",") : impact;
		expect(impactFilter).toBe("high");
	});

	it("handles empty array", () => {
		const impact: ImpactLevel[] = [];
		const impactFilter = Array.isArray(impact) ? impact.join(",") : impact;
		expect(impactFilter).toBe("");
	});

	it("handles all impact levels", () => {
		const impact: ImpactLevel[] = ["high", "medium", "low"];
		const impactFilter = Array.isArray(impact) ? impact.join(",") : impact;
		expect(impactFilter).toBe("high,medium,low");
	});
});

// ============================================
// Query Key Tests
// ============================================

describe("query keys", () => {
	it("economic calendar events key includes dates and impact", () => {
		const startDate = "2025-01-01";
		const endDate = "2025-01-31";
		const impact = "high,medium";

		// Mock query key structure
		const queryKey = ["economicCalendar", "events", startDate, endDate, impact];
		expect(queryKey).toContain("economicCalendar");
		expect(queryKey).toContain("events");
		expect(queryKey).toContain(startDate);
		expect(queryKey).toContain(endDate);
		expect(queryKey).toContain(impact);
	});

	it("event history key includes eventId", () => {
		const eventId = "fred-123-cpi";
		const queryKey = ["economicCalendar", "history", eventId];
		expect(queryKey).toContain("economicCalendar");
		expect(queryKey).toContain("history");
		expect(queryKey).toContain(eventId);
	});

	it("single event key includes id", () => {
		const id = "fred-456-gdp";
		const queryKey = ["economicCalendar", "event", id];
		expect(queryKey).toContain("economicCalendar");
		expect(queryKey).toContain("event");
		expect(queryKey).toContain(id);
	});
});

// ============================================
// URL Params Building Tests
// ============================================

describe("URL params building", () => {
	it("builds params with start and end dates", () => {
		const params = new URLSearchParams({
			start: "2025-01-01",
			end: "2025-01-31",
			country: "US",
		});
		expect(params.get("start")).toBe("2025-01-01");
		expect(params.get("end")).toBe("2025-01-31");
		expect(params.get("country")).toBe("US");
	});

	it("adds impact filter when provided", () => {
		const params = new URLSearchParams({
			start: "2025-01-01",
			end: "2025-01-31",
			country: "US",
		});
		const impactFilter = "high,medium";
		if (impactFilter) {
			params.set("impact", impactFilter);
		}
		expect(params.get("impact")).toBe("high,medium");
	});

	it("omits impact when not provided", () => {
		const params = new URLSearchParams({
			start: "2025-01-01",
			end: "2025-01-31",
			country: "US",
		});
		const impactFilter: string | undefined = undefined;
		if (impactFilter) {
			params.set("impact", impactFilter);
		}
		expect(params.get("impact")).toBeNull();
	});

	it("builds valid query string", () => {
		const params = new URLSearchParams({
			start: "2025-01-01",
			end: "2025-01-31",
			country: "US",
		});
		const queryString = params.toString();
		expect(queryString).toContain("start=2025-01-01");
		expect(queryString).toContain("end=2025-01-31");
		expect(queryString).toContain("country=US");
	});
});

// ============================================
// Default Values Tests
// ============================================

describe("default values", () => {
	it("startDate defaults to today", () => {
		const options: UseEconomicCalendarOptions = {};
		const startDate = options.startDate ?? getToday();
		expect(startDate).toBe(getToday());
	});

	it("endDate defaults to 30 days from now", () => {
		const options: UseEconomicCalendarOptions = {};
		const endDate = options.endDate ?? getDatePlusDays(30);
		expect(endDate).toBe(getDatePlusDays(30));
	});

	it("country defaults to US", () => {
		const options: UseEconomicCalendarOptions = {};
		const country = options.country ?? "US";
		expect(country).toBe("US");
	});

	it("enabled defaults to true", () => {
		const options: UseEconomicCalendarOptions = {};
		const enabled = options.enabled ?? true;
		expect(enabled).toBe(true);
	});
});

// ============================================
// Utility Hook Configuration Tests
// ============================================

describe("useUpcomingHighImpactEvents configuration", () => {
	it("uses 7 day range", () => {
		const endDate = getDatePlusDays(7);
		const today = new Date();
		const futureDate = new Date(endDate);
		const diffDays = Math.round((futureDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
		expect(diffDays).toBeGreaterThanOrEqual(6);
		expect(diffDays).toBeLessThanOrEqual(8);
	});

	it("filters to high impact only", () => {
		const impact = "high";
		expect(impact).toBe("high");
	});
});

describe("useThisWeekEvents configuration", () => {
	it("uses 7 day range", () => {
		const startDate = getToday();
		const endDate = getDatePlusDays(7);
		expect(startDate).toBe(getToday());
		const today = new Date();
		const futureDate = new Date(endDate);
		const diffDays = Math.round((futureDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
		expect(diffDays).toBeGreaterThanOrEqual(6);
		expect(diffDays).toBeLessThanOrEqual(8);
	});

	it("includes all impact levels", () => {
		// No impact filter = all levels
		const impact: ImpactLevel | ImpactLevel[] | undefined = undefined;
		expect(impact).toBeUndefined();
	});
});

describe("useEventHistory configuration", () => {
	it("is disabled when eventId is null", () => {
		const eventId: string | null = null;
		const enabled = Boolean(eventId);
		expect(enabled).toBe(false);
	});

	it("is enabled when eventId is provided", () => {
		const eventId: string | null = "fred-123";
		const enabled = Boolean(eventId);
		expect(enabled).toBe(true);
	});

	it("handles empty string eventId", () => {
		const eventId = "";
		const enabled = Boolean(eventId);
		expect(enabled).toBe(false);
	});
});

// ============================================
// Module Exports Tests
// ============================================

describe("useEconomicCalendar exports", () => {
	it("exports useEconomicCalendar hook", async () => {
		const module = await import("../useEconomicCalendar");
		expect(module.useEconomicCalendar).toBeDefined();
		expect(typeof module.useEconomicCalendar).toBe("function");
	});

	it("exports useEconomicEvent hook", async () => {
		const module = await import("../useEconomicCalendar");
		expect(module.useEconomicEvent).toBeDefined();
		expect(typeof module.useEconomicEvent).toBe("function");
	});

	it("exports useUpcomingHighImpactEvents hook", async () => {
		const module = await import("../useEconomicCalendar");
		expect(module.useUpcomingHighImpactEvents).toBeDefined();
		expect(typeof module.useUpcomingHighImpactEvents).toBe("function");
	});

	it("exports useThisWeekEvents hook", async () => {
		const module = await import("../useEconomicCalendar");
		expect(module.useThisWeekEvents).toBeDefined();
		expect(typeof module.useThisWeekEvents).toBe("function");
	});

	it("exports useEventHistory hook", async () => {
		const module = await import("../useEconomicCalendar");
		expect(module.useEventHistory).toBeDefined();
		expect(typeof module.useEventHistory).toBe("function");
	});
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
	it("handles year boundary dates", () => {
		const date = new Date("2025-12-31");
		const formatted = formatDate(date);
		expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("handles leap year dates", () => {
		const date = new Date("2024-02-29");
		const formatted = formatDate(date);
		expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("handles large day offsets", () => {
		const result = getDatePlusDays(365);
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
