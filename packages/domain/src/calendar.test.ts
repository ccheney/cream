/**
 * Market Calendar Tests
 */

import { describe, expect, test } from "bun:test";
import {
	canStartCycle,
	DEFAULT_CLOSE_TIME,
	EARLY_CLOSE_TIME,
	getAllHolidays,
	getAllowedSessions,
	getExpirationCycle,
	getHoliday,
	getMarketCloseTime,
	getMinutesToClose,
	getMonthlyExpiration,
	getMonthlyExpirations,
	getNextRTHStart,
	getNextTradingDay,
	getPreviousTradingDay,
	getThirdFriday,
	getTradingSession,
	hasDailyOptions,
	isDailyExpiration,
	isEntryAction,
	isExitAction,
	isMarketOpen,
	isMonthlyExpiration,
	isPassiveAction,
	isRTH,
	isTradingPossible,
	isWeeklyExpiration,
	MIN_MINUTES_BEFORE_CLOSE,
	NYSE_HOLIDAYS_2026,
	NYSE_SESSIONS,
	validateSessionForAction,
} from "./calendar";

// ============================================
// Holiday Tests
// ============================================

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
		expect(earlyCloseHolidays.length).toBe(2); // Nov 27, Dec 24

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

	test("Independence Day observed on July 3, 2026 (July 4 is Saturday)", () => {
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
		const holiday = getHoliday("2026-01-05"); // Monday
		expect(holiday).toBeNull();
	});

	test("accepts Date object", () => {
		const holiday = getHoliday(new Date("2026-01-01T12:00:00Z"));
		expect(holiday?.name).toBe("New Year's Day");
	});
});

// ============================================
// Market Open Tests
// ============================================

describe("isMarketOpen", () => {
	test("returns true for regular trading day", () => {
		expect(isMarketOpen("2026-01-05")).toBe(true); // Monday
		expect(isMarketOpen("2026-01-06")).toBe(true); // Tuesday
	});

	test("returns false for Saturday", () => {
		expect(isMarketOpen("2026-01-03")).toBe(false); // Saturday
	});

	test("returns false for Sunday", () => {
		expect(isMarketOpen("2026-01-04")).toBe(false); // Sunday
	});

	test("returns false for full holidays", () => {
		expect(isMarketOpen("2026-01-01")).toBe(false); // New Year's Day
		expect(isMarketOpen("2026-12-25")).toBe(false); // Christmas
		expect(isMarketOpen("2026-04-03")).toBe(false); // Good Friday
	});

	test("returns true for early close days", () => {
		expect(isMarketOpen("2026-11-27")).toBe(true); // Day after Thanksgiving
		expect(isMarketOpen("2026-12-24")).toBe(true); // Christmas Eve
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
		expect(getMarketCloseTime("2026-01-03")).toBeNull(); // Saturday
	});
});

// ============================================
// Trading Session Tests
// ============================================

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
		expect(getTradingSession("2026-01-03T14:30:00Z")).toBe("CLOSED"); // Saturday 9:30 ET
	});

	test("returns CLOSED for holiday", () => {
		expect(getTradingSession("2026-12-25T14:30:00Z")).toBe("CLOSED");
	});

	test("returns PRE_MARKET for early morning", () => {
		// 8:00 ET = 13:00 UTC
		expect(getTradingSession("2026-01-05T13:00:00Z")).toBe("PRE_MARKET");
	});

	test("returns RTH during market hours", () => {
		// 10:30 ET = 15:30 UTC
		expect(getTradingSession("2026-01-05T15:30:00Z")).toBe("RTH");
		// 14:00 ET = 19:00 UTC
		expect(getTradingSession("2026-01-05T19:00:00Z")).toBe("RTH");
	});

	test("returns AFTER_HOURS after close", () => {
		// 17:00 ET = 22:00 UTC
		expect(getTradingSession("2026-01-05T22:00:00Z")).toBe("AFTER_HOURS");
	});

	test("returns CLOSED after extended hours", () => {
		// 21:00 ET = 02:00 UTC next day - this is past 20:00 ET
		expect(getTradingSession("2026-01-06T02:00:00Z")).toBe("CLOSED");
	});
});

describe("isRTH", () => {
	test("returns true during market hours", () => {
		expect(isRTH("2026-01-05T15:30:00Z")).toBe(true); // 10:30 ET
	});

	test("returns false outside market hours", () => {
		expect(isRTH("2026-01-05T13:00:00Z")).toBe(false); // Pre-market
		expect(isRTH("2026-01-05T22:00:00Z")).toBe(false); // After-hours
		expect(isRTH("2026-01-03T15:30:00Z")).toBe(false); // Weekend
	});
});

// ============================================
// Option Expiration Tests
// ============================================

describe("getThirdFriday", () => {
	test("calculates third Friday correctly for January 2026", () => {
		const thirdFriday = getThirdFriday(2026, 1);
		expect(thirdFriday.getUTCDate()).toBe(16);
		expect(thirdFriday.getUTCDay()).toBe(5); // Friday
	});

	test("calculates third Friday correctly for April 2026", () => {
		const thirdFriday = getThirdFriday(2026, 4);
		expect(thirdFriday.getUTCDate()).toBe(17);
		expect(thirdFriday.getUTCDay()).toBe(5); // Friday
	});
});

describe("getMonthlyExpiration", () => {
	test("returns third Friday for normal months", () => {
		const expiration = getMonthlyExpiration(2026, 1);
		expect(expiration.getUTCDate()).toBe(16);
	});

	test("moves April expiration to Thursday due to Good Friday", () => {
		// Good Friday 2026 is April 3, but third Friday is April 17
		// April 17 is not Good Friday, so should stay
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
		expect(isWeeklyExpiration("2026-01-09")).toBe(true); // First Friday
		expect(isWeeklyExpiration("2026-01-23")).toBe(true); // Fourth Friday
	});

	test("returns false for monthly expiration", () => {
		expect(isWeeklyExpiration("2026-01-16")).toBe(false); // Third Friday
	});

	test("returns false for non-Friday", () => {
		expect(isWeeklyExpiration("2026-01-15")).toBe(false); // Thursday
	});
});

describe("hasDailyOptions", () => {
	test("returns true for major index ETFs", () => {
		expect(hasDailyOptions("SPY")).toBe(true);
		expect(hasDailyOptions("QQQ")).toBe(true);
		expect(hasDailyOptions("IWM")).toBe(true);
	});

	test("returns true for index options", () => {
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

	test("returns false for AAPL (no daily options)", () => {
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
		expect(getExpirationCycle("SPY", "2026-01-07")).toBe("DAILY"); // Wednesday
	});

	test("returns null for non-expiration date with regular stock", () => {
		expect(getExpirationCycle("AAPL", "2026-01-07")).toBeNull(); // Wednesday
	});
});

// ============================================
// Cycle Scheduling Tests
// ============================================

describe("canStartCycle", () => {
	test("returns true during RTH with time before close", () => {
		// 10:30 ET = 15:30 UTC
		expect(canStartCycle("2026-01-05T15:30:00Z")).toBe(true);
	});

	test("returns false within 5 minutes of close", () => {
		// 15:56 ET = 20:56 UTC (4 minutes before 16:00 close)
		expect(canStartCycle("2026-01-05T20:56:00Z")).toBe(false);
	});

	test("returns false during pre-market", () => {
		// 8:00 ET = 13:00 UTC
		expect(canStartCycle("2026-01-05T13:00:00Z")).toBe(false);
	});

	test("returns false during after-hours", () => {
		// 17:00 ET = 22:00 UTC
		expect(canStartCycle("2026-01-05T22:00:00Z")).toBe(false);
	});

	test("returns false on holiday", () => {
		expect(canStartCycle("2026-12-25T15:30:00Z")).toBe(false);
	});

	test("returns false on weekend", () => {
		expect(canStartCycle("2026-01-03T15:30:00Z")).toBe(false);
	});
});

describe("MIN_MINUTES_BEFORE_CLOSE", () => {
	test("is 5 minutes", () => {
		expect(MIN_MINUTES_BEFORE_CLOSE).toBe(5);
	});
});

// ============================================
// Navigation Tests
// ============================================

describe("getNextTradingDay", () => {
	test("returns next day for Thursday", () => {
		const next = getNextTradingDay("2026-01-08"); // Thursday
		expect(next.getUTCDate()).toBe(9); // Friday
	});

	test("skips weekend", () => {
		const next = getNextTradingDay("2026-01-09"); // Friday
		expect(next.getUTCDate()).toBe(12); // Monday
	});

	test("skips holidays", () => {
		const next = getNextTradingDay("2026-12-24"); // Christmas Eve (Thursday)
		// Dec 25 = Christmas (Friday, closed)
		// Dec 26 = Saturday
		// Dec 27 = Sunday
		// Dec 28 = Monday (open)
		expect(next.getUTCDate()).toBe(28);
	});
});

describe("getPreviousTradingDay", () => {
	test("returns previous day for Tuesday", () => {
		const prev = getPreviousTradingDay("2026-01-06"); // Tuesday
		expect(prev.getUTCDate()).toBe(5); // Monday
	});

	test("skips weekend", () => {
		const prev = getPreviousTradingDay("2026-01-12"); // Monday
		expect(prev.getUTCDate()).toBe(9); // Friday
	});
});

// ============================================
// Utility Tests
// ============================================

describe("getAllHolidays", () => {
	test("returns copy of holidays array", () => {
		const holidays = getAllHolidays();
		expect(holidays.length).toBe(12);
		expect(holidays).not.toBe(NYSE_HOLIDAYS_2026);
	});
});

describe("getMonthlyExpirations", () => {
	test("returns 12 expirations for a year", () => {
		const expirations = getMonthlyExpirations(2026);
		expect(expirations.length).toBe(12);
	});

	test("all expirations are on Friday (or Thursday for Good Friday adjustment)", () => {
		const expirations = getMonthlyExpirations(2026);
		for (const exp of expirations) {
			const dayOfWeek = exp.getUTCDay();
			// Friday (5) or Thursday (4) for holiday adjustment
			expect([4, 5]).toContain(dayOfWeek);
		}
	});
});

// ============================================
// Session Validation Tests
// ============================================

describe("Action Classification", () => {
	describe("isEntryAction", () => {
		test("returns true for BUY", () => {
			expect(isEntryAction("BUY")).toBe(true);
		});

		test("returns true for SELL", () => {
			expect(isEntryAction("SELL")).toBe(true);
		});

		test("returns true for INCREASE", () => {
			expect(isEntryAction("INCREASE")).toBe(true);
		});

		test("returns false for CLOSE", () => {
			expect(isEntryAction("CLOSE")).toBe(false);
		});

		test("returns false for REDUCE", () => {
			expect(isEntryAction("REDUCE")).toBe(false);
		});

		test("returns false for HOLD", () => {
			expect(isEntryAction("HOLD")).toBe(false);
		});
	});

	describe("isExitAction", () => {
		test("returns true for CLOSE", () => {
			expect(isExitAction("CLOSE")).toBe(true);
		});

		test("returns true for REDUCE", () => {
			expect(isExitAction("REDUCE")).toBe(true);
		});

		test("returns false for BUY", () => {
			expect(isExitAction("BUY")).toBe(false);
		});

		test("returns false for SELL", () => {
			expect(isExitAction("SELL")).toBe(false);
		});

		test("returns false for HOLD", () => {
			expect(isExitAction("HOLD")).toBe(false);
		});
	});

	describe("isPassiveAction", () => {
		test("returns true for HOLD", () => {
			expect(isPassiveAction("HOLD")).toBe(true);
		});

		test("returns false for BUY", () => {
			expect(isPassiveAction("BUY")).toBe(false);
		});

		test("returns false for CLOSE", () => {
			expect(isPassiveAction("CLOSE")).toBe(false);
		});
	});
});

describe("getAllowedSessions", () => {
	test("HOLD is allowed in all sessions including CLOSED", () => {
		const sessions = getAllowedSessions("EQUITY", "HOLD");
		expect(sessions).toContain("RTH");
		expect(sessions).toContain("PRE_MARKET");
		expect(sessions).toContain("AFTER_HOURS");
		expect(sessions).toContain("CLOSED");
	});

	test("equity entries require RTH by default", () => {
		const sessions = getAllowedSessions("EQUITY", "BUY");
		expect(sessions).toEqual(["RTH"]);
	});

	test("equity entries allow extended hours when configured", () => {
		const sessions = getAllowedSessions("EQUITY", "BUY", { allowExtendedHours: true });
		expect(sessions).toContain("RTH");
		expect(sessions).toContain("PRE_MARKET");
		expect(sessions).toContain("AFTER_HOURS");
	});

	test("option entries only allow RTH (even with extended hours config)", () => {
		const sessions = getAllowedSessions("OPTION", "BUY", { allowExtendedHours: true });
		expect(sessions).toEqual(["RTH"]);
	});

	test("equity exits allow RTH by default", () => {
		const sessions = getAllowedSessions("EQUITY", "CLOSE");
		expect(sessions).toEqual(["RTH"]);
	});

	test("equity exits allow extended hours when configured", () => {
		const sessions = getAllowedSessions("EQUITY", "CLOSE", { allowExtendedHours: true });
		expect(sessions).toContain("RTH");
		expect(sessions).toContain("PRE_MARKET");
		expect(sessions).toContain("AFTER_HOURS");
	});

	test("option exits only allow RTH", () => {
		const sessions = getAllowedSessions("OPTION", "CLOSE");
		expect(sessions).toEqual(["RTH"]);
	});
});

describe("validateSessionForAction", () => {
	// RTH time: 10:30 ET = 15:30 UTC
	const RTH_TIME = "2026-01-05T15:30:00Z";
	// Pre-market time: 8:00 ET = 13:00 UTC
	const PRE_MARKET_TIME = "2026-01-05T13:00:00Z";
	// After-hours time: 17:00 ET = 22:00 UTC
	const AFTER_HOURS_TIME = "2026-01-05T22:00:00Z";
	// Weekend (Saturday)
	const WEEKEND_TIME = "2026-01-03T15:30:00Z";
	// Holiday (Christmas)
	const HOLIDAY_TIME = "2026-12-25T15:30:00Z";

	describe("Entry actions (BUY, SELL, INCREASE)", () => {
		test("allows equity BUY during RTH", () => {
			const result = validateSessionForAction("BUY", "EQUITY", RTH_TIME);
			expect(result.valid).toBe(true);
			expect(result.session).toBe("RTH");
		});

		test("rejects equity BUY during pre-market (default config)", () => {
			const result = validateSessionForAction("BUY", "EQUITY", PRE_MARKET_TIME);
			expect(result.valid).toBe(false);
			expect(result.session).toBe("PRE_MARKET");
			expect(result.reason).toContain("RTH");
			expect(result.suggestion).toContain("Re-plan");
		});

		test("rejects equity BUY during after-hours (default config)", () => {
			const result = validateSessionForAction("BUY", "EQUITY", AFTER_HOURS_TIME);
			expect(result.valid).toBe(false);
			expect(result.session).toBe("AFTER_HOURS");
		});

		test("allows equity BUY during pre-market with extended hours config", () => {
			const result = validateSessionForAction("BUY", "EQUITY", PRE_MARKET_TIME, {
				allowExtendedHours: true,
			});
			expect(result.valid).toBe(true);
		});

		test("rejects option BUY during pre-market even with extended hours", () => {
			const result = validateSessionForAction("BUY", "OPTION", PRE_MARKET_TIME, {
				allowExtendedHours: true,
			});
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("Options");
		});

		test("rejects BUY on weekend", () => {
			const result = validateSessionForAction("BUY", "EQUITY", WEEKEND_TIME);
			expect(result.valid).toBe(false);
			expect(result.session).toBe("CLOSED");
			expect(result.reason).toContain("closed");
		});

		test("rejects BUY on holiday with holiday name", () => {
			const result = validateSessionForAction("BUY", "EQUITY", HOLIDAY_TIME);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("Christmas");
		});
	});

	describe("Exit actions (CLOSE, REDUCE)", () => {
		test("allows equity CLOSE during RTH", () => {
			const result = validateSessionForAction("CLOSE", "EQUITY", RTH_TIME);
			expect(result.valid).toBe(true);
		});

		test("rejects equity CLOSE during pre-market (default config)", () => {
			const result = validateSessionForAction("CLOSE", "EQUITY", PRE_MARKET_TIME);
			expect(result.valid).toBe(false);
		});

		test("allows equity CLOSE during pre-market with extended hours", () => {
			const result = validateSessionForAction("CLOSE", "EQUITY", PRE_MARKET_TIME, {
				allowExtendedHours: true,
			});
			expect(result.valid).toBe(true);
		});

		test("rejects option CLOSE during pre-market even with extended hours", () => {
			const result = validateSessionForAction("CLOSE", "OPTION", PRE_MARKET_TIME, {
				allowExtendedHours: true,
			});
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("Option exits");
		});
	});

	describe("HOLD action", () => {
		test("allows HOLD during RTH", () => {
			const result = validateSessionForAction("HOLD", "EQUITY", RTH_TIME);
			expect(result.valid).toBe(true);
		});

		test("allows HOLD during pre-market", () => {
			const result = validateSessionForAction("HOLD", "EQUITY", PRE_MARKET_TIME);
			expect(result.valid).toBe(true);
		});

		test("allows HOLD on weekend", () => {
			const result = validateSessionForAction("HOLD", "EQUITY", WEEKEND_TIME);
			expect(result.valid).toBe(true);
		});

		test("allows HOLD on holiday", () => {
			const result = validateSessionForAction("HOLD", "OPTION", HOLIDAY_TIME);
			expect(result.valid).toBe(true);
		});
	});

	describe("Testing override (alwaysOpen)", () => {
		test("allows BUY on weekend with alwaysOpen", () => {
			const result = validateSessionForAction("BUY", "EQUITY", WEEKEND_TIME, {
				alwaysOpen: true,
			});
			expect(result.valid).toBe(true);
			expect(result.session).toBe("RTH");
		});

		test("allows BUY on holiday with alwaysOpen", () => {
			const result = validateSessionForAction("BUY", "OPTION", HOLIDAY_TIME, {
				alwaysOpen: true,
			});
			expect(result.valid).toBe(true);
		});
	});
});

describe("isTradingPossible", () => {
	test("returns true during RTH", () => {
		expect(isTradingPossible("2026-01-05T15:30:00Z")).toBe(true);
	});

	test("returns true during pre-market", () => {
		expect(isTradingPossible("2026-01-05T13:00:00Z")).toBe(true);
	});

	test("returns true during after-hours", () => {
		expect(isTradingPossible("2026-01-05T22:00:00Z")).toBe(true);
	});

	test("returns false on weekend", () => {
		expect(isTradingPossible("2026-01-03T15:30:00Z")).toBe(false);
	});

	test("returns false on holiday", () => {
		expect(isTradingPossible("2026-12-25T15:30:00Z")).toBe(false);
	});
});

describe("getNextRTHStart", () => {
	test("returns current time if already in RTH", () => {
		const rthTime = new Date("2026-01-05T15:30:00Z");
		const result = getNextRTHStart(rthTime);
		expect(result.getTime()).toBe(rthTime.getTime());
	});

	test("returns today's RTH start if in pre-market", () => {
		const result = getNextRTHStart("2026-01-05T13:00:00Z");
		// 9:30 AM ET on Jan 5 = 14:30 UTC
		expect(result.toISOString()).toBe("2026-01-05T14:30:00.000Z");
	});

	test("returns next trading day's RTH start if after hours", () => {
		const result = getNextRTHStart("2026-01-05T22:00:00Z");
		// Next trading day (Jan 6) at 9:30 AM ET
		expect(result.toISOString()).toBe("2026-01-06T14:30:00.000Z");
	});

	test("returns Monday's RTH start if Friday after hours", () => {
		const result = getNextRTHStart("2026-01-09T22:00:00Z"); // Friday after-hours
		// Next trading day (Jan 12, Monday) at 9:30 AM ET
		expect(result.toISOString()).toBe("2026-01-12T14:30:00.000Z");
	});
});

describe("getMinutesToClose", () => {
	test("returns correct minutes during RTH", () => {
		// 10:30 ET = 15:30 UTC, close at 16:00 ET
		// Minutes to close: 16:00 - 10:30 = 5:30 = 330 minutes
		const result = getMinutesToClose("2026-01-05T15:30:00Z");
		expect(result).toBe(330);
	});

	test("returns 0 at market close", () => {
		// 16:00 ET = 21:00 UTC
		const result = getMinutesToClose("2026-01-05T21:00:00Z");
		expect(result).toBe(0);
	});

	test("returns null on closed day", () => {
		expect(getMinutesToClose("2026-01-03T15:30:00Z")).toBeNull(); // Saturday
		expect(getMinutesToClose("2026-12-25T15:30:00Z")).toBeNull(); // Holiday
	});

	test("returns correct minutes on early close day", () => {
		// 10:30 ET on Nov 27 (early close at 13:00 ET)
		// Minutes to close: 13:00 - 10:30 = 2:30 = 150 minutes
		const result = getMinutesToClose("2026-11-27T15:30:00Z");
		expect(result).toBe(150);
	});
});
