import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { formatZodErrors } from "../llm-parsing";
import { SimpleSchema } from "./fixtures";

describe("formatZodErrors", () => {
	it("formats missing field errors", () => {
		const result = SimpleSchema.safeParse({ name: "test" });
		if (result.success) {
			throw new Error("Expected failure");
		}

		const formatted = formatZodErrors(result.error);

		expect(formatted.length).toBe(1);
		const firstFormatted = formatted[0];
		expect(firstFormatted).toBeDefined();
		expect(firstFormatted?.path).toBe("value");
		expect(firstFormatted?.message).toBeDefined();
	});

	it("formats type mismatch errors", () => {
		const result = SimpleSchema.safeParse({ name: "test", value: "not number" });
		if (result.success) {
			throw new Error("Expected failure");
		}

		const formatted = formatZodErrors(result.error);

		const firstFormatted = formatted[0];
		expect(firstFormatted).toBeDefined();
		expect(firstFormatted?.expected).toBe("number");
		expect(firstFormatted?.message).toContain("number");
	});
});

describe("formatZodErrors", () => {
	it("formats enum errors", () => {
		const enumSchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });
		const result = enumSchema.safeParse({ status: "INVALID" });
		if (result.success) {
			throw new Error("Expected failure");
		}

		const formatted = formatZodErrors(result.error);

		const firstFormatted = formatted[0];
		expect(firstFormatted).toBeDefined();
		expect(firstFormatted?.message).toContain("OPEN");
		expect(firstFormatted?.message).toContain("CLOSED");
	});

	it("formats nested path errors", () => {
		const nestedSchema = z.object({
			outer: z.object({
				inner: z.object({
					value: z.number(),
				}),
			}),
		});

		const result = nestedSchema.safeParse({
			outer: { inner: { value: "not number" } },
		});
		if (result.success) {
			throw new Error("Expected failure");
		}

		const formatted = formatZodErrors(result.error);
		const firstFormatted = formatted[0];
		expect(firstFormatted).toBeDefined();
		expect(firstFormatted?.path).toBe("outer.inner.value");
	});
});
