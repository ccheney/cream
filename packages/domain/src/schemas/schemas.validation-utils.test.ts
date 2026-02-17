import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
	formatValidationError,
	formatZodIssue,
	getErrorMessages,
	parseWithDefaults,
	safeParse,
} from "./index.js";

describe("formatValidationError", () => {
	it("formats Zod error correctly", () => {
		const schema = z.object({ name: z.string().min(1), age: z.number().positive() });
		const result = schema.safeParse({ name: "", age: -5 });
		expect(result.success).toBe(false);
		if (!result.success) {
			const formatted = formatValidationError(result.error);
			expect(formatted.type).toBe("validation_error");
			expect(formatted.fields.length).toBe(2);
			expect(formatted.timestamp).toBeDefined();
		}
	});
});

describe("formatZodIssue", () => {
	it("formats issue with path", () => {
		const schema = z.object({ user: z.object({ name: z.string() }) });
		const result = schema.safeParse({ user: { name: 123 } });
		expect(result.success).toBe(false);
		if (!result.success) {
			const formatted = formatZodIssue(result.error.issues[0]);
			expect(formatted.path).toBe("user.name");
			expect(formatted.code).toBe("invalid_type");
			expect(formatted.expected).toBe("string");
		}
	});
});

describe("getErrorMessages", () => {
	it("returns concatenated error messages", () => {
		const schema = z.object({ a: z.string(), b: z.number() });
		const result = schema.safeParse({ a: 123, b: "not a number" });
		expect(result.success).toBe(false);
		if (!result.success) {
			const messages = getErrorMessages(result.error);
			expect(messages).toContain("a:");
			expect(messages).toContain("b:");
		}
	});
});

describe("safeParse", () => {
	it("returns success with data for valid input", () => {
		const schema = z.object({ name: z.string() });
		const result = safeParse(schema, { name: "test" });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe("test");
		}
	});

	it("returns error for invalid input", () => {
		const schema = z.object({ name: z.string() });
		const result = safeParse(schema, { name: 123 });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.type).toBe("validation_error");
		}
	});
});

describe("parseWithDefaults", () => {
	it("applies default values", () => {
		const schema = z.object({ name: z.string(), count: z.number().default(10) });
		const result = parseWithDefaults(schema, { name: "test" });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.count).toBe(10);
		}
	});
});
