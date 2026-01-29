/**
 * Trader Agent
 *
 * Synthesizes all analyst outputs into concrete portfolio adjustment plans.
 *
 * @see https://mastra.ai/llms.txt for Mastra v1 patterns
 */

import { TRADER_CONFIG, TRADER_PROMPT } from "@cream/agents";
import { getModelId } from "@cream/domain";
import { Agent } from "@mastra/core/agent";

import {
	getEnrichedPortfolioState,
	getGreeks,
	getPredictionSignals,
	getQuotes,
	getRecentDecisions,
	helixQuery,
	optionChain,
	searchAcademicPapers,
	searchExternalPapers,
} from "../tools/index.js";

export const trader = new Agent({
	id: TRADER_CONFIG.type,
	name: TRADER_CONFIG.name,
	description: TRADER_CONFIG.role,
	instructions: TRADER_PROMPT,
	model: getModelId(),
	tools: {
		getRecentDecisions,
		getQuotes,
		getEnrichedPortfolioState,
		optionChain,
		getGreeks,
		helixQuery,
		getPredictionSignals,
		searchAcademicPapers,
		searchExternalPapers,
	},
});
