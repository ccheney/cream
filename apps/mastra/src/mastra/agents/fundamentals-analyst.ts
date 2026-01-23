/**
 * Fundamentals Analyst Agent
 *
 * Assesses fundamental valuation and macroeconomic context for trading decisions.
 *
 * @see https://mastra.ai/llms.txt for Mastra v1 patterns
 */

import { FUNDAMENTALS_ANALYST_CONFIG, FUNDAMENTALS_ANALYST_PROMPT } from "@cream/agents";
import { getModelId } from "@cream/domain";
import { Agent } from "@mastra/core/agent";

import {
	analyzeContent,
	fredEconomicCalendar,
	getMarketSnapshots,
	getPredictionSignals,
	graphragQuery,
	helixQuery,
} from "../tools/index.js";

export const fundamentalsAnalyst = new Agent({
	id: FUNDAMENTALS_ANALYST_CONFIG.type,
	name: FUNDAMENTALS_ANALYST_CONFIG.name,
	description: FUNDAMENTALS_ANALYST_CONFIG.role,
	instructions: FUNDAMENTALS_ANALYST_PROMPT,
	model: getModelId(),
	tools: {
		fredEconomicCalendar,
		graphragQuery,
		analyzeContent,
		helixQuery,
		getPredictionSignals,
		getMarketSnapshots,
	},
});
