/**
 * Stub Agents for Trading Cycle Workflow
 *
 * These agents return hardcoded/mock responses for testing.
 * They will be replaced with real LLM-powered agents in Phase 8.
 *
 * For Phase 4, we don't use actual Mastra Agents with LLMs.
 * Instead, the workflow steps directly return stub data.
 * Real agents will be integrated in Phase 8.
 */

// Use relative imports from source to avoid requiring package build
import {
  AGENT_CONFIGS,
  AGENT_PROMPTS,
  type AgentType,
} from "../../../../packages/mastra-kit/src/index.js";

// ============================================
// Stub Agent Configuration
// ============================================

/**
 * Stub agent configuration.
 * In Phase 8, these will be replaced with real Mastra Agents.
 */
export interface StubAgent {
  id: AgentType;
  name: string;
  role: string;
  model: string;
  systemPrompt: string;
}

/**
 * Create a stub agent configuration.
 */
function createStubAgent(agentType: AgentType): StubAgent {
  const config = AGENT_CONFIGS[agentType];
  const systemPrompt = AGENT_PROMPTS[agentType];

  return {
    id: agentType,
    name: config.name,
    role: config.role,
    model: config.model,
    systemPrompt,
  };
}

// ============================================
// Analyst Agents (Phase 1 - Parallel)
// ============================================

export const technicalAnalyst = createStubAgent("technical_analyst");
export const newsAnalyst = createStubAgent("news_analyst");
export const fundamentalsAnalyst = createStubAgent("fundamentals_analyst");

// ============================================
// Research Agents (Phase 2 - Parallel)
// ============================================

export const bullishResearcher = createStubAgent("bullish_researcher");
export const bearishResearcher = createStubAgent("bearish_researcher");

// ============================================
// Decision Agents (Phase 3-4)
// ============================================

export const trader = createStubAgent("trader");
export const riskManager = createStubAgent("risk_manager");
export const critic = createStubAgent("critic");

// ============================================
// All Agents Registry
// ============================================

export const agents = {
  technicalAnalyst,
  newsAnalyst,
  fundamentalsAnalyst,
  bullishResearcher,
  bearishResearcher,
  trader,
  riskManager,
  critic,
};

export type AgentRegistry = typeof agents;
