/**
 * Calendar Service Tests
 *
 * Tests for HardcodedCalendarService (BACKTEST) and AlpacaCalendarService (PAPER/LIVE).
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { AlpacaCalendarClient } from "./alpaca-client";
import { InMemoryCalendarCache } from "./cache";
import {
	AlpacaCalendarService,
	CalendarServiceError,
	createHardcodedCalendarService,
	HardcodedCalendarService,
} from "./service";
import type { CalendarDay, MarketClock } from "./types";

describe("HardcodedCalendarService", () => {
	const service = new HardcodedCalendarService();

	describe("isTradingDay", () => {
		it("returns true for a regular weekday", async () => {
			expect(await service.isTradingDay("2026-01-12")).toBe(true);
		});

		it("returns false for Saturday", async () => {
			expect(await service.isTradingDay("2026-01-10")).toBe(false);
		});

		it("returns false for Sunday", async () => {
			expect(await service.isTradingDay("2026-01-11")).toBe(false);
		});

		it("returns false for a holiday", async () => {
			// New Year's Day 2026
			expect(await service.isTradingDay("2026-01-01")).toBe(false);
		});

		it("returns true for an early close day", async () => {
			// Day after Thanksgiving 2026
			expect(await service.isTradingDay("2026-11-27")).toBe(true);
		});

		it("handles Date objects", async () => {
			const date = new Date("2026-01-12T12:00:00Z");
			expect(await service.isTradingDay(date)).toBe(true);
		});
	});

	describe("isTradingDaySync", () => {
		it("works synchronously", () => {
			expect(service.isTradingDaySync("2026-01-12")).toBe(true);
			expect(service.isTradingDaySync("2026-01-01")).toBe(false);
		});
	});

	describe("getMarketCloseTime", () => {
		it("returns 16:00 for regular trading days", async () => {
			expect(await service.getMarketCloseTime("2026-01-12")).toBe("16:00");
		});

		it("returns 13:00 for early close days", async () => {
			// Day after Thanksgiving 2026
			expect(await service.getMarketCloseTime("2026-11-27")).toBe("13:00");
		});

		it("returns null for holidays", async () => {
			expect(await service.getMarketCloseTime("2026-01-01")).toBe(null);
		});

		it("returns null for weekends", async () => {
			expect(await service.getMarketCloseTime("2026-01-10")).toBe(null);
		});
	});

	describe("getTradingSession", () => {
		it("returns CLOSED for weekends", async () => {
			const saturday = new Date("2026-01-10T15:00:00Z");
			expect(await service.getTradingSession(saturday)).toBe("CLOSED");
		});

		it("returns CLOSED for holidays", async () => {
			const newYears = new Date("2026-01-01T15:00:00Z");
			expect(await service.getTradingSession(newYears)).toBe("CLOSED");
		});

		it("returns PRE_MARKET before 9:30 ET", async () => {
			// 8:00 AM ET = 13:00 UTC
			const preMarket = new Date("2026-01-12T13:00:00Z");
			expect(await service.getTradingSession(preMarket)).toBe("PRE_MARKET");
		});

		it("returns RTH during market hours", async () => {
			// 11:00 AM ET = 16:00 UTC
			const rth = new Date("2026-01-12T16:00:00Z");
			expect(await service.getTradingSession(rth)).toBe("RTH");
		});

		it("returns AFTER_HOURS after 4:00 PM ET", async () => {
			// 5:00 PM ET = 22:00 UTC
			const afterHours = new Date("2026-01-12T22:00:00Z");
			expect(await service.getTradingSession(afterHours)).toBe("AFTER_HOURS");
		});

		it("returns CLOSED late at night", async () => {
			// 10:00 PM ET = 03:00 UTC next day
			const closed = new Date("2026-01-13T03:00:00Z");
			expect(await service.getTradingSession(closed)).toBe("CLOSED");
		});

		it("returns CLOSED on early close days after 1:00 PM ET", async () => {
			// Day after Thanksgiving 2026, 2:00 PM ET = 19:00 UTC
			const afterEarlyClose = new Date("2026-11-27T19:00:00Z");
			expect(await service.getTradingSession(afterEarlyClose)).toBe("CLOSED");
		});
	});

	describe("isRTH", () => {
		it("returns true during regular trading hours", async () => {
			const rth = new Date("2026-01-12T16:00:00Z"); // 11:00 AM ET
			expect(await service.isRTH(rth)).toBe(true);
		});

		it("returns false outside RTH", async () => {
			const preMarket = new Date("2026-01-12T13:00:00Z"); // 8:00 AM ET
			expect(await service.isRTH(preMarket)).toBe(false);
		});
	});

	describe("isMarketOpen", () => {
		it("always returns true in BACKTEST mode", async () => {
			expect(await service.isMarketOpen()).toBe(true);
		});
	});

	describe("getClock", () => {
		it("returns isOpen: true in BACKTEST mode", async () => {
			const clock = await service.getClock();
			expect(clock.isOpen).toBe(true);
		});

		it("returns a valid MarketClock object", async () => {
			const clock = await service.getClock();
			expect(clock.timestamp).toBeInstanceOf(Date);
			expect(clock.nextOpen).toBeInstanceOf(Date);
			expect(clock.nextClose).toBeInstanceOf(Date);
		});
	});

	describe("getNextTradingDay", () => {
		it("returns next weekday for Friday", async () => {
			const friday = "2026-01-09";
			const next = await service.getNextTradingDay(friday);
			expect(next.toISOString().slice(0, 10)).toBe("2026-01-12");
		});

		it("skips holidays", async () => {
			// Dec 24, 2026 is early close, Dec 25 is closed
			const beforeChristmas = "2026-12-24";
			const next = await service.getNextTradingDay(beforeChristmas);
			expect(next.toISOString().slice(0, 10)).toBe("2026-12-28");
		});

		it("handles Date objects", async () => {
			const friday = new Date("2026-01-09T12:00:00Z");
			const next = await service.getNextTradingDay(friday);
			expect(next.toISOString().slice(0, 10)).toBe("2026-01-12");
		});
	});

	describe("getPreviousTradingDay", () => {
		it("returns previous weekday for Monday", async () => {
			const monday = "2026-01-12";
			const prev = await service.getPreviousTradingDay(monday);
			expect(prev.toISOString().slice(0, 10)).toBe("2026-01-09");
		});

		it("skips holidays", async () => {
			// Jan 2 2026 is Friday, Jan 1 is holiday
			const afterNewYear = "2026-01-02";
			const prev = await service.getPreviousTradingDay(afterNewYear);
			expect(prev.toISOString().slice(0, 10)).toBe("2025-12-31");
		});
	});

	describe("getCalendarRange", () => {
		it("returns trading days in range", async () => {
			const start = "2026-01-05"; // Monday
			const end = "2026-01-09"; // Friday
			const days = await service.getCalendarRange(start, end);

			expect(days.length).toBe(5);
			expect(days[0]?.date).toBe("2026-01-05");
			expect(days[4]?.date).toBe("2026-01-09");
		});

		it("excludes weekends and holidays", async () => {
			const start = "2026-01-01"; // New Year's (holiday)
			const end = "2026-01-05"; // Monday
			const days = await service.getCalendarRange(start, end);

			// Should have Jan 2 (Fri) and Jan 5 (Mon)
			expect(days.length).toBe(2);
			expect(days[0]?.date).toBe("2026-01-02");
			expect(days[1]?.date).toBe("2026-01-05");
		});

		it("returns early close times correctly", async () => {
			const start = "2026-11-27"; // Day after Thanksgiving (early close)
			const end = "2026-11-27";
			const days = await service.getCalendarRange(start, end);

			expect(days.length).toBe(1);
			expect(days[0]?.close).toBe("13:00");
		});

		it("handles Date objects", async () => {
			const start = new Date("2026-01-05T12:00:00Z");
			const end = new Date("2026-01-06T12:00:00Z");
			const days = await service.getCalendarRange(start, end);

			expect(days.length).toBe(2);
		});
	});

	describe("factory function", () => {
		it("creates a valid CalendarService", () => {
			const service = createHardcodedCalendarService();
			expect(service).toBeDefined();
			expect(service.isTradingDay).toBeDefined();
			expect(service.getTradingSession).toBeDefined();
		});
	});
});

// ============================================
// AlpacaCalendarService Tests
// ============================================

describe("AlpacaCalendarService", () => {
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
			cache
		);
	});

	afterEach(() => {
		cache.clear();
	});

	describe("initialize", () => {
		it("preloads current and next year by default", async () => {
			const getCalendarSpy = spyOn(mockClient, "getCalendar");
			await service.initialize();

			const currentYear = new Date().getUTCFullYear();
			expect(getCalendarSpy).toHaveBeenCalledTimes(2);
			expect(cache.isYearLoaded(currentYear)).toBe(true);
			expect(cache.isYearLoaded(currentYear + 1)).toBe(true);
		});

		it("preloads custom years when specified", async () => {
			const getCalendarSpy = spyOn(mockClient, "getCalendar");
			await service.initialize([2026, 2027, 2028]);

			expect(getCalendarSpy).toHaveBeenCalledTimes(3);
		});
	});

	describe("isTradingDay", () => {
		beforeEach(async () => {
			cache.setYear(2026, mockCalendarDays);
		});

		it("returns true for trading days", async () => {
			expect(await service.isTradingDay("2026-01-05")).toBe(true);
		});

		it("returns false for non-trading days", async () => {
			// Saturday - not in mock data
			expect(await service.isTradingDay("2026-01-10")).toBe(false);
		});
	});

	describe("getMarketCloseTime", () => {
		beforeEach(async () => {
			cache.setYear(2026, [...mockCalendarDays, earlyCloseDay]);
		});

		it("returns close time for trading days", async () => {
			expect(await service.getMarketCloseTime("2026-01-05")).toBe("16:00");
		});

		it("returns early close time", async () => {
			expect(await service.getMarketCloseTime("2026-11-27")).toBe("13:00");
		});

		it("returns null for non-trading days", async () => {
			expect(await service.getMarketCloseTime("2026-01-10")).toBe(null);
		});
	});

	describe("getTradingSession", () => {
		beforeEach(async () => {
			cache.setYear(2026, [...mockCalendarDays, earlyCloseDay]);
		});

		it("returns CLOSED for non-trading days", async () => {
			const saturday = new Date("2026-01-10T16:00:00Z");
			expect(await service.getTradingSession(saturday)).toBe("CLOSED");
		});

		it("returns PRE_MARKET before open", async () => {
			// 8:00 AM ET = 13:00 UTC
			const preMarket = new Date("2026-01-05T13:00:00Z");
			expect(await service.getTradingSession(preMarket)).toBe("PRE_MARKET");
		});

		it("returns RTH during market hours", async () => {
			// 11:00 AM ET = 16:00 UTC
			const rth = new Date("2026-01-05T16:00:00Z");
			expect(await service.getTradingSession(rth)).toBe("RTH");
		});

		it("returns AFTER_HOURS after close", async () => {
			// 5:00 PM ET = 22:00 UTC
			const afterHours = new Date("2026-01-05T22:00:00Z");
			expect(await service.getTradingSession(afterHours)).toBe("AFTER_HOURS");
		});

		it("returns CLOSED after early close", async () => {
			// 2:00 PM ET on early close day = 19:00 UTC
			const afterEarlyClose = new Date("2026-11-27T19:00:00Z");
			expect(await service.getTradingSession(afterEarlyClose)).toBe("CLOSED");
		});
	});

	describe("isRTH", () => {
		beforeEach(async () => {
			cache.setYear(2026, mockCalendarDays);
		});

		it("returns true during RTH", async () => {
			const rth = new Date("2026-01-05T16:00:00Z");
			expect(await service.isRTH(rth)).toBe(true);
		});

		it("returns false outside RTH", async () => {
			const preMarket = new Date("2026-01-05T13:00:00Z");
			expect(await service.isRTH(preMarket)).toBe(false);
		});
	});

	describe("isMarketOpen", () => {
		it("returns clock isOpen status", async () => {
			expect(await service.isMarketOpen()).toBe(true);

			const closedClock = { ...mockClock, isOpen: false };
			mockClient.getClock = async () => closedClock;
			cache.clear();

			expect(await service.isMarketOpen()).toBe(false);
		});
	});

	describe("getClock", () => {
		it("returns clock from API", async () => {
			const clock = await service.getClock();
			expect(clock.isOpen).toBe(true);
			expect(clock.timestamp).toEqual(mockClock.timestamp);
		});

		it("caches clock data", async () => {
			const getClockSpy = spyOn(mockClient, "getClock");

			await service.getClock();
			await service.getClock();

			expect(getClockSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("getNextTradingDay", () => {
		beforeEach(async () => {
			cache.setYear(2026, mockCalendarDays);
			cache.setYear(2027, [{ date: "2027-01-04", open: "09:30", close: "16:00" }]);
		});

		it("returns next trading day", async () => {
			const next = await service.getNextTradingDay("2026-01-05");
			expect(next.toISOString().slice(0, 10)).toBe("2026-01-06");
		});

		it("skips weekends", async () => {
			// Jan 9 is Friday, next is Jan 12 Monday
			const next = await service.getNextTradingDay("2026-01-09");
			expect(next.toISOString().slice(0, 10)).toBe("2026-01-12");
		});
	});

	describe("getPreviousTradingDay", () => {
		beforeEach(async () => {
			cache.setYear(2025, [{ date: "2025-12-31", open: "09:30", close: "16:00" }]);
			cache.setYear(2026, mockCalendarDays);
		});

		it("returns previous trading day", async () => {
			const prev = await service.getPreviousTradingDay("2026-01-06");
			expect(prev.toISOString().slice(0, 10)).toBe("2026-01-05");
		});

		it("skips weekends", async () => {
			// Jan 12 is Monday, prev is Jan 9 Friday
			const prev = await service.getPreviousTradingDay("2026-01-12");
			expect(prev.toISOString().slice(0, 10)).toBe("2026-01-09");
		});
	});

	describe("getCalendarRange", () => {
		beforeEach(async () => {
			cache.setYear(2026, mockCalendarDays);
		});

		it("returns trading days in range", async () => {
			const days = await service.getCalendarRange("2026-01-05", "2026-01-07");
			expect(days.length).toBe(3);
			expect(days[0]?.date).toBe("2026-01-05");
			expect(days[2]?.date).toBe("2026-01-07");
		});

		it("excludes days outside range", async () => {
			const days = await service.getCalendarRange("2026-01-06", "2026-01-06");
			expect(days.length).toBe(1);
			expect(days[0]?.date).toBe("2026-01-06");
		});
	});

	describe("sync methods", () => {
		describe("when cache is populated", () => {
			beforeEach(async () => {
				cache.setYear(2026, [...mockCalendarDays, earlyCloseDay]);
			});

			it("isTradingDaySync works", () => {
				expect(service.isTradingDaySync("2026-01-05")).toBe(true);
				expect(service.isTradingDaySync("2026-01-10")).toBe(false);
			});

			it("getTradingSessionSync works", () => {
				const rth = new Date("2026-01-05T16:00:00Z");
				expect(service.getTradingSessionSync(rth)).toBe("RTH");
			});

			it("getMarketCloseTimeSync works", () => {
				expect(service.getMarketCloseTimeSync("2026-01-05")).toBe("16:00");
				expect(service.getMarketCloseTimeSync("2026-11-27")).toBe("13:00");
			});
		});

		describe("when cache is empty", () => {
			it("isTradingDaySync throws", () => {
				expect(() => service.isTradingDaySync("2026-01-05")).toThrow(CalendarServiceError);
			});

			it("getTradingSessionSync throws", () => {
				expect(() => service.getTradingSessionSync(new Date("2026-01-05T16:00:00Z"))).toThrow(
					CalendarServiceError
				);
			});

			it("getMarketCloseTimeSync throws", () => {
				expect(() => service.getMarketCloseTimeSync("2026-01-05")).toThrow(CalendarServiceError);
			});

			it("throws with NOT_INITIALIZED code", () => {
				try {
					service.isTradingDaySync("2026-01-05");
					expect.unreachable("Should have thrown");
				} catch (error) {
					expect(error).toBeInstanceOf(CalendarServiceError);
					expect((error as CalendarServiceError).code).toBe("NOT_INITIALIZED");
				}
			});
		});
	});
});
