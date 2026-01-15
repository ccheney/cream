/**
 * Economic Calendar Routes Tests
 *
 * Tests for the /api/economic-calendar endpoints that provide economic event data.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { TransformedEvent } from "../services/economic-calendar.js";
import economicCalendarRoutes from "./economic-calendar";

// Response types for type-safe assertions
interface EventsResponse {
	events: TransformedEvent[];
	meta: {
		start: string;
		end: string;
		count: number;
		lastUpdated: string;
	};
}

interface EventDetailResponse {
	event: TransformedEvent;
}

interface ErrorResponse {
	error: string;
	message: string;
}

// ============================================
// Mock Data
// ============================================

const mockEvents: TransformedEvent[] = [
	{
		id: "2025-01-15-cpi",
		name: "CPI MoM",
		date: "2025-01-15",
		time: "08:30:00",
		country: "US",
		impact: "high",
		actual: "0.3%",
		previous: "0.2%",
		forecast: "0.3%",
		unit: "%",
	},
	{
		id: "2025-01-16-retail-sales",
		name: "Retail Sales MoM",
		date: "2025-01-16",
		time: "08:30:00",
		country: "US",
		impact: "medium",
		actual: null,
		previous: "0.5%",
		forecast: "0.4%",
		unit: "%",
	},
	{
		id: "2025-01-17-industrial-production",
		name: "Industrial Production MoM",
		date: "2025-01-17",
		time: "09:15:00",
		country: "US",
		impact: "low",
		actual: null,
		previous: "0.1%",
		forecast: "0.2%",
		unit: "%",
	},
];

// ============================================
// Mock Service
// ============================================

let mockGetEvents = async () => ({
	events: mockEvents,
	meta: {
		start: "2025-01-15",
		end: "2025-01-17",
		count: mockEvents.length,
		lastUpdated: new Date().toISOString(),
	},
});

let mockGetEvent = async (id: string) => mockEvents.find((e) => e.id === id) ?? null;

const createMockService = () => ({
	getEvents: mockGetEvents,
	getEvent: mockGetEvent,
	clearCache: () => {},
	getCacheStats: () => ({ size: 0, maxSize: 100, ttlMs: 86400000 }),
});

beforeAll(() => {
	Bun.env.CREAM_ENV = "BACKTEST";
});

// Mock the economic calendar service
mock.module("../services/economic-calendar.js", () => ({
	getEconomicCalendarService: createMockService,
}));

describe("Economic Calendar Routes", () => {
	beforeEach(() => {
		// Reset mocks to defaults before each test
		mockGetEvents = async () => ({
			events: mockEvents,
			meta: {
				start: "2025-01-15",
				end: "2025-01-17",
				count: mockEvents.length,
				lastUpdated: new Date().toISOString(),
			},
		});
		mockGetEvent = async (id: string) => mockEvents.find((e) => e.id === id) ?? null;
	});

	describe("GET /", () => {
		test("returns events for valid date range", async () => {
			const res = await economicCalendarRoutes.request("/?start=2025-01-15&end=2025-01-17");
			expect(res.status).toBe(200);

			const data = (await res.json()) as EventsResponse;
			expect(data.events).toBeArray();
			expect(data.events.length).toBe(3);
			expect(data.meta.count).toBe(3);
		});

		test("returns correct event structure", async () => {
			const res = await economicCalendarRoutes.request("/?start=2025-01-15&end=2025-01-17");
			expect(res.status).toBe(200);

			const data = (await res.json()) as EventsResponse;
			const event = data.events[0];
			expect(event).toHaveProperty("id");
			expect(event).toHaveProperty("name");
			expect(event).toHaveProperty("date");
			expect(event).toHaveProperty("time");
			expect(event).toHaveProperty("country");
			expect(event).toHaveProperty("impact");
			expect(event).toHaveProperty("actual");
			expect(event).toHaveProperty("previous");
			expect(event).toHaveProperty("forecast");
		});

		test("returns 400 for missing start param", async () => {
			const res = await economicCalendarRoutes.request("/?end=2025-01-17");
			expect(res.status).toBe(400);
		});

		test("returns 400 for missing end param", async () => {
			const res = await economicCalendarRoutes.request("/?start=2025-01-15");
			expect(res.status).toBe(400);
		});

		test("returns 400 for invalid start date format", async () => {
			const res = await economicCalendarRoutes.request("/?start=2025/01/15&end=2025-01-17");
			expect(res.status).toBe(400);
		});

		test("returns 400 for invalid end date format", async () => {
			const res = await economicCalendarRoutes.request("/?start=2025-01-15&end=invalid");
			expect(res.status).toBe(400);
		});

		test("returns 400 for date range exceeding 90 days", async () => {
			const res = await economicCalendarRoutes.request("/?start=2025-01-01&end=2025-06-01");
			expect(res.status).toBe(400);

			const data = (await res.json()) as ErrorResponse;
			expect(data.error).toBe("INVALID_RANGE");
			expect(data.message).toContain("90 days");
		});

		test("returns 400 when end date is before start date", async () => {
			const res = await economicCalendarRoutes.request("/?start=2025-01-17&end=2025-01-15");
			expect(res.status).toBe(400);

			const data = (await res.json()) as ErrorResponse;
			expect(data.error).toBe("INVALID_RANGE");
			expect(data.message).toContain("after start");
		});

		test("filters by country when provided", async () => {
			// The mock doesn't actually filter, but we verify the param is accepted
			const res = await economicCalendarRoutes.request(
				"/?start=2025-01-15&end=2025-01-17&country=US"
			);
			expect(res.status).toBe(200);
		});

		test("filters by impact level when provided", async () => {
			// Update mock to return filtered events
			mockGetEvents = async () => ({
				events: mockEvents.filter((e) => e.impact === "high"),
				meta: {
					start: "2025-01-15",
					end: "2025-01-17",
					count: 1,
					lastUpdated: new Date().toISOString(),
				},
			});

			const res = await economicCalendarRoutes.request(
				"/?start=2025-01-15&end=2025-01-17&impact=high"
			);
			expect(res.status).toBe(200);

			const data = (await res.json()) as EventsResponse;
			expect(data.meta.count).toBe(1);
		});

		test("accepts multiple impact levels", async () => {
			mockGetEvents = async () => ({
				events: mockEvents.filter((e) => e.impact === "high" || e.impact === "medium"),
				meta: {
					start: "2025-01-15",
					end: "2025-01-17",
					count: 2,
					lastUpdated: new Date().toISOString(),
				},
			});

			const res = await economicCalendarRoutes.request(
				"/?start=2025-01-15&end=2025-01-17&impact=high,medium"
			);
			expect(res.status).toBe(200);

			const data = (await res.json()) as EventsResponse;
			expect(data.meta.count).toBe(2);
		});

		test("returns 503 when service throws error", async () => {
			mockGetEvents = async () => {
				throw new Error("API unavailable");
			};

			const res = await economicCalendarRoutes.request("/?start=2025-01-15&end=2025-01-17");
			expect(res.status).toBe(503);

			const data = (await res.json()) as ErrorResponse;
			expect(data.error).toBe("SERVICE_UNAVAILABLE");
		});

		test("includes meta information in response", async () => {
			const res = await economicCalendarRoutes.request("/?start=2025-01-15&end=2025-01-17");
			expect(res.status).toBe(200);

			const data = (await res.json()) as EventsResponse;
			expect(data.meta).toHaveProperty("start");
			expect(data.meta).toHaveProperty("end");
			expect(data.meta).toHaveProperty("count");
			expect(data.meta).toHaveProperty("lastUpdated");
		});
	});

	describe("GET /:id", () => {
		test("returns event for valid id", async () => {
			const res = await economicCalendarRoutes.request("/2025-01-15-cpi");
			expect(res.status).toBe(200);

			const data = (await res.json()) as EventDetailResponse;
			expect(data.event).toBeDefined();
			expect(data.event.id).toBe("2025-01-15-cpi");
			expect(data.event.name).toBe("CPI MoM");
		});

		test("returns 404 for unknown event id", async () => {
			mockGetEvent = async () => null;

			const res = await economicCalendarRoutes.request("/unknown-event-id");
			expect(res.status).toBe(404);

			const data = (await res.json()) as ErrorResponse;
			expect(data.error).toBe("NOT_FOUND");
		});

		test("returns 503 when service throws error", async () => {
			mockGetEvent = async () => {
				throw new Error("Service error");
			};

			const res = await economicCalendarRoutes.request("/2025-01-15-cpi");
			expect(res.status).toBe(503);

			const data = (await res.json()) as ErrorResponse;
			expect(data.error).toBe("SERVICE_UNAVAILABLE");
		});

		test("returns complete event details", async () => {
			const res = await economicCalendarRoutes.request("/2025-01-15-cpi");
			expect(res.status).toBe(200);

			const data = (await res.json()) as EventDetailResponse;
			expect(data.event.impact).toBe("high");
			expect(data.event.actual).toBe("0.3%");
			expect(data.event.previous).toBe("0.2%");
			expect(data.event.forecast).toBe("0.3%");
		});
	});
});
