/**
 * Calendar Cache Tests
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { AlpacaCalendarClient } from "./alpaca-client";
import { createCalendarCache, InMemoryCalendarCache } from "./cache";
import type { CalendarDay, MarketClock } from "./types";

let cache: InMemoryCalendarCache;

const mockCalendarDays: CalendarDay[] = [
	{ date: "2026-01-05", open: "09:30", close: "16:00" },
	{ date: "2026-01-06", open: "09:30", close: "16:00" },
];

const mockClock: MarketClock = {
	isOpen: true,
	timestamp: new Date("2026-01-12T15:30:00.000Z"),
	nextOpen: new Date("2026-01-13T14:30:00.000Z"),
	nextClose: new Date("2026-01-12T21:00:00.000Z"),
};

beforeEach(() => {
	cache = new InMemoryCalendarCache();
});

afterEach(() => {
	cache.clear();
});

describe("InMemoryCalendarCache year cache", () => {
	it("returns undefined for uncached year", () => {
		expect(cache.getYear(2026)).toBeUndefined();
	});

	it("caches and retrieves year data", () => {
		cache.setYear(2026, mockCalendarDays);
		expect(cache.getYear(2026)).toEqual(mockCalendarDays);
	});

	it("reports year as loaded after caching", () => {
		expect(cache.isYearLoaded(2026)).toBe(false);
		cache.setYear(2026, mockCalendarDays);
		expect(cache.isYearLoaded(2026)).toBe(true);
	});

	it("expires year data after TTL", async () => {
		const shortTtlCache = new InMemoryCalendarCache({ calendarTtlMs: 50 });
		shortTtlCache.setYear(2026, mockCalendarDays);
		expect(shortTtlCache.getYear(2026)).toEqual(mockCalendarDays);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(shortTtlCache.getYear(2026)).toBeUndefined();
		expect(shortTtlCache.isYearLoaded(2026)).toBe(false);
	});

	it("clears year cache", () => {
		cache.setYear(2026, mockCalendarDays);
		cache.setYear(2027, mockCalendarDays);
		cache.clear();
		expect(cache.getYear(2026)).toBeUndefined();
		expect(cache.getYear(2027)).toBeUndefined();
	});
});

describe("InMemoryCalendarCache clock cache", () => {
	it("returns undefined for uncached clock", () => {
		expect(cache.getClock()).toBeUndefined();
	});

	it("caches and retrieves clock data", () => {
		cache.setClock(mockClock);
		expect(cache.getClock()).toEqual(mockClock);
	});

	it("expires clock data after TTL", async () => {
		const shortTtlCache = new InMemoryCalendarCache({ clockTtlMs: 50 });
		shortTtlCache.setClock(mockClock);
		expect(shortTtlCache.getClock()).toEqual(mockClock);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(shortTtlCache.getClock()).toBeUndefined();
	});

	it("clears clock cache", () => {
		cache.setClock(mockClock);
		cache.clear();
		expect(cache.getClock()).toBeUndefined();
	});
});

describe("InMemoryCalendarCache preloadYears basic", () => {
	it("fetches and caches years from client", async () => {
		const mockClient = {
			getCalendar: async (_start: string, _end: string) => mockCalendarDays,
		} as AlpacaCalendarClient;
		const getCalendarSpy = spyOn(mockClient, "getCalendar");

		await cache.preloadYears([2026, 2027], mockClient);
		expect(getCalendarSpy).toHaveBeenCalledTimes(2);
		expect(getCalendarSpy).toHaveBeenCalledWith("2026-01-01", "2026-12-31");
		expect(getCalendarSpy).toHaveBeenCalledWith("2027-01-01", "2027-12-31");
		expect(cache.isYearLoaded(2026)).toBe(true);
		expect(cache.isYearLoaded(2027)).toBe(true);
	});

	it("skips already loaded years", async () => {
		const mockClient = { getCalendar: async () => mockCalendarDays } as AlpacaCalendarClient;
		const getCalendarSpy = spyOn(mockClient, "getCalendar");

		cache.setYear(2026, mockCalendarDays);
		await cache.preloadYears([2026, 2027], mockClient);
		expect(getCalendarSpy).toHaveBeenCalledTimes(1);
		expect(getCalendarSpy).toHaveBeenCalledWith("2027-01-01", "2027-12-31");
	});
});

describe("InMemoryCalendarCache preloadYears edge cases", () => {
	it("fetches expired years", async () => {
		const shortTtlCache = new InMemoryCalendarCache({ calendarTtlMs: 50 });
		const mockClient = { getCalendar: async () => mockCalendarDays } as AlpacaCalendarClient;
		const getCalendarSpy = spyOn(mockClient, "getCalendar");

		shortTtlCache.setYear(2026, mockCalendarDays);
		await new Promise((resolve) => setTimeout(resolve, 100));
		await shortTtlCache.preloadYears([2026], mockClient);
		expect(getCalendarSpy).toHaveBeenCalledTimes(1);
	});

	it("handles empty years array", async () => {
		const mockClient = { getCalendar: async () => mockCalendarDays } as AlpacaCalendarClient;
		await expect(cache.preloadYears([], mockClient)).resolves.toBeUndefined();
	});
});

describe("InMemoryCalendarCache factory", () => {
	it("creates a cache with default config", () => {
		expect(createCalendarCache()).toBeInstanceOf(InMemoryCalendarCache);
	});

	it("creates a cache with custom config", () => {
		expect(
			createCalendarCache({
				calendarTtlMs: 1000,
				clockTtlMs: 500,
			}),
		).toBeInstanceOf(InMemoryCalendarCache);
	});
});
