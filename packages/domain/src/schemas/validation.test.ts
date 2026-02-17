/**
 * Tests for validation utilities.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	coerceDate,
	coerceInt,
	containsSqlInjection,
	formatValidationError,
	formatZodIssue,
	getErrorMessages,
	parseWithDefaults,
	safeParse,
	safeString,
	safeTickerSymbol,
	sanitizeString,
} from "./validation";

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
		expect(formatZodIssue(issue).path).toBe("user.age");
	});

	test("includes type information for type errors", () => {
		const issue: z.ZodIssue = {
			code: "invalid_type",
			expected: "number",
			received: "string",
			path: ["count"],
			message: "Expected number",
		};
		expect(formatZodIssue(issue).expected).toBeDefined();
	});
});

describe("formatValidationError", () => {
	test("formats multiple errors", () => {
		const schema = z.object({ name: z.string(), age: z.number() });

		try {
			schema.parse({});
		} catch (error) {
			if (error instanceof z.ZodError) {
				const formatted = formatValidationError(error);
				expect(formatted.type).toBe("validation_error");
				expect(formatted.fields.length).toBe(2);
				expect(formatted.fields.some((field) => field.path === "name")).toBe(true);
				expect(formatted.fields.some((field) => field.path === "age")).toBe(true);
			}
		}
	});
});

describe("getErrorMessages", () => {
	test("concatenates error messages", () => {
		const schema = z.object({ name: z.string(), age: z.number() });

		try {
			schema.parse({});
		} catch (error) {
			if (error instanceof z.ZodError) {
				const messages = getErrorMessages(error);
				expect(messages.includes("name")).toBe(true);
				expect(messages.includes("age")).toBe(true);
				expect(messages.includes(";")).toBe(true);
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
		const schema = z.object({ name: z.string(), count: z.number().default(10) });
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
			expect(result.error.fields.some((field) => field.path === "name")).toBe(true);
		}
	});
});

describe("containsSqlInjection", () => {
	test("detects common SQL patterns", () => {
		expect(containsSqlInjection("test'value")).toBe(true);
		expect(containsSqlInjection('test"value')).toBe(true);
		expect(containsSqlInjection("test -- comment")).toBe(true);
		expect(containsSqlInjection("test; DROP TABLE")).toBe(true);
		expect(containsSqlInjection("1 OR 1=1")).toBe(true);
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

	test("enforces min and max length", () => {
		expect(() => safeString(5).parse("abc")).toThrow();
		expect(() => safeString(0, 10).parse("this string is too long")).toThrow();
	});
});

describe("safeTickerSymbol", () => {
	test("accepts valid ticker symbols", () => {
		const validator = safeTickerSymbol();
		expect(validator.parse("AAPL")).toBe("AAPL");
		expect(validator.parse("SPY")).toBe("SPY");
		expect(validator.parse("BRK")).toBe("BRK");
	});

	test("rejects invalid ticker symbols", () => {
		const validator = safeTickerSymbol();
		expect(() => validator.parse("aapl")).toThrow();
		expect(() => validator.parse("AAPL'--")).toThrow();
		expect(() => validator.parse("SPY;DROP")).toThrow();
		expect(() => validator.parse("")).toThrow();
	});
});

describe("sanitizeString", () => {
	test("escapes and removes dangerous characters", () => {
		expect(sanitizeString("O'Brien")).toBe("O''Brien");
		expect(sanitizeString('Say "hello"')).toBe('Say ""hello""');
		expect(sanitizeString("test; DROP TABLE;")).toBe("test DROP TABLE");
		expect(sanitizeString("test -- comment")).toBe("test  comment");
		expect(sanitizeString("test /* comment */")).toBe("test  comment ");
	});
});

describe("coerceInt", () => {
	test("parses number and string inputs", () => {
		const validator = coerceInt();
		expect(validator.parse(42)).toBe(42);
		expect(validator.parse("42")).toBe(42);
		expect(validator.parse(42.9)).toBe(42);
	});

	test("uses defaults for nullish and invalid values", () => {
		const validatorWithDefault = coerceInt(10);
		expect(validatorWithDefault.parse(undefined)).toBe(10);
		expect(validatorWithDefault.parse(null)).toBe(10);
		expect(validatorWithDefault.parse("")).toBe(10);
		expect(validatorWithDefault.parse("not-a-number")).toBe(10);
		expect(coerceInt().parse(undefined)).toBe(0);
	});
});

describe("coerceDate", () => {
	test("parses Date object", () => {
		const validator = coerceDate();
		const date = new Date("2026-01-05");
		const result = validator.parse(date);
		expect(result.getTime()).toBe(date.getTime());
	});

	test("parses ISO strings and timestamps", () => {
		const validator = coerceDate();
		expect(validator.parse("2026-01-05T00:00:00Z").toISOString()).toBe("2026-01-05T00:00:00.000Z");
		expect(validator.parse(1735689600000)).toBeInstanceOf(Date);
	});

	test("throws for non-date input", () => {
		const validator = coerceDate();
		expect(() => validator.parse({})).toThrow();
	});
});
