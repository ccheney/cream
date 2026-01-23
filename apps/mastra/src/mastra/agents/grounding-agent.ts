/**
 * Grounding Agent
 *
 * Performs web and X searches to gather real-time context for trading analysis.
 * Uses xAI Grok's live search via providerOptions rather than tools.
 *
 * @see https://mastra.ai/llms.txt for Mastra v1 patterns
 */

import { GROUNDING_AGENT_CONFIG, GROUNDING_AGENT_PROMPT } from "@cream/agents";
import { Agent } from "@mastra/core/agent";

export const groundingAgent = new Agent({
	id: GROUNDING_AGENT_CONFIG.type,
	name: GROUNDING_AGENT_CONFIG.name,
	description: GROUNDING_AGENT_CONFIG.role,
	instructions: GROUNDING_AGENT_PROMPT,
	// Grounding agent uses xAI Grok for live web search
	model: "xai/grok-3",
	tools: {},
});
