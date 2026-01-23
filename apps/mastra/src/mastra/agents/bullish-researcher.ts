/**
 * Bullish Researcher Agent
 *
 * Constructs the strongest possible case for LONG exposure.
 *
 * @see https://mastra.ai/llms.txt for Mastra v1 patterns
 */

import { BULLISH_RESEARCHER_CONFIG, BULLISH_RESEARCHER_PROMPT } from "@cream/agents";
import { getModelId } from "@cream/domain";
import { Agent } from "@mastra/core/agent";

import { analyzeContent, helixQuery, searchAcademicPapers } from "../tools/index.js";

export const bullishResearcher = new Agent({
	id: BULLISH_RESEARCHER_CONFIG.type,
	name: BULLISH_RESEARCHER_CONFIG.name,
	description: BULLISH_RESEARCHER_CONFIG.role,
	instructions: BULLISH_RESEARCHER_PROMPT,
	model: getModelId(),
	tools: {
		helixQuery,
		analyzeContent,
		searchAcademicPapers,
	},
});
