/**
 * FRED client utility and schema tests.
 */

import { afterEach, describe, expect, it } from "bun:test";
import {
	classifyReleaseImpact,
	createFREDClient,
	createFREDClientFromEnv,
	FREDClient,
	FREDObservationsResponseSchema,
	FREDReleaseDatesResponseSchema,
	getReleaseById,
} from "./fred-client.js";

describe("classifyReleaseImpact", () => {
	it("classifies high impact releases", () => {
		expect(classifyReleaseImpact(10)).toBe("high");
		expect(classifyReleaseImpact(50)).toBe("high");
		expect(classifyReleaseImpact(53)).toBe("high");
		expect(classifyReleaseImpact(101)).toBe("high");
	});

	it("classifies medium and low impact releases", () => {
		expect(classifyReleaseImpact(13)).toBe("medium");
		expect(classifyReleaseImpact(11)).toBe("medium");
		expect(classifyReleaseImpact(999)).toBe("low");
	});
});

describe("getReleaseById", () => {
	it("finds known releases", () => {
		const cpi = getReleaseById(10);
		expect(cpi?.key).toBe("CPI");
		expect(cpi?.name).toBe("Consumer Price Index");
		expect(getReleaseById(50)?.key).toBe("EMPLOYMENT");
	});

	it("returns undefined for unknown releases", () => {
		expect(getReleaseById(99999)).toBeUndefined();
	});
});

describe("FRED schemas", () => {
	it("validates release date response and coerces release_id", () => {
		const parsed = FREDReleaseDatesResponseSchema.safeParse({
			realtime_start: "2026-01-01",
			realtime_end: "2026-01-31",
			order_by: "release_date",
			sort_order: "desc",
			count: 1,
			offset: 0,
			limit: 100,
			release_dates: [{ release_id: "10", date: "2026-01-15" }],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.release_dates?.[0]?.release_id).toBe(10);
		}
	});

	it("transforms missing observation value to null", () => {
		const parsed = FREDObservationsResponseSchema.safeParse({
			realtime_start: "2026-01-01",
			realtime_end: "2026-01-31",
			observation_start: "2025-01-01",
			observation_end: "2026-01-01",
			units: "lin",
			output_type: 1,
			file_type: "json",
			order_by: "observation_date",
			sort_order: "asc",
			count: 1,
			offset: 0,
			limit: 100,
			observations: [
				{
					realtime_start: "2026-01-01",
					realtime_end: "2026-01-31",
					date: "2025-01-01",
					value: ".",
				},
			],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.observations[0]?.value).toBeNull();
		}
	});
});

describe("createFREDClient", () => {
	it("creates client instance", () => {
		expect(createFREDClient({ apiKey: "test-key" })).toBeInstanceOf(FREDClient);
	});

	it("accepts full config", () => {
		expect(
			createFREDClient({
				apiKey: "test-key",
				baseUrl: "https://custom.api.com",
				timeout: 5000,
				retries: 5,
				retryDelay: 1000,
			}),
		).toBeInstanceOf(FREDClient);
	});
});

describe("createFREDClientFromEnv", () => {
	const originalKey = Bun.env.FRED_API_KEY;

	afterEach(() => {
		if (originalKey !== undefined) {
			Bun.env.FRED_API_KEY = originalKey;
		} else {
			delete Bun.env.FRED_API_KEY;
		}
	});

	it("creates client when env var exists", () => {
		Bun.env.FRED_API_KEY = "test-api-key";
		expect(createFREDClientFromEnv()).toBeInstanceOf(FREDClient);
	});

	it("throws when env var is missing", () => {
		delete Bun.env.FRED_API_KEY;
		expect(() => createFREDClientFromEnv()).toThrow(
			"FRED_API_KEY environment variable is required",
		);
	});
});
