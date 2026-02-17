/**
 * AlpacaCalendarClient Integration Tests
 */

import { describe, expect, it } from "bun:test";
import { createAlpacaCalendarClient } from "./alpaca-client";

const ALPACA_KEY = Bun.env.ALPACA_KEY;
const ALPACA_SECRET = Bun.env.ALPACA_SECRET;
const HAS_CREDENTIALS = Boolean(ALPACA_KEY && ALPACA_SECRET);
const describeIfCredentials = describe.skipIf(!HAS_CREDENTIALS);

function createClient() {
	if (!ALPACA_KEY || !ALPACA_SECRET) {
		throw new Error("ALPACA credentials are required for integration tests");
	}
	return createAlpacaCalendarClient({
		apiKey: ALPACA_KEY,
		apiSecret: ALPACA_SECRET,
		environment: "PAPER",
	});
}

describeIfCredentials("AlpacaCalendarClient Integration getCalendar basic", () => {
	it("returns calendar days for a valid date range", async () => {
		const today = new Date();
		const nextWeek = new Date(today);
		nextWeek.setDate(today.getDate() + 14);
		const start = today.toISOString().slice(0, 10);
		const end = nextWeek.toISOString().slice(0, 10);

		const days = await createClient().getCalendar(start, end);
		expect(Array.isArray(days)).toBe(true);
		expect(days.length).toBeGreaterThan(0);

		for (const day of days) {
			expect(day).toHaveProperty("date");
			expect(day).toHaveProperty("open");
			expect(day).toHaveProperty("close");
			expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(day.open).toMatch(/^\d{2}:\d{2}$/);
			expect(day.close).toMatch(/^\d{2}:\d{2}$/);
		}
	});

	it("returns empty array for weekend-only past range", async () => {
		const days = await createClient().getCalendar("2025-01-04", "2025-01-05");
		expect(Array.isArray(days)).toBe(true);
		expect(days.length).toBe(0);
	});
});

describeIfCredentials("AlpacaCalendarClient Integration getCalendar ordering", () => {
	it("returns sorted calendar days", async () => {
		const days = await createClient().getCalendar("2025-01-06", "2025-01-31");
		for (let i = 1; i < days.length; i++) {
			const previous = days[i - 1];
			const current = days[i];
			if (!previous || !current) {
				throw new Error("Expected calendar days to be defined");
			}
			expect(current.date > previous.date).toBe(true);
		}
	});

	it("accepts Date objects as parameters", async () => {
		const days = await createClient().getCalendar(new Date("2025-06-01"), new Date("2025-06-30"));
		expect(Array.isArray(days)).toBe(true);
		expect(days.length).toBeGreaterThan(15);
		expect(days.length).toBeLessThan(25);
	});
});

describeIfCredentials("AlpacaCalendarClient Integration getClock", () => {
	it("returns current market clock status", async () => {
		const clock = await createClient().getClock();
		expect(clock).toHaveProperty("isOpen");
		expect(clock).toHaveProperty("timestamp");
		expect(clock).toHaveProperty("nextOpen");
		expect(clock).toHaveProperty("nextClose");
		expect(typeof clock.isOpen).toBe("boolean");
		expect(clock.timestamp).toBeInstanceOf(Date);
		expect(clock.nextOpen).toBeInstanceOf(Date);
		expect(clock.nextClose).toBeInstanceOf(Date);
		expect(Math.abs(Date.now() - clock.timestamp.getTime())).toBeLessThan(60000);
	});

	it("nextOpen and nextClose are in the future when relevant", async () => {
		const clock = await createClient().getClock();
		const now = Date.now();
		if (clock.isOpen) {
			expect(clock.nextClose.getTime()).toBeGreaterThan(now);
		} else {
			expect(clock.nextOpen.getTime()).toBeGreaterThan(now);
		}
	});
});

describeIfCredentials("AlpacaCalendarClient Integration schema conformance", () => {
	it("calendar response passes expected schema shape", async () => {
		const days = await createClient().getCalendar("2025-01-06", "2025-01-10");
		for (const day of days) {
			expect(day.date).not.toBeNull();
			expect(day.open).not.toBeNull();
			expect(day.close).not.toBeNull();
			if (day.sessionOpen !== undefined) {
				expect(typeof day.sessionOpen).toBe("string");
			}
			if (day.sessionClose !== undefined) {
				expect(typeof day.sessionClose).toBe("string");
			}
		}
	});

	it("clock response has ISO timestamps", async () => {
		const clock = await createClient().getClock();
		expect(clock.timestamp.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(clock.nextOpen.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(clock.nextClose.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});
