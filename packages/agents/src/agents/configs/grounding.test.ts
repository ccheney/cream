/**
 * Tests for Grounding Agent Configuration
 *
 * Verifies that the grounding agent is properly configured to use xAI Grok
 * for web and X searches. Grok's search is integrated via providerOptions
 * rather than tools, so the tools array should be empty.
 */

import { describe, expect, test } from "bun:test";

import { GROUNDING_AGENT_CONFIG } from "./groundingAgent.js";

describe("Grounding Agent Configuration", () => {
	test("grounding agent has no tools (Grok uses providerOptions)", () => {
		expect(GROUNDING_AGENT_CONFIG.tools).toEqual([]);
		expect(GROUNDING_AGENT_CONFIG.tools).toHaveLength(0);
	});

	test("grounding agent type is grounding_agent", () => {
		expect(GROUNDING_AGENT_CONFIG.type).toBe("grounding_agent");
	});

	test("grounding agent has name and role", () => {
		expect(GROUNDING_AGENT_CONFIG.name).toBe("Web Grounding Agent");
		expect(GROUNDING_AGENT_CONFIG.role).toContain("searches");
	});
});
