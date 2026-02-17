import { describe, expect, test } from "bun:test";
import {
	DEFAULT_CLOSE_TIME,
	EARLY_CLOSE_TIME,
	getHoliday,
	getMarketCloseTime,
	getTradingSession,
	isMarketOpen,
	isRTH,
	NYSE_HOLIDAYS_2026,
	NYSE_SESSIONS,
} from "./calendar";
import { useHardcodedCalendarService } from "./calendar/test-helpers";

useHardcodedCalendarService();

describe("NYSE Holidays 2026", () => {
	test("has 12 holidays defined", () => {
		expect(NYSE_HOLIDAYS_2026.length).toBe(12);
	});

	test("all holidays have required fields", () => {
		for (const holiday of NYSE_HOLIDAYS_2026) {
			expect(holiday.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(holiday.name.length).toBeGreaterThan(0);
			expect(["FULL_CLOSE", "EARLY_CLOSE"]).toContain(holiday.type);
		}
	});

	test("early close holidays have close time", () => {
		const earlyCloseHolidays = NYSE_HOLIDAYS_2026.filter((h) => h.type === "EARLY_CLOSE");
		expect(earlyCloseHolidays.length).toBe(2);

		for (const holiday of earlyCloseHolidays) {
			expect(holiday.closeTime).toBe("13:00");
		}
	});

	test("Good Friday is April 3, 2026", () => {
		const goodFriday = NYSE_HOLIDAYS_2026.find((h) => h.name === "Good Friday");
		expect(goodFriday?.date).toBe("2026-04-03");
		expect(goodFriday?.type).toBe("FULL_CLOSE");
	});

	test("Juneteenth is June 19, 2026", () => {
		const juneteenth = NYSE_HOLIDAYS_2026.find((h) => h.name === "Juneteenth");
		expect(juneteenth?.date).toBe("2026-06-19");
	});

	test("Independence Day observed on July 3, 2026", () => {
		const july4 = NYSE_HOLIDAYS_2026.find((h) => h.name.includes("Independence Day"));
		expect(july4?.date).toBe("2026-07-03");
	});
});

describe("getHoliday", () => {
	test("returns holiday for holiday date", () => {
		const holiday = getHoliday("2026-12-25");
		expect(holiday).not.toBeNull();
		expect(holiday?.name).toBe("Christmas Day");
	});

	test("returns null for regular trading day", () => {
		expect(getHoliday("2026-01-05")).toBeNull();
	});

	test("accepts Date object", () => {
		expect(getHoliday(new Date("2026-01-01T12:00:00Z"))?.name).toBe("New Year's Day");
	});
});

describe("isMarketOpen", () => {
	test("returns true for regular trading day", () => {
		expect(isMarketOpen("2026-01-05")).toBe(true);
		expect(isMarketOpen("2026-01-06")).toBe(true);
	});

	test("returns false for weekend", () => {
		expect(isMarketOpen("2026-01-03")).toBe(false);
		expect(isMarketOpen("2026-01-04")).toBe(false);
	});

	test("returns false for full holidays", () => {
		expect(isMarketOpen("2026-01-01")).toBe(false);
		expect(isMarketOpen("2026-12-25")).toBe(false);
		expect(isMarketOpen("2026-04-03")).toBe(false);
	});

	test("returns true for early close days", () => {
		expect(isMarketOpen("2026-11-27")).toBe(true);
		expect(isMarketOpen("2026-12-24")).toBe(true);
	});
});

describe("getMarketCloseTime", () => {
	test("returns 16:00 for regular trading day", () => {
		expect(getMarketCloseTime("2026-01-05")).toBe(DEFAULT_CLOSE_TIME);
	});

	test("returns 13:00 for early close days", () => {
		expect(getMarketCloseTime("2026-11-27")).toBe(EARLY_CLOSE_TIME);
		expect(getMarketCloseTime("2026-12-24")).toBe(EARLY_CLOSE_TIME);
	});

	test("returns null for closed days", () => {
		expect(getMarketCloseTime("2026-12-25")).toBeNull();
		expect(getMarketCloseTime("2026-01-03")).toBeNull();
	});
});

describe("NYSE_SESSIONS", () => {
	test("pre-market is 4:00-9:30", () => {
		expect(NYSE_SESSIONS.PRE_MARKET.start).toBe("04:00");
		expect(NYSE_SESSIONS.PRE_MARKET.end).toBe("09:30");
	});

	test("RTH is 9:30-16:00", () => {
		expect(NYSE_SESSIONS.RTH.start).toBe("09:30");
		expect(NYSE_SESSIONS.RTH.end).toBe("16:00");
	});

	test("after-hours is 16:00-20:00", () => {
		expect(NYSE_SESSIONS.AFTER_HOURS.start).toBe("16:00");
		expect(NYSE_SESSIONS.AFTER_HOURS.end).toBe("20:00");
	});
});

describe("getTradingSession", () => {
	test("returns CLOSED for weekend", () => {
		expect(getTradingSession("2026-01-03T14:30:00Z")).toBe("CLOSED");
	});

	test("returns CLOSED for holiday", () => {
		expect(getTradingSession("2026-12-25T14:30:00Z")).toBe("CLOSED");
	});

	test("returns PRE_MARKET for early morning", () => {
		expect(getTradingSession("2026-01-05T13:00:00Z")).toBe("PRE_MARKET");
	});

	test("returns RTH during market hours", () => {
		expect(getTradingSession("2026-01-05T15:30:00Z")).toBe("RTH");
		expect(getTradingSession("2026-01-05T19:00:00Z")).toBe("RTH");
	});

	test("returns AFTER_HOURS after close", () => {
		expect(getTradingSession("2026-01-05T22:00:00Z")).toBe("AFTER_HOURS");
	});

	test("returns CLOSED after extended hours", () => {
		expect(getTradingSession("2026-01-06T02:00:00Z")).toBe("CLOSED");
	});
});

describe("isRTH", () => {
	test("returns true during market hours", () => {
		expect(isRTH("2026-01-05T15:30:00Z")).toBe(true);
	});

	test("returns false outside market hours", () => {
		expect(isRTH("2026-01-05T13:00:00Z")).toBe(false);
		expect(isRTH("2026-01-05T22:00:00Z")).toBe(false);
		expect(isRTH("2026-01-03T15:30:00Z")).toBe(false);
	});
});
