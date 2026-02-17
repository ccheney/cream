import { describe, expect, test } from "bun:test";

import { Iso8601Schema, Iso8601UtcSchema } from "../time";

describe("Iso8601Schema", () => {
	test("accepts valid ISO-8601 timestamp with Z timezone", () => {
		const result = Iso8601Schema.safeParse("2026-01-04T16:30:00Z");
		expect(result.success).toBe(true);
	});

	test("accepts valid ISO-8601 timestamp with offset", () => {
		const result = Iso8601Schema.safeParse("2026-01-04T10:30:00-06:00");
		expect(result.success).toBe(true);
	});

	test("rejects timestamp without timezone", () => {
		const result = Iso8601Schema.safeParse("2026-01-04T16:30:00");
		expect(result.success).toBe(false);
	});

	test("rejects invalid date format", () => {
		const result = Iso8601Schema.safeParse("2026/01/04 16:30:00");
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

	test("rejects non-UTC timestamp with offset", () => {
		const result = Iso8601UtcSchema.safeParse("2026-01-04T10:30:00-06:00");
		expect(result.success).toBe(false);
	});
});
