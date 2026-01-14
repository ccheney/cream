/**
 * LLM Output Parsing Tests
 *
 * Tests for JSON parsing with retry logic for malformed LLM outputs.
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
	type AgentType,
	allowsSkipOnFailure,
	cleanLLMOutput,
	formatJsonParseError,
	formatZodErrorString,
	formatZodErrors,
	generateRetryPrompt,
	type ParseLogger,
	parseOnce,
	parseWithRetry,
	redactSensitiveData,
	requiresRejectionOnFailure,
} from "./llm-parsing";

// ============================================
// Test Schemas
// ============================================

const SimpleSchema = z.object({
	name: z.string(),
	value: z.number(),
});

const ComplexSchema = z.object({
	action: z.enum(["BUY", "SELL", "HOLD"]),
	symbol: z.string().min(1),
	quantity: z.number().int().positive(),
	confidence: z.number().min(0).max(1),
	rationale: z.string().min(10),
	nested: z
		.object({
			level: z.number(),
			tags: z.array(z.string()),
		})
		.optional(),
});

const _ApprovalSchema = z.object({
	decision: z.enum(["APPROVE", "REJECT"]),
	reason: z.string(),
});

// ============================================
// Mock Logger
// ============================================

function createMockLogger(): ParseLogger & { calls: Record<string, unknown[][]> } {
	const calls: Record<string, unknown[][]> = {
		debug: [],
		info: [],
		warn: [],
		error: [],
	};

	return {
		calls,
		debug: (message, data) => calls.debug.push([message, data]),
		info: (message, data) => calls.info.push([message, data]),
		warn: (message, data) => calls.warn.push([message, data]),
		error: (message, data) => calls.error.push([message, data]),
	};
}

// ============================================
// Valid JSON Tests
// ============================================

describe("parseWithRetry - valid JSON", () => {
	it("succeeds on first attempt with valid JSON", async () => {
		const input = JSON.stringify({ name: "test", value: 42 });
		const result = await parseWithRetry(input, SimpleSchema);

		expect(result.success).toBe(true);
		expect(result.data).toEqual({ name: "test", value: 42 });
		expect(result.attempts.length).toBe(1);
		expect(result.attempts[0].attemptNumber).toBe(1);
		expect(result.attempts[0].success).toBe(true);
		expect(result.agentAction).toBe("SUCCESS");
	});

	it("succeeds with complex nested schema", async () => {
		const input = JSON.stringify({
			action: "BUY",
			symbol: "AAPL",
			quantity: 100,
			confidence: 0.85,
			rationale: "Strong momentum with volume confirmation",
			nested: {
				level: 2,
				tags: ["momentum", "breakout"],
			},
		});

		const result = await parseWithRetry(input, ComplexSchema);

		expect(result.success).toBe(true);
		expect(result.data?.action).toBe("BUY");
		expect(result.data?.nested?.tags).toEqual(["momentum", "breakout"]);
	});
});

// ============================================
// Malformed JSON Tests (Retry Behavior)
// ============================================

describe("parseWithRetry - malformed JSON", () => {
	it("retries once and succeeds on second attempt", async () => {
		const invalidInput = '{ "name": "test", value: 42 }'; // Missing quotes around value
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
		expect(result.attempts[0].success).toBe(false);
		expect(result.attempts[1].success).toBe(true);
		expect(callCount).toBe(1);
	});

	it("fails after exactly two attempts", async () => {
		const invalidInput = "not json at all";
		const stillInvalidInput = "still not json";

		const retryCallback = async (_prompt: string): Promise<string> => {
			return stillInvalidInput;
		};

		const result = await parseWithRetry(invalidInput, SimpleSchema, {
			retryCallback,
			taskContext: "Parse simple object",
		});

		expect(result.success).toBe(false);
		expect(result.attempts.length).toBe(2);
		expect(result.attempts[0].success).toBe(false);
		expect(result.attempts[1].success).toBe(false);
		expect(result.finalError).toBeDefined();
	});

	it("fails immediately without retry callback", async () => {
		const invalidInput = "not json";

		const result = await parseWithRetry(invalidInput, SimpleSchema);

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
		expect(retryCount).toBe(1); // Only one retry attempt
		expect(result.attempts.length).toBe(2); // Original + 1 retry = 2 total
	});
});

// ============================================
// Schema Validation Error Tests
// ============================================

describe("parseWithRetry - schema validation errors", () => {
	it("retries on missing required fields", async () => {
		const missingFields = JSON.stringify({ name: "test" }); // Missing value
		const complete = JSON.stringify({ name: "test", value: 42 });

		const retryCallback = async (prompt: string): Promise<string> => {
			expect(prompt).toContain("Error:");
			return complete;
		};

		const result = await parseWithRetry(missingFields, SimpleSchema, {
			retryCallback,
		});

		expect(result.success).toBe(true);
		expect(result.attempts[0].success).toBe(false);
		expect(result.attempts[0].zodErrors).toBeDefined();
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
		expect(result.attempts[0].zodErrors?.[0].path).toBe("value");
	});

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

		const retryCallback = async (_prompt: string): Promise<string> => validEnum;

		const result = await parseWithRetry(invalidEnum, ComplexSchema, {
			retryCallback,
		});

		expect(result.success).toBe(true);
		expect(result.attempts[0].zodErrors).toBeDefined();
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
		expect(result.attempts[0].zodErrors).toBeDefined();
		expect(result.attempts[0].zodErrors?.[0].path).toContain("nested");
	});
});

// ============================================
// Agent-Specific Handling Tests
// ============================================

describe("parseWithRetry - agent-specific handling", () => {
	it("returns REJECT for RiskManagerAgent on failure", async () => {
		const result = await parseWithRetry("invalid", SimpleSchema, {
			agentType: "RiskManagerAgent",
		});

		expect(result.success).toBe(false);
		expect(result.agentAction).toBe("REJECT");
	});

	it("returns REJECT for CriticAgent on failure", async () => {
		const result = await parseWithRetry("invalid", SimpleSchema, {
			agentType: "CriticAgent",
		});

		expect(result.success).toBe(false);
		expect(result.agentAction).toBe("REJECT");
	});

	it("returns REJECT for TraderAgent on failure", async () => {
		const result = await parseWithRetry("invalid", SimpleSchema, {
			agentType: "TraderAgent",
		});

		expect(result.success).toBe(false);
		expect(result.agentAction).toBe("REJECT");
	});

	it("returns SKIP for research agents on failure", async () => {
		const researchAgents: AgentType[] = [
			"TechnicalAnalyst",
			"NewsSentimentAnalyst",
			"FundamentalsMacroAnalyst",
			"BullishResearchAgent",
			"BearishResearchAgent",
		];

		for (const agentType of researchAgents) {
			const result = await parseWithRetry("invalid", SimpleSchema, {
				agentType,
			});

			expect(result.success).toBe(false);
			expect(result.agentAction).toBe("SKIP");
		}
	});

	it("returns SUCCESS for all agents when parse succeeds", async () => {
		const allAgents: AgentType[] = ["TechnicalAnalyst", "RiskManagerAgent", "TraderAgent"];

		for (const agentType of allAgents) {
			const result = await parseWithRetry('{"name":"test","value":1}', SimpleSchema, {
				agentType,
			});

			expect(result.success).toBe(true);
			expect(result.agentAction).toBe("SUCCESS");
		}
	});
});

// ============================================
// Logging Tests
// ============================================

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

		// Should have logged the retry
		const retryLogs = logger.calls.info.filter(
			(call) => typeof call[0] === "string" && call[0].includes("retry")
		);
		expect(retryLogs.length).toBeGreaterThan(0);
	});

	it("redacts sensitive data in logs", async () => {
		const logger = createMockLogger();
		const sensitiveInput = '{"apiKey": "sk-1234567890abcdef", "name": "test"}';

		await parseWithRetry(sensitiveInput, SimpleSchema, {
			logger,
			redactSecrets: true,
		});

		// Check that logged output is redacted
		const warnCalls = logger.calls.warn;
		for (const call of warnCalls) {
			if (call[1] && typeof call[1] === "object" && "rawOutput" in (call[1] as object)) {
				expect((call[1] as { rawOutput: string }).rawOutput).not.toContain("sk-1234567890");
			}
		}
	});
});

// ============================================
// Retry Prompt Generation Tests
// ============================================

describe("generateRetryPrompt", () => {
	it("includes original task context", () => {
		const prompt = generateRetryPrompt(
			"Generate trading decision",
			"Missing field: action",
			"DecisionPlan schema"
		);

		expect(prompt).toContain("Generate trading decision");
	});

	it("includes error details", () => {
		const prompt = generateRetryPrompt("Task", "value: Expected number, received string", "Schema");

		expect(prompt).toContain("Expected number");
		expect(prompt).toContain("received string");
	});

	it("includes schema description", () => {
		const prompt = generateRetryPrompt(
			"Task",
			"Error",
			"a valid JSON object with action and symbol"
		);

		expect(prompt).toContain("action and symbol");
	});

	it("includes JSON format instructions", () => {
		const prompt = generateRetryPrompt("Task", "Error", "Schema");

		expect(prompt).toContain("valid JSON");
		expect(prompt).toContain("required fields");
	});
});

// ============================================
// Error Formatting Tests
// ============================================

describe("formatZodErrors", () => {
	it("formats missing field errors", () => {
		const result = SimpleSchema.safeParse({ name: "test" });
		if (result.success) {
			throw new Error("Expected failure");
		}

		const formatted = formatZodErrors(result.error);

		expect(formatted.length).toBe(1);
		expect(formatted[0].path).toBe("value");
		expect(formatted[0].message).toBeDefined();
	});

	it("formats type mismatch errors", () => {
		const result = SimpleSchema.safeParse({ name: "test", value: "not number" });
		if (result.success) {
			throw new Error("Expected failure");
		}

		const formatted = formatZodErrors(result.error);

		expect(formatted[0].expected).toBe("number");
		// Zod v4 includes received type info in message, but received field may vary
		expect(formatted[0].message).toContain("number");
	});

	it("formats enum errors", () => {
		const EnumSchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });
		const result = EnumSchema.safeParse({ status: "INVALID" });
		if (result.success) {
			throw new Error("Expected failure");
		}

		const formatted = formatZodErrors(result.error);

		// Zod v4 includes options in message, expected may be extracted from message
		expect(formatted[0].message).toContain("OPEN");
		expect(formatted[0].message).toContain("CLOSED");
	});

	it("formats nested path errors", () => {
		const NestedSchema = z.object({
			outer: z.object({
				inner: z.object({
					value: z.number(),
				}),
			}),
		});

		const result = NestedSchema.safeParse({
			outer: { inner: { value: "not number" } },
		});
		if (result.success) {
			throw new Error("Expected failure");
		}

		const formatted = formatZodErrors(result.error);

		expect(formatted[0].path).toBe("outer.inner.value");
	});
});

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

		// Zod v4 format: "Invalid input: expected string, received number"
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
		} catch (e) {
			error = e as Error;
		}

		expect(error).toBeDefined();
		const formatted = formatJsonParseError(error!, input);

		expect(formatted).toContain("syntax error");
	});

	it("handles non-syntax errors", () => {
		const formatted = formatJsonParseError(new Error("Unknown error"), "{}");

		expect(formatted).toContain("parse error");
	});
});

// ============================================
// Output Cleaning Tests
// ============================================

describe("cleanLLMOutput", () => {
	it("removes markdown code blocks", () => {
		const input = '```json\n{"name": "test"}\n```';
		const cleaned = cleanLLMOutput(input);

		expect(cleaned).toBe('{"name": "test"}');
	});

	it("removes code blocks without language", () => {
		const input = '```\n{"value": 42}\n```';
		const cleaned = cleanLLMOutput(input);

		expect(cleaned).toBe('{"value": 42}');
	});

	it("extracts JSON from surrounding text", () => {
		const input = 'Here is the JSON:\n{"name": "test"}\nEnd of response';
		const cleaned = cleanLLMOutput(input);

		expect(cleaned).toBe('{"name": "test"}');
	});

	it("handles arrays", () => {
		const input = "Array: [1, 2, 3]";
		const cleaned = cleanLLMOutput(input);

		expect(cleaned).toBe("[1, 2, 3]");
	});

	it("preserves valid JSON as-is", () => {
		const input = '{"name": "test", "value": 42}';
		const cleaned = cleanLLMOutput(input);

		expect(cleaned).toBe(input);
	});
});

// ============================================
// Secret Redaction Tests
// ============================================

describe("redactSensitiveData", () => {
	it("redacts API keys", () => {
		const input = '{"api_key": "sk-1234567890abcdefghij"}';
		const redacted = redactSensitiveData(input);

		expect(redacted).toContain("[REDACTED]");
		expect(redacted).not.toContain("sk-1234567890");
	});

	it("redacts Bearer tokens", () => {
		const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test";
		const redacted = redactSensitiveData(input);

		expect(redacted).toContain("[REDACTED]");
		expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
	});

	it("redacts AWS access keys", () => {
		const input = "AWS_ACCESS_KEY: AKIAIOSFODNN7EXAMPLE";
		const redacted = redactSensitiveData(input);

		expect(redacted).toContain("[REDACTED]");
	});

	it("redacts passwords", () => {
		const input = '{"password": "supersecret123"}';
		const redacted = redactSensitiveData(input);

		expect(redacted).toContain("[REDACTED]");
		expect(redacted).not.toContain("supersecret123");
	});

	it("preserves non-sensitive data", () => {
		const input = '{"name": "test", "value": 42}';
		const redacted = redactSensitiveData(input);

		expect(redacted).toBe(input);
	});
});

// ============================================
// Agent Type Helper Tests
// ============================================

describe("requiresRejectionOnFailure", () => {
	it("returns true for critical agents", () => {
		expect(requiresRejectionOnFailure("RiskManagerAgent")).toBe(true);
		expect(requiresRejectionOnFailure("CriticAgent")).toBe(true);
		expect(requiresRejectionOnFailure("TraderAgent")).toBe(true);
	});

	it("returns false for research agents", () => {
		expect(requiresRejectionOnFailure("TechnicalAnalyst")).toBe(false);
		expect(requiresRejectionOnFailure("BullishResearchAgent")).toBe(false);
	});
});

describe("allowsSkipOnFailure", () => {
	it("returns true for research agents", () => {
		expect(allowsSkipOnFailure("TechnicalAnalyst")).toBe(true);
		expect(allowsSkipOnFailure("NewsSentimentAnalyst")).toBe(true);
		expect(allowsSkipOnFailure("FundamentalsMacroAnalyst")).toBe(true);
		expect(allowsSkipOnFailure("BullishResearchAgent")).toBe(true);
		expect(allowsSkipOnFailure("BearishResearchAgent")).toBe(true);
	});

	it("returns false for critical agents", () => {
		expect(allowsSkipOnFailure("RiskManagerAgent")).toBe(false);
		expect(allowsSkipOnFailure("CriticAgent")).toBe(false);
		expect(allowsSkipOnFailure("TraderAgent")).toBe(false);
	});
});

// ============================================
// parseOnce (Synchronous) Tests
// ============================================

describe("parseOnce", () => {
	it("succeeds with valid JSON", () => {
		const result = parseOnce('{"name":"test","value":1}', SimpleSchema);

		expect(result.success).toBe(true);
		expect(result.data).toEqual({ name: "test", value: 1 });
		expect(result.attempts.length).toBe(1);
	});

	it("fails with invalid JSON (no retry)", () => {
		const result = parseOnce("invalid", SimpleSchema);

		expect(result.success).toBe(false);
		expect(result.attempts.length).toBe(1);
		expect(result.finalError).toBeDefined();
	});

	it("respects agent type for failure action", () => {
		const result = parseOnce("invalid", SimpleSchema, {
			agentType: "RiskManagerAgent",
		});

		expect(result.agentAction).toBe("REJECT");
	});
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
	it("handles empty string input", async () => {
		const result = await parseWithRetry("", SimpleSchema);

		expect(result.success).toBe(false);
		expect(result.attempts[0].error).toBeDefined();
	});

	it("handles whitespace-only input", async () => {
		const result = await parseWithRetry("   \n\t  ", SimpleSchema);

		expect(result.success).toBe(false);
	});

	it("handles null in JSON", async () => {
		const NullableSchema = z.object({
			name: z.string(),
			optional: z.number().nullable(),
		});

		const result = await parseWithRetry('{"name":"test","optional":null}', NullableSchema);

		expect(result.success).toBe(true);
		expect(result.data?.optional).toBeNull();
	});

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
