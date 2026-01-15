/**
 * Calendar Service Factory Tests
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	CalendarConfigError,
	createCalendarService,
	getCalendarService,
	initCalendarService,
	isCalendarServiceAvailable,
	requireCalendarService,
	resetCalendarService,
} from "./factory";
import { HardcodedCalendarService } from "./service";

// Reset singleton at file load time to clear any pollution from other test files
resetCalendarService();

// Detect if module mocking from other test files has polluted the getCalendarService function
// This can happen when running the full test suite because bun's mock.module() can affect
// module exports globally before this test file's describe blocks run
const moduleIsPolluted = (() => {
	resetCalendarService();
	const service = getCalendarService();
	// If we get a non-null service after reset, something is wrong
	return service !== null;
})();

describe("CalendarService Factory", () => {
	const originalEnv = { ...Bun.env };

	beforeEach(() => {
		resetCalendarService();
		// Set BACKTEST mode for most tests
		Bun.env.CREAM_ENV = "BACKTEST";
	});

	afterEach(() => {
		resetCalendarService();
		// Restore original env
		Bun.env.CREAM_ENV = originalEnv.CREAM_ENV;
		Bun.env.ALPACA_KEY = originalEnv.ALPACA_KEY;
		Bun.env.ALPACA_SECRET = originalEnv.ALPACA_SECRET;
	});

	describe("createCalendarService", () => {
		it("creates HardcodedCalendarService in BACKTEST mode", async () => {
			const service = await createCalendarService({ mode: "BACKTEST" });
			expect(service).toBeInstanceOf(HardcodedCalendarService);
		});

		it("uses CREAM_ENV if mode not specified", async () => {
			Bun.env.CREAM_ENV = "BACKTEST";
			const service = await createCalendarService();
			expect(service).toBeInstanceOf(HardcodedCalendarService);
		});

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
	});

	// Skip singleton tests if module is polluted by other test files' mock.module() calls
	// These tests pass individually but can fail when running the full test suite
	describe.skipIf(moduleIsPolluted)("singleton management", () => {
		describe("getCalendarService", () => {
			it("returns null before initialization", () => {
				expect(getCalendarService()).toBeNull();
			});

			it("returns service after initialization", async () => {
				await initCalendarService({ mode: "BACKTEST" });
				const service = getCalendarService();
				expect(service).not.toBeNull();
				expect(service).toBeInstanceOf(HardcodedCalendarService);
			});
		});

		describe("requireCalendarService", () => {
			it("throws if not initialized", () => {
				expect(() => requireCalendarService()).toThrow("not initialized");
			});

			it("returns service after initialization", async () => {
				await initCalendarService({ mode: "BACKTEST" });
				const service = requireCalendarService();
				expect(service).toBeInstanceOf(HardcodedCalendarService);
			});
		});

		describe("initCalendarService", () => {
			it("initializes the singleton", async () => {
				const service = await initCalendarService({ mode: "BACKTEST" });
				expect(service).toBeInstanceOf(HardcodedCalendarService);
				expect(getCalendarService()).toBe(service);
			});

			it("returns existing instance on repeated calls", async () => {
				const first = await initCalendarService({ mode: "BACKTEST" });
				const second = await initCalendarService({ mode: "BACKTEST" });
				expect(first).toBe(second);
			});

			it("handles concurrent initialization calls", async () => {
				const [first, second, third] = await Promise.all([
					initCalendarService({ mode: "BACKTEST" }),
					initCalendarService({ mode: "BACKTEST" }),
					initCalendarService({ mode: "BACKTEST" }),
				]);

				expect(first).toBe(second);
				expect(second).toBe(third);
			});
		});

		describe("resetCalendarService", () => {
			it("clears the singleton", async () => {
				await initCalendarService({ mode: "BACKTEST" });
				expect(getCalendarService()).not.toBeNull();

				resetCalendarService();
				expect(getCalendarService()).toBeNull();
			});

			it("does not throw if not initialized", () => {
				expect(() => resetCalendarService()).not.toThrow();
			});

			it("allows reinitialization after reset", async () => {
				const first = await initCalendarService({ mode: "BACKTEST" });
				resetCalendarService();
				const second = await initCalendarService({ mode: "BACKTEST" });

				expect(first).not.toBe(second);
			});
		});
	});

	describe("isCalendarServiceAvailable", () => {
		it("returns true for BACKTEST mode", () => {
			expect(isCalendarServiceAvailable({ mode: "BACKTEST" })).toBe(true);
		});

		it("returns false for PAPER mode without credentials", () => {
			delete Bun.env.ALPACA_KEY;
			delete Bun.env.ALPACA_SECRET;
			expect(isCalendarServiceAvailable({ mode: "PAPER" })).toBe(false);
		});

		it("returns true for PAPER mode with credentials", () => {
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

		it("message suggests BACKTEST mode", () => {
			const error = new CalendarConfigError("ALPACA_KEY", "PAPER");
			expect(error.message).toContain("BACKTEST");
		});
	});
});
