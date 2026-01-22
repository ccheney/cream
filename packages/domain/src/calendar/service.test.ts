/**
 * Calendar Service Tests
 *
 * Tests for AlpacaCalendarService.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { AlpacaCalendarClient } from "./alpaca-client";
import { InMemoryCalendarCache } from "./cache";
import { AlpacaCalendarService, CalendarServiceError } from "./service";
import type { CalendarDay, MarketClock } from "./types";

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
			cache,
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
			const preMarket = new Date("2026-01-05T13:00:00Z");
			expect(await service.getTradingSession(preMarket)).toBe("PRE_MARKET");
		});

		it("returns RTH during market hours", async () => {
			const rth = new Date("2026-01-05T16:00:00Z");
			expect(await service.getTradingSession(rth)).toBe("RTH");
		});

		it("returns AFTER_HOURS after close", async () => {
			const afterHours = new Date("2026-01-05T22:00:00Z");
			expect(await service.getTradingSession(afterHours)).toBe("AFTER_HOURS");
		});

		it("returns CLOSED after early close", async () => {
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
					CalendarServiceError,
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
