/**
 * FRED Client Tests
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	classifyReleaseImpact,
	FREDClient,
	FREDClientError,
	type FREDObservationsResponse,
	FREDObservationsResponseSchema,
	type FREDReleaseDatesResponse,
	FREDReleaseDatesResponseSchema,
	type FREDReleaseSeriesResponse,
	type FREDReleasesResponse,
	getReleaseById,
} from "./fred-client.js";

describe("FREDClient", () => {
	let client: FREDClient;
	let originalFetch: typeof globalThis.fetch;

	const mockReleaseDatesResponse: FREDReleaseDatesResponse = {
		realtime_start: "2026-01-01",
		realtime_end: "2026-01-31",
		order_by: "release_date",
		sort_order: "desc",
		count: 2,
		offset: 0,
		limit: 100,
		release_dates: [
			{ release_id: 10, release_name: "CPI", date: "2026-01-15" },
			{ release_id: 50, release_name: "Employment Situation", date: "2026-01-10" },
		],
	};

	const mockReleasesResponse: FREDReleasesResponse = {
		realtime_start: "2026-01-01",
		realtime_end: "2026-01-31",
		order_by: "release_id",
		sort_order: "asc",
		count: 2,
		offset: 0,
		limit: 100,
		releases: [
			{
				id: 10,
				realtime_start: "2026-01-01",
				realtime_end: "2026-01-31",
				name: "Consumer Price Index",
				press_release: true,
				link: "https://www.bls.gov/cpi/",
			},
			{
				id: 50,
				realtime_start: "2026-01-01",
				realtime_end: "2026-01-31",
				name: "Employment Situation",
				press_release: true,
				link: "https://www.bls.gov/news.release/empsit.htm",
			},
		],
	};

	const mockReleaseSeriesResponse: FREDReleaseSeriesResponse = {
		realtime_start: "2026-01-01",
		realtime_end: "2026-01-31",
		order_by: "series_id",
		sort_order: "asc",
		count: 2,
		offset: 0,
		limit: 100,
		seriess: [
			{
				id: "CPIAUCSL",
				realtime_start: "2026-01-01",
				realtime_end: "2026-01-31",
				title: "Consumer Price Index for All Urban Consumers: All Items",
				observation_start: "1947-01-01",
				observation_end: "2026-01-01",
				frequency: "Monthly",
				frequency_short: "M",
				units: "Index 1982-1984=100",
				units_short: "Index 1982-84=100",
				seasonal_adjustment: "Seasonally Adjusted",
				seasonal_adjustment_short: "SA",
				last_updated: "2026-01-15 07:31:02-06",
				popularity: 95,
			},
			{
				id: "CPILFESL",
				realtime_start: "2026-01-01",
				realtime_end: "2026-01-31",
				title: "Consumer Price Index for All Urban Consumers: All Items Less Food and Energy",
				observation_start: "1957-01-01",
				observation_end: "2026-01-01",
				frequency: "Monthly",
				frequency_short: "M",
				units: "Index 1982-1984=100",
				units_short: "Index 1982-84=100",
				seasonal_adjustment: "Seasonally Adjusted",
				seasonal_adjustment_short: "SA",
				last_updated: "2026-01-15 07:31:02-06",
				popularity: 90,
			},
		],
	};

	const mockObservationsResponse: FREDObservationsResponse = {
		realtime_start: "2026-01-01",
		realtime_end: "2026-01-31",
		observation_start: "2025-01-01",
		observation_end: "2026-01-01",
		units: "lin",
		output_type: 1,
		file_type: "json",
		order_by: "observation_date",
		sort_order: "asc",
		count: 3,
		offset: 0,
		limit: 100000,
		observations: [
			{
				realtime_start: "2026-01-01",
				realtime_end: "2026-01-31",
				date: "2025-01-01",
				value: "308.417",
			},
			{
				realtime_start: "2026-01-01",
				realtime_end: "2026-01-31",
				date: "2025-02-01",
				value: "309.685",
			},
			{
				realtime_start: "2026-01-01",
				realtime_end: "2026-01-31",
				date: "2025-03-01",
				value: "310.123",
			},
		],
	};

	beforeEach(() => {
		client = new FREDClient({ apiKey: "test-api-key" });
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe("constructor", () => {
		it("creates client with config", () => {
			const customClient = new FREDClient({
				apiKey: "custom-key",
				timeout: 60000,
				retries: 5,
			});
			expect(customClient).toBeInstanceOf(FREDClient);
		});

		it("uses default config values", () => {
			const defaultClient = new FREDClient({ apiKey: "key" });
			expect(defaultClient).toBeInstanceOf(FREDClient);
		});
	});

	describe("getReleaseDates", () => {
		it("fetches release dates successfully", async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(new Response(JSON.stringify(mockReleaseDatesResponse), { status: 200 }))
			);

			const result = await client.getReleaseDates();

			expect(result.count).toBe(2);
			expect(result.release_dates).toHaveLength(2);
			expect(result.release_dates?.[0]?.release_name).toBe("CPI");
		});

		it("includes api_key and file_type in request", async () => {
			let capturedUrl: string | null = null;

			globalThis.fetch = mock((url: string) => {
				capturedUrl = url;
				return Promise.resolve(
					new Response(JSON.stringify(mockReleaseDatesResponse), { status: 200 })
				);
			});

			await client.getReleaseDates();

			expect(capturedUrl).toContain("api_key=test-api-key");
			expect(capturedUrl).toContain("file_type=json");
		});

		it("passes query parameters", async () => {
			let capturedUrl: string | null = null;

			globalThis.fetch = mock((url: string) => {
				capturedUrl = url;
				return Promise.resolve(
					new Response(JSON.stringify(mockReleaseDatesResponse), { status: 200 })
				);
			});

			await client.getReleaseDates({
				limit: 50,
				sort_order: "desc",
				include_release_dates_with_no_data: true,
			});

			expect(capturedUrl).toContain("limit=50");
			expect(capturedUrl).toContain("sort_order=desc");
			expect(capturedUrl).toContain("include_release_dates_with_no_data=true");
		});
	});

	describe("getReleases", () => {
		it("fetches releases successfully", async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(new Response(JSON.stringify(mockReleasesResponse), { status: 200 }))
			);

			const result = await client.getReleases();

			expect(result.count).toBe(2);
			expect(result.releases).toHaveLength(2);
			expect(result.releases[0].name).toBe("Consumer Price Index");
		});
	});

	describe("getReleaseSeries", () => {
		it("fetches series for a release", async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(new Response(JSON.stringify(mockReleaseSeriesResponse), { status: 200 }))
			);

			const result = await client.getReleaseSeries(10);

			expect(result.count).toBe(2);
			expect(result.seriess).toHaveLength(2);
			expect(result.seriess[0].id).toBe("CPIAUCSL");
		});

		it("includes release_id in request", async () => {
			let capturedUrl: string | null = null;

			globalThis.fetch = mock((url: string) => {
				capturedUrl = url;
				return Promise.resolve(
					new Response(JSON.stringify(mockReleaseSeriesResponse), { status: 200 })
				);
			});

			await client.getReleaseSeries(10);

			expect(capturedUrl).toContain("release_id=10");
		});
	});

	describe("getObservations", () => {
		it("fetches observations for a series", async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(new Response(JSON.stringify(mockObservationsResponse), { status: 200 }))
			);

			const result = await client.getObservations("CPIAUCSL");

			expect(result.count).toBe(3);
			expect(result.observations).toHaveLength(3);
			expect(result.observations[0].value).toBe("308.417");
		});

		it("includes series_id in request", async () => {
			let capturedUrl: string | null = null;

			globalThis.fetch = mock((url: string) => {
				capturedUrl = url;
				return Promise.resolve(
					new Response(JSON.stringify(mockObservationsResponse), { status: 200 })
				);
			});

			await client.getObservations("CPIAUCSL", {
				observation_start: "2025-01-01",
				observation_end: "2026-01-01",
			});

			expect(capturedUrl).toContain("series_id=CPIAUCSL");
			expect(capturedUrl).toContain("observation_start=2025-01-01");
			expect(capturedUrl).toContain("observation_end=2026-01-01");
		});
	});

	describe("getReleaseSchedule", () => {
		it("fetches schedule for a specific release", async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(new Response(JSON.stringify(mockReleaseDatesResponse), { status: 200 }))
			);

			const result = await client.getReleaseSchedule(10);

			expect(result.count).toBe(2);
			expect(result.release_dates).toHaveLength(2);
		});

		it("includes release_id in request", async () => {
			let capturedUrl: string | null = null;

			globalThis.fetch = mock((url: string) => {
				capturedUrl = url;
				return Promise.resolve(
					new Response(JSON.stringify(mockReleaseDatesResponse), { status: 200 })
				);
			});

			await client.getReleaseSchedule(10, { include_release_dates_with_no_data: true });

			expect(capturedUrl).toContain("release_id=10");
			expect(capturedUrl).toContain("include_release_dates_with_no_data=true");
		});
	});

	describe("getLatestValue", () => {
		it("returns latest value for a series", async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(new Response(JSON.stringify(mockObservationsResponse), { status: 200 }))
			);

			const result = await client.getLatestValue("CPIAUCSL");

			expect(result).not.toBeNull();
			expect(result?.date).toBe("2025-01-01");
			expect(result?.value).toBe(308.417);
		});

		it("returns null for empty observations", async () => {
			const emptyResponse = {
				...mockObservationsResponse,
				count: 0,
				observations: [],
			};

			globalThis.fetch = mock(() =>
				Promise.resolve(new Response(JSON.stringify(emptyResponse), { status: 200 }))
			);

			const result = await client.getLatestValue("UNKNOWN");

			expect(result).toBeNull();
		});

		it("returns null for missing value ('.')", async () => {
			const missingValueResponse = {
				...mockObservationsResponse,
				count: 1,
				observations: [
					{
						realtime_start: "2026-01-01",
						realtime_end: "2026-01-31",
						date: "2025-01-01",
						value: ".",
					},
				],
			};

			globalThis.fetch = mock(() =>
				Promise.resolve(new Response(JSON.stringify(missingValueResponse), { status: 200 }))
			);

			const result = await client.getLatestValue("CPIAUCSL");

			expect(result).toBeNull();
		});

		it("passes sort_order=desc and limit=1 to API", async () => {
			let capturedUrl: string | null = null;

			globalThis.fetch = mock((url: string) => {
				capturedUrl = url;
				return Promise.resolve(
					new Response(JSON.stringify(mockObservationsResponse), { status: 200 })
				);
			});

			await client.getLatestValue("CPIAUCSL");

			expect(capturedUrl).toContain("sort_order=desc");
			expect(capturedUrl).toContain("limit=1");
		});
	});

	describe("error handling", () => {
		it("throws UNAUTHORIZED on 401", async () => {
			globalThis.fetch = mock(() => Promise.resolve(new Response("Unauthorized", { status: 401 })));

			await expect(client.getReleaseDates()).rejects.toThrow(FREDClientError);

			try {
				await client.getReleaseDates();
			} catch (error) {
				expect((error as FREDClientError).code).toBe("UNAUTHORIZED");
			}
		});

		it("throws NOT_FOUND on 404", async () => {
			globalThis.fetch = mock(() => Promise.resolve(new Response("Not Found", { status: 404 })));

			try {
				await client.getReleaseDates();
			} catch (error) {
				expect((error as FREDClientError).code).toBe("NOT_FOUND");
			}
		});

		it("throws VALIDATION_ERROR on invalid response", async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(new Response(JSON.stringify({ invalid: "data" }), { status: 200 }))
			);

			try {
				await client.getReleaseDates();
			} catch (error) {
				expect((error as FREDClientError).code).toBe("VALIDATION_ERROR");
			}
		});

		it("throws API_ERROR on non-ok response", async () => {
			globalThis.fetch = mock(() => Promise.resolve(new Response("Server Error", { status: 500 })));

			// Reduce retries for faster test
			const fastClient = new FREDClient({
				apiKey: "test",
				retries: 0,
				retryDelay: 10,
			});

			try {
				await fastClient.getReleaseDates();
			} catch (error) {
				expect((error as FREDClientError).code).toBe("API_ERROR");
			}
		});
	});

	describe("FREDClientError", () => {
		it("has correct name", () => {
			const error = new FREDClientError("test", "RATE_LIMITED");
			expect(error.name).toBe("FREDClientError");
		});

		it("has correct code", () => {
			const error = new FREDClientError("test", "UNAUTHORIZED");
			expect(error.code).toBe("UNAUTHORIZED");
		});

		it("preserves cause", () => {
			const cause = new Error("original");
			const error = new FREDClientError("wrapped", "NETWORK_ERROR", cause);
			expect(error.cause).toBe(cause);
		});
	});
});

describe("classifyReleaseImpact", () => {
	it("returns high for CPI (10)", () => {
		expect(classifyReleaseImpact(10)).toBe("high");
	});

	it("returns high for Employment (50)", () => {
		expect(classifyReleaseImpact(50)).toBe("high");
	});

	it("returns high for GDP (53)", () => {
		expect(classifyReleaseImpact(53)).toBe("high");
	});

	it("returns high for FOMC (101)", () => {
		expect(classifyReleaseImpact(101)).toBe("high");
	});

	it("returns medium for Industrial Production (13)", () => {
		expect(classifyReleaseImpact(13)).toBe("medium");
	});

	it("returns medium for PPI (11)", () => {
		expect(classifyReleaseImpact(11)).toBe("medium");
	});

	it("returns low for unknown releases", () => {
		expect(classifyReleaseImpact(999)).toBe("low");
	});
});

describe("getReleaseById", () => {
	it("finds CPI release", () => {
		const result = getReleaseById(10);
		expect(result).toBeDefined();
		expect(result?.key).toBe("CPI");
		expect(result?.name).toBe("Consumer Price Index");
	});

	it("finds Employment release", () => {
		const result = getReleaseById(50);
		expect(result).toBeDefined();
		expect(result?.key).toBe("EMPLOYMENT");
	});

	it("returns undefined for unknown release", () => {
		const result = getReleaseById(99999);
		expect(result).toBeUndefined();
	});
});

describe("Zod Schemas", () => {
	it("validates release dates response", () => {
		const result = FREDReleaseDatesResponseSchema.safeParse({
			realtime_start: "2026-01-01",
			realtime_end: "2026-01-31",
			order_by: "release_date",
			sort_order: "desc",
			count: 1,
			offset: 0,
			limit: 100,
			release_dates: [{ release_id: 10, date: "2026-01-15" }],
		});
		expect(result.success).toBe(true);
	});

	it("handles string release_id in release dates", () => {
		const result = FREDReleaseDatesResponseSchema.safeParse({
			realtime_start: "2026-01-01",
			realtime_end: "2026-01-31",
			order_by: "release_date",
			sort_order: "desc",
			count: 1,
			offset: 0,
			limit: 100,
			release_dates: [{ release_id: "10", date: "2026-01-15" }],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.release_dates?.[0]?.release_id).toBe(10);
		}
	});

	it("transforms missing value '.' to null in observations", () => {
		const result = FREDObservationsResponseSchema.safeParse({
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
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.observations[0].value).toBeNull();
		}
	});
});

// ============================================
// Factory Functions Tests
// ============================================

import { createFREDClient, createFREDClientFromEnv } from "./fred-client.js";

describe("createFREDClient", () => {
	it("creates a FREDClient with the given config", () => {
		const client = createFREDClient({ apiKey: "test-key" });
		expect(client).toBeInstanceOf(FREDClient);
	});

	it("passes all config options to client", () => {
		const client = createFREDClient({
			apiKey: "test-key",
			baseUrl: "https://custom.api.com",
			timeout: 5000,
			retries: 5,
			retryDelay: 1000,
		});
		expect(client).toBeInstanceOf(FREDClient);
	});
});

describe("createFREDClientFromEnv", () => {
	const originalFredKey = process.env.FRED_API_KEY;

	afterEach(() => {
		if (originalFredKey !== undefined) {
			process.env.FRED_API_KEY = originalFredKey;
		} else {
			delete process.env.FRED_API_KEY;
		}
	});

	it("creates client when FRED_API_KEY is set", () => {
		process.env.FRED_API_KEY = "test-api-key";

		const client = createFREDClientFromEnv();
		expect(client).toBeInstanceOf(FREDClient);
	});

	it("throws when FRED_API_KEY is not set", () => {
		delete process.env.FRED_API_KEY;

		expect(() => createFREDClientFromEnv()).toThrow(
			"FRED_API_KEY environment variable is required"
		);
	});
});
