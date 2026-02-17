import { describe, expect, test } from "bun:test";
import {
	canStartCycle,
	getAllHolidays,
	getExpirationCycle,
	getMonthlyExpiration,
	getMonthlyExpirations,
	getNextTradingDay,
	getPreviousTradingDay,
	getThirdFriday,
	hasDailyOptions,
	isDailyExpiration,
	isMonthlyExpiration,
	isWeeklyExpiration,
	MIN_MINUTES_BEFORE_CLOSE,
	NYSE_HOLIDAYS_2026,
} from "./calendar";
import { useHardcodedCalendarService } from "./calendar/test-helpers";

useHardcodedCalendarService();

describe("getThirdFriday", () => {
	test("calculates third Friday correctly for January 2026", () => {
		const thirdFriday = getThirdFriday(2026, 1);
		expect(thirdFriday.getUTCDate()).toBe(16);
		expect(thirdFriday.getUTCDay()).toBe(5);
	});

	test("calculates third Friday correctly for April 2026", () => {
		const thirdFriday = getThirdFriday(2026, 4);
		expect(thirdFriday.getUTCDate()).toBe(17);
		expect(thirdFriday.getUTCDay()).toBe(5);
	});
});

describe("getMonthlyExpiration", () => {
	test("returns third Friday for normal months", () => {
		const expiration = getMonthlyExpiration(2026, 1);
		expect(expiration.getUTCDate()).toBe(16);
	});

	test("keeps April expiration on April 17, 2026", () => {
		const expiration = getMonthlyExpiration(2026, 4);
		expect(expiration.getUTCDate()).toBe(17);
	});
});

describe("isMonthlyExpiration", () => {
	test("returns true for monthly expiration date", () => {
		expect(isMonthlyExpiration("2026-01-16")).toBe(true);
	});

	test("returns false for non-expiration date", () => {
		expect(isMonthlyExpiration("2026-01-15")).toBe(false);
		expect(isMonthlyExpiration("2026-01-17")).toBe(false);
	});
});

describe("isWeeklyExpiration", () => {
	test("returns true for non-monthly Friday", () => {
		expect(isWeeklyExpiration("2026-01-09")).toBe(true);
		expect(isWeeklyExpiration("2026-01-23")).toBe(true);
	});

	test("returns false for monthly expiration", () => {
		expect(isWeeklyExpiration("2026-01-16")).toBe(false);
	});

	test("returns false for non-Friday", () => {
		expect(isWeeklyExpiration("2026-01-15")).toBe(false);
	});
});

describe("hasDailyOptions", () => {
	test("returns true for supported index symbols", () => {
		expect(hasDailyOptions("SPY")).toBe(true);
		expect(hasDailyOptions("QQQ")).toBe(true);
		expect(hasDailyOptions("IWM")).toBe(true);
		expect(hasDailyOptions("SPX")).toBe(true);
		expect(hasDailyOptions("NDX")).toBe(true);
	});

	test("returns false for regular stocks", () => {
		expect(hasDailyOptions("AAPL")).toBe(false);
		expect(hasDailyOptions("MSFT")).toBe(false);
	});

	test("is case insensitive", () => {
		expect(hasDailyOptions("spy")).toBe(true);
		expect(hasDailyOptions("Spy")).toBe(true);
	});
});

describe("isDailyExpiration", () => {
	test("returns true for SPY on trading day", () => {
		expect(isDailyExpiration("SPY", "2026-01-05")).toBe(true);
	});

	test("returns false for SPY on weekend", () => {
		expect(isDailyExpiration("SPY", "2026-01-03")).toBe(false);
	});

	test("returns false for AAPL", () => {
		expect(isDailyExpiration("AAPL", "2026-01-05")).toBe(false);
	});
});

describe("getExpirationCycle", () => {
	test("returns MONTHLY for third Friday", () => {
		expect(getExpirationCycle("AAPL", "2026-01-16")).toBe("MONTHLY");
	});

	test("returns WEEKLY for non-monthly Friday", () => {
		expect(getExpirationCycle("AAPL", "2026-01-09")).toBe("WEEKLY");
	});

	test("returns DAILY for SPY on trading day", () => {
		expect(getExpirationCycle("SPY", "2026-01-07")).toBe("DAILY");
	});

	test("returns null for non-expiration date with regular stock", () => {
		expect(getExpirationCycle("AAPL", "2026-01-07")).toBeNull();
	});
});

describe("canStartCycle", () => {
	test("returns true during RTH with time before close", () => {
		expect(canStartCycle("2026-01-05T15:30:00Z")).toBe(true);
	});

	test("returns false within 5 minutes of close", () => {
		expect(canStartCycle("2026-01-05T20:56:00Z")).toBe(false);
	});

	test("returns false outside RTH", () => {
		expect(canStartCycle("2026-01-05T13:00:00Z")).toBe(false);
		expect(canStartCycle("2026-01-05T22:00:00Z")).toBe(false);
	});

	test("returns false on closed days", () => {
		expect(canStartCycle("2026-12-25T15:30:00Z")).toBe(false);
		expect(canStartCycle("2026-01-03T15:30:00Z")).toBe(false);
	});
});

describe("MIN_MINUTES_BEFORE_CLOSE", () => {
	test("is 5 minutes", () => {
		expect(MIN_MINUTES_BEFORE_CLOSE).toBe(5);
	});
});

describe("getNextTradingDay", () => {
	test("returns next day for Thursday", () => {
		const next = getNextTradingDay("2026-01-08");
		expect(next.getUTCDate()).toBe(9);
	});

	test("skips weekend", () => {
		const next = getNextTradingDay("2026-01-09");
		expect(next.getUTCDate()).toBe(12);
	});

	test("skips holidays", () => {
		const next = getNextTradingDay("2026-12-24");
		expect(next.getUTCDate()).toBe(28);
	});
});

describe("getPreviousTradingDay", () => {
	test("returns previous day for Tuesday", () => {
		const prev = getPreviousTradingDay("2026-01-06");
		expect(prev.getUTCDate()).toBe(5);
	});

	test("skips weekend", () => {
		const prev = getPreviousTradingDay("2026-01-12");
		expect(prev.getUTCDate()).toBe(9);
	});
});

describe("getAllHolidays", () => {
	test("returns copy of holidays array", () => {
		const holidays = getAllHolidays();
		expect(holidays.length).toBe(12);
		expect(holidays).not.toBe(NYSE_HOLIDAYS_2026);
	});
});

describe("getMonthlyExpirations", () => {
	test("returns 12 expirations for a year", () => {
		expect(getMonthlyExpirations(2026).length).toBe(12);
	});

	test("all expirations are on Friday or Thursday adjustment", () => {
		const expirations = getMonthlyExpirations(2026);
		for (const expiration of expirations) {
			expect([4, 5]).toContain(expiration.getUTCDay());
		}
	});
});
