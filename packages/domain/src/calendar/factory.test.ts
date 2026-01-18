/**
 * Calendar Service Factory Tests
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	CalendarConfigError,
	createCalendarService,
	getCalendarService,
	isCalendarServiceAvailable,
	requireCalendarService,
	resetCalendarService,
} from "./factory";

// Reset singleton at file load time to clear any pollution from other test files
resetCalendarService();

// Detect if module mocking from other test files has polluted factory functions
const moduleIsPolluted = (() => {
	resetCalendarService();
	const service = getCalendarService();
	if (service !== null) return true;
	try {
		requireCalendarService();
		return true;
	} catch {
		return false;
	}
})();

describe("CalendarService Factory", () => {
	const originalEnv = { ...Bun.env };

	beforeEach(() => {
		resetCalendarService();
		Bun.env.CREAM_ENV = "PAPER";
	});

	afterEach(() => {
		resetCalendarService();
		Bun.env.CREAM_ENV = originalEnv.CREAM_ENV;
		Bun.env.ALPACA_KEY = originalEnv.ALPACA_KEY;
		Bun.env.ALPACA_SECRET = originalEnv.ALPACA_SECRET;
	});

	describe("createCalendarService", () => {
		it("throws CalendarConfigError in PAPER mode without ALPACA_KEY", async () => {
			delete Bun.env.ALPACA_KEY;
			delete Bun.env.ALPACA_SECRET;

			await expect(createCalendarService({ mode: "PAPER" })).rejects.toThrow(CalendarConfigError);
		});

		it("throws CalendarConfigError in LIVE mode without credentials", async () => {
			delete Bun.env.ALPACA_KEY;
			delete Bun.env.ALPACA_SECRET;

			await expect(createCalendarService({ mode: "LIVE" })).rejects.toThrow(CalendarConfigError);
		});

		it("error message includes environment variable name", async () => {
			delete Bun.env.ALPACA_KEY;
			delete Bun.env.ALPACA_SECRET;

			try {
				await createCalendarService({ mode: "PAPER" });
				expect.unreachable("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(CalendarConfigError);
				const configError = error as CalendarConfigError;
				expect(configError.missingVar).toBe("ALPACA_KEY");
				expect(configError.mode).toBe("PAPER");
				expect(configError.message).toContain("ALPACA_KEY");
				expect(configError.message).toContain("PAPER");
			}
		});

		it("throws CalendarConfigError when only ALPACA_KEY is present", async () => {
			Bun.env.ALPACA_KEY = "test-key";
			delete Bun.env.ALPACA_SECRET;

			try {
				await createCalendarService({ mode: "PAPER" });
				expect.unreachable("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(CalendarConfigError);
				const configError = error as CalendarConfigError;
				expect(configError.missingVar).toBe("ALPACA_SECRET");
			}
		});
	});

	describe.skipIf(moduleIsPolluted)("singleton management", () => {
		describe("getCalendarService", () => {
			it("returns null before initialization", () => {
				expect(getCalendarService()).toBeNull();
			});
		});

		describe("requireCalendarService", () => {
			it("throws if not initialized", () => {
				expect(() => requireCalendarService()).toThrow("not initialized");
			});
		});

		describe("resetCalendarService", () => {
			it("does not throw if not initialized", () => {
				expect(() => resetCalendarService()).not.toThrow();
			});
		});
	});

	describe("isCalendarServiceAvailable", () => {
		it("returns false without credentials", () => {
			delete Bun.env.ALPACA_KEY;
			delete Bun.env.ALPACA_SECRET;
			expect(isCalendarServiceAvailable({ mode: "PAPER" })).toBe(false);
		});

		it("returns true with credentials", () => {
			Bun.env.ALPACA_KEY = "test-key";
			Bun.env.ALPACA_SECRET = "test-secret";
			expect(isCalendarServiceAvailable({ mode: "PAPER" })).toBe(true);
		});

		it("checks custom credentials over env vars", () => {
			delete Bun.env.ALPACA_KEY;
			delete Bun.env.ALPACA_SECRET;
			expect(
				isCalendarServiceAvailable({
					mode: "PAPER",
					alpacaKey: "custom-key",
					alpacaSecret: "custom-secret",
				})
			).toBe(true);
		});

		it("returns false with only one credential", () => {
			Bun.env.ALPACA_KEY = "test-key";
			delete Bun.env.ALPACA_SECRET;
			expect(isCalendarServiceAvailable({ mode: "PAPER" })).toBe(false);
		});
	});

	describe("CalendarConfigError", () => {
		it("has correct name", () => {
			const error = new CalendarConfigError("ALPACA_KEY", "PAPER");
			expect(error.name).toBe("CalendarConfigError");
		});

		it("has correct properties", () => {
			const error = new CalendarConfigError("ALPACA_SECRET", "LIVE");
			expect(error.missingVar).toBe("ALPACA_SECRET");
			expect(error.mode).toBe("LIVE");
		});

		it("message contains mode and missing var", () => {
			const error = new CalendarConfigError("ALPACA_KEY", "PAPER");
			expect(error.message).toContain("PAPER");
			expect(error.message).toContain("ALPACA_KEY");
		});
	});
});
