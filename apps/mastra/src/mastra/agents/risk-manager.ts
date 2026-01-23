/**
 * Risk Manager Agent
 *
 * Validates trading plans against risk constraints before execution.
 *
 * @see https://mastra.ai/llms.txt for Mastra v1 patterns
 */

import { RISK_MANAGER_CONFIG, RISK_MANAGER_PROMPT } from "@cream/agents";
import { getModelId } from "@cream/domain";
import { Agent } from "@mastra/core/agent";

import { getEnrichedPortfolioState, getPredictionSignals } from "../tools/index.js";

export const riskManager = new Agent({
	id: RISK_MANAGER_CONFIG.type,
	name: RISK_MANAGER_CONFIG.name,
	description: RISK_MANAGER_CONFIG.role,
	instructions: RISK_MANAGER_PROMPT,
	model: getModelId(),
	tools: {
		getEnrichedPortfolioState,
		getPredictionSignals,
	},
});
