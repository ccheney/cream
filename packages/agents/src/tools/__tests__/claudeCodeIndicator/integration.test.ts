/**
 * Integration tests for Claude Code Indicator with mock SDK
 *
 * Tests the implementIndicator function with dependency-injected mock SDK.
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "PAPER";

import { describe, expect, test } from "bun:test";
import type { SessionOptions } from "../../claudeCodeIndicator.js";
import { ImplementIndicatorInputSchema, implementIndicator } from "../../claudeCodeIndicator.js";
import { createMockHypothesis, createMockSDKProvider, mockExistingPatterns } from "./fixtures.js";

describe("implementIndicator with mock SDK", () => {
	test("returns SDK not installed error when SDK explicitly disabled", async () => {
		const result = await implementIndicator({
			hypothesis: createMockHypothesis(),
			existingPatterns: mockExistingPatterns,
			config: { sdkProvider: null },
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("Claude Agent SDK not installed");
	});

	test("creates session with correct options", async () => {
		const capturedOptions = { value: null as SessionOptions | null };
		const mockProvider = createMockSDKProvider({
			messages: [{ type: "assistant", session_id: "test-session" }],
			capturedOptions,
		});

		await implementIndicator({
			hypothesis: createMockHypothesis(),
			existingPatterns: mockExistingPatterns,
			config: { sdkProvider: mockProvider },
		});

		expect(capturedOptions.value).not.toBeNull();
		expect(capturedOptions.value?.model).toBe("claude-opus-4-5-20251101");
		expect(capturedOptions.value?.maxTurns).toBe(20);
		expect(capturedOptions.value?.allowedTools).toContain("Read");
		expect(capturedOptions.value?.allowedTools).toContain("Write");
		expect(capturedOptions.value?.allowedTools).toContain("Bash");
	});

	test("sends implementation prompt to session", async () => {
		const capturedPrompt = { value: null as string | null };
		const mockProvider = createMockSDKProvider({
			messages: [{ type: "assistant", session_id: "test-session" }],
			capturedPrompt,
		});

		await implementIndicator({
			hypothesis: createMockHypothesis(),
			existingPatterns: mockExistingPatterns,
			config: { sdkProvider: mockProvider },
		});

		expect(capturedPrompt.value).not.toBeNull();
		expect(capturedPrompt.value).toContain("sector_rotation_momentum");
		expect(capturedPrompt.value).toContain("packages/indicators/src/custom");
	});

	test("counts turns from assistant messages", async () => {
		const mockProvider = createMockSDKProvider({
			messages: [
				{ type: "assistant", session_id: "test-session" },
				{ type: "tool_use", session_id: "test-session" },
				{ type: "assistant", session_id: "test-session" },
				{ type: "tool_result", session_id: "test-session" },
				{ type: "assistant", session_id: "test-session" },
			],
		});

		const result = await implementIndicator({
			hypothesis: createMockHypothesis(),
			existingPatterns: mockExistingPatterns,
			config: { sdkProvider: mockProvider },
		});

		// turnsUsed should count only assistant messages (3)
		expect(result.turnsUsed).toBe(3);
	});

	test("respects config overrides", async () => {
		const capturedOptions = { value: null as SessionOptions | null };
		const mockProvider = createMockSDKProvider({
			messages: [{ type: "assistant", session_id: "test-session" }],
			capturedOptions,
		});

		await implementIndicator({
			hypothesis: createMockHypothesis(),
			existingPatterns: mockExistingPatterns,
			config: {
				model: "claude-opus-4-20250514",
				maxTurns: 30,
				sdkProvider: mockProvider,
			},
		});

		expect(capturedOptions.value?.model).toBe("claude-opus-4-20250514");
		expect(capturedOptions.value?.maxTurns).toBe(30);
	});

	test("canUseTool allows Read operations", async () => {
		const capturedOptions = { value: null as SessionOptions | null };
		const mockProvider = createMockSDKProvider({
			messages: [{ type: "assistant", session_id: "test-session" }],
			capturedOptions,
		});

		await implementIndicator({
			hypothesis: createMockHypothesis(),
			existingPatterns: mockExistingPatterns,
			config: { sdkProvider: mockProvider },
		});

		const canUseTool = capturedOptions.value?.canUseTool;
		expect(canUseTool).toBeDefined();

		if (canUseTool) {
			const result = await canUseTool("Read", { file_path: "/any/path.ts" });
			expect(result.behavior).toBe("allow");
		}
	});

	test("canUseTool allows Write to custom directory", async () => {
		const capturedOptions = { value: null as SessionOptions | null };
		const mockProvider = createMockSDKProvider({
			messages: [{ type: "assistant", session_id: "test-session" }],
			capturedOptions,
		});

		await implementIndicator({
			hypothesis: createMockHypothesis(),
			existingPatterns: mockExistingPatterns,
			config: { sdkProvider: mockProvider },
		});

		const canUseTool = capturedOptions.value?.canUseTool;
		expect(canUseTool).toBeDefined();

		if (canUseTool) {
			const allowed = await canUseTool("Write", {
				file_path: "packages/indicators/src/custom/test.ts",
			});
			expect(allowed.behavior).toBe("allow");

			const denied = await canUseTool("Write", {
				file_path: "packages/indicators/src/momentum/test.ts",
			});
			expect(denied.behavior).toBe("deny");
		}
	});

	test("canUseTool allows safe Bash commands", async () => {
		const capturedOptions = { value: null as SessionOptions | null };
		const mockProvider = createMockSDKProvider({
			messages: [{ type: "assistant", session_id: "test-session" }],
			capturedOptions,
		});

		await implementIndicator({
			hypothesis: createMockHypothesis(),
			existingPatterns: mockExistingPatterns,
			config: { sdkProvider: mockProvider },
		});

		const canUseTool = capturedOptions.value?.canUseTool;
		expect(canUseTool).toBeDefined();

		if (canUseTool) {
			const testAllowed = await canUseTool("Bash", {
				command: "bun test packages/indicators",
			});
			expect(testAllowed.behavior).toBe("allow");

			const lsAllowed = await canUseTool("Bash", { command: "ls -la" });
			expect(lsAllowed.behavior).toBe("allow");

			const dangerousDenied = await canUseTool("Bash", { command: "rm -rf /" });
			expect(dangerousDenied.behavior).toBe("deny");
		}
	});

	test("validates input before SDK call", () => {
		const validInput = {
			hypothesis: createMockHypothesis(),
			existingPatterns: mockExistingPatterns,
		};

		const result = ImplementIndicatorInputSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});
});
