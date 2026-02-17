import { describe, expect, test } from "bun:test";
import {
	getAllowedSessions,
	getMinutesToClose,
	getNextRTHStart,
	isEntryAction,
	isExitAction,
	isPassiveAction,
	isTradingPossible,
	validateSessionForAction,
} from "./calendar";
import { useHardcodedCalendarService } from "./calendar/test-helpers";

useHardcodedCalendarService();

const RTH_TIME = "2026-01-05T15:30:00Z";
const PRE_MARKET_TIME = "2026-01-05T13:00:00Z";
const AFTER_HOURS_TIME = "2026-01-05T22:00:00Z";
const WEEKEND_TIME = "2026-01-03T15:30:00Z";
const HOLIDAY_TIME = "2026-12-25T15:30:00Z";

describe("Action Classification", () => {
	test("isEntryAction matches expected actions", () => {
		expect(isEntryAction("BUY")).toBe(true);
		expect(isEntryAction("SELL")).toBe(true);
		expect(isEntryAction("INCREASE")).toBe(true);
		expect(isEntryAction("CLOSE")).toBe(false);
		expect(isEntryAction("REDUCE")).toBe(false);
		expect(isEntryAction("HOLD")).toBe(false);
	});

	test("isExitAction matches expected actions", () => {
		expect(isExitAction("CLOSE")).toBe(true);
		expect(isExitAction("REDUCE")).toBe(true);
		expect(isExitAction("BUY")).toBe(false);
		expect(isExitAction("SELL")).toBe(false);
		expect(isExitAction("HOLD")).toBe(false);
	});

	test("isPassiveAction only returns true for HOLD", () => {
		expect(isPassiveAction("HOLD")).toBe(true);
		expect(isPassiveAction("BUY")).toBe(false);
		expect(isPassiveAction("CLOSE")).toBe(false);
	});
});

describe("getAllowedSessions", () => {
	test("HOLD is allowed in all sessions", () => {
		const sessions = getAllowedSessions("EQUITY", "HOLD");
		expect(sessions).toContain("RTH");
		expect(sessions).toContain("PRE_MARKET");
		expect(sessions).toContain("AFTER_HOURS");
		expect(sessions).toContain("CLOSED");
	});

	test("entries require RTH by default", () => {
		expect(getAllowedSessions("EQUITY", "BUY")).toEqual(["RTH"]);
		expect(getAllowedSessions("OPTION", "BUY", { allowExtendedHours: true })).toEqual(["RTH"]);
	});

	test("equity entries and exits allow extended hours when configured", () => {
		expect(getAllowedSessions("EQUITY", "BUY", { allowExtendedHours: true })).toEqual([
			"PRE_MARKET",
			"RTH",
			"AFTER_HOURS",
		]);
		expect(getAllowedSessions("EQUITY", "CLOSE", { allowExtendedHours: true })).toEqual([
			"PRE_MARKET",
			"RTH",
			"AFTER_HOURS",
		]);
	});

	test("option exits only allow RTH", () => {
		expect(getAllowedSessions("OPTION", "CLOSE")).toEqual(["RTH"]);
	});
});

describe("validateSessionForAction entries", () => {
	test("allows equity BUY during RTH", () => {
		const result = validateSessionForAction("BUY", "EQUITY", RTH_TIME);
		expect(result.valid).toBe(true);
		expect(result.session).toBe("RTH");
	});

	test("rejects equity BUY outside RTH by default", () => {
		expect(validateSessionForAction("BUY", "EQUITY", PRE_MARKET_TIME).valid).toBe(false);
		expect(validateSessionForAction("BUY", "EQUITY", AFTER_HOURS_TIME).valid).toBe(false);
	});

	test("allows equity BUY in pre-market with extended hours enabled", () => {
		const result = validateSessionForAction("BUY", "EQUITY", PRE_MARKET_TIME, {
			allowExtendedHours: true,
		});
		expect(result.valid).toBe(true);
	});

	test("rejects option BUY in pre-market even with extended hours", () => {
		const result = validateSessionForAction("BUY", "OPTION", PRE_MARKET_TIME, {
			allowExtendedHours: true,
		});
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("Options");
	});

	test("rejects BUY on weekend and holiday", () => {
		expect(validateSessionForAction("BUY", "EQUITY", WEEKEND_TIME).reason).toContain("closed");
		expect(validateSessionForAction("BUY", "EQUITY", HOLIDAY_TIME).reason).toContain("Christmas");
	});
});

describe("validateSessionForAction exits and hold", () => {
	test("equity CLOSE behavior matches config", () => {
		expect(validateSessionForAction("CLOSE", "EQUITY", RTH_TIME).valid).toBe(true);
		expect(validateSessionForAction("CLOSE", "EQUITY", PRE_MARKET_TIME).valid).toBe(false);
		expect(
			validateSessionForAction("CLOSE", "EQUITY", PRE_MARKET_TIME, {
				allowExtendedHours: true,
			}).valid,
		).toBe(true);
	});

	test("option CLOSE remains RTH-only", () => {
		const result = validateSessionForAction("CLOSE", "OPTION", PRE_MARKET_TIME, {
			allowExtendedHours: true,
		});
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("Option exits");
	});

	test("HOLD is always allowed", () => {
		expect(validateSessionForAction("HOLD", "EQUITY", RTH_TIME).valid).toBe(true);
		expect(validateSessionForAction("HOLD", "EQUITY", PRE_MARKET_TIME).valid).toBe(true);
		expect(validateSessionForAction("HOLD", "EQUITY", WEEKEND_TIME).valid).toBe(true);
		expect(validateSessionForAction("HOLD", "OPTION", HOLIDAY_TIME).valid).toBe(true);
	});
});

describe("validateSessionForAction alwaysOpen override", () => {
	test("allows weekend and holiday entries", () => {
		expect(
			validateSessionForAction("BUY", "EQUITY", WEEKEND_TIME, {
				alwaysOpen: true,
			}),
		).toMatchObject({ valid: true, session: "RTH" });
		expect(
			validateSessionForAction("BUY", "OPTION", HOLIDAY_TIME, {
				alwaysOpen: true,
			}).valid,
		).toBe(true);
	});
});

describe("trading availability helpers", () => {
	test("isTradingPossible matches session openness", () => {
		expect(isTradingPossible("2026-01-05T15:30:00Z")).toBe(true);
		expect(isTradingPossible("2026-01-05T13:00:00Z")).toBe(true);
		expect(isTradingPossible("2026-01-05T22:00:00Z")).toBe(true);
		expect(isTradingPossible("2026-01-03T15:30:00Z")).toBe(false);
		expect(isTradingPossible("2026-12-25T15:30:00Z")).toBe(false);
	});

	test("getNextRTHStart resolves current, same-day, and next-trading-day cases", () => {
		const rthTime = new Date("2026-01-05T15:30:00Z");
		expect(getNextRTHStart(rthTime).getTime()).toBe(rthTime.getTime());
		expect(getNextRTHStart("2026-01-05T13:00:00Z").toISOString()).toBe("2026-01-05T14:30:00.000Z");
		expect(getNextRTHStart("2026-01-05T22:00:00Z").toISOString()).toBe("2026-01-06T14:30:00.000Z");
		expect(getNextRTHStart("2026-01-09T22:00:00Z").toISOString()).toBe("2026-01-12T14:30:00.000Z");
	});

	test("getMinutesToClose handles regular, boundary, closed, and early-close cases", () => {
		expect(getMinutesToClose("2026-01-05T15:30:00Z")).toBe(330);
		expect(getMinutesToClose("2026-01-05T21:00:00Z")).toBe(0);
		expect(getMinutesToClose("2026-01-03T15:30:00Z")).toBeNull();
		expect(getMinutesToClose("2026-12-25T15:30:00Z")).toBeNull();
		expect(getMinutesToClose("2026-11-27T15:30:00Z")).toBe(150);
	});
});
