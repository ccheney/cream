/**
 * News Analyst Agent
 *
 * Assesses the market impact of news events and social sentiment signals.
 *
 * @see https://mastra.ai/llms.txt for Mastra v1 patterns
 */

import { NEWS_ANALYST_CONFIG, NEWS_ANALYST_PROMPT } from "@cream/agents";
import { getModelId } from "@cream/domain";
import { Agent } from "@mastra/core/agent";

import {
	analyzeContent,
	extractNewsContext,
	graphragQuery,
	helixQuery,
} from "../tools/index.js";

export const newsAnalyst = new Agent({
	id: NEWS_ANALYST_CONFIG.type,
	name: NEWS_ANALYST_CONFIG.name,
	description: NEWS_ANALYST_CONFIG.role,
	instructions: NEWS_ANALYST_PROMPT,
	model: getModelId(),
	tools: {
		extractNewsContext,
		analyzeContent,
		graphragQuery,
		helixQuery,
	},
});
