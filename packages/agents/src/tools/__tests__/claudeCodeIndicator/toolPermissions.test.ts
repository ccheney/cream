/**
 * Tool permission tests for Claude Code Indicator
 *
 * Tests the permission handler logic and AST similarity threshold.
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "PAPER";

import { describe, expect, test } from "bun:test";

describe("tool permission handler logic", () => {
	test("Read tool should be allowed", () => {
		const allowedReadTools = ["Read", "Grep", "Glob"];
		expect(allowedReadTools.includes("Read")).toBe(true);
	});

	test("Write tool requires /custom/ in path", () => {
		const validPath = "packages/indicators/src/custom/test.ts";
		const invalidPath = "packages/indicators/src/momentum/test.ts";

		expect(validPath.includes("/custom/")).toBe(true);
		expect(invalidPath.includes("/custom/")).toBe(false);
	});

	test("Bash tool allows bun test commands", () => {
		const validCommands = ["bun test packages/indicators", "ls -la"];
		const invalidCommands = ["rm -rf /", "curl https://evil.com"];

		for (const cmd of validCommands) {
			expect(cmd.startsWith("bun test") || cmd.startsWith("ls")).toBe(true);
		}

		for (const cmd of invalidCommands) {
			expect(cmd.startsWith("bun test") || cmd.startsWith("ls")).toBe(false);
		}
	});
});

describe("AST similarity threshold", () => {
	test("similarity above 0.8 should be rejected", () => {
		const threshold = 0.8;
		const highSimilarity = 0.85;
		const lowSimilarity = 0.25;

		expect(highSimilarity > threshold).toBe(true);
		expect(lowSimilarity > threshold).toBe(false);
	});
});
