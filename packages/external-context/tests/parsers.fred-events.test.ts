/**
 * Parser Tests: FRED Event Filtering and Sorting
 */

import { expect, it } from "bun:test";
import type { FREDEconomicEvent } from "../src/index.js";
import { filterSignificantFREDEvents, sortFREDEventsByDateAndImpact } from "../src/index.js";

it("should filter to only high and medium impact events", () => {
	const events: FREDEconomicEvent[] = [
		{
			id: "fred-10-2025-01-15",
			name: "CPI",
			date: "2025-01-15",
			time: "08:30:00",
			impact: "high",
			forecast: null,
			previous: null,
			actual: null,
			releaseId: 10,
		},
		{
			id: "fred-13-2025-01-16",
			name: "Industrial Production",
			date: "2025-01-16",
			time: "08:30:00",
			impact: "medium",
			forecast: null,
			previous: null,
			actual: null,
			releaseId: 13,
		},
		{
			id: "fred-999-2025-01-17",
			name: "Minor Release",
			date: "2025-01-17",
			time: "08:30:00",
			impact: "low",
			forecast: null,
			previous: null,
			actual: null,
			releaseId: 999,
		},
	];

	const filtered = filterSignificantFREDEvents(events);

	expect(filtered).toHaveLength(2);
	expect(filtered.some((e) => e.impact === "high")).toBe(true);
	expect(filtered.some((e) => e.impact === "medium")).toBe(true);
	expect(filtered.some((e) => e.impact === "low")).toBe(false);
});

it("should sort by date first, then by impact", () => {
	const events: FREDEconomicEvent[] = [
		{
			id: "3",
			name: "Event C",
			date: "2025-01-17",
			time: "08:30:00",
			impact: "high",
			forecast: null,
			previous: null,
			actual: null,
			releaseId: 3,
		},
		{
			id: "1",
			name: "Event A",
			date: "2025-01-15",
			time: "08:30:00",
			impact: "low",
			forecast: null,
			previous: null,
			actual: null,
			releaseId: 1,
		},
		{
			id: "2",
			name: "Event B",
			date: "2025-01-15",
			time: "08:30:00",
			impact: "high",
			forecast: null,
			previous: null,
			actual: null,
			releaseId: 2,
		},
	];

	const sorted = sortFREDEventsByDateAndImpact(events);

	expect(sorted).toHaveLength(3);
	// First: 2025-01-15, high impact
	expect(sorted[0]?.id).toBe("2");
	// Second: 2025-01-15, low impact
	expect(sorted[1]?.id).toBe("1");
	// Third: 2025-01-17, high impact
	expect(sorted[2]?.id).toBe("3");
});

it("should handle empty array", () => {
	const sorted = sortFREDEventsByDateAndImpact([]);
	expect(sorted).toHaveLength(0);
});
