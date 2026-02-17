import { describe, expect, it } from "bun:test";

import { formatJsonParseError, formatZodErrorString } from "../llm-parsing";
import { SimpleSchema } from "./fixtures";

describe("formatZodErrorString", () => {
	it("creates single-line error string", () => {
		const result = SimpleSchema.safeParse({});
		if (result.success) {
			throw new Error("Expected failure");
		}

		const errorString = formatZodErrorString(result.error);

		expect(typeof errorString).toBe("string");
		expect(errorString.length).toBeGreaterThan(0);
	});

	it("includes type information", () => {
		const result = SimpleSchema.safeParse({ name: 123, value: "str" });
		if (result.success) {
			throw new Error("Expected failure");
		}

		const errorString = formatZodErrorString(result.error);

		expect(errorString).toContain("expected");
		expect(errorString).toContain("received");
	});
});

describe("formatJsonParseError", () => {
	it("extracts position from syntax error", () => {
		const input = '{"name": "test", value: 42}';
		let error: Error | undefined;

		try {
			JSON.parse(input);
		} catch (parseError) {
			error = parseError as Error;
		}

		expect(error).toBeDefined();
		if (!error) {
			throw new Error("Expected JSON parse error");
		}

		const formatted = formatJsonParseError(error, input);
		expect(formatted).toContain("syntax error");
	});

	it("handles non-syntax errors", () => {
		const formatted = formatJsonParseError(new Error("Unknown error"), "{}");
		expect(formatted).toContain("parse error");
	});
});
