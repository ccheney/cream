/**
 * Export tests for Claude Code Indicator
 *
 * Tests that the module exports the expected tool definition.
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "PAPER";

import { describe, expect, test } from "bun:test";

describe("claudeCodeIndicator exports", () => {
	test("exports tool definition", async () => {
		const { claudeCodeIndicator } = await import("../../claudeCodeIndicator.js");

		expect(claudeCodeIndicator.name).toBe("implement-indicator");
		expect(claudeCodeIndicator.description).toContain("Claude Code");
		expect(claudeCodeIndicator.inputSchema).toBeDefined();
		expect(claudeCodeIndicator.outputSchema).toBeDefined();
		expect(claudeCodeIndicator.execute).toBeDefined();
	});
});
