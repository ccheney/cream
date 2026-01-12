/**
 * AlpacaCalendarClient Integration Tests
 *
 * Tests that verify real Alpaca API behavior using PAPER credentials.
 * These tests are skipped if ALPACA_KEY is not set.
 *
 * Run with: bun test alpaca-client.integration.test.ts
 */

import { describe, expect, it } from "bun:test";
import { createAlpacaCalendarClient } from "./alpaca-client";

// ============================================
// Environment Check
// ============================================

const ALPACA_KEY = process.env.ALPACA_KEY;
const ALPACA_SECRET = process.env.ALPACA_SECRET;
const HAS_CREDENTIALS = Boolean(ALPACA_KEY && ALPACA_SECRET);

// ============================================
// Integration Tests
// ============================================

describe.skipIf(!HAS_CREDENTIALS)("AlpacaCalendarClient Integration", () => {
  const client = HAS_CREDENTIALS
    ? createAlpacaCalendarClient({
        apiKey: ALPACA_KEY!,
        apiSecret: ALPACA_SECRET!,
        environment: "PAPER",
      })
    : null;

  describe("getCalendar", () => {
    it("returns calendar days for a valid date range", async () => {
      // Fetch next 7 trading days from today
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 14); // Two weeks to ensure we get some trading days

      const start = today.toISOString().split("T")[0]!;
      const end = nextWeek.toISOString().split("T")[0]!;

      const days = await client!.getCalendar(start, end);

      // Should return an array of calendar days
      expect(Array.isArray(days)).toBe(true);

      // Should have at least some trading days (not all days are trading days)
      expect(days.length).toBeGreaterThan(0);

      // Each day should have required fields
      for (const day of days) {
        expect(day).toHaveProperty("date");
        expect(day).toHaveProperty("open");
        expect(day).toHaveProperty("close");

        // Date should be in YYYY-MM-DD format
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

        // Open and close should be in HH:MM format
        expect(day.open).toMatch(/^\d{2}:\d{2}$/);
        expect(day.close).toMatch(/^\d{2}:\d{2}$/);
      }
    });

    it("returns empty array for past range with no trading days", async () => {
      // Query a weekend in the past
      const days = await client!.getCalendar("2025-01-04", "2025-01-05"); // Saturday-Sunday

      expect(Array.isArray(days)).toBe(true);
      expect(days.length).toBe(0);
    });

    it("returns sorted calendar days", async () => {
      const days = await client!.getCalendar("2025-01-06", "2025-01-31");

      // Check that dates are in ascending order
      for (let i = 1; i < days.length; i++) {
        const prevDate = days[i - 1]!.date;
        const currDate = days[i]!.date;
        expect(currDate > prevDate).toBe(true);
      }
    });

    it("accepts Date objects as parameters", async () => {
      const start = new Date("2025-06-01");
      const end = new Date("2025-06-30");

      const days = await client!.getCalendar(start, end);

      expect(Array.isArray(days)).toBe(true);
      // June has roughly 20-22 trading days
      expect(days.length).toBeGreaterThan(15);
      expect(days.length).toBeLessThan(25);
    });
  });

  describe("getClock", () => {
    it("returns current market clock status", async () => {
      const clock = await client!.getClock();

      // Should have all required fields
      expect(clock).toHaveProperty("isOpen");
      expect(clock).toHaveProperty("timestamp");
      expect(clock).toHaveProperty("nextOpen");
      expect(clock).toHaveProperty("nextClose");

      // isOpen should be a boolean
      expect(typeof clock.isOpen).toBe("boolean");

      // Dates should be valid Date objects
      expect(clock.timestamp).toBeInstanceOf(Date);
      expect(clock.nextOpen).toBeInstanceOf(Date);
      expect(clock.nextClose).toBeInstanceOf(Date);

      // Timestamp should be close to current time (within 1 minute)
      const now = Date.now();
      const clockTime = clock.timestamp.getTime();
      expect(Math.abs(now - clockTime)).toBeLessThan(60000);
    });

    it("nextOpen and nextClose are in the future", async () => {
      const clock = await client!.getClock();
      const now = Date.now();

      // One of them should be in the future
      // If market is open, nextClose is in future
      // If market is closed, nextOpen is in future
      if (clock.isOpen) {
        expect(clock.nextClose.getTime()).toBeGreaterThan(now);
      } else {
        expect(clock.nextOpen.getTime()).toBeGreaterThan(now);
      }
    });
  });

  describe("response schema validation", () => {
    it("calendar response passes schema validation", async () => {
      const days = await client!.getCalendar("2025-01-06", "2025-01-10");

      for (const day of days) {
        // Ensure no unexpected null values
        expect(day.date).not.toBeNull();
        expect(day.open).not.toBeNull();
        expect(day.close).not.toBeNull();

        // Session times may be undefined but not null
        if (day.sessionOpen !== undefined) {
          expect(typeof day.sessionOpen).toBe("string");
        }
        if (day.sessionClose !== undefined) {
          expect(typeof day.sessionClose).toBe("string");
        }
      }
    });

    it("clock response has valid ISO timestamp format", async () => {
      const clock = await client!.getClock();

      // Timestamps should be valid dates that can be serialized
      expect(clock.timestamp.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(clock.nextOpen.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(clock.nextClose.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
