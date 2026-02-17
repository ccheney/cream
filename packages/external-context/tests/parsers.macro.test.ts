/**
 * Parser Tests: Macro
 */

import { expect, it } from "bun:test";
import {
	calculateMacroSurprise,
	filterRecentMacroReleases,
	groupByIndicator,
	isMacroReleaseSignificant,
	parseEconomicCalendarEvents,
} from "../src/index.js";

it("should parse economic calendar events", () => {
	const events = [
		{
			date: "2026-01-05",
			country: "US",
			event: "Non-Farm Payrolls",
			actual: 250000,
			previous: 200000,
			estimate: 220000,
		},
	];

	const results = parseEconomicCalendarEvents(events);
	expect(results).toHaveLength(1);
	const firstResult = results[0];
	if (firstResult) {
		expect(firstResult.indicator).toBe("Non-Farm Payrolls");
		expect(firstResult.value).toBe(250000);
	}
});

it("should calculate macro surprise", () => {
	// Beat
	expect(calculateMacroSurprise(110, 100)).toBeGreaterThan(0);
	// Miss
	expect(calculateMacroSurprise(90, 100)).toBeLessThan(0);
	// Inline
	expect(calculateMacroSurprise(100, 100)).toBe(0);
});

it("should detect significant macro releases", () => {
	const significant = {
		indicator: "GDP",
		value: 3.5,
		previousValue: 3.0,
		date: new Date(),
		source: "test",
	};
	const insignificant = {
		indicator: "GDP",
		value: 3.01,
		previousValue: 3.0,
		date: new Date(),
		source: "test",
	};

	expect(isMacroReleaseSignificant(significant, 0.5)).toBe(true);
	expect(isMacroReleaseSignificant(insignificant, 0.5)).toBe(false);
});

it("should group by indicator", () => {
	const releases = [
		{ indicator: "GDP", value: 3.0, date: new Date(), source: "test" },
		{ indicator: "CPI", value: 2.5, date: new Date(), source: "test" },
		{ indicator: "GDP", value: 2.8, date: new Date(Date.now() - 100000), source: "test" },
	];

	const groups = groupByIndicator(releases);
	expect(groups.size).toBe(2);
	const gdpGroup = groups.get("GDP");
	const cpiGroup = groups.get("CPI");
	if (gdpGroup && cpiGroup) {
		expect(gdpGroup).toHaveLength(2);
		expect(cpiGroup).toHaveLength(1);
	}
});

it("should skip events with null actual values", () => {
	const events = [
		{
			date: "2026-01-05",
			country: "US",
			event: "Non-Farm Payrolls",
			actual: null,
			previous: 200000,
		},
		{
			date: "2026-01-06",
			country: "US",
			event: "Unemployment Rate",
			actual: 3.7,
			previous: 3.8,
		},
	];

	const results = parseEconomicCalendarEvents(events);
	expect(results).toHaveLength(1);
	expect(results[0]?.indicator).toBe("Unemployment Rate");
});

it("should calculate surprise using previous when estimate is 0", () => {
	// When estimate is 0, should fall back to previous-based calculation
	const result = calculateMacroSurprise(110, 0, 100);
	// Should use previous-based: (110-100)/100 * 0.5 = 0.05
	expect(result).toBeCloseTo(0.05, 2);
});

it("should calculate surprise using previous when estimate is undefined", () => {
	const result = calculateMacroSurprise(110, undefined, 100);
	// (110-100)/100 * 0.5 = 0.05
	expect(result).toBeCloseTo(0.05, 2);
});

it("should return 0 surprise when no baseline available", () => {
	const result = calculateMacroSurprise(110, undefined, undefined);
	expect(result).toBe(0);
});

it("should return 0 surprise when previous is 0 and no estimate", () => {
	const result = calculateMacroSurprise(110, undefined, 0);
	expect(result).toBe(0);
});

it("should cap surprise at 1 for large beats", () => {
	const result = calculateMacroSurprise(200, 100);
	expect(result).toBe(1);
});

it("should cap surprise at -1 for large misses", () => {
	const result = calculateMacroSurprise(0, 100);
	expect(result).toBe(-1);
});

it("should consider release significant when previousValue is undefined", () => {
	const release = {
		indicator: "GDP",
		value: 3.5,
		previousValue: undefined,
		date: new Date(),
		source: "test",
	};

	expect(isMacroReleaseSignificant(release)).toBe(true);
});

it("should filter recent macro releases by age", () => {
	const now = new Date();
	const recentDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
	const oldDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days ago

	const releases = [
		{ indicator: "GDP", value: 3.0, date: recentDate, source: "test" },
		{ indicator: "CPI", value: 2.5, date: oldDate, source: "test" },
		{ indicator: "Jobs", value: 250000, date: now, source: "test" },
	];

	const filtered = filterRecentMacroReleases(releases, 7);
	expect(filtered).toHaveLength(2);
	expect(filtered.some((r) => r.indicator === "GDP")).toBe(true);
	expect(filtered.some((r) => r.indicator === "Jobs")).toBe(true);
	expect(filtered.some((r) => r.indicator === "CPI")).toBe(false);
});

it("should filter all old macro releases", () => {
	const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

	const releases = [
		{ indicator: "GDP", value: 3.0, date: oldDate, source: "test" },
		{ indicator: "CPI", value: 2.5, date: oldDate, source: "test" },
	];

	const filtered = filterRecentMacroReleases(releases, 7);
	expect(filtered).toHaveLength(0);
});
