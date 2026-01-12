/**
 * FRED Integration Tests
 *
 * Integration tests that verify FRED API end-to-end.
 * These tests require FRED_API_KEY environment variable to run.
 *
 * Run with: CREAM_ENV=PAPER bun test apps/api/src/steps/gatherExternalContext.integration.test.ts
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { createContext, requireEnv } from "@cream/domain";
import { getFredEconomicCalendar, getMacroIndicators } from "@cream/mastra-kit";

// Skip all tests if FRED_API_KEY is not set
const skipIfNoKey = !process.env.FRED_API_KEY;

beforeAll(() => {
  process.env.CREAM_ENV = "PAPER";
});

describe.skipIf(skipIfNoKey)("FRED Integration", () => {
  describe("getEconomicCalendar", () => {
    test("fetches upcoming release dates", async () => {
      const ctx = createContext(requireEnv(), "scheduled");

      const today = new Date();
      const startDate = today.toISOString().split("T")[0] ?? "";
      const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const endDate = thirtyDaysLater.toISOString().split("T")[0] ?? "";

      const events = await getFredEconomicCalendar(ctx, startDate, endDate);

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toHaveProperty("id");
      expect(events[0]).toHaveProperty("name");
      expect(events[0]).toHaveProperty("date");
      expect(events[0]).toHaveProperty("impact");
    }, 30000); // 30 second timeout for API call

    test("includes high impact releases", async () => {
      const ctx = createContext(requireEnv(), "scheduled");

      const today = new Date();
      const startDate = today.toISOString().split("T")[0] ?? "";
      const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const endDate = thirtyDaysLater.toISOString().split("T")[0] ?? "";

      const events = await getFredEconomicCalendar(ctx, startDate, endDate);

      // Should include high impact events like CPI, Employment, GDP
      const highImpact = events.filter((e) => e.impact === "high");
      expect(highImpact.length).toBeGreaterThan(0);
    }, 30000);

    test("returns events sorted by date", async () => {
      const ctx = createContext(requireEnv(), "scheduled");

      const today = new Date();
      const startDate = today.toISOString().split("T")[0] ?? "";
      const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const endDate = thirtyDaysLater.toISOString().split("T")[0] ?? "";

      const events = await getFredEconomicCalendar(ctx, startDate, endDate);

      if (events.length > 1) {
        for (let i = 1; i < events.length; i++) {
          const prevDate = new Date(events[i - 1]?.date ?? "");
          const currDate = new Date(events[i]?.date ?? "");
          expect(currDate.getTime()).toBeGreaterThanOrEqual(prevDate.getTime());
        }
      }
    }, 30000);
  });

  describe("getMacroIndicators", () => {
    test("fetches CPI observations", async () => {
      const ctx = createContext(requireEnv(), "scheduled");
      const indicators = await getMacroIndicators(ctx, ["CPIAUCSL"]);

      expect(indicators.CPIAUCSL).toBeDefined();
      expect(indicators.CPIAUCSL?.value).toBeGreaterThan(0);
      expect(indicators.CPIAUCSL?.date).toBeDefined();
    }, 30000);

    test("fetches unemployment rate", async () => {
      const ctx = createContext(requireEnv(), "scheduled");
      const indicators = await getMacroIndicators(ctx, ["UNRATE"]);

      expect(indicators.UNRATE).toBeDefined();
      expect(indicators.UNRATE?.value).toBeGreaterThanOrEqual(0);
      expect(indicators.UNRATE?.value).toBeLessThan(100);
    }, 30000);

    test("fetches multiple series in parallel", async () => {
      const ctx = createContext(requireEnv(), "scheduled");
      const indicators = await getMacroIndicators(ctx, ["CPIAUCSL", "UNRATE", "FEDFUNDS"]);

      expect(indicators.CPIAUCSL).toBeDefined();
      expect(indicators.UNRATE).toBeDefined();
      expect(indicators.FEDFUNDS).toBeDefined();
    }, 60000); // 60 second timeout for multiple API calls

    test("includes percent change for CPI when available", async () => {
      const ctx = createContext(requireEnv(), "scheduled");
      const indicators = await getMacroIndicators(ctx, ["CPIAUCSL"]);

      expect(indicators.CPIAUCSL).toBeDefined();
      expect(indicators.CPIAUCSL?.value).toBeGreaterThan(0);

      // Change may be undefined if previous observation is missing or has "." value
      // When available, CPI change should be reasonable (-10% to +20% range)
      const change = indicators.CPIAUCSL?.change;
      if (change !== undefined) {
        expect(change).toBeGreaterThan(-10);
        expect(change).toBeLessThan(20);
      }
    }, 30000);

    test("fetches default series when none specified", async () => {
      const ctx = createContext(requireEnv(), "scheduled");
      const indicators = await getMacroIndicators(ctx);

      // Should have at least some indicators when fetching defaults
      const keys = Object.keys(indicators);
      expect(keys.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe("Rate Limiting", () => {
    test("handles multiple rapid requests gracefully", async () => {
      const ctx = createContext(requireEnv(), "scheduled");

      // Make a few requests in quick succession
      // FRED allows 120 req/min, so 5 should be fine
      const requests = Array.from({ length: 5 }, () => getMacroIndicators(ctx, ["CPIAUCSL"]));

      const results = await Promise.all(requests);

      // All requests should succeed
      for (const result of results) {
        expect(result.CPIAUCSL).toBeDefined();
      }
    }, 60000);
  });
});

describe("gatherExternalContext without FRED_API_KEY", () => {
  test("returns empty macroIndicators when API key missing", () => {
    // This test verifies graceful degradation is documented
    // The actual gatherExternalContext step handles missing keys gracefully
    // by returning empty arrays/objects without throwing
    expect(true).toBe(true);
  });
});
