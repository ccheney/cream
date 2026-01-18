/**
 * Real Mastra Agent Implementation
 *
 * This file re-exports all agent functionality from focused modules.
 * Existing imports should continue to work with no changes.
 *
 * Module structure:
 * - types.ts: All interfaces and type definitions
 * - schemas.ts: All Zod schemas for structured outputs
 * - prompts.ts: Prompt building functions
 * - factory.ts: Agent factory and utilities
 * - analysts.ts: News, Fundamentals analysts
 * - researchers.ts: Bullish/Bearish researchers
 * - trader.ts: Trader agent
 * - approvers.ts: Risk Manager and Critic agents
 * - consensus.ts: Consensus loop orchestration
 *
 * @see docs/plans/05-agents.md
 */

// ============================================
// Types
// ============================================

export type {
	AgentConfigEntry,
	AgentContext,
	AgentRuntimeSettings,
	AgentStreamChunk,
	BearishResearchOutput,
	BullishResearchOutput,
	CriticOutput,
	DecisionPlan,
	FundamentalsAnalysisOutput,
	OnStreamChunk,
	RiskManagerOutput,
	SentimentAnalysisOutput,
} from "./types.js";

// ============================================
// Analysts
// ============================================

export {
	fundamentalsAnalystAgent,
	newsAnalystAgent,
	runAnalystsParallel,
	runAnalystsParallelStreaming,
	runFundamentalsAnalyst,
	runFundamentalsAnalystStreaming,
	runNewsAnalyst,
	runNewsAnalystStreaming,
} from "./analysts.js";

// ============================================
// Researchers
// ============================================

export {
	bearishResearcherAgent,
	bullishResearcherAgent,
	runBearishResearcher,
	runBearishResearcherStreaming,
	runBullishResearcher,
	runBullishResearcherStreaming,
	runDebateParallel,
	runDebateParallelStreaming,
} from "./researchers.js";

// ============================================
// Trader
// ============================================

export {
	revisePlan,
	runTrader,
	runTraderStreaming,
	traderAgent,
} from "./trader.js";

// ============================================
// Approvers
// ============================================

export {
	criticAgent,
	riskManagerAgent,
	runApprovalParallel,
	runApprovalParallelStreaming,
	runCritic,
	runCriticStreaming,
	runRiskManager,
	runRiskManagerStreaming,
} from "./approvers.js";

// ============================================
// Consensus
// ============================================

export {
	type ConsensusResult,
	runConsensusLoop,
	runConsensusLoopStreaming,
} from "./consensus.js";

// ============================================
// Grounding
// ============================================

export { groundingAgent, runGroundingAgent, runGroundingAgentStreaming } from "./grounding.js";

// ============================================
// Agent Registry
// ============================================

import { fundamentalsAnalystAgent, newsAnalystAgent } from "./analysts.js";
import { criticAgent, riskManagerAgent } from "./approvers.js";
import { groundingAgent } from "./grounding.js";
import { bearishResearcherAgent, bullishResearcherAgent } from "./researchers.js";
import { traderAgent } from "./trader.js";

export const mastraAgents = {
	grounding_agent: groundingAgent,
	news_analyst: newsAnalystAgent,
	fundamentals_analyst: fundamentalsAnalystAgent,
	bullish_researcher: bullishResearcherAgent,
	bearish_researcher: bearishResearcherAgent,
	trader: traderAgent,
	risk_manager: riskManagerAgent,
	critic: criticAgent,
} as const;

export type MastraAgentRegistry = typeof mastraAgents;
