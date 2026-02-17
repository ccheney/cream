import { describe, expect, it } from "bun:test";

import { checkStaleness, getStaleSymbols, isFresh } from "./staleness";

describe("checkStaleness", () => {
	it("should detect stale data", () => {
		const oldTimestamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
		const result = checkStaleness(oldTimestamp, "1h");

		expect(result.isStale).toBe(true);
		expect(result.staleMinutes).toBeGreaterThan(120);
	});

	it("should detect fresh data", () => {
		const recentTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
		const result = checkStaleness(recentTimestamp, "1h");

		expect(result.isStale).toBe(false);
		expect(result.staleMinutes).toBeLessThan(120);
	});

	it("should handle null timestamp", () => {
		const result = checkStaleness(null, "1h");

		expect(result.isStale).toBe(true);
		expect(result.staleMinutes).toBe(Infinity);
	});

	it("should use correct thresholds per timeframe", () => {
		const timestamp = new Date(Date.now() - 15 * 60 * 1000).toISOString();

		const result1m = checkStaleness(timestamp, "1m");
		const result1d = checkStaleness(timestamp, "1d");

		expect(result1m.isStale).toBe(true);
		expect(result1d.isStale).toBe(false);
	});
});

describe("getStaleSymbols", () => {
	it("should return only stale symbols", () => {
		const timestamps = new Map<string, string | null>();
		timestamps.set("AAPL", new Date(Date.now() - 30 * 60 * 1000).toISOString());
		timestamps.set("MSFT", new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString());
		timestamps.set("GOOGL", null);

		const stale = getStaleSymbols(timestamps, "1h");

		expect(stale).toContain("MSFT");
		expect(stale).toContain("GOOGL");
		expect(stale).not.toContain("AAPL");
	});
});

describe("isFresh", () => {
	it("should return true for fresh data", () => {
		const timestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
		expect(isFresh(timestamp, "1h")).toBe(true);
	});

	it("should return false for stale data", () => {
		const timestamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
		expect(isFresh(timestamp, "1h")).toBe(false);
	});
});
