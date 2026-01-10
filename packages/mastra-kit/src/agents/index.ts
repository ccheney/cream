/**
 * Agent Configurations
 *
 * Exports for agent configs, registry, and specialized agents.
 *
 * NOTE: Model selection is now global via trading_config.global_model.
 * All agents use the same model at runtime.
 *
 * @see docs/plans/05-agents.md
 */

// Re-export individual configs
export {
  BEARISH_RESEARCHER_CONFIG,
  BULLISH_RESEARCHER_CONFIG,
  CRITIC_CONFIG,
  FUNDAMENTALS_ANALYST_CONFIG,
  NEWS_ANALYST_CONFIG,
  RISK_MANAGER_CONFIG,
  TECHNICAL_ANALYST_CONFIG,
  TRADER_CONFIG,
} from "./configs/index.js";
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
// Re-export registry
export {
  AGENT_CONFIGS,
  EXECUTION_PHASES,
  type ExecutionPhase,
  getAgentConfig,
  getAllAgentConfigs,
  getAnalystAgents,
  getApproverAgents,
  getDecisionAgents,
  getResearchAgents,
} from "./registry.js";
