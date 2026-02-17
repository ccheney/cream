/**
 * Calendar Service Tests
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { AlpacaCalendarClient } from "./alpaca-client";
import { InMemoryCalendarCache } from "./cache";
import { AlpacaCalendarService, CalendarServiceError } from "./service";
import type { CalendarDay, MarketClock } from "./types";

const mockCalendarDays: CalendarDay[] = [
	{ date: "2026-01-05", open: "09:30", close: "16:00" },
	{ date: "2026-01-06", open: "09:30", close: "16:00" },
	{ date: "2026-01-07", open: "09:30", close: "16:00" },
	{ date: "2026-01-08", open: "09:30", close: "16:00" },
	{ date: "2026-01-09", open: "09:30", close: "16:00" },
	{ date: "2026-01-12", open: "09:30", close: "16:00" },
];

const earlyCloseDay: CalendarDay = { date: "2026-11-27", open: "09:30", close: "13:00" };
const mockClock: MarketClock = {
	isOpen: true,
	timestamp: new Date("2026-01-12T15:30:00.000Z"),
	nextOpen: new Date("2026-01-13T14:30:00.000Z"),
	nextClose: new Date("2026-01-12T21:00:00.000Z"),
};

let mockClient: AlpacaCalendarClient;
let cache: InMemoryCalendarCache;
let service: AlpacaCalendarService;

beforeEach(() => {
	cache = new InMemoryCalendarCache();
	mockClient = {
		getCalendar: async () => mockCalendarDays,
		getClock: async () => mockClock,
	} as AlpacaCalendarClient;

	service = new AlpacaCalendarService(
		{ apiKey: "test", apiSecret: "test", environment: "PAPER" },
		mockClient,
		cache,
	);
});

afterEach(() => {
	cache.clear();
});

describe("AlpacaCalendarService initialize", () => {
	it("preloads current and next year by default", async () => {
		const getCalendarSpy = spyOn(mockClient, "getCalendar");
		await service.initialize();
		const currentYear = new Date().getUTCFullYear();
		expect(getCalendarSpy).toHaveBeenCalledTimes(2);
		expect(cache.isYearLoaded(currentYear)).toBe(true);
		expect(cache.isYearLoaded(currentYear + 1)).toBe(true);
	});

	it("preloads custom years", async () => {
		const getCalendarSpy = spyOn(mockClient, "getCalendar");
		await service.initialize([2026, 2027, 2028]);
		expect(getCalendarSpy).toHaveBeenCalledTimes(3);
	});
});

describe("AlpacaCalendarService trading day and close time", () => {
	beforeEach(() => {
		cache.setYear(2026, [...mockCalendarDays, earlyCloseDay]);
	});

	it("isTradingDay returns true for trading days", async () => {
		expect(await service.isTradingDay("2026-01-05")).toBe(true);
	});

	it("isTradingDay returns false for non-trading days", async () => {
		expect(await service.isTradingDay("2026-01-10")).toBe(false);
	});

	it("getMarketCloseTime returns regular and early closes", async () => {
		expect(await service.getMarketCloseTime("2026-01-05")).toBe("16:00");
		expect(await service.getMarketCloseTime("2026-11-27")).toBe("13:00");
	});

	it("getMarketCloseTime returns null for non-trading day", async () => {
		expect(await service.getMarketCloseTime("2026-01-10")).toBe(null);
	});
});

describe("AlpacaCalendarService trading session and RTH", () => {
	beforeEach(() => {
		cache.setYear(2026, [...mockCalendarDays, earlyCloseDay]);
	});

	it("returns CLOSED for non-trading days", async () => {
		expect(await service.getTradingSession(new Date("2026-01-10T16:00:00Z"))).toBe("CLOSED");
	});

	it("returns PRE_MARKET before open", async () => {
		expect(await service.getTradingSession(new Date("2026-01-05T13:00:00Z"))).toBe("PRE_MARKET");
	});

	it("returns RTH during market hours", async () => {
		expect(await service.getTradingSession(new Date("2026-01-05T16:00:00Z"))).toBe("RTH");
	});

	it("returns AFTER_HOURS after close", async () => {
		expect(await service.getTradingSession(new Date("2026-01-05T22:00:00Z"))).toBe("AFTER_HOURS");
	});

	it("returns CLOSED after early close", async () => {
		expect(await service.getTradingSession(new Date("2026-11-27T19:00:00Z"))).toBe("CLOSED");
	});

	it("isRTH is true only during RTH", async () => {
		expect(await service.isRTH(new Date("2026-01-05T16:00:00Z"))).toBe(true);
		expect(await service.isRTH(new Date("2026-01-05T13:00:00Z"))).toBe(false);
	});
});

describe("AlpacaCalendarService market clock", () => {
	it("isMarketOpen returns clock isOpen", async () => {
		expect(await service.isMarketOpen()).toBe(true);
		mockClient.getClock = async () => ({ ...mockClock, isOpen: false });
		cache.clear();
		expect(await service.isMarketOpen()).toBe(false);
	});

	it("getClock caches response", async () => {
		const getClockSpy = spyOn(mockClient, "getClock");
		const clock = await service.getClock();
		expect(clock.timestamp).toEqual(mockClock.timestamp);
		await service.getClock();
		expect(getClockSpy).toHaveBeenCalledTimes(1);
	});
});

describe("AlpacaCalendarService trading day navigation", () => {
	it("getNextTradingDay returns next trading day and skips weekend", async () => {
		cache.setYear(2026, mockCalendarDays);
		cache.setYear(2027, [{ date: "2027-01-04", open: "09:30", close: "16:00" }]);
		expect((await service.getNextTradingDay("2026-01-05")).toISOString().slice(0, 10)).toBe(
			"2026-01-06",
		);
		expect((await service.getNextTradingDay("2026-01-09")).toISOString().slice(0, 10)).toBe(
			"2026-01-12",
		);
	});

	it("getPreviousTradingDay returns previous trading day and skips weekend", async () => {
		cache.setYear(2025, [{ date: "2025-12-31", open: "09:30", close: "16:00" }]);
		cache.setYear(2026, mockCalendarDays);
		expect((await service.getPreviousTradingDay("2026-01-06")).toISOString().slice(0, 10)).toBe(
			"2026-01-05",
		);
		expect((await service.getPreviousTradingDay("2026-01-12")).toISOString().slice(0, 10)).toBe(
			"2026-01-09",
		);
	});
});

describe("AlpacaCalendarService range and sync methods", () => {
	it("getCalendarRange returns days in inclusive range", async () => {
		cache.setYear(2026, mockCalendarDays);
		const days = await service.getCalendarRange("2026-01-05", "2026-01-07");
		expect(days.length).toBe(3);
		expect(days[0]?.date).toBe("2026-01-05");
		expect(days[2]?.date).toBe("2026-01-07");
	});

	it("getCalendarRange excludes days outside range", async () => {
		cache.setYear(2026, mockCalendarDays);
		const days = await service.getCalendarRange("2026-01-06", "2026-01-06");
		expect(days.length).toBe(1);
		expect(days[0]?.date).toBe("2026-01-06");
	});

	it("sync methods work when cache is populated", () => {
		cache.setYear(2026, [...mockCalendarDays, earlyCloseDay]);
		expect(service.isTradingDaySync("2026-01-05")).toBe(true);
		expect(service.getTradingSessionSync(new Date("2026-01-05T16:00:00Z"))).toBe("RTH");
		expect(service.getMarketCloseTimeSync("2026-11-27")).toBe("13:00");
	});

	it("sync methods throw when cache is empty", () => {
		expect(() => service.isTradingDaySync("2026-01-05")).toThrow(CalendarServiceError);
		expect(() => service.getTradingSessionSync(new Date("2026-01-05T16:00:00Z"))).toThrow(
			CalendarServiceError,
		);
		expect(() => service.getMarketCloseTimeSync("2026-01-05")).toThrow(CalendarServiceError);
		expect(() => service.isTradingDaySync("2026-01-05")).toThrow("initialize");
	});

	it("sync errors include NOT_INITIALIZED code", () => {
		try {
			service.isTradingDaySync("2026-01-05");
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(CalendarServiceError);
			expect((error as CalendarServiceError).code).toBe("NOT_INITIALIZED");
		}
	});
});
