import { describe, expect, it } from "bun:test";

import { parseWithRetry } from "../llm-parsing";
import { SimpleSchema } from "./fixtures";

describe("parseWithRetry - malformed JSON", () => {
	it("retries once and succeeds on second attempt", async () => {
		const invalidInput = '{ "name": "test", value: 42 }';
		const validInput = JSON.stringify({ name: "test", value: 42 });

		let callCount = 0;
		const retryCallback = async (_prompt: string): Promise<string> => {
			callCount++;
			return validInput;
		};

		const result = await parseWithRetry(invalidInput, SimpleSchema, {
			retryCallback,
			taskContext: "Parse simple object",
		});

		expect(result.success).toBe(true);
		expect(result.attempts.length).toBe(2);
		const firstAttempt = result.attempts[0];
		const secondAttempt = result.attempts[1];
		expect(firstAttempt).toBeDefined();
		expect(secondAttempt).toBeDefined();
		expect(firstAttempt?.success).toBe(false);
		expect(secondAttempt?.success).toBe(true);
		expect(callCount).toBe(1);
	});

	it("fails after exactly two attempts", async () => {
		const retryCallback = async (_prompt: string): Promise<string> => "still not json";
		const result = await parseWithRetry("not json at all", SimpleSchema, {
			retryCallback,
			taskContext: "Parse simple object",
		});

		expect(result.success).toBe(false);
		expect(result.attempts.length).toBe(2);
		const firstAttempt = result.attempts[0];
		const secondAttempt = result.attempts[1];
		expect(firstAttempt).toBeDefined();
		expect(secondAttempt).toBeDefined();
		expect(firstAttempt?.success).toBe(false);
		expect(secondAttempt?.success).toBe(false);
		expect(result.finalError).toBeDefined();
	});
});

describe("parseWithRetry - malformed JSON", () => {
	it("fails immediately without retry callback", async () => {
		const result = await parseWithRetry("not json", SimpleSchema);

		expect(result.success).toBe(false);
		expect(result.attempts.length).toBe(1);
		expect(result.finalError).toBeDefined();
	});

	it("does not retry more than once (no infinite loops)", async () => {
		let retryCount = 0;
		const retryCallback = async (_prompt: string): Promise<string> => {
			retryCount++;
			return "invalid json";
		};

		const result = await parseWithRetry("bad json", SimpleSchema, {
			retryCallback,
		});

		expect(result.success).toBe(false);
		expect(retryCount).toBe(1);
		expect(result.attempts.length).toBe(2);
	});
});
