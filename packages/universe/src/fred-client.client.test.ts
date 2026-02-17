/**
 * FRED client behavior tests.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	FREDClient,
	FREDClientError,
	type FREDObservationsResponse,
	type FREDReleaseDatesResponse,
	type FREDReleaseSeriesResponse,
	type FREDReleasesResponse,
} from "./fred-client.js";

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

let client: FREDClient;
let originalFetch: typeof globalThis.fetch;

function mockJsonResponse(body: unknown): void {
	globalThis.fetch = mock(() =>
		Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
	);
}

function captureUrl(body: unknown): () => string | null {
	let capturedUrl: string | null = null;
	globalThis.fetch = mock((url: string) => {
		capturedUrl = url;
		return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
	});
	return () => capturedUrl;
}

beforeEach(() => {
	client = new FREDClient({ apiKey: "test-api-key" });
	originalFetch = globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("FREDClient constructor", () => {
	it("creates client with custom config", () => {
		const customClient = new FREDClient({
			apiKey: "custom-key",
			timeout: 60000,
			retries: 5,
		});
		expect(customClient).toBeInstanceOf(FREDClient);
	});

	it("creates client with defaults", () => {
		expect(new FREDClient({ apiKey: "key" })).toBeInstanceOf(FREDClient);
	});
});

describe("getReleaseDates", () => {
	it("fetches release dates", async () => {
		mockJsonResponse(mockReleaseDatesResponse);
		const result = await client.getReleaseDates();
		expect(result.count).toBe(2);
		expect(result.release_dates).toHaveLength(2);
		expect(result.release_dates?.[0]?.release_name).toBe("CPI");
	});

	it("includes auth params in request", async () => {
		const getCapturedUrl = captureUrl(mockReleaseDatesResponse);
		await client.getReleaseDates();
		expect(getCapturedUrl()).toContain("api_key=test-api-key");
		expect(getCapturedUrl()).toContain("file_type=json");
	});

	it("passes query params", async () => {
		const getCapturedUrl = captureUrl(mockReleaseDatesResponse);
		await client.getReleaseDates({
			limit: 50,
			sort_order: "desc",
			include_release_dates_with_no_data: true,
		});
		expect(getCapturedUrl()).toContain("limit=50");
		expect(getCapturedUrl()).toContain("sort_order=desc");
		expect(getCapturedUrl()).toContain("include_release_dates_with_no_data=true");
	});
});

describe("getReleases", () => {
	it("fetches releases", async () => {
		mockJsonResponse(mockReleasesResponse);
		const result = await client.getReleases();
		expect(result.count).toBe(2);
		expect(result.releases).toHaveLength(2);
		expect(result.releases[0]?.name).toBe("Consumer Price Index");
	});
});

describe("getReleaseSeries", () => {
	it("fetches release series", async () => {
		mockJsonResponse(mockReleaseSeriesResponse);
		const result = await client.getReleaseSeries(10);
		expect(result.count).toBe(2);
		expect(result.seriess).toHaveLength(2);
		expect(result.seriess[0]?.id).toBe("CPIAUCSL");
	});

	it("includes release_id in request", async () => {
		const getCapturedUrl = captureUrl(mockReleaseSeriesResponse);
		await client.getReleaseSeries(10);
		expect(getCapturedUrl()).toContain("release_id=10");
	});
});

describe("getObservations", () => {
	it("fetches observations", async () => {
		mockJsonResponse(mockObservationsResponse);
		const result = await client.getObservations("CPIAUCSL");
		expect(result.count).toBe(3);
		expect(result.observations).toHaveLength(3);
		expect(result.observations[0]?.value).toBe("308.417");
	});

	it("includes series and date params", async () => {
		const getCapturedUrl = captureUrl(mockObservationsResponse);
		await client.getObservations("CPIAUCSL", {
			observation_start: "2025-01-01",
			observation_end: "2026-01-01",
		});
		expect(getCapturedUrl()).toContain("series_id=CPIAUCSL");
		expect(getCapturedUrl()).toContain("observation_start=2025-01-01");
		expect(getCapturedUrl()).toContain("observation_end=2026-01-01");
	});
});

describe("getReleaseSchedule", () => {
	it("fetches release schedule", async () => {
		mockJsonResponse(mockReleaseDatesResponse);
		const result = await client.getReleaseSchedule(10);
		expect(result.count).toBe(2);
		expect(result.release_dates).toHaveLength(2);
	});

	it("includes release schedule params", async () => {
		const getCapturedUrl = captureUrl(mockReleaseDatesResponse);
		await client.getReleaseSchedule(10, { include_release_dates_with_no_data: true });
		expect(getCapturedUrl()).toContain("release_id=10");
		expect(getCapturedUrl()).toContain("include_release_dates_with_no_data=true");
	});
});

describe("getLatestValue responses", () => {
	it("returns latest value", async () => {
		mockJsonResponse(mockObservationsResponse);
		const result = await client.getLatestValue("CPIAUCSL");
		expect(result?.date).toBe("2025-01-01");
		expect(result?.value).toBe(308.417);
	});

	it("returns null for empty observations", async () => {
		mockJsonResponse({ ...mockObservationsResponse, count: 0, observations: [] });
		expect(await client.getLatestValue("UNKNOWN")).toBeNull();
	});

	it("returns null for missing values", async () => {
		mockJsonResponse({
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
		});
		expect(await client.getLatestValue("CPIAUCSL")).toBeNull();
	});
});

describe("getLatestValue request params", () => {
	it("requests descending order with limit 1", async () => {
		const getCapturedUrl = captureUrl(mockObservationsResponse);
		await client.getLatestValue("CPIAUCSL");
		expect(getCapturedUrl()).toContain("sort_order=desc");
		expect(getCapturedUrl()).toContain("limit=1");
	});
});

describe("FREDClient error handling", () => {
	it("throws UNAUTHORIZED on 401", async () => {
		globalThis.fetch = mock(() => Promise.resolve(new Response("Unauthorized", { status: 401 })));
		await expect(client.getReleaseDates()).rejects.toThrow(FREDClientError);
		await expect(client.getReleaseDates()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("throws NOT_FOUND on 404", async () => {
		globalThis.fetch = mock(() => Promise.resolve(new Response("Not Found", { status: 404 })));
		await expect(client.getReleaseDates()).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("throws VALIDATION_ERROR on invalid payload", async () => {
		mockJsonResponse({ invalid: "data" });
		await expect(client.getReleaseDates()).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
	});

	it("throws API_ERROR on non-ok response", async () => {
		globalThis.fetch = mock(() => Promise.resolve(new Response("Server Error", { status: 500 })));
		const fastClient = new FREDClient({ apiKey: "test", retries: 0, retryDelay: 10 });
		await expect(fastClient.getReleaseDates()).rejects.toMatchObject({ code: "API_ERROR" });
	});
});

describe("FREDClientError", () => {
	it("sets class name", () => {
		expect(new FREDClientError("test", "RATE_LIMITED").name).toBe("FREDClientError");
	});

	it("stores code and cause", () => {
		const cause = new Error("original");
		const error = new FREDClientError("wrapped", "NETWORK_ERROR", cause);
		expect(error.code).toBe("NETWORK_ERROR");
		expect(error.cause).toBe(cause);
	});
});
