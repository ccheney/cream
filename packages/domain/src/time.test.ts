/**
 * Time Utilities Tests
 *
 * Tests for ISO-8601/RFC 3339 timestamp handling
 */

import { describe, expect, test } from "bun:test";
import {
  addDays,
  addHours,
  // Arithmetic
  addMilliseconds,
  addMinutes,
  addSeconds,
  // Comparison
  compareIso8601,
  DateOnlySchema,
  daysToExpiration,
  diffMilliseconds,
  fromDateOnly,
  fromIso8601,
  getOptionExpirationTime,
  getTradingDay,
  // Schemas
  Iso8601Schema,
  Iso8601UtcSchema,
  isAfter,
  isBefore,
  isBetween,
  isOptionExpired,
  isSameTradingDay,
  isValidDateOnly,
  // Validation
  isValidIso8601,
  nowIso8601,
  startOfDay,
  // Trading
  startOfHour,
  toDateOnly,
  // Conversion
  toIso8601,
} from "./time";

// ============================================
// Zod Schema Tests
// ============================================

describe("Iso8601Schema", () => {
  test("accepts UTC timestamp with Z suffix", () => {
    const result = Iso8601Schema.safeParse("2026-01-04T16:30:00Z");
    expect(result.success).toBe(true);
  });

  test("accepts UTC timestamp with milliseconds", () => {
    const result = Iso8601Schema.safeParse("2026-01-04T16:30:00.123Z");
    expect(result.success).toBe(true);
  });

  test("accepts timestamp with positive offset", () => {
    const result = Iso8601Schema.safeParse("2026-01-04T16:30:00+05:30");
    expect(result.success).toBe(true);
  });

  test("accepts timestamp with negative offset", () => {
    const result = Iso8601Schema.safeParse("2026-01-04T16:30:00-06:00");
    expect(result.success).toBe(true);
  });

  test("rejects timestamp without timezone", () => {
    const result = Iso8601Schema.safeParse("2026-01-04T16:30:00");
    expect(result.success).toBe(false);
  });

  test("rejects date-only string", () => {
    const result = Iso8601Schema.safeParse("2026-01-04");
    expect(result.success).toBe(false);
  });
});

describe("Iso8601UtcSchema", () => {
  test("accepts valid UTC timestamp with milliseconds", () => {
    const result = Iso8601UtcSchema.safeParse("2026-01-04T16:30:00.123Z");
    expect(result.success).toBe(true);
  });

  test("accepts valid UTC timestamp without milliseconds", () => {
    const result = Iso8601UtcSchema.safeParse("2026-01-04T16:30:00Z");
    expect(result.success).toBe(true);
  });

  test("accepts timestamp with microseconds", () => {
    const result = Iso8601UtcSchema.safeParse("2026-01-04T16:30:00.123456Z");
    expect(result.success).toBe(true);
  });

  test("rejects non-UTC timestamp", () => {
    const result = Iso8601UtcSchema.safeParse("2026-01-04T16:30:00-06:00");
    expect(result.success).toBe(false);
  });

  test("rejects timestamp before Unix epoch", () => {
    const result = Iso8601UtcSchema.safeParse("1969-12-31T23:59:59.999Z");
    expect(result.success).toBe(false);
  });

  test("accepts date that JS auto-corrects (Feb 30 -> Mar 2)", () => {
    // Note: JavaScript Date auto-corrects invalid dates, so Feb 30 becomes Mar 2
    // This is intentional - we rely on Date parsing rather than strict validation
    const result = Iso8601UtcSchema.safeParse("2026-02-30T16:30:00.123Z");
    expect(result.success).toBe(true);
  });
});

describe("DateOnlySchema", () => {
  test("accepts valid date", () => {
    const result = DateOnlySchema.safeParse("2026-01-04");
    expect(result.success).toBe(true);
  });

  test("accepts leap year date", () => {
    const result = DateOnlySchema.safeParse("2024-02-29");
    expect(result.success).toBe(true);
  });

  test("rejects non-leap year Feb 29", () => {
    const result = DateOnlySchema.safeParse("2026-02-29");
    expect(result.success).toBe(false);
  });

  test("rejects invalid day", () => {
    const result = DateOnlySchema.safeParse("2026-01-32");
    expect(result.success).toBe(false);
  });

  test("rejects wrong format", () => {
    const result = DateOnlySchema.safeParse("01-04-2026");
    expect(result.success).toBe(false);
  });

  test("rejects timestamp format", () => {
    const result = DateOnlySchema.safeParse("2026-01-04T16:30:00Z");
    expect(result.success).toBe(false);
  });
});

// ============================================
// Conversion Function Tests
// ============================================

describe("toIso8601", () => {
  test("converts Date to ISO-8601 string", () => {
    const date = new Date("2026-01-04T16:30:45.123Z");
    expect(toIso8601(date)).toBe("2026-01-04T16:30:45.123Z");
  });

  test("preserves millisecond precision", () => {
    const date = new Date("2026-01-04T00:00:00.001Z");
    expect(toIso8601(date)).toBe("2026-01-04T00:00:00.001Z");
  });

  test("handles midnight", () => {
    const date = new Date("2026-01-04T00:00:00.000Z");
    expect(toIso8601(date)).toBe("2026-01-04T00:00:00.000Z");
  });

  test("throws for invalid Date", () => {
    expect(() => toIso8601(new Date("invalid"))).toThrow("Invalid Date object");
  });

  test("throws for non-Date argument", () => {
    expect(() => toIso8601("string" as unknown as Date)).toThrow();
  });
});

describe("fromIso8601", () => {
  test("parses valid timestamp", () => {
    const date = fromIso8601("2026-01-04T16:30:45.123Z");
    expect(date.toISOString()).toBe("2026-01-04T16:30:45.123Z");
  });

  test("preserves milliseconds", () => {
    const date = fromIso8601("2026-01-04T00:00:00.999Z");
    expect(date.getUTCMilliseconds()).toBe(999);
  });

  test("throws for invalid format", () => {
    expect(() => fromIso8601("2026-01-04")).toThrow("Invalid ISO-8601 format");
  });

  test("throws for non-UTC timestamp", () => {
    expect(() => fromIso8601("2026-01-04T16:30:00-06:00")).toThrow("Invalid ISO-8601 format");
  });
});

describe("nowIso8601", () => {
  test("returns current time as ISO-8601", () => {
    const now = nowIso8601();
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("returns recent timestamp", () => {
    const now = nowIso8601();
    const date = fromIso8601(now);
    const diff = Date.now() - date.getTime();
    expect(diff).toBeLessThan(1000); // Within 1 second
  });
});

describe("toDateOnly", () => {
  test("extracts date from timestamp", () => {
    const date = new Date("2026-01-04T16:30:45.123Z");
    expect(toDateOnly(date)).toBe("2026-01-04");
  });

  test("uses UTC date", () => {
    // 11 PM UTC on Jan 4 is still Jan 4 UTC (though Jan 5 in some timezones)
    const date = new Date("2026-01-04T23:00:00.000Z");
    expect(toDateOnly(date)).toBe("2026-01-04");
  });

  test("throws for invalid Date", () => {
    expect(() => toDateOnly(new Date("invalid"))).toThrow("Invalid Date object");
  });
});

describe("fromDateOnly", () => {
  test("parses date at midnight UTC", () => {
    const date = fromDateOnly("2026-01-04");
    expect(date.toISOString()).toBe("2026-01-04T00:00:00.000Z");
  });

  test("throws for invalid format", () => {
    expect(() => fromDateOnly("01-04-2026")).toThrow("Invalid date format");
  });

  test("throws for invalid date", () => {
    expect(() => fromDateOnly("2026-02-30")).toThrow("Invalid date format");
  });
});

// ============================================
// Validation Function Tests
// ============================================

describe("isValidIso8601", () => {
  test("returns true for valid UTC timestamp", () => {
    expect(isValidIso8601("2026-01-04T16:30:00.123Z")).toBe(true);
  });

  test("returns true for timestamp without ms", () => {
    expect(isValidIso8601("2026-01-04T16:30:00Z")).toBe(true);
  });

  test("returns false for non-UTC timestamp", () => {
    expect(isValidIso8601("2026-01-04T16:30:00-06:00")).toBe(false);
  });

  test("returns false for date-only", () => {
    expect(isValidIso8601("2026-01-04")).toBe(false);
  });

  test("returns false for before epoch", () => {
    expect(isValidIso8601("1969-12-31T23:59:59Z")).toBe(false);
  });
});

describe("isValidDateOnly", () => {
  test("returns true for valid date", () => {
    expect(isValidDateOnly("2026-01-04")).toBe(true);
  });

  test("returns false for invalid date", () => {
    expect(isValidDateOnly("2026-02-30")).toBe(false);
  });

  test("returns false for wrong format", () => {
    expect(isValidDateOnly("01/04/2026")).toBe(false);
  });
});

// ============================================
// Comparison Function Tests
// ============================================

describe("compareIso8601", () => {
  test("returns -1 when a is before b", () => {
    expect(compareIso8601("2026-01-04T10:00:00.000Z", "2026-01-04T12:00:00.000Z")).toBe(-1);
  });

  test("returns 1 when a is after b", () => {
    expect(compareIso8601("2026-01-04T12:00:00.000Z", "2026-01-04T10:00:00.000Z")).toBe(1);
  });

  test("returns 0 when equal", () => {
    expect(compareIso8601("2026-01-04T12:00:00.000Z", "2026-01-04T12:00:00.000Z")).toBe(0);
  });

  test("compares milliseconds", () => {
    expect(compareIso8601("2026-01-04T12:00:00.001Z", "2026-01-04T12:00:00.000Z")).toBe(1);
  });
});

describe("isBefore / isAfter / isBetween", () => {
  const early = "2026-01-04T10:00:00.000Z";
  const mid = "2026-01-04T12:00:00.000Z";
  const late = "2026-01-04T14:00:00.000Z";

  test("isBefore returns true when before", () => {
    expect(isBefore(early, mid)).toBe(true);
  });

  test("isBefore returns false when after", () => {
    expect(isBefore(late, mid)).toBe(false);
  });

  test("isAfter returns true when after", () => {
    expect(isAfter(late, mid)).toBe(true);
  });

  test("isAfter returns false when before", () => {
    expect(isAfter(early, mid)).toBe(false);
  });

  test("isBetween returns true when in range", () => {
    expect(isBetween(mid, early, late)).toBe(true);
  });

  test("isBetween includes boundaries", () => {
    expect(isBetween(early, early, late)).toBe(true);
    expect(isBetween(late, early, late)).toBe(true);
  });

  test("isBetween returns false when outside", () => {
    expect(isBetween(late, early, mid)).toBe(false);
  });
});

// ============================================
// Arithmetic Function Tests
// ============================================

describe("addMilliseconds", () => {
  test("adds positive milliseconds", () => {
    expect(addMilliseconds("2026-01-04T12:00:00.000Z", 500)).toBe("2026-01-04T12:00:00.500Z");
  });

  test("subtracts negative milliseconds", () => {
    expect(addMilliseconds("2026-01-04T12:00:00.500Z", -500)).toBe("2026-01-04T12:00:00.000Z");
  });
});

describe("addSeconds", () => {
  test("adds seconds", () => {
    expect(addSeconds("2026-01-04T12:00:00.000Z", 30)).toBe("2026-01-04T12:00:30.000Z");
  });
});

describe("addMinutes", () => {
  test("adds minutes", () => {
    expect(addMinutes("2026-01-04T12:00:00.000Z", 15)).toBe("2026-01-04T12:15:00.000Z");
  });

  test("handles hour rollover", () => {
    expect(addMinutes("2026-01-04T12:45:00.000Z", 30)).toBe("2026-01-04T13:15:00.000Z");
  });
});

describe("addHours", () => {
  test("adds hours", () => {
    expect(addHours("2026-01-04T12:00:00.000Z", 3)).toBe("2026-01-04T15:00:00.000Z");
  });

  test("handles day rollover", () => {
    expect(addHours("2026-01-04T22:00:00.000Z", 5)).toBe("2026-01-05T03:00:00.000Z");
  });
});

describe("addDays", () => {
  test("adds days", () => {
    expect(addDays("2026-01-04T12:00:00.000Z", 7)).toBe("2026-01-11T12:00:00.000Z");
  });

  test("handles month rollover", () => {
    expect(addDays("2026-01-30T12:00:00.000Z", 5)).toBe("2026-02-04T12:00:00.000Z");
  });
});

describe("diffMilliseconds", () => {
  test("calculates positive difference", () => {
    expect(diffMilliseconds("2026-01-04T12:00:01.000Z", "2026-01-04T12:00:00.000Z")).toBe(1000);
  });

  test("calculates negative difference", () => {
    expect(diffMilliseconds("2026-01-04T12:00:00.000Z", "2026-01-04T12:00:01.000Z")).toBe(-1000);
  });

  test("handles milliseconds", () => {
    expect(diffMilliseconds("2026-01-04T12:00:00.123Z", "2026-01-04T12:00:00.000Z")).toBe(123);
  });
});

// ============================================
// Trading-Specific Tests
// ============================================

describe("startOfHour", () => {
  test("rounds down to start of hour", () => {
    expect(startOfHour("2026-01-04T15:30:45.123Z")).toBe("2026-01-04T15:00:00.000Z");
  });

  test("preserves exact hour", () => {
    expect(startOfHour("2026-01-04T15:00:00.000Z")).toBe("2026-01-04T15:00:00.000Z");
  });
});

describe("startOfDay", () => {
  test("rounds down to midnight UTC", () => {
    expect(startOfDay("2026-01-04T15:30:45.123Z")).toBe("2026-01-04T00:00:00.000Z");
  });
});

describe("isSameTradingDay", () => {
  test("returns true for same day", () => {
    expect(isSameTradingDay("2026-01-04T10:00:00.000Z", "2026-01-04T22:00:00.000Z")).toBe(true);
  });

  test("returns false for different days", () => {
    expect(isSameTradingDay("2026-01-04T23:00:00.000Z", "2026-01-05T01:00:00.000Z")).toBe(false);
  });
});

describe("getTradingDay", () => {
  test("extracts trading day", () => {
    expect(getTradingDay("2026-01-04T15:30:00.000Z")).toBe("2026-01-04");
  });
});

describe("getOptionExpirationTime", () => {
  test("returns 4 PM ET in UTC (9 PM)", () => {
    expect(getOptionExpirationTime("2026-01-17")).toBe("2026-01-17T21:00:00.000Z");
  });

  test("throws for invalid date", () => {
    expect(() => getOptionExpirationTime("2026-02-30")).toThrow("Invalid expiration date format");
  });
});

describe("isOptionExpired", () => {
  test("returns false before expiration", () => {
    expect(isOptionExpired("2026-01-17", "2026-01-17T20:00:00.000Z")).toBe(false);
  });

  test("returns true after expiration", () => {
    expect(isOptionExpired("2026-01-17", "2026-01-17T22:00:00.000Z")).toBe(true);
  });
});

describe("daysToExpiration", () => {
  test("calculates positive days", () => {
    const days = daysToExpiration("2026-01-17", "2026-01-14T21:00:00.000Z");
    expect(days).toBe(3);
  });

  test("calculates fractional days", () => {
    const days = daysToExpiration("2026-01-17", "2026-01-16T21:00:00.000Z");
    expect(days).toBe(1);
  });

  test("returns negative for expired", () => {
    const days = daysToExpiration("2026-01-17", "2026-01-18T21:00:00.000Z");
    expect(days).toBe(-1);
  });
});

// ============================================
// Round-Trip Tests
// ============================================

describe("round-trip conversions", () => {
  test("toIso8601 → fromIso8601 preserves value", () => {
    const original = new Date("2026-01-04T16:30:45.123Z");
    const str = toIso8601(original);
    const parsed = fromIso8601(str);
    expect(parsed.getTime()).toBe(original.getTime());
  });

  test("toDateOnly → fromDateOnly preserves date", () => {
    const original = new Date("2026-01-04T16:30:45.123Z");
    const str = toDateOnly(original);
    const parsed = fromDateOnly(str);
    expect(parsed.getUTCFullYear()).toBe(2026);
    expect(parsed.getUTCMonth()).toBe(0); // January
    expect(parsed.getUTCDate()).toBe(4);
  });

  test("nowIso8601 → fromIso8601 is valid", () => {
    const now = nowIso8601();
    const parsed = fromIso8601(now);
    expect(parsed).toBeInstanceOf(Date);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
  });
});
