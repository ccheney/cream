/**
 * Tests for External Data Input Validation
 */

import { describe, expect, it } from "bun:test";
import {
  extractApiErrorMessage,
  extractRateLimitStatus,
  isApiErrorResponse,
  validateOHLC,
  validatePrice,
  validatePriceChange,
  validateRawCandle,
  validateRawCandles,
  validateSymbol,
  validateTimestamp,
  validateVolume,
} from "./external";

// ============================================
// Price Validation Tests
// ============================================

describe("validatePrice", () => {
  it("should accept valid price", () => {
    const issues = validatePrice(150.25, "close");
    expect(issues).toHaveLength(0);
  });

  it("should reject null price", () => {
    const issues = validatePrice(null, "close");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
  });

  it("should reject undefined price", () => {
    const issues = validatePrice(undefined, "close");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
  });

  it("should reject NaN price", () => {
    const issues = validatePrice(NaN, "close");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.issue).toContain("not a valid number");
  });

  it("should reject Infinity price", () => {
    const issues = validatePrice(Infinity, "close");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.issue).toContain("infinite");
  });

  it("should reject negative price", () => {
    const issues = validatePrice(-10, "close");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
  });

  it("should warn for very low price", () => {
    const issues = validatePrice(0.00001, "close");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
  });

  it("should reject price exceeding maximum", () => {
    const issues = validatePrice(1_000_000_000, "close");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
  });

  it("should accept string price that converts to valid number", () => {
    const issues = validatePrice("150.25", "close");
    expect(issues).toHaveLength(0);
  });
});

// ============================================
// OHLC Validation Tests
// ============================================

describe("validateOHLC", () => {
  it("should accept valid OHLC", () => {
    const issues = validateOHLC(100, 105, 98, 103);
    expect(issues).toHaveLength(0);
  });

  it("should reject high < open", () => {
    const issues = validateOHLC(100, 99, 98, 103);
    expect(issues.some((i) => i.issue.includes("High") && i.issue.includes("Open"))).toBe(true);
  });

  it("should reject high < close", () => {
    const issues = validateOHLC(100, 102, 98, 105);
    expect(issues.some((i) => i.issue.includes("High") && i.issue.includes("Close"))).toBe(true);
  });

  it("should reject high < low", () => {
    const issues = validateOHLC(100, 98, 105, 103);
    expect(issues.some((i) => i.issue.includes("High") && i.issue.includes("Low"))).toBe(true);
  });

  it("should reject low > open", () => {
    const issues = validateOHLC(100, 105, 102, 103);
    expect(issues.some((i) => i.issue.includes("Low") && i.issue.includes("Open"))).toBe(true);
  });

  it("should reject low > close", () => {
    const issues = validateOHLC(100, 105, 104, 103);
    expect(issues.some((i) => i.issue.includes("Low") && i.issue.includes("Close"))).toBe(true);
  });

  it("should accept flat candle (all same)", () => {
    const issues = validateOHLC(100, 100, 100, 100);
    expect(issues).toHaveLength(0);
  });
});

// ============================================
// Price Change Validation Tests
// ============================================

describe("validatePriceChange", () => {
  it("should accept normal price change", () => {
    const issues = validatePriceChange(100, 102);
    expect(issues).toHaveLength(0);
  });

  it("should warn on extreme price change", () => {
    const issues = validatePriceChange(100, 250);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
  });

  it("should handle zero previous close", () => {
    const issues = validatePriceChange(0, 100);
    expect(issues).toHaveLength(0); // Can't calculate change
  });

  it("should handle negative previous close", () => {
    const issues = validatePriceChange(-10, 100);
    expect(issues).toHaveLength(0); // Can't calculate change
  });
});

// ============================================
// Volume Validation Tests
// ============================================

describe("validateVolume", () => {
  it("should accept valid volume", () => {
    const issues = validateVolume(1000000);
    expect(issues).toHaveLength(0);
  });

  it("should accept zero volume", () => {
    const issues = validateVolume(0);
    expect(issues).toHaveLength(0);
  });

  it("should reject null volume", () => {
    const issues = validateVolume(null);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
  });

  it("should reject negative volume", () => {
    const issues = validateVolume(-1000);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
  });

  it("should warn on extreme volume", () => {
    const issues = validateVolume(100_000_000_000);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
  });

  it("should reject NaN volume", () => {
    const issues = validateVolume(NaN);
    expect(issues).toHaveLength(1);
  });
});

// ============================================
// Timestamp Validation Tests
// ============================================

describe("validateTimestamp", () => {
  it("should accept valid ISO timestamp", () => {
    const issues = validateTimestamp("2024-01-15T10:30:00Z");
    expect(issues).toHaveLength(0);
  });

  it("should accept Date object", () => {
    const issues = validateTimestamp(new Date());
    expect(issues).toHaveLength(0);
  });

  it("should accept Unix timestamp (milliseconds)", () => {
    const issues = validateTimestamp(Date.now());
    expect(issues).toHaveLength(0);
  });

  it("should accept Unix timestamp (seconds)", () => {
    const issues = validateTimestamp(Math.floor(Date.now() / 1000));
    expect(issues).toHaveLength(0);
  });

  it("should reject null timestamp", () => {
    const issues = validateTimestamp(null);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
  });

  it("should reject invalid string", () => {
    const issues = validateTimestamp("not-a-date");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.issue).toContain("Invalid timestamp");
  });

  it("should reject future timestamp", () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour in future
    const issues = validateTimestamp(futureDate);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.issue).toContain("future");
  });

  it("should warn on very old timestamp", () => {
    const oldDate = new Date("1900-01-01");
    const issues = validateTimestamp(oldDate);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
  });

  it("should reject non-date type", () => {
    const issues = validateTimestamp({ foo: "bar" });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.issue).toContain("must be Date, string, or number");
  });
});

// ============================================
// Raw Candle Validation Tests
// ============================================

describe("validateRawCandle", () => {
  it("should accept valid candle (standard format)", () => {
    const result = validateRawCandle({
      timestamp: "2024-01-15T10:30:00Z",
      open: 100,
      high: 105,
      low: 98,
      close: 103,
      volume: 1000000,
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.sanitized).toBeDefined();
  });

  it("should accept valid candle (Polygon format)", () => {
    const result = validateRawCandle({
      t: Date.now(),
      o: 100,
      h: 105,
      l: 98,
      c: 103,
      v: 1000000,
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("should reject candle with invalid OHLC", () => {
    const result = validateRawCandle({
      timestamp: "2024-01-15T10:30:00Z",
      open: 100,
      high: 95, // Invalid: high < open
      low: 98,
      close: 103,
      volume: 1000000,
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.issue.includes("High"))).toBe(true);
  });

  it("should reject candle with missing price", () => {
    const result = validateRawCandle({
      timestamp: "2024-01-15T10:30:00Z",
      open: 100,
      high: 105,
      // missing low
      close: 103,
      volume: 1000000,
    });

    expect(result.valid).toBe(false);
  });

  it("should reject candle with negative volume", () => {
    const result = validateRawCandle({
      timestamp: "2024-01-15T10:30:00Z",
      open: 100,
      high: 105,
      low: 98,
      close: 103,
      volume: -1000,
    });

    expect(result.valid).toBe(false);
  });
});

describe("validateRawCandles", () => {
  it("should separate valid and invalid candles", () => {
    const candles = [
      {
        timestamp: "2024-01-15T10:30:00Z",
        open: 100,
        high: 105,
        low: 98,
        close: 103,
        volume: 1000000,
      },
      {
        timestamp: "2024-01-15T10:31:00Z",
        open: 100,
        high: 95, // Invalid
        low: 98,
        close: 103,
        volume: 1000000,
      },
      {
        timestamp: "2024-01-15T10:32:00Z",
        open: 103,
        high: 108,
        low: 102,
        close: 106,
        volume: 1200000,
      },
    ];

    const result = validateRawCandles(candles);

    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.index).toBe(1);
  });
});

// ============================================
// API Error Response Tests
// ============================================

describe("isApiErrorResponse", () => {
  it("should detect error field", () => {
    expect(isApiErrorResponse({ error: "Rate limit exceeded" })).toBe(true);
  });

  it("should detect Error field (capitalized)", () => {
    expect(isApiErrorResponse({ Error: "Something went wrong" })).toBe(true);
  });

  it("should detect error status string", () => {
    expect(isApiErrorResponse({ status: "error" })).toBe(true);
  });

  it("should detect HTTP error status code", () => {
    expect(isApiErrorResponse({ status: 429 })).toBe(true);
    expect(isApiErrorResponse({ status: 500 })).toBe(true);
  });

  it("should detect non-zero error code", () => {
    expect(isApiErrorResponse({ code: 1001 })).toBe(true);
  });

  it("should not flag successful response", () => {
    expect(isApiErrorResponse({ status: 200, data: [] })).toBe(false);
    expect(isApiErrorResponse({ results: [], count: 0 })).toBe(false);
  });

  it("should handle null and non-objects", () => {
    expect(isApiErrorResponse(null)).toBe(false);
    expect(isApiErrorResponse("string")).toBe(false);
    expect(isApiErrorResponse(123)).toBe(false);
  });
});

describe("extractApiErrorMessage", () => {
  it("should extract error field", () => {
    expect(extractApiErrorMessage({ error: "Rate limit" })).toBe("Rate limit");
  });

  it("should extract message field", () => {
    expect(extractApiErrorMessage({ message: "Not found" })).toBe("Not found");
  });

  it("should extract nested error message", () => {
    expect(extractApiErrorMessage({ error: { message: "Nested error" } })).toBe("Nested error");
  });

  it("should return JSON for unknown format", () => {
    const result = extractApiErrorMessage({ foo: "bar" });
    expect(result).toContain("foo");
  });
});

// ============================================
// Rate Limit Status Tests
// ============================================

describe("extractRateLimitStatus", () => {
  it("should extract rate limit from headers", () => {
    const headers = new Headers({
      "X-RateLimit-Remaining": "10",
      "X-RateLimit-Limit": "100",
    });

    const status = extractRateLimitStatus(headers);

    expect(status.isRateLimited).toBe(false);
    expect(status.remaining).toBe(10);
    expect(status.limit).toBe(100);
  });

  it("should detect rate limited (remaining = 0)", () => {
    const headers = new Headers({
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Limit": "100",
    });

    const status = extractRateLimitStatus(headers);

    expect(status.isRateLimited).toBe(true);
  });

  it("should detect rate limited (Retry-After present)", () => {
    const headers = new Headers({
      "Retry-After": "30",
    });

    const status = extractRateLimitStatus(headers);

    expect(status.isRateLimited).toBe(true);
    expect(status.retryAfterSeconds).toBe(30);
  });

  it("should handle object headers", () => {
    const headers = {
      "x-ratelimit-remaining": "5",
      "x-ratelimit-limit": "50",
    };

    const status = extractRateLimitStatus(headers);

    expect(status.remaining).toBe(5);
    expect(status.limit).toBe(50);
  });
});

// ============================================
// Symbol Validation Tests
// ============================================

describe("validateSymbol", () => {
  it("should accept valid ticker", () => {
    const issues = validateSymbol("AAPL");
    expect(issues).toHaveLength(0);
  });

  it("should accept option symbol", () => {
    const issues = validateSymbol("AAPL230120C00150000");
    expect(issues).toHaveLength(0);
  });

  it("should reject empty symbol", () => {
    const issues = validateSymbol("");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.issue).toContain("empty");
  });

  it("should reject non-string", () => {
    const issues = validateSymbol(123);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.issue).toContain("must be a string");
  });

  it("should reject too long symbol", () => {
    const issues = validateSymbol("A".repeat(25));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.issue).toContain("maximum length");
  });

  it("should reject invalid characters", () => {
    const issues = validateSymbol("AAP$L");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.issue).toContain("invalid characters");
  });

  it("should accept symbols with dots", () => {
    const issues = validateSymbol("BRK.A");
    expect(issues).toHaveLength(0);
  });
});
