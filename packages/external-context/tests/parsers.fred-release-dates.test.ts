/**
 * Parser Tests: FRED Release Dates
 */

import { expect, it } from "bun:test";
import type { FREDLatestValues } from "../src/index.js";
import { parseFREDReleaseDates } from "../src/index.js";

it("should parse valid release dates", () => {
	const releaseDates = [
		{ release_id: 10, release_name: "Consumer Price Index", date: "2025-01-15" },
	];

	const events = parseFREDReleaseDates(releaseDates);

	expect(events).toHaveLength(1);
	const event = events[0];
	if (event) {
		expect(event.id).toBe("fred-10-2025-01-15");
		expect(event.name).toBe("Consumer Price Index");
		expect(event.date).toBe("2025-01-15");
		expect(event.impact).toBe("high"); // CPI is high impact
		expect(event.releaseId).toBe(10);
		expect(event.time).toBe("08:30:00"); // Default release time
		expect(event.forecast).toBeNull();
	}
});

it("should parse release dates with string release_id", () => {
	const releaseDates = [{ release_id: "50" as unknown as number, date: "2025-01-10" }];

	const events = parseFREDReleaseDates(releaseDates);

	expect(events).toHaveLength(1);
	const event = events[0];
	if (event) {
		expect(event.id).toBe("fred-50-2025-01-10");
		expect(event.impact).toBe("high"); // Employment is high impact
	}
});

it("should populate previous and actual from latestValues", () => {
	const releaseDates = [{ release_id: 10, date: "2025-01-15" }];
	const latestValues = new Map<number, FREDLatestValues>([
		[10, { previous: 315.5, actual: 316.2 }],
	]);

	const events = parseFREDReleaseDates(releaseDates, latestValues);

	expect(events).toHaveLength(1);
	const event = events[0];
	if (event) {
		expect(event.previous).toBe("315.5");
		expect(event.actual).toBe("316.2");
	}
});

it("should handle null values in latestValues", () => {
	const releaseDates = [{ release_id: 10, date: "2025-01-15" }];
	const latestValues = new Map<number, FREDLatestValues>([[10, { previous: null, actual: null }]]);

	const events = parseFREDReleaseDates(releaseDates, latestValues);

	expect(events).toHaveLength(1);
	const event = events[0];
	if (event) {
		expect(event.previous).toBeNull();
		expect(event.actual).toBeNull();
	}
});

it("should return empty array for empty input", () => {
	const events = parseFREDReleaseDates([]);
	expect(events).toHaveLength(0);
});

it("should use special release time for FOMC", () => {
	const releaseDates = [
		{ release_id: 101, release_name: "FOMC Press Release", date: "2025-01-29" },
	];

	const events = parseFREDReleaseDates(releaseDates);

	expect(events).toHaveLength(1);
	const event = events[0];
	if (event) {
		expect(event.time).toBe("14:00:00"); // FOMC at 2pm ET
		expect(event.impact).toBe("high");
	}
});

it("should fallback to release name when not in registry", () => {
	const releaseDates = [{ release_id: 99999, release_name: "Unknown Release", date: "2025-01-15" }];

	const events = parseFREDReleaseDates(releaseDates);

	expect(events).toHaveLength(1);
	const event = events[0];
	if (event) {
		expect(event.name).toBe("Unknown Release");
		expect(event.impact).toBe("low"); // Not in high/medium list
	}
});

it("should generate fallback name when no release_name", () => {
	const releaseDates = [{ release_id: 99999, date: "2025-01-15" }];

	const events = parseFREDReleaseDates(releaseDates);

	expect(events).toHaveLength(1);
	const event = events[0];
	if (event) {
		expect(event.name).toBe("FRED Release 99999");
	}
});
