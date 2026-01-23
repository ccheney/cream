/**
 * Critic Agent
 *
 * Validates logical consistency and evidentiary basis of trading plans.
 *
 * @see https://mastra.ai/llms.txt for Mastra v1 patterns
 */

import { CRITIC_CONFIG, CRITIC_PROMPT } from "@cream/agents";
import { getModelId } from "@cream/domain";
import { Agent } from "@mastra/core/agent";

export const critic = new Agent({
	id: CRITIC_CONFIG.type,
	name: CRITIC_CONFIG.name,
	description: CRITIC_CONFIG.role,
	instructions: CRITIC_PROMPT,
	model: getModelId(),
	tools: {},
});
