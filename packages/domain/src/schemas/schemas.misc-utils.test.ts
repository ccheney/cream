import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
	coerceBool,
	coerceInt,
	containsSqlInjection,
	createTypeGuard,
	safeString,
	sanitizeString,
	validateBatch,
	validated,
	validatedSafe,
} from "./index.js";

describe("containsSqlInjection", () => {
	it("detects SQL injection patterns", () => {
		expect(containsSqlInjection("'; DROP TABLE users; --")).toBe(true);
		expect(containsSqlInjection("1 OR 1=1")).toBe(true);
		expect(containsSqlInjection("admin'--")).toBe(true);
		expect(containsSqlInjection("SELECT * FROM users")).toBe(false);
	});

	it("accepts safe strings", () => {
		expect(containsSqlInjection("John Doe")).toBe(false);
		expect(containsSqlInjection("user@example.com")).toBe(false);
		expect(containsSqlInjection("AAPL")).toBe(false);
	});
});

describe("safeString", () => {
	it("rejects SQL injection attempts", () => {
		const safeName = safeString(1, 100);
		expect(() => safeName.parse("admin'; DROP TABLE users; --")).toThrow();
	});

	it("accepts safe strings", () => {
		const safeName = safeString(1, 100);
		expect(safeName.parse("John Doe")).toBe("John Doe");
	});
});

describe("sanitizeString", () => {
	it("escapes dangerous characters", () => {
		expect(sanitizeString("O'Brien")).toBe("O''Brien");
		expect(sanitizeString('Say "Hello"')).toBe('Say ""Hello""');
		expect(sanitizeString("DROP; TABLE")).toBe("DROP TABLE");
	});
});

describe("validated", () => {
	it("validates before executing function", async () => {
		const schema = z.object({ value: z.number().positive() });
		const fn = validated(schema, (data) => data.value * 2);
		expect(await fn({ value: 5 })).toBe(10);
		await expect(fn({ value: -5 })).rejects.toThrow();
	});
});

describe("validatedSafe", () => {
	it("returns result instead of throwing", async () => {
		const schema = z.object({ value: z.number().positive() });
		const fn = validatedSafe(schema, (data) => data.value * 2);

		const successResult = await fn({ value: 5 });
		expect(successResult.success).toBe(true);
		if (successResult.success) {
			expect(successResult.data).toBe(10);
		}

		const errorResult = await fn({ value: -5 });
		expect(errorResult.success).toBe(false);
	});
});

describe("validateBatch", () => {
	it("separates valid and invalid items", () => {
		const schema = z.object({ value: z.number().positive() });
		const items = [{ value: 1 }, { value: -1 }, { value: 2 }, { value: -2 }];
		const result = validateBatch(schema, items);
		expect(result.valid.length).toBe(2);
		expect(result.invalid.length).toBe(2);
		expect(result.invalid[0].index).toBe(1);
		expect(result.invalid[1].index).toBe(3);
	});
});

describe("createTypeGuard", () => {
	it("creates a working type guard", () => {
		const schema = z.object({ name: z.string() });
		const isValid = createTypeGuard(schema);
		expect(isValid({ name: "test" })).toBe(true);
		expect(isValid({ name: 123 })).toBe(false);
		expect(isValid(null)).toBe(false);
	});
});

describe("coerceInt", () => {
	it("coerces string to int", () => {
		const schema = z.object({ page: coerceInt(1) });
		expect(schema.parse({ page: "5" }).page).toBe(5);
	});

	it("uses default for NaN", () => {
		const schema = z.object({ page: coerceInt(1) });
		expect(schema.parse({ page: "not-a-number" }).page).toBe(1);
	});
});

describe("coerceBool", () => {
	it("coerces supported values to boolean", () => {
		const schema = z.object({ active: coerceBool(false) });
		expect(schema.parse({ active: "true" }).active).toBe(true);
		expect(schema.parse({ active: "false" }).active).toBe(false);
		expect(schema.parse({ active: 1 }).active).toBe(true);
		expect(schema.parse({ active: 0 }).active).toBe(false);
	});
});
