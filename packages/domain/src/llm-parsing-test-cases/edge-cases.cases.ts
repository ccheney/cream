import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { parseWithRetry } from "../llm-parsing";
import { SimpleSchema } from "./fixtures";

describe("edge cases", () => {
	it("handles empty string input", async () => {
		const result = await parseWithRetry("", SimpleSchema);

		expect(result.success).toBe(false);
		const firstAttempt = result.attempts[0];
		expect(firstAttempt).toBeDefined();
		expect(firstAttempt?.error).toBeDefined();
	});

	it("handles whitespace-only input", async () => {
		const result = await parseWithRetry("   \n\t  ", SimpleSchema);

		expect(result.success).toBe(false);
	});

	it("handles null in JSON", async () => {
		const nullableSchema = z.object({
			name: z.string(),
			optional: z.number().nullable(),
		});

		const result = await parseWithRetry('{"name":"test","optional":null}', nullableSchema);

		expect(result.success).toBe(true);
		expect(result.data?.optional).toBeNull();
	});
});

describe("edge cases", () => {
	it("handles retry callback throwing error", async () => {
		const retryCallback = async (_prompt: string): Promise<string> => {
			throw new Error("Network failure");
		};

		const result = await parseWithRetry("invalid", SimpleSchema, {
			retryCallback,
		});

		expect(result.success).toBe(false);
		expect(result.finalError).toContain("Retry callback failed");
	});

	it("handles very long input", async () => {
		const longValue = "x".repeat(100000);
		const input = JSON.stringify({ name: longValue, value: 1 });

		const result = await parseWithRetry(input, SimpleSchema);

		expect(result.success).toBe(true);
		expect(result.data?.name.length).toBe(100000);
	});
});
