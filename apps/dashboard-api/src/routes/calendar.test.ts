/**
 * Calendar Routes Tests
 *
 * Tests for the /api/calendar endpoints that provide market calendar data.
 */

// IMPORTANT: Mock must be set up before any imports that use @cream/domain
import { afterAll, mock } from "bun:test";

// Define mock calendar service helper for generating date ranges
function generateMockCalendarRange(start: string, end: string) {
	const days: Array<{
		date: string;
		open: string;
		close: string;
		sessionOpen: string;
		sessionClose: string;
	}> = [];
	const startDate = new Date(start);
	const endDate = new Date(end);

	for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
		const dayOfWeek = d.getDay();
		// Skip weekends
		if (dayOfWeek === 0 || dayOfWeek === 6) {
			continue;
		}
		days.push({
			date: d.toISOString().split("T")[0] ?? "",
			open: "09:30",
			close: "16:00",
			sessionOpen: "04:00",
			sessionClose: "20:00",
		});
	}
	return days;
}

// Define mock calendar service
const mockCalendarServiceForModule = {
	isMarketOpen: async () => true,
	isTradingDay: async () => true,
	getMarketCloseTime: async () => "16:00",
	getTradingSession: async () => "RTH" as const,
	isRTH: async () => true,
	getNextTradingDay: async () => new Date("2025-01-13"),
	getPreviousTradingDay: async () => new Date("2025-01-10"),
	getClock: async () => ({
		isOpen: true,
		nextOpen: new Date("2025-01-13T14:30:00Z"),
		nextClose: new Date("2025-01-12T21:00:00Z"),
		timestamp: new Date("2025-01-12T16:00:00Z"),
	}),
	getCalendarRange: async (start: string, end: string) => generateMockCalendarRange(start, end),
	isTradingDaySync: () => true,
	getTradingSessionSync: () => "RTH" as const,
	getMarketCloseTimeSync: () => "16:00",
};

// Mock @cream/domain BEFORE importing calendarRoutes
mock.module("@cream/domain", () => ({
	getCalendarService: () => mockCalendarServiceForModule,
	initCalendarService: async () => {},
	TradingSessionSchema: {
		parse: (v: string) => v,
		safeParse: (v: string) => ({ success: true, data: v }),
	},
}));

// Now import dependencies that use @cream/domain
import { beforeAll, describe, expect, test } from "bun:test";
import type { TradingSession } from "@cream/domain";
import calendarRoutes from "./calendar";

// Response types for type-safe assertions
interface CalendarDayResponse {
	date: string;
	open: string;
	close: string;
	sessionOpen?: string;
	sessionClose?: string;
}

interface ClockResponse {
	isOpen: boolean;
	nextOpen: string;
	nextClose: string;
	timestamp: string;
}

interface StatusResponse {
	isOpen: boolean;
	session: TradingSession;
	nextOpen: string;
	nextClose: string;
	message: string;
}

beforeAll(() => {
	process.env.CREAM_ENV = "BACKTEST";
});

afterAll(() => {
	// Restore mocked modules to clean up for other tests
	mock.restore();
});

describe("Calendar Routes", () => {
	describe("GET /", () => {
		test("returns calendar days for valid date range", async () => {
			const res = await calendarRoutes.request("/?start=2025-01-06&end=2025-01-10");
			expect(res.status).toBe(200);

			const data = (await res.json()) as CalendarDayResponse[];
			expect(Array.isArray(data)).toBe(true);
			expect(data.length).toBeGreaterThan(0);

			// Verify structure of first day
			const firstDay = data[0];
			expect(firstDay).toHaveProperty("date");
			expect(firstDay).toHaveProperty("open");
			expect(firstDay).toHaveProperty("close");
		});

		test("returns 400 for invalid start date format", async () => {
			const res = await calendarRoutes.request("/?start=2025/01/06&end=2025-01-10");
			expect(res.status).toBe(400);
		});

		test("returns 400 for invalid end date format", async () => {
			const res = await calendarRoutes.request("/?start=2025-01-06&end=invalid");
			expect(res.status).toBe(400);
		});

		test("returns 400 when start is missing", async () => {
			const res = await calendarRoutes.request("/?end=2025-01-10");
			expect(res.status).toBe(400);
		});

		test("returns 400 when end is missing", async () => {
			const res = await calendarRoutes.request("/?start=2025-01-06");
			expect(res.status).toBe(400);
		});

		test("includes optional session times when available", async () => {
			const res = await calendarRoutes.request("/?start=2025-01-06&end=2025-01-10");
			expect(res.status).toBe(200);

			const data = (await res.json()) as CalendarDayResponse[];
			const firstDay = data[0];
			expect(firstDay).toHaveProperty("sessionOpen");
			expect(firstDay).toHaveProperty("sessionClose");
		});
	});

	describe("GET /clock", () => {
		test("returns current market clock status", async () => {
			const res = await calendarRoutes.request("/clock");
			expect(res.status).toBe(200);

			const data = (await res.json()) as ClockResponse;
			expect(data).toHaveProperty("isOpen");
			expect(data).toHaveProperty("nextOpen");
			expect(data).toHaveProperty("nextClose");
			expect(data).toHaveProperty("timestamp");
		});

		test("returns boolean isOpen field", async () => {
			const res = await calendarRoutes.request("/clock");
			expect(res.status).toBe(200);

			const data = (await res.json()) as ClockResponse;
			expect(typeof data.isOpen).toBe("boolean");
		});

		test("returns ISO date strings for times", async () => {
			const res = await calendarRoutes.request("/clock");
			expect(res.status).toBe(200);

			const data = (await res.json()) as ClockResponse;
			// Verify ISO format
			expect(data.nextOpen).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
			expect(data.nextClose).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
			expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});
	});

	describe("GET /status", () => {
		test("returns market status with message", async () => {
			const res = await calendarRoutes.request("/status");
			expect(res.status).toBe(200);

			const data = (await res.json()) as StatusResponse;
			expect(data).toHaveProperty("isOpen");
			expect(data).toHaveProperty("session");
			expect(data).toHaveProperty("nextOpen");
			expect(data).toHaveProperty("nextClose");
			expect(data).toHaveProperty("message");
		});

		test("message is a non-empty string", async () => {
			const res = await calendarRoutes.request("/status");
			expect(res.status).toBe(200);

			const data = (await res.json()) as StatusResponse;
			expect(typeof data.message).toBe("string");
			expect(data.message.length).toBeGreaterThan(0);
		});

		test("session is a valid trading session", async () => {
			const res = await calendarRoutes.request("/status");
			expect(res.status).toBe(200);

			const data = (await res.json()) as StatusResponse;
			const validSessions = ["PRE_MARKET", "RTH", "AFTER_HOURS", "CLOSED"];
			expect(validSessions).toContain(data.session);
		});
	});
});
