/**
 * Tests for Validation Utilities
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  coerceBool,
  coerceDate,
  coerceInt,
  containsSqlInjection,
  formatValidationError,
  formatZodIssue,
  getErrorMessages,
  parseWithDefaults,
  partialExcept,
  safeParse,
  safeString,
  safeTickerSymbol,
  sanitizeString,
  withSoftDelete,
  withTimestamps,
} from "./validation";

// ============================================
// Error Formatting Tests
// ============================================

describe("formatZodIssue", () => {
  test("formats required field issue", () => {
    const issue: z.ZodIssue = {
      code: "invalid_type",
      expected: "string",
      received: "undefined",
      path: ["name"],
      message: "Required",
    };

    const formatted = formatZodIssue(issue);
    expect(formatted.path).toBe("name");
    expect(formatted.message).toBe("Required");
    expect(formatted.code).toBe("invalid_type");
  });

  test("formats nested path issue", () => {
    const issue: z.ZodIssue = {
      code: "invalid_type",
      expected: "number",
      received: "string",
      path: ["user", "age"],
      message: "Expected number",
    };

    const formatted = formatZodIssue(issue);
    expect(formatted.path).toBe("user.age");
  });

  test("includes type information for type errors", () => {
    const issue: z.ZodIssue = {
      code: "invalid_type",
      expected: "number",
      received: "string",
      path: ["count"],
      message: "Expected number",
    };

    const formatted = formatZodIssue(issue);
    expect(formatted.expected).toBeDefined();
  });
});

describe("formatValidationError", () => {
  test("formats multiple errors", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    try {
      schema.parse({});
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formatted = formatValidationError(error);
        expect(formatted.type).toBe("validation_error");
        expect(formatted.fields.length).toBe(2);
        expect(formatted.fields.some((f) => f.path === "name")).toBe(true);
        expect(formatted.fields.some((f) => f.path === "age")).toBe(true);
      }
    }
  });
});

describe("getErrorMessages", () => {
  test("concatenates error messages", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    try {
      schema.parse({});
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = getErrorMessages(error);
        expect(messages.includes("name")).toBe(true);
        expect(messages.includes("age")).toBe(true);
        expect(messages.includes(";")).toBe(true); // Separator
      }
    }
  });
});

describe("safeParse", () => {
  test("returns success for valid data", () => {
    const schema = z.object({ name: z.string() });
    const result = safeParse(schema, { name: "test" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("test");
    }
  });

  test("returns error for invalid data", () => {
    const schema = z.object({ name: z.string() });
    const result = safeParse(schema, {});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("validation_error");
    }
  });
});

describe("parseWithDefaults", () => {
  test("returns success for valid data", () => {
    const schema = z.object({ name: z.string() });
    const result = parseWithDefaults(schema, { name: "test" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("test");
    }
  });

  test("applies default values", () => {
    const schema = z.object({
      name: z.string(),
      count: z.number().default(10),
    });
    const result = parseWithDefaults(schema, { name: "test" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.count).toBe(10);
    }
  });

  test("returns error for invalid data", () => {
    const schema = z.object({ name: z.string() });
    const result = parseWithDefaults(schema, {});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("validation_error");
      expect(result.error.fields.some((f) => f.path === "name")).toBe(true);
    }
  });
});

// ============================================
// SQL Injection Prevention Tests
// ============================================

describe("containsSqlInjection", () => {
  test("detects single quotes", () => {
    expect(containsSqlInjection("test'value")).toBe(true);
  });

  test("detects double quotes", () => {
    expect(containsSqlInjection('test"value')).toBe(true);
  });

  test("detects SQL comments", () => {
    expect(containsSqlInjection("test -- comment")).toBe(true);
  });

  test("detects semicolon", () => {
    expect(containsSqlInjection("test; DROP TABLE")).toBe(true);
  });

  test("detects OR keyword", () => {
    expect(containsSqlInjection("1 OR 1=1")).toBe(true);
  });

  test("detects DROP keyword", () => {
    expect(containsSqlInjection("DROP TABLE users")).toBe(true);
  });

  test("returns false for safe input", () => {
    expect(containsSqlInjection("normal input")).toBe(false);
    expect(containsSqlInjection("AAPL")).toBe(false);
    expect(containsSqlInjection("123")).toBe(false);
  });
});

describe("safeString", () => {
  test("accepts safe strings", () => {
    const validator = safeString();
    expect(validator.parse("Hello World")).toBe("Hello World");
  });

  test("rejects SQL injection attempts", () => {
    const validator = safeString();
    expect(() => validator.parse("test' OR 1=1")).toThrow();
  });

  test("enforces min length", () => {
    const validator = safeString(5);
    expect(() => validator.parse("abc")).toThrow();
  });

  test("enforces max length", () => {
    const validator = safeString(0, 10);
    expect(() => validator.parse("this string is too long")).toThrow();
  });
});

describe("safeTickerSymbol", () => {
  test("accepts valid ticker symbols", () => {
    const validator = safeTickerSymbol();
    expect(validator.parse("AAPL")).toBe("AAPL");
    expect(validator.parse("SPY")).toBe("SPY");
    expect(validator.parse("BRK")).toBe("BRK");
  });

  test("rejects lowercase symbols", () => {
    const validator = safeTickerSymbol();
    expect(() => validator.parse("aapl")).toThrow();
  });

  test("rejects symbols with special characters", () => {
    const validator = safeTickerSymbol();
    expect(() => validator.parse("AAPL'--")).toThrow();
    expect(() => validator.parse("SPY;DROP")).toThrow();
  });

  test("rejects empty string", () => {
    const validator = safeTickerSymbol();
    expect(() => validator.parse("")).toThrow();
  });
});

describe("sanitizeString", () => {
  test("escapes single quotes", () => {
    const result = sanitizeString("O'Brien");
    expect(result).toBe("O''Brien");
  });

  test("escapes double quotes", () => {
    const result = sanitizeString('Say "hello"');
    expect(result).toBe('Say ""hello""');
  });

  test("removes semicolons", () => {
    const result = sanitizeString("test; DROP TABLE;");
    expect(result).toBe("test DROP TABLE");
  });

  test("removes SQL comments", () => {
    const result = sanitizeString("test -- comment");
    expect(result).toBe("test  comment");
  });

  test("removes block comments", () => {
    const result = sanitizeString("test /* comment */");
    expect(result).toBe("test  comment ");
  });
});

// ============================================
// Coercion Tests
// ============================================

describe("coerceInt", () => {
  test("parses number", () => {
    const validator = coerceInt();
    expect(validator.parse(42)).toBe(42);
  });

  test("parses string number", () => {
    const validator = coerceInt();
    expect(validator.parse("42")).toBe(42);
  });

  test("floors decimal numbers", () => {
    const validator = coerceInt();
    expect(validator.parse(42.9)).toBe(42);
  });

  test("returns default for undefined", () => {
    const validator = coerceInt(10);
    expect(validator.parse(undefined)).toBe(10);
  });

  test("returns default for null", () => {
    const validator = coerceInt(10);
    expect(validator.parse(null)).toBe(10);
  });

  test("returns default for empty string", () => {
    const validator = coerceInt(10);
    expect(validator.parse("")).toBe(10);
  });

  test("returns default for NaN", () => {
    const validator = coerceInt(10);
    expect(validator.parse("not-a-number")).toBe(10);
  });

  test("returns 0 when no default provided", () => {
    const validator = coerceInt();
    expect(validator.parse(undefined)).toBe(0);
  });
});

describe("coerceBool", () => {
  test("parses boolean true", () => {
    const validator = coerceBool();
    expect(validator.parse(true)).toBe(true);
  });

  test("parses boolean false", () => {
    const validator = coerceBool();
    expect(validator.parse(false)).toBe(false);
  });

  test("parses string 'true'", () => {
    const validator = coerceBool();
    expect(validator.parse("true")).toBe(true);
  });

  test("parses string 'false'", () => {
    const validator = coerceBool();
    expect(validator.parse("false")).toBe(false);
  });

  test("parses string '1' as true", () => {
    const validator = coerceBool();
    expect(validator.parse("1")).toBe(true);
  });

  test("parses string '0' as false", () => {
    const validator = coerceBool();
    expect(validator.parse("0")).toBe(false);
  });

  test("parses string 'yes' as true", () => {
    const validator = coerceBool();
    expect(validator.parse("yes")).toBe(true);
  });

  test("parses string 'no' as false", () => {
    const validator = coerceBool();
    expect(validator.parse("no")).toBe(false);
  });

  test("parses empty string as false", () => {
    const validator = coerceBool();
    expect(validator.parse("")).toBe(false);
  });

  test("parses number 0 as false", () => {
    const validator = coerceBool();
    expect(validator.parse(0)).toBe(false);
  });

  test("parses non-zero number as true", () => {
    const validator = coerceBool();
    expect(validator.parse(42)).toBe(true);
  });

  test("returns default for undefined", () => {
    const validator = coerceBool(true);
    expect(validator.parse(undefined)).toBe(true);
  });

  test("returns default for null", () => {
    const validator = coerceBool(true);
    expect(validator.parse(null)).toBe(true);
  });

  test("coerces object to boolean", () => {
    const validator = coerceBool();
    expect(validator.parse({})).toBe(true);
  });
});

describe("coerceDate", () => {
  test("parses Date object", () => {
    const validator = coerceDate();
    const date = new Date("2026-01-05");
    const result = validator.parse(date);
    expect(result.getTime()).toBe(date.getTime());
  });

  test("parses ISO string", () => {
    const validator = coerceDate();
    const result = validator.parse("2026-01-05T00:00:00Z");
    expect(result instanceof Date).toBe(true);
    expect(result.toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });

  test("parses timestamp number", () => {
    const validator = coerceDate();
    const timestamp = 1735689600000; // 2025-01-01
    const result = validator.parse(timestamp);
    expect(result instanceof Date).toBe(true);
  });

  test("returns invalid date for non-date input", () => {
    const validator = coerceDate();
    expect(() => validator.parse({})).toThrow();
  });
});

// ============================================
// Schema Composition Tests
// ============================================

describe("partialExcept", () => {
  test("makes non-required fields optional", () => {
    const schema = z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    });

    const partial = partialExcept(schema, ["id"]);

    // id is required, name and age are optional
    expect(() => partial.parse({ id: "123" })).not.toThrow();
    expect(() => partial.parse({})).toThrow();
  });

  test("keeps multiple required fields", () => {
    const schema = z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    });

    const partial = partialExcept(schema, ["id", "name"]);

    expect(() => partial.parse({ id: "123", name: "Test" })).not.toThrow();
    expect(() => partial.parse({ id: "123" })).toThrow();
  });
});

describe("withTimestamps", () => {
  test("adds createdAt and updatedAt fields", () => {
    const schema = z.object({ name: z.string() });
    const withTs = withTimestamps(schema);

    const result = withTs.parse({
      name: "Test",
      createdAt: "2026-01-05T00:00:00Z",
      updatedAt: "2026-01-05T00:00:00Z",
    });

    expect(result.createdAt).toBe("2026-01-05T00:00:00Z");
    expect(result.updatedAt).toBe("2026-01-05T00:00:00Z");
  });

  test("requires timestamp fields", () => {
    const schema = z.object({ name: z.string() });
    const withTs = withTimestamps(schema);

    expect(() => withTs.parse({ name: "Test" })).toThrow();
  });
});

describe("withSoftDelete", () => {
  test("adds optional deletedAt field", () => {
    const schema = z.object({ name: z.string() });
    const withDel = withSoftDelete(schema);

    const result = withDel.parse({ name: "Test" });
    expect(result.deletedAt).toBeUndefined();
  });

  test("accepts deletedAt timestamp", () => {
    const schema = z.object({ name: z.string() });
    const withDel = withSoftDelete(schema);

    const result = withDel.parse({
      name: "Test",
      deletedAt: "2026-01-05T00:00:00Z",
    });

    expect(result.deletedAt).toBe("2026-01-05T00:00:00Z");
  });

  test("accepts null deletedAt", () => {
    const schema = z.object({ name: z.string() });
    const withDel = withSoftDelete(schema);

    const result = withDel.parse({
      name: "Test",
      deletedAt: null,
    });

    expect(result.deletedAt).toBeNull();
  });
});
