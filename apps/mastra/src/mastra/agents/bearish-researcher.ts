/**
 * Bearish Researcher Agent
 *
 * Constructs the strongest possible case for SHORT exposure or avoiding.
 *
 * @see https://mastra.ai/llms.txt for Mastra v1 patterns
 */

import { BEARISH_RESEARCHER_CONFIG, BEARISH_RESEARCHER_PROMPT } from "@cream/agents";
import { getModelId } from "@cream/domain";
import { Agent } from "@mastra/core/agent";

import { analyzeContent, helixQuery, searchAcademicPapers } from "../tools/index.js";

export const bearishResearcher = new Agent({
	id: BEARISH_RESEARCHER_CONFIG.type,
	name: BEARISH_RESEARCHER_CONFIG.name,
	description: BEARISH_RESEARCHER_CONFIG.role,
	instructions: BEARISH_RESEARCHER_PROMPT,
	model: getModelId(),
	tools: {
		helixQuery,
		analyzeContent,
		searchAcademicPapers,
	},
});
