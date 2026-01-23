/**
 * FRED Tool Implementation Tests
 *
 * Tests for getEconomicCalendar and getMacroIndicators functions.
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "PAPER";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ExecutionContext } from "@cream/domain";
import { requireValue } from "@cream/test-utils";
import type {
	FREDObservation,
	FREDObservationsResponse,
	FREDReleaseDate,
	FREDReleaseDatesResponse,
} from "@cream/universe";
import { FREDClient } from "@cream/universe";
import { resetFREDClient, setFREDClientForTesting } from "../clients.js";
import { getEconomicCalendar, getMacroIndicators } from "./fred.js";

const createMockFREDClient = (
	overrides: Partial<Pick<FREDClient, "getReleaseDates" | "getObservations">>,
): FREDClient => {
	const client = new FREDClient({ apiKey: "test" });
	if (overrides.getReleaseDates) {
		client.getReleaseDates = overrides.getReleaseDates;
	}
	if (overrides.getObservations) {
		client.getObservations = overrides.getObservations;
	}
	return client;
};

// ============================================
// Test Context Factory
// ============================================

function createTestContext(
	environment: "PAPER" | "LIVE" = "PAPER",
	source: "test" | "manual" = "test",
): ExecutionContext {
	return {
		environment,
		source,
		traceId: "test-trace-123",
	};
}

// ============================================
// Mock Data
// ============================================

const buildReleaseDatesResponse = (releaseDates: FREDReleaseDate[]): FREDReleaseDatesResponse => ({
	realtime_start: "2025-01-01",
	realtime_end: "2025-12-31",
	order_by: "release_date",
	sort_order: "asc",
	count: releaseDates.length,
	offset: 0,
	limit: 1000,
	release_dates: releaseDates,
});

const buildObservationsResponse = (observations: FREDObservation[]): FREDObservationsResponse => ({
	realtime_start: "2025-01-01",
	realtime_end: "2025-12-31",
	observation_start: "2024-01-01",
	observation_end: "2025-12-31",
	units: "lin",
	output_type: 1,
	file_type: "json",
	order_by: "observation_date",
	sort_order: "desc",
	count: observations.length,
	offset: 0,
	limit: 100000,
	observations,
});

const makeObservation = (date: string, value: string | null): FREDObservation => ({
	realtime_start: "2025-01-01",
	realtime_end: "2025-12-31",
	date,
	value,
});

const mockReleaseDates = buildReleaseDatesResponse([
	{ release_id: 9, date: "2025-02-12", release_name: "Consumer Price Index" },
	{ release_id: 50, date: "2025-02-07", release_name: "Employment Situation" },
	{ release_id: 11, date: "2025-02-10", release_name: "Producer Price Index" },
	{ release_id: 999, date: "2025-02-15", release_name: "Unknown Release" },
]);

const mockObservations = buildObservationsResponse([
	makeObservation("2025-01-15", "315.6"),
	makeObservation("2024-12-15", "314.1"),
]);

// ============================================
// getEconomicCalendar Tests
// ============================================

describe("getEconomicCalendar", () => {
	afterEach(() => {
		resetFREDClient();
	});

	describe("test mode", () => {
		test("returns empty array in test mode", async () => {
			const ctx = createTestContext("PAPER", "test");
			const events = await getEconomicCalendar(ctx, "2025-01-01", "2025-01-31");
			expect(events).toEqual([]);
		});

		test("does not call FRED API in test mode", async () => {
			const mockGetReleaseDates = mock(() => Promise.resolve(buildReleaseDatesResponse([])));
			setFREDClientForTesting(
				createMockFREDClient({
					getReleaseDates: mockGetReleaseDates,
					getObservations: mock(() => Promise.resolve(buildObservationsResponse([]))),
				}),
			);

			const ctx = createTestContext("PAPER", "test");
			await getEconomicCalendar(ctx, "2025-01-01", "2025-01-31");

			expect(mockGetReleaseDates).not.toHaveBeenCalled();
		});
	});

	describe("no API key", () => {
		test("returns empty array when FRED client is null", async () => {
			// Force getFREDClient to return null (simulates no API key)
			setFREDClientForTesting(null);

			const ctx = createTestContext("PAPER");
			const events = await getEconomicCalendar(ctx, "2025-01-01", "2025-01-31");
			expect(events).toEqual([]);
		});
	});

	describe("successful fetch", () => {
		beforeEach(() => {
			const mockClient = createMockFREDClient({
				getReleaseDates: mock(() => Promise.resolve(mockReleaseDates)),
				getObservations: mock(() => Promise.resolve(mockObservations)),
			});
			setFREDClientForTesting(mockClient);
		});

		test("calls API with correct parameters", async () => {
			const mockGetReleaseDates = mock(() => Promise.resolve(buildReleaseDatesResponse([])));
			setFREDClientForTesting(
				createMockFREDClient({
					getReleaseDates: mockGetReleaseDates,
					getObservations: mock(() => Promise.resolve(buildObservationsResponse([]))),
				}),
			);

			const ctx = createTestContext("PAPER", "manual");
			await getEconomicCalendar(ctx, "2025-01-01", "2025-01-31");

			expect(mockGetReleaseDates).toHaveBeenCalledWith({
				realtime_start: "2025-01-01",
				realtime_end: "2025-01-31",
				include_release_dates_with_no_data: true,
				limit: 1000,
				order_by: "release_date",
				sort_order: "asc",
			});
		});

		test("filters to tracked releases only", async () => {
			const ctx = createTestContext("PAPER", "manual");
			const events = await getEconomicCalendar(ctx, "2025-02-01", "2025-02-28");

			// Should only include tracked releases (CPI=9, Employment=10, PPI=50)
			// Should NOT include release_id 999 (unknown)
			const releaseIds = events.map((e) => e.id);
			expect(releaseIds.some((id) => id.includes("fred-999"))).toBe(false);
		});

		test("transforms events correctly", async () => {
			const ctx = createTestContext("PAPER", "manual");
			const events = await getEconomicCalendar(ctx, "2025-02-01", "2025-02-28");

			// Find CPI event (release_id 9 is high impact)
			const cpiEvent = events.find((e) => e.id.includes("fred-9-"));

			if (cpiEvent) {
				expect(cpiEvent).toHaveProperty("id");
				expect(cpiEvent).toHaveProperty("name");
				expect(cpiEvent).toHaveProperty("date");
				expect(cpiEvent).toHaveProperty("time");
				expect(cpiEvent).toHaveProperty("impact");
				expect(cpiEvent.impact).toBe("high");
			}
		});

		test("classifies impact correctly", async () => {
			const ctx = createTestContext("PAPER", "manual");
			const events = await getEconomicCalendar(ctx, "2025-02-01", "2025-02-28");

			// CPI (id=9) should be high impact
			const cpiEvent = events.find((e) => e.id.includes("fred-9-"));
			if (cpiEvent) {
				expect(cpiEvent.impact).toBe("high");
			}

			// PPI (id=11) should be medium impact
			const ppiEvent = events.find((e) => e.id.includes("fred-11-"));
			if (ppiEvent) {
				expect(ppiEvent.impact).toBe("medium");
			}
		});
	});

	describe("API error handling", () => {
		test("returns empty array on API error", async () => {
			const mockClient = createMockFREDClient({
				getReleaseDates: mock(() => Promise.reject(new Error("API rate limit exceeded"))),
				getObservations: mock(() => Promise.resolve(buildObservationsResponse([]))),
			});
			setFREDClientForTesting(mockClient);

			const ctx = createTestContext("PAPER");
			const events = await getEconomicCalendar(ctx, "2025-01-01", "2025-01-31");

			expect(events).toEqual([]);
		});
	});
});

// ============================================
// getMacroIndicators Tests
// ============================================

describe("getMacroIndicators", () => {
	afterEach(() => {
		resetFREDClient();
	});

	describe("test mode", () => {
		test("returns empty object in test mode", async () => {
			const ctx = createTestContext("PAPER", "test");
			const indicators = await getMacroIndicators(ctx);
			expect(indicators).toEqual({});
		});

		test("does not call FRED API in test mode", async () => {
			const mockGetObservations = mock(() => Promise.resolve(buildObservationsResponse([])));
			setFREDClientForTesting(
				createMockFREDClient({
					getReleaseDates: mock(() => Promise.resolve(buildReleaseDatesResponse([]))),
					getObservations: mockGetObservations,
				}),
			);

			const ctx = createTestContext("PAPER", "test");
			await getMacroIndicators(ctx);

			expect(mockGetObservations).not.toHaveBeenCalled();
		});
	});

	describe("no API key", () => {
		test("returns empty object when FRED client is null", async () => {
			// Force getFREDClient to return null (simulates no API key)
			setFREDClientForTesting(null);

			const ctx = createTestContext("PAPER");
			const indicators = await getMacroIndicators(ctx);
			expect(indicators).toEqual({});
		});
	});

	describe("successful fetch", () => {
		test("fetches default series when none specified", async () => {
			const mockGetObservations = mock(() =>
				Promise.resolve(
					buildObservationsResponse([
						makeObservation("2025-01-15", "3.5"),
						makeObservation("2024-12-15", "3.4"),
					]),
				),
			);
			setFREDClientForTesting(
				createMockFREDClient({
					getReleaseDates: mock(() => Promise.resolve(buildReleaseDatesResponse([]))),
					getObservations: mockGetObservations,
				}),
			);

			const ctx = createTestContext("PAPER", "manual");
			await getMacroIndicators(ctx);

			// Should be called for each default series
			expect(mockGetObservations.mock.calls.length).toBeGreaterThan(0);
		});

		test("respects custom series IDs", async () => {
			const mockGetObservations = mock(() =>
				Promise.resolve(
					buildObservationsResponse([
						makeObservation("2025-01-15", "100.5"),
						makeObservation("2024-12-15", "100.0"),
					]),
				),
			);
			setFREDClientForTesting(
				createMockFREDClient({
					getReleaseDates: mock(() => Promise.resolve(buildReleaseDatesResponse([]))),
					getObservations: mockGetObservations,
				}),
			);

			const ctx = createTestContext("PAPER", "manual");
			const customSeries = ["CUSTOM1", "CUSTOM2"];
			await getMacroIndicators(ctx, customSeries);

			// Should be called exactly twice for custom series
			expect(mockGetObservations.mock.calls.length).toBe(2);
		});

		test("calculates percent change correctly", async () => {
			setFREDClientForTesting(
				createMockFREDClient({
					getReleaseDates: mock(() => Promise.resolve(buildReleaseDatesResponse([]))),
					getObservations: mock(() =>
						Promise.resolve(
							buildObservationsResponse([
								makeObservation("2025-01-15", "105.0"),
								makeObservation("2024-12-15", "100.0"),
							]),
						),
					),
				}),
			);

			const ctx = createTestContext("PAPER", "manual");
			const result = await getMacroIndicators(ctx, ["TEST"]);

			const testResult = requireValue(result.TEST, "TEST result");
			expect(testResult.value).toBe(105.0);
			expect(testResult.change).toBeCloseTo(5.0, 1);
		});

		test("returns latest value and date", async () => {
			setFREDClientForTesting(
				createMockFREDClient({
					getReleaseDates: mock(() => Promise.resolve(buildReleaseDatesResponse([]))),
					getObservations: mock(() =>
						Promise.resolve(
							buildObservationsResponse([
								makeObservation("2025-01-15", "315.6"),
								makeObservation("2024-12-15", "314.1"),
							]),
						),
					),
				}),
			);

			const ctx = createTestContext("PAPER", "manual");
			const result = await getMacroIndicators(ctx, ["CPIAUCSL"]);

			const cpiResult = requireValue(result.CPIAUCSL, "CPIAUCSL result");
			expect(cpiResult.value).toBe(315.6);
			expect(cpiResult.date).toBe("2025-01-15");
		});
	});

	describe("missing values handling", () => {
		test("handles missing value (.) gracefully", async () => {
			setFREDClientForTesting(
				createMockFREDClient({
					getReleaseDates: mock(() => Promise.resolve(buildReleaseDatesResponse([]))),
					getObservations: mock(() =>
						Promise.resolve(
							buildObservationsResponse([
								makeObservation("2025-01-15", "."),
								makeObservation("2024-12-15", "100.0"),
							]),
						),
					),
				}),
			);

			const ctx = createTestContext("PAPER");
			const result = await getMacroIndicators(ctx, ["TEST"]);

			// Should not include series with missing latest value
			expect(result.TEST).toBeUndefined();
		});

		test("handles empty observations", async () => {
			setFREDClientForTesting(
				createMockFREDClient({
					getReleaseDates: mock(() => Promise.resolve(buildReleaseDatesResponse([]))),
					getObservations: mock(() => Promise.resolve(buildObservationsResponse([]))),
				}),
			);

			const ctx = createTestContext("PAPER");
			const result = await getMacroIndicators(ctx, ["EMPTY"]);

			expect(result.EMPTY).toBeUndefined();
		});

		test("handles null value", async () => {
			setFREDClientForTesting(
				createMockFREDClient({
					getReleaseDates: mock(() => Promise.resolve(buildReleaseDatesResponse([]))),
					getObservations: mock(() =>
						Promise.resolve(buildObservationsResponse([makeObservation("2025-01-15", null)])),
					),
				}),
			);

			const ctx = createTestContext("PAPER");
			const result = await getMacroIndicators(ctx, ["NULL"]);

			expect(result.NULL).toBeUndefined();
		});
	});

	describe("API error handling", () => {
		test("handles API errors gracefully", async () => {
			setFREDClientForTesting(
				createMockFREDClient({
					getReleaseDates: mock(() => Promise.resolve(buildReleaseDatesResponse([]))),
					getObservations: mock(() => Promise.reject(new Error("Network error"))),
				}),
			);

			const ctx = createTestContext("PAPER", "manual");
			const result = await getMacroIndicators(ctx, ["ERROR"]);

			// Should return empty object when all fetches fail
			expect(result).toEqual({});
		});

		test("continues fetching other series when one fails", async () => {
			let callCount = 0;
			setFREDClientForTesting(
				createMockFREDClient({
					getReleaseDates: mock(() => Promise.resolve(buildReleaseDatesResponse([]))),
					getObservations: mock(() => {
						callCount++;
						if (callCount === 1) {
							return Promise.reject(new Error("First fails"));
						}
						return Promise.resolve(
							buildObservationsResponse([
								makeObservation("2025-01-15", "100.0"),
								makeObservation("2024-12-15", "99.0"),
							]),
						);
					}),
				}),
			);

			const ctx = createTestContext("PAPER", "manual");
			const result = await getMacroIndicators(ctx, ["FAIL", "SUCCESS"]);

			// Should still have the successful series
			expect(result.SUCCESS).toBeDefined();
			expect(result.FAIL).toBeUndefined();
		});
	});
});
