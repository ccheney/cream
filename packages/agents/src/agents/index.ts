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
	GROUNDING_AGENT_CONFIG,
	NEWS_ANALYST_CONFIG,
	RISK_MANAGER_CONFIG,
	TRADER_CONFIG,
} from "./configs/index.js";
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
