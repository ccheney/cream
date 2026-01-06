/**
 * Staleness Detection Tests
 */

import { describe, expect, test } from "bun:test";
import {
  checkMultipleStaleness,
  checkStaleness,
  DEFAULT_STALENESS_THRESHOLDS,
  getStaleSymbols,
  isFresh,
} from "../src/validation/staleness";

describe("checkStaleness", () => {
  test("returns stale=true when timestamp is null", () => {
    const result = checkStaleness(null, "1h");
    expect(result.isStale).toBe(true);
    expect(result.lastTimestamp).toBeNull();
    expect(result.staleMinutes).toBe(Infinity);
    expect(result.threshold).toBe(120); // 2 hours for 1h timeframe
    expect(result.timeframe).toBe("1h");
  });

  test("returns stale=true when data is older than threshold", () => {
    // 3 hours ago (threshold is 2 hours for 1h timeframe)
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const result = checkStaleness(threeHoursAgo, "1h");
    expect(result.isStale).toBe(true);
    expect(result.staleMinutes).toBeGreaterThan(120);
  });

  test("returns stale=false when data is fresh", () => {
    // 30 minutes ago (threshold is 2 hours for 1h timeframe)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const result = checkStaleness(thirtyMinutesAgo, "1h");
    expect(result.isStale).toBe(false);
    expect(result.staleMinutes).toBeLessThan(120);
  });

  test("uses correct threshold for different timeframes", () => {
    const recentTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago

    // 1m timeframe: threshold is 2 minutes - 5 min ago is stale
    expect(checkStaleness(recentTimestamp, "1m").isStale).toBe(true);

    // 1h timeframe: threshold is 120 minutes - 5 min ago is fresh
    expect(checkStaleness(recentTimestamp, "1h").isStale).toBe(false);
  });

  test("uses custom thresholds when provided", () => {
    const customThresholds = { ...DEFAULT_STALENESS_THRESHOLDS, "1h": 10 }; // 10 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // With default threshold (120 min), 15 min ago is fresh
    expect(checkStaleness(fifteenMinutesAgo, "1h").isStale).toBe(false);

    // With custom threshold (10 min), 15 min ago is stale
    expect(checkStaleness(fifteenMinutesAgo, "1h", customThresholds).isStale).toBe(true);
  });
});

describe("checkMultipleStaleness", () => {
  test("checks staleness for multiple symbols", () => {
    const timestamps = new Map<string, string | null>();
    const freshTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
    const staleTimestamp = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(); // 5 hours ago

    timestamps.set("AAPL", freshTimestamp);
    timestamps.set("GOOGL", staleTimestamp);
    timestamps.set("MSFT", null);

    const results = checkMultipleStaleness(timestamps, "1h");

    expect(results.get("AAPL")?.isStale).toBe(false);
    expect(results.get("GOOGL")?.isStale).toBe(true);
    expect(results.get("MSFT")?.isStale).toBe(true);
    expect(results.size).toBe(3);
  });

  test("returns empty map for empty input", () => {
    const timestamps = new Map<string, string | null>();
    const results = checkMultipleStaleness(timestamps, "1h");
    expect(results.size).toBe(0);
  });
});

describe("getStaleSymbols", () => {
  test("returns only stale symbols", () => {
    const timestamps = new Map<string, string | null>();
    const freshTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const staleTimestamp = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();

    timestamps.set("AAPL", freshTimestamp);
    timestamps.set("GOOGL", staleTimestamp);
    timestamps.set("MSFT", null);
    timestamps.set("TSLA", freshTimestamp);

    const stale = getStaleSymbols(timestamps, "1h");

    expect(stale).toContain("GOOGL");
    expect(stale).toContain("MSFT");
    expect(stale).not.toContain("AAPL");
    expect(stale).not.toContain("TSLA");
    expect(stale.length).toBe(2);
  });

  test("returns empty array when no stale symbols", () => {
    const timestamps = new Map<string, string | null>();
    const freshTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    timestamps.set("AAPL", freshTimestamp);
    timestamps.set("GOOGL", freshTimestamp);

    const stale = getStaleSymbols(timestamps, "1h");
    expect(stale.length).toBe(0);
  });
});

describe("isFresh", () => {
  test("returns true for fresh data", () => {
    const freshTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(isFresh(freshTimestamp, "1h")).toBe(true);
  });

  test("returns false for stale data", () => {
    const staleTimestamp = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    expect(isFresh(staleTimestamp, "1h")).toBe(false);
  });

  test("returns false for null timestamp", () => {
    expect(isFresh(null, "1h")).toBe(false);
  });
});
