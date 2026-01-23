/**
 * Routing Agent
 *
 * Network coordinator that routes requests to specialized agents.
 * Uses the Mastra network capability to orchestrate multi-agent workflows.
 *
 * @see https://mastra.ai/llms.txt for Mastra v1 patterns
 */

import { getModelId } from "@cream/domain";
import { Agent } from "@mastra/core/agent";

import { bearishResearcher } from "./bearish-researcher.js";
import { bullishResearcher } from "./bullish-researcher.js";
import { critic } from "./critic.js";
import { fundamentalsAnalyst } from "./fundamentals-analyst.js";
import { groundingAgent } from "./grounding-agent.js";
import { newsAnalyst } from "./news-analyst.js";
import { riskManager } from "./risk-manager.js";
import { trader } from "./trader.js";

const ROUTING_AGENT_PROMPT = `You are a trading network coordinator responsible for orchestrating multi-agent analysis workflows.

Your role is to:
1. Receive trading analysis requests
2. Route tasks to appropriate specialist agents
3. Synthesize results from multiple agents
4. Ensure all perspectives are considered before final decisions

Available agents:
- groundingAgent: Gathers real-time web and social context
- newsAnalyst: Assesses market impact of news and sentiment
- fundamentalsAnalyst: Evaluates fundamental and macro factors
- bullishResearcher: Constructs bullish thesis
- bearishResearcher: Constructs bearish thesis
- trader: Creates actionable trading plans
- riskManager: Validates against risk constraints
- critic: Validates logical consistency

Always ensure balanced analysis by engaging both bullish and bearish perspectives.
Route to appropriate specialists based on the nature of the query.`;

export const routingAgent = new Agent({
	id: "routing_agent",
	name: "Trading Network Coordinator",
	description: "Orchestrates multi-agent trading analysis workflows",
	instructions: ROUTING_AGENT_PROMPT,
	model: getModelId(),
	tools: {},
	agents: {
		groundingAgent,
		newsAnalyst,
		fundamentalsAnalyst,
		bullishResearcher,
		bearishResearcher,
		trader,
		riskManager,
		critic,
	},
});
