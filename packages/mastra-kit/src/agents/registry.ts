/**
 * Agent Registry
 *
 * Central registry for all agent configurations and execution phases.
 */

import { AGENT_TYPES, type AgentConfig, type AgentType } from "../types.js";
import {
  BEARISH_RESEARCHER_CONFIG,
  BULLISH_RESEARCHER_CONFIG,
  CRITIC_CONFIG,
  FUNDAMENTALS_ANALYST_CONFIG,
  IDEA_AGENT_CONFIG,
  INDICATOR_RESEARCHER_CONFIG,
  NEWS_ANALYST_CONFIG,
  RISK_MANAGER_CONFIG,
  TRADER_CONFIG,
} from "./configs/index.js";

// ============================================
// Agent Registry
// ============================================

export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  news_analyst: NEWS_ANALYST_CONFIG,
  fundamentals_analyst: FUNDAMENTALS_ANALYST_CONFIG,
  bullish_researcher: BULLISH_RESEARCHER_CONFIG,
  bearish_researcher: BEARISH_RESEARCHER_CONFIG,
  trader: TRADER_CONFIG,
  risk_manager: RISK_MANAGER_CONFIG,
  critic: CRITIC_CONFIG,
  idea_agent: IDEA_AGENT_CONFIG,
  indicator_researcher: INDICATOR_RESEARCHER_CONFIG,
};

/**
 * Get configuration for a specific agent type
 */
export function getAgentConfig(agentType: AgentType): AgentConfig {
  const config = AGENT_CONFIGS[agentType];
  if (!config) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }
  return config;
}

/**
 * Get all agent configurations
 */
export function getAllAgentConfigs(): AgentConfig[] {
  return AGENT_TYPES.map((type) => AGENT_CONFIGS[type]);
}

/**
 * Get analyst agents (run in parallel, first phase)
 */
export function getAnalystAgents(): AgentConfig[] {
  return [AGENT_CONFIGS.news_analyst, AGENT_CONFIGS.fundamentals_analyst];
}

/**
 * Get research agents (run after analysts, second phase)
 */
export function getResearchAgents(): AgentConfig[] {
  return [AGENT_CONFIGS.bullish_researcher, AGENT_CONFIGS.bearish_researcher];
}

/**
 * Get decision agents (run sequentially, final phase)
 */
export function getDecisionAgents(): AgentConfig[] {
  return [AGENT_CONFIGS.trader, AGENT_CONFIGS.risk_manager, AGENT_CONFIGS.critic];
}

/**
 * Get approver agents (must both approve for consensus)
 */
export function getApproverAgents(): AgentConfig[] {
  return [AGENT_CONFIGS.risk_manager, AGENT_CONFIGS.critic];
}

// ============================================
// Agent Execution Order
// ============================================

/**
 * Defines the execution phases for the agent network.
 * Agents in the same phase can run in parallel.
 */
export const EXECUTION_PHASES = [
  {
    phase: 1,
    name: "Analysis",
    agents: ["news_analyst", "fundamentals_analyst"],
    parallel: true,
  },
  {
    phase: 2,
    name: "Research",
    agents: ["bullish_researcher", "bearish_researcher"],
    parallel: true,
  },
  {
    phase: 3,
    name: "Decision",
    agents: ["trader"],
    parallel: false,
  },
  {
    phase: 4,
    name: "Approval",
    agents: ["risk_manager", "critic"],
    parallel: true,
  },
] as const;

export type ExecutionPhase = (typeof EXECUTION_PHASES)[number];
