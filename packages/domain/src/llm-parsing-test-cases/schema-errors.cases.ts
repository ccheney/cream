import { describe, expect, it } from "bun:test";

import { parseWithRetry } from "../llm-parsing";
import { ComplexSchema, SimpleSchema } from "./fixtures";

describe("parseWithRetry - schema validation errors", () => {
	it("retries on missing required fields", async () => {
		const missingFields = JSON.stringify({ name: "test" });
		const complete = JSON.stringify({ name: "test", value: 42 });

		const retryCallback = async (prompt: string): Promise<string> => {
			expect(prompt).toContain("Error:");
			return complete;
		};

		const result = await parseWithRetry(missingFields, SimpleSchema, {
			retryCallback,
		});

		expect(result.success).toBe(true);
		const firstAttempt = result.attempts[0];
		expect(firstAttempt).toBeDefined();
		expect(firstAttempt?.success).toBe(false);
		expect(firstAttempt?.zodErrors).toBeDefined();
	});

	it("retries on type mismatch", async () => {
		const wrongType = JSON.stringify({ name: "test", value: "not a number" });
		const correct = JSON.stringify({ name: "test", value: 42 });

		let retryPrompt = "";
		const retryCallback = async (prompt: string): Promise<string> => {
			retryPrompt = prompt;
			return correct;
		};

		const result = await parseWithRetry(wrongType, SimpleSchema, {
			retryCallback,
		});

		expect(result.success).toBe(true);
		expect(retryPrompt).toContain("expected");
		const firstAttempt = result.attempts[0];
		const firstError = firstAttempt?.zodErrors?.[0];
		expect(firstAttempt).toBeDefined();
		expect(firstError).toBeDefined();
		expect(firstError?.path).toBe("value");
	});
});

describe("parseWithRetry - schema validation errors", () => {
	it("retries on invalid enum value", async () => {
		const invalidEnum = JSON.stringify({
			action: "INVALID",
			symbol: "AAPL",
			quantity: 100,
			confidence: 0.8,
			rationale: "Test rationale with enough characters",
		});
		const validEnum = JSON.stringify({
			action: "BUY",
			symbol: "AAPL",
			quantity: 100,
			confidence: 0.8,
			rationale: "Test rationale with enough characters",
		});

		const result = await parseWithRetry(invalidEnum, ComplexSchema, {
			retryCallback: async () => validEnum,
		});

		expect(result.success).toBe(true);
		const firstAttempt = result.attempts[0];
		expect(firstAttempt).toBeDefined();
		expect(firstAttempt?.zodErrors).toBeDefined();
	});

	it("provides clear nested path in errors", async () => {
		const invalidNested = JSON.stringify({
			action: "BUY",
			symbol: "AAPL",
			quantity: 100,
			confidence: 0.8,
			rationale: "Test rationale with enough characters",
			nested: {
				level: "not a number",
				tags: [],
			},
		});

		const result = await parseWithRetry(invalidNested, ComplexSchema);

		expect(result.success).toBe(false);
		const firstAttempt = result.attempts[0];
		const firstError = firstAttempt?.zodErrors?.[0];
		expect(firstAttempt).toBeDefined();
		expect(firstAttempt?.zodErrors).toBeDefined();
		expect(firstError).toBeDefined();
		expect(firstError?.path).toContain("nested");
	});
});
