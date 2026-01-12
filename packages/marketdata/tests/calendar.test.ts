/**
 * Trading Calendar Tests
 */

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_US_CALENDAR,
  getNextTradingDay,
  getPreviousTradingDay,
  getTradingDaysBetween,
  isEarlyClose,
  isExpectedGap,
  isHoliday,
  isMarketOpen,
  isTradingDay,
  isWeekend,
} from "../src/validation/calendar";

describe("isWeekend", () => {
  test("Saturday is a weekend", () => {
    const saturday = new Date("2025-01-04"); // Saturday
    expect(isWeekend(saturday)).toBe(true);
  });

  test("Sunday is a weekend", () => {
    const sunday = new Date("2025-01-05"); // Sunday
    expect(isWeekend(sunday)).toBe(true);
  });

  test("Monday is not a weekend", () => {
    const monday = new Date("2025-01-06"); // Monday
    expect(isWeekend(monday)).toBe(false);
  });

  test("Friday is not a weekend", () => {
    const friday = new Date("2025-01-03"); // Friday
    expect(isWeekend(friday)).toBe(false);
  });
});

describe("isHoliday", () => {
  test("New Year's Day 2025 is a holiday", () => {
    const newYears = new Date("2025-01-01");
    expect(isHoliday(newYears)).toBe(true);
  });

  test("MLK Day 2025 is a holiday", () => {
    const mlkDay = new Date("2025-01-20");
    expect(isHoliday(mlkDay)).toBe(true);
  });

  test("Regular day is not a holiday", () => {
    const regularDay = new Date("2025-01-06");
    expect(isHoliday(regularDay)).toBe(false);
  });
});

describe("isEarlyClose", () => {
  test("Day before Independence Day 2025 is early close", () => {
    const july3 = new Date("2025-07-03");
    expect(isEarlyClose(july3)).toBe(true);
  });

  test("Christmas Eve 2025 is early close", () => {
    const christmasEve = new Date("2025-12-24");
    expect(isEarlyClose(christmasEve)).toBe(true);
  });

  test("Regular day is not early close", () => {
    const regularDay = new Date("2025-01-06");
    expect(isEarlyClose(regularDay)).toBe(false);
  });
});

describe("isTradingDay", () => {
  test("Monday is a trading day", () => {
    const monday = new Date("2025-01-06");
    expect(isTradingDay(monday)).toBe(true);
  });

  test("Saturday is not a trading day", () => {
    const saturday = new Date("2025-01-04");
    expect(isTradingDay(saturday)).toBe(false);
  });

  test("Holiday is not a trading day", () => {
    const holiday = new Date("2025-01-01");
    expect(isTradingDay(holiday)).toBe(false);
  });
});

describe("isMarketOpen", () => {
  // Note: These tests use UTC times and convert to ET

  test("market is closed on weekend", () => {
    // Saturday at 10am ET = 15:00 UTC in winter
    const saturdayMorning = new Date("2025-01-04T15:00:00Z");
    expect(isMarketOpen(saturdayMorning)).toBe(false);
  });

  test("market is closed on holiday", () => {
    // New Year's Day at 10am ET
    const holiday = new Date("2025-01-01T15:00:00Z");
    expect(isMarketOpen(holiday)).toBe(false);
  });

  test("market is open during regular hours", () => {
    // Monday Jan 6 2025 at 10am ET = 15:00 UTC
    const tradingTime = new Date("2025-01-06T15:00:00Z");
    expect(isMarketOpen(tradingTime)).toBe(true);
  });

  test("market is closed before open", () => {
    // Monday Jan 6 2025 at 8am ET = 13:00 UTC (before 9:30am open)
    const beforeOpen = new Date("2025-01-06T13:00:00Z");
    expect(isMarketOpen(beforeOpen)).toBe(false);
  });

  test("market is closed after close", () => {
    // Monday Jan 6 2025 at 5pm ET = 22:00 UTC (after 4pm close)
    const afterClose = new Date("2025-01-06T22:00:00Z");
    expect(isMarketOpen(afterClose)).toBe(false);
  });

  test("market closes early on early close days at 1pm", () => {
    // Christmas Eve 2025 at 2pm ET = 19:00 UTC (after 1pm early close)
    const afterEarlyClose = new Date("2025-12-24T19:00:00Z");
    expect(isMarketOpen(afterEarlyClose)).toBe(false);

    // Christmas Eve 2025 at 12pm ET = 17:00 UTC (before 1pm early close)
    const beforeEarlyClose = new Date("2025-12-24T17:00:00Z");
    expect(isMarketOpen(beforeEarlyClose)).toBe(true);
  });

  test("extended hours are considered when flag is set", () => {
    // Monday Jan 6 2025 at 5am ET = 10:00 UTC (pre-market)
    const preMarket = new Date("2025-01-06T10:00:00Z");
    expect(isMarketOpen(preMarket, DEFAULT_US_CALENDAR, false)).toBe(false);
    expect(isMarketOpen(preMarket, DEFAULT_US_CALENDAR, true)).toBe(true);
  });

  test("accepts string timestamp", () => {
    const tradingTimeStr = "2025-01-06T15:00:00Z";
    expect(isMarketOpen(tradingTimeStr)).toBe(true);
  });
});

describe("getNextTradingDay", () => {
  test("next trading day after Friday is Monday", () => {
    const friday = new Date("2025-01-03");
    const nextDay = getNextTradingDay(friday);
    expect(nextDay.getDay()).toBe(1); // Monday
  });

  test("next trading day after Thursday is Friday", () => {
    const thursday = new Date("2025-01-02");
    const nextDay = getNextTradingDay(thursday);
    expect(nextDay.getDay()).toBe(5); // Friday
  });

  test("skips holidays", () => {
    // Day before MLK Day 2025 (Sunday Jan 19)
    const sunday = new Date("2025-01-19");
    const nextDay = getNextTradingDay(sunday);
    // Should skip MLK Day (Jan 20) and return Jan 21
    expect(nextDay.toISOString().split("T")[0]).toBe("2025-01-21");
  });

  test("skips weekend and holiday combined", () => {
    // Friday before New Year's 2025
    const friday = new Date("2024-12-27");
    const nextDay = getNextTradingDay(friday);
    // Should skip Sat (28), Sun (29), Mon (30), Tue (31), Wed Jan 1 (holiday)
    // Return Thu Jan 2
    expect(nextDay.toISOString().split("T")[0]).toBe("2024-12-30");
  });
});

describe("getPreviousTradingDay", () => {
  test("previous trading day before Monday is Friday", () => {
    const monday = new Date("2025-01-06");
    const prevDay = getPreviousTradingDay(monday);
    expect(prevDay.getDay()).toBe(5); // Friday
  });

  test("previous trading day before Friday is Thursday", () => {
    const friday = new Date("2025-01-03");
    const prevDay = getPreviousTradingDay(friday);
    expect(prevDay.getDay()).toBe(4); // Thursday
  });

  test("skips holidays going backward", () => {
    // Day after MLK Day 2025 (Jan 21)
    const tuesday = new Date("2025-01-21");
    const prevDay = getPreviousTradingDay(tuesday);
    // Should skip MLK Day (Jan 20) and return Jan 17 (Friday)
    expect(prevDay.toISOString().split("T")[0]).toBe("2025-01-17");
  });

  test("skips weekend going backward", () => {
    const monday = new Date("2025-01-13");
    const prevDay = getPreviousTradingDay(monday);
    // Should skip Sun (12), Sat (11) and return Fri (10)
    expect(prevDay.toISOString().split("T")[0]).toBe("2025-01-10");
  });
});

describe("getTradingDaysBetween", () => {
  test("returns 0 for same day", () => {
    const day = new Date("2025-01-06");
    expect(getTradingDaysBetween(day, day)).toBe(0);
  });

  test("counts trading days between two dates", () => {
    const start = new Date("2025-01-06"); // Monday
    const end = new Date("2025-01-10"); // Friday
    expect(getTradingDaysBetween(start, end)).toBe(4); // Tue, Wed, Thu, Fri
  });

  test("excludes weekends", () => {
    const start = new Date("2025-01-03"); // Friday
    const end = new Date("2025-01-06"); // Monday
    expect(getTradingDaysBetween(start, end)).toBe(1); // Only Monday
  });

  test("excludes holidays", () => {
    const start = new Date("2025-01-17"); // Friday before MLK
    const end = new Date("2025-01-21"); // Tuesday after MLK
    // Excludes Sat (18), Sun (19), Mon (20 - MLK holiday)
    expect(getTradingDaysBetween(start, end)).toBe(1); // Only Tuesday
  });
});

describe("isExpectedGap", () => {
  test("overnight gap is expected", () => {
    // Gap between market close on Monday and open on Tuesday
    const monday4pm = "2025-01-06T21:00:00Z"; // 4pm ET
    const tuesday930am = "2025-01-07T14:30:00Z"; // 9:30am ET
    expect(isExpectedGap(monday4pm, tuesday930am)).toBe(true);
  });

  test("weekend gap is expected", () => {
    const friday4pm = "2025-01-03T21:00:00Z";
    const monday930am = "2025-01-06T14:30:00Z";
    expect(isExpectedGap(friday4pm, monday930am)).toBe(true);
  });

  test("holiday gap is expected", () => {
    // Gap crossing MLK Day
    const friday4pm = "2025-01-17T21:00:00Z";
    const tuesday930am = "2025-01-21T14:30:00Z";
    expect(isExpectedGap(friday4pm, tuesday930am)).toBe(true);
  });

  test("intraday gap is unexpected during trading hours", () => {
    const monday10am = "2025-01-06T15:00:00Z";
    const monday11am = "2025-01-06T16:00:00Z";
    // Consecutive hours during trading day - not expected to have gap
    expect(isExpectedGap(monday10am, monday11am)).toBe(false);
  });
});
