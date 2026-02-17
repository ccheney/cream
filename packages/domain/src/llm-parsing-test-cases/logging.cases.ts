import { describe, expect, it } from "bun:test";

import { parseWithRetry } from "../llm-parsing";
import { createMockLogger, SimpleSchema } from "./fixtures";

describe("parseWithRetry - logging", () => {
	it("logs all parse attempts", async () => {
		const logger = createMockLogger();

		await parseWithRetry("invalid", SimpleSchema, {
			logger,
		});

		expect(logger.calls.info.length).toBeGreaterThan(0);
		expect(logger.calls.warn.length).toBeGreaterThan(0);
		expect(logger.calls.error.length).toBeGreaterThan(0);
	});

	it("logs retry attempt", async () => {
		const logger = createMockLogger();
		const retryCallback = async (_prompt: string) => '{"name":"test","value":1}';

		await parseWithRetry("invalid", SimpleSchema, {
			logger,
			retryCallback,
		});

		const retryLogs = logger.calls.info.filter(
			(call) => typeof call[0] === "string" && call[0].includes("retry"),
		);
		expect(retryLogs.length).toBeGreaterThan(0);
	});
});

describe("parseWithRetry - logging", () => {
	it("redacts sensitive data in logs", async () => {
		const logger = createMockLogger();
		const sensitiveInput = '{"apiKey": "sk-1234567890abcdef", "name": "test"}';

		await parseWithRetry(sensitiveInput, SimpleSchema, {
			logger,
			redactSecrets: true,
		});

		const warnCalls = logger.calls.warn;
		for (const call of warnCalls) {
			if (call[1] && typeof call[1] === "object" && "rawOutput" in (call[1] as object)) {
				expect((call[1] as { rawOutput: string }).rawOutput).not.toContain("sk-1234567890");
			}
		}
	});
});
