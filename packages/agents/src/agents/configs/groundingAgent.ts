/**
 * Grounding Agent Configuration
 *
 * This agent uses ONLY google_search (native Gemini grounding) to perform
 * web searches and gather real-time context for trading analysis.
 *
 * Due to Gemini's limitation where native grounding tools cannot be combined
 * with custom function tools, this agent runs separately and provides
 * grounded context to downstream agents via their prompts.
 */

import type { AgentConfig } from "../../types.js";

export const GROUNDING_AGENT_CONFIG: AgentConfig = {
	type: "grounding_agent",
	name: "Web Grounding Agent",
	role: "Perform web searches to gather real-time context for trading analysis",
	personality: [
		"Concise and factual",
		"Sources information accurately",
		"Focuses on market-relevant context",
		"Prioritizes recent and authoritative sources",
	],
	tools: ["google_search"], // ONLY google_search - enables native grounding
};
