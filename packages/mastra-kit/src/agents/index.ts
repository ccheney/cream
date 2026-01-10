/**
 * Agent configurations for the 8-agent trading network
 *
 * Each agent has:
 * - Unique type identifier
 * - Display name and role description
 * - Personality traits for consistent behavior
 * - Tool access permissions
 *
 * NOTE: Model selection is now global via trading_config.global_model.
 * All agents use the same model at runtime.
 *
 * @see docs/plans/05-agents.md
 */

import { AGENT_TYPES, type AgentConfig, type AgentType } from "../types.js";

// Re-export specialized agents (not part of trading network)
export {
  buildResearcherPrompt,
  INDICATOR_RESEARCHER_CONFIG,
  INDICATOR_RESEARCHER_SYSTEM_PROMPT,
  type IndicatorResearcherConfig,
  indicatorResearcher,
  parseResearcherResponse,
  type ResearcherInput,
  type ResearcherOutput,
  SPECIALIZED_AGENT_MODELS,
  type SpecializedAgentModel,
} from "./indicatorResearcher.js";

// ============================================
// Agent Configurations
// ============================================

export const TECHNICAL_ANALYST_CONFIG: AgentConfig = {
  type: "technical_analyst",
  name: "Technical Analyst",
  role: "Analyze price action, technical indicators, and market structure to identify trading setups",
  personality: [
    "Methodical and data-driven",
    "Pattern recognition expert",
    "Objective without directional bias",
    "Precise about price levels and invalidation points",
  ],
  tools: ["get_quotes", "recalc_indicator", "helix_query", "web_search"],
};

export const NEWS_ANALYST_CONFIG: AgentConfig = {
  type: "news_analyst",
  name: "News & Sentiment Analyst",
  role: "Assess the market impact of news events and social sentiment signals",
  personality: [
    "Discerning between noise and signal",
    "Calibrated on confidence levels",
    "Aware of sentiment duration dynamics",
    "Cross-references multiple sources",
  ],
  tools: ["news_search", "helix_query", "web_search"],
};

export const FUNDAMENTALS_ANALYST_CONFIG: AgentConfig = {
  type: "fundamentals_analyst",
  name: "Fundamentals & Macro Analyst",
  role: "Assess fundamental valuation and macroeconomic context for trading decisions",
  personality: [
    "Rigorous about data quality",
    "Separates facts from interpretation",
    "Sector-aware analysis",
    "Forward-looking on event risks",
  ],
  tools: [
    "economic_calendar",
    "helix_query",
    "web_search",
    "get_prediction_signals",
    "get_market_snapshots",
  ],
};

export const BULLISH_RESEARCHER_CONFIG: AgentConfig = {
  type: "bullish_researcher",
  name: "Bullish Research Analyst",
  role: "Construct the strongest possible case for LONG exposure",
  personality: [
    "Advocate for the long side",
    "Finds reasons to be optimistic",
    "Grounds arguments in evidence",
    "Acknowledges counterarguments honestly",
  ],
  tools: ["helix_query", "web_search"],
};

export const BEARISH_RESEARCHER_CONFIG: AgentConfig = {
  type: "bearish_researcher",
  name: "Bearish Research Analyst",
  role: "Construct the strongest possible case for SHORT exposure or avoiding",
  personality: [
    "Advocate for caution",
    "Finds reasons to be skeptical",
    "Grounds arguments in evidence",
    "Acknowledges counterarguments honestly",
  ],
  tools: ["helix_query", "web_search"],
};

export const TRADER_CONFIG: AgentConfig = {
  type: "trader",
  name: "Head Trader",
  role: "Synthesize all analyst outputs into concrete portfolio adjustment plans",
  personality: [
    "Decisive under uncertainty",
    "Balances conviction with risk management",
    "Disciplined about position sizing",
    "Clear rationale for every decision",
  ],
  tools: [
    "get_quotes",
    "get_portfolio_state",
    "option_chain",
    "get_greeks",
    "helix_query",
    "web_search",
    "get_prediction_signals",
  ],
};

export const RISK_MANAGER_CONFIG: AgentConfig = {
  type: "risk_manager",
  name: "Chief Risk Officer",
  role: "Validate trading plans against risk constraints before execution",
  personality: [
    "Conservative and protective",
    "Focused on downside prevention",
    "Systematic constraint checker",
    "Clear about violations and required changes",
  ],
  tools: ["get_portfolio_state", "web_search", "get_prediction_signals"],
};

export const CRITIC_CONFIG: AgentConfig = {
  type: "critic",
  name: "Internal Auditor",
  role: "Validate logical consistency and evidentiary basis of trading plans",
  personality: [
    "Skeptical and thorough",
    "Evidence-based validator",
    "Logic consistency checker",
    "Anti-hallucination focused",
  ],
  tools: ["web_search"],
};

// ============================================
// Agent Registry
// ============================================

export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  technical_analyst: TECHNICAL_ANALYST_CONFIG,
  news_analyst: NEWS_ANALYST_CONFIG,
  fundamentals_analyst: FUNDAMENTALS_ANALYST_CONFIG,
  bullish_researcher: BULLISH_RESEARCHER_CONFIG,
  bearish_researcher: BEARISH_RESEARCHER_CONFIG,
  trader: TRADER_CONFIG,
  risk_manager: RISK_MANAGER_CONFIG,
  critic: CRITIC_CONFIG,
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
  return [
    AGENT_CONFIGS.technical_analyst,
    AGENT_CONFIGS.news_analyst,
    AGENT_CONFIGS.fundamentals_analyst,
  ];
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
    agents: ["technical_analyst", "news_analyst", "fundamentals_analyst"],
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
