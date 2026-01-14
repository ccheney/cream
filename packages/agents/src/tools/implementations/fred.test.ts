/**
 * FRED Tool Implementation Tests
 *
 * Tests for getEconomicCalendar and getMacroIndicators functions.
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ExecutionContext } from "@cream/domain";
import { resetFREDClient, setFREDClientForTesting } from "../clients.js";
import { getEconomicCalendar, getMacroIndicators } from "./fred.js";

// ============================================
// Test Context Factory
// ============================================

function createTestContext(
	environment: "BACKTEST" | "PAPER" | "LIVE" = "BACKTEST"
): ExecutionContext {
	return {
		environment,
		source: "test",
		traceId: "test-trace-123",
	};
}

// ============================================
// Mock Data
// ============================================

const mockReleaseDates = {
	release_dates: [
		{ release_id: "9", date: "2025-02-12", release_name: "Consumer Price Index" },
		{ release_id: "50", date: "2025-02-07", release_name: "Employment Situation" },
		{ release_id: "11", date: "2025-02-10", release_name: "Producer Price Index" },
		{ release_id: "999", date: "2025-02-15", release_name: "Unknown Release" },
	],
};

const mockObservations = {
	observations: [
		{ date: "2025-01-15", value: "315.6" },
		{ date: "2024-12-15", value: "314.1" },
	],
};

// ============================================
// getEconomicCalendar Tests
// ============================================

describe("getEconomicCalendar", () => {
	afterEach(() => {
		resetFREDClient();
	});

	describe("BACKTEST mode", () => {
		test("returns empty array in backtest mode", async () => {
			const ctx = createTestContext("BACKTEST");
			const events = await getEconomicCalendar(ctx, "2025-01-01", "2025-01-31");
			expect(events).toEqual([]);
		});

		test("does not call FRED API in backtest mode", async () => {
			const mockGetReleaseDates = mock(() => Promise.resolve({ release_dates: [] }));
			setFREDClientForTesting({
				getReleaseDates: mockGetReleaseDates,
				getObservations: mock(() => Promise.resolve({ observations: [] })),
			} as any);

			const ctx = createTestContext("BACKTEST");
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
			const mockClient = {
				getReleaseDates: mock(() => Promise.resolve(mockReleaseDates)),
				getObservations: mock(() => Promise.resolve(mockObservations)),
			};
			setFREDClientForTesting(mockClient as any);
		});

		test("calls API with correct parameters", async () => {
			const mockGetReleaseDates = mock(() => Promise.resolve({ release_dates: [] }));
			setFREDClientForTesting({
				getReleaseDates: mockGetReleaseDates,
				getObservations: mock(() => Promise.resolve({ observations: [] })),
			} as any);

			const ctx = createTestContext("PAPER");
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
			const ctx = createTestContext("PAPER");
			const events = await getEconomicCalendar(ctx, "2025-02-01", "2025-02-28");

			// Should only include tracked releases (CPI=9, Employment=10, PPI=50)
			// Should NOT include release_id 999 (unknown)
			const releaseIds = events.map((e) => e.id);
			expect(releaseIds.some((id) => id.includes("fred-999"))).toBe(false);
		});

		test("transforms events correctly", async () => {
			const ctx = createTestContext("PAPER");
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
			const ctx = createTestContext("PAPER");
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
			const mockClient = {
				getReleaseDates: mock(() => Promise.reject(new Error("API rate limit exceeded"))),
				getObservations: mock(() => Promise.resolve({ observations: [] })),
			};
			setFREDClientForTesting(mockClient as any);

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

	describe("BACKTEST mode", () => {
		test("returns empty object in backtest mode", async () => {
			const ctx = createTestContext("BACKTEST");
			const indicators = await getMacroIndicators(ctx);
			expect(indicators).toEqual({});
		});

		test("does not call FRED API in backtest mode", async () => {
			const mockGetObservations = mock(() => Promise.resolve({ observations: [] }));
			setFREDClientForTesting({
				getReleaseDates: mock(() => Promise.resolve({ release_dates: [] })),
				getObservations: mockGetObservations,
			} as any);

			const ctx = createTestContext("BACKTEST");
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
				Promise.resolve({
					observations: [
						{ date: "2025-01-15", value: "3.5" },
						{ date: "2024-12-15", value: "3.4" },
					],
				})
			);
			setFREDClientForTesting({
				getReleaseDates: mock(() => Promise.resolve({ release_dates: [] })),
				getObservations: mockGetObservations,
			} as any);

			const ctx = createTestContext("PAPER");
			await getMacroIndicators(ctx);

			// Should be called for each default series
			expect(mockGetObservations.mock.calls.length).toBeGreaterThan(0);
		});

		test("respects custom series IDs", async () => {
			const mockGetObservations = mock(() =>
				Promise.resolve({
					observations: [
						{ date: "2025-01-15", value: "100.5" },
						{ date: "2024-12-15", value: "100.0" },
					],
				})
			);
			setFREDClientForTesting({
				getReleaseDates: mock(() => Promise.resolve({ release_dates: [] })),
				getObservations: mockGetObservations,
			} as any);

			const ctx = createTestContext("PAPER");
			const customSeries = ["CUSTOM1", "CUSTOM2"];
			await getMacroIndicators(ctx, customSeries);

			// Should be called exactly twice for custom series
			expect(mockGetObservations.mock.calls.length).toBe(2);
		});

		test("calculates percent change correctly", async () => {
			setFREDClientForTesting({
				getReleaseDates: mock(() => Promise.resolve({ release_dates: [] })),
				getObservations: mock(() =>
					Promise.resolve({
						observations: [
							{ date: "2025-01-15", value: "105.0" },
							{ date: "2024-12-15", value: "100.0" },
						],
					})
				),
			} as any);

			const ctx = createTestContext("PAPER");
			const result = await getMacroIndicators(ctx, ["TEST"]);

			expect(result.TEST).toBeDefined();
			expect(result.TEST!.value).toBe(105.0);
			expect(result.TEST!.change).toBeCloseTo(5.0, 1);
		});

		test("returns latest value and date", async () => {
			setFREDClientForTesting({
				getReleaseDates: mock(() => Promise.resolve({ release_dates: [] })),
				getObservations: mock(() =>
					Promise.resolve({
						observations: [
							{ date: "2025-01-15", value: "315.6" },
							{ date: "2024-12-15", value: "314.1" },
						],
					})
				),
			} as any);

			const ctx = createTestContext("PAPER");
			const result = await getMacroIndicators(ctx, ["CPIAUCSL"]);

			expect(result.CPIAUCSL).toBeDefined();
			expect(result.CPIAUCSL!.value).toBe(315.6);
			expect(result.CPIAUCSL!.date).toBe("2025-01-15");
		});
	});

	describe("missing values handling", () => {
		test("handles missing value (.) gracefully", async () => {
			setFREDClientForTesting({
				getReleaseDates: mock(() => Promise.resolve({ release_dates: [] })),
				getObservations: mock(() =>
					Promise.resolve({
						observations: [
							{ date: "2025-01-15", value: "." },
							{ date: "2024-12-15", value: "100.0" },
						],
					})
				),
			} as any);

			const ctx = createTestContext("PAPER");
			const result = await getMacroIndicators(ctx, ["TEST"]);

			// Should not include series with missing latest value
			expect(result.TEST).toBeUndefined();
		});

		test("handles empty observations", async () => {
			setFREDClientForTesting({
				getReleaseDates: mock(() => Promise.resolve({ release_dates: [] })),
				getObservations: mock(() =>
					Promise.resolve({
						observations: [],
					})
				),
			} as any);

			const ctx = createTestContext("PAPER");
			const result = await getMacroIndicators(ctx, ["EMPTY"]);

			expect(result.EMPTY).toBeUndefined();
		});

		test("handles null value", async () => {
			setFREDClientForTesting({
				getReleaseDates: mock(() => Promise.resolve({ release_dates: [] })),
				getObservations: mock(() =>
					Promise.resolve({
						observations: [{ date: "2025-01-15", value: null }],
					})
				),
			} as any);

			const ctx = createTestContext("PAPER");
			const result = await getMacroIndicators(ctx, ["NULL"]);

			expect(result.NULL).toBeUndefined();
		});
	});

	describe("API error handling", () => {
		test("handles API errors gracefully", async () => {
			setFREDClientForTesting({
				getReleaseDates: mock(() => Promise.resolve({ release_dates: [] })),
				getObservations: mock(() => Promise.reject(new Error("Network error"))),
			} as any);

			const ctx = createTestContext("PAPER");
			const result = await getMacroIndicators(ctx, ["ERROR"]);

			// Should return empty object when all fetches fail
			expect(result).toEqual({});
		});

		test("continues fetching other series when one fails", async () => {
			let callCount = 0;
			setFREDClientForTesting({
				getReleaseDates: mock(() => Promise.resolve({ release_dates: [] })),
				getObservations: mock(() => {
					callCount++;
					if (callCount === 1) {
						return Promise.reject(new Error("First fails"));
					}
					return Promise.resolve({
						observations: [
							{ date: "2025-01-15", value: "100.0" },
							{ date: "2024-12-15", value: "99.0" },
						],
					});
				}),
			} as any);

			const ctx = createTestContext("PAPER");
			const result = await getMacroIndicators(ctx, ["FAIL", "SUCCESS"]);

			// Should still have the successful series
			expect(result.SUCCESS).toBeDefined();
			expect(result.FAIL).toBeUndefined();
		});
	});
});
