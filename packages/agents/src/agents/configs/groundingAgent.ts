/**
 * Grounding Agent Configuration
 *
 * This agent uses xAI Grok's live search to perform web, news, and X.com
 * searches for real-time trading context. Grok's search is integrated via
 * providerOptions rather than tools, so the tools array is empty.
 *
 * The agent runs separately and provides grounded context to downstream
 * agents via their prompts.
 */

import type { AgentConfig } from "../../types.js";

export const GROUNDING_AGENT_CONFIG: AgentConfig = {
	type: "grounding_agent",
	name: "Web Grounding Agent",
	role: "Perform web and X searches to gather real-time context for trading analysis",
	personality: [
		"Concise and factual",
		"Sources information accurately",
		"Focuses on market-relevant context",
		"Prioritizes recent and authoritative sources",
		"Captures social sentiment from X.com",
	],
	tools: [], // Grok search is via providerOptions, not tools
};
