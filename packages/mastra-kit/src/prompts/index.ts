/**
 * Agent Prompts
 *
 * System prompts for each agent type in the trading network.
 */

import type { AgentType } from "../types.js";

export { BEARISH_RESEARCHER_PROMPT } from "./bearishResearcher.js";
export { BULLISH_RESEARCHER_PROMPT } from "./bullishResearcher.js";
export { CRITIC_PROMPT } from "./critic.js";
export { FUNDAMENTALS_ANALYST_PROMPT } from "./fundamentalsAnalyst.js";
export { NEWS_ANALYST_PROMPT } from "./newsAnalyst.js";
export { RISK_MANAGER_PROMPT } from "./riskManager.js";
export { SELF_CHECK_PROMPT } from "./selfCheck.js";
// Individual prompt exports
export { TECHNICAL_ANALYST_PROMPT } from "./technicalAnalyst.js";
export { TRADER_PROMPT } from "./trader.js";

import { INDICATOR_RESEARCHER_SYSTEM_PROMPT } from "../agents/indicatorResearcher.js";
import { BEARISH_RESEARCHER_PROMPT } from "./bearishResearcher.js";
import { BULLISH_RESEARCHER_PROMPT } from "./bullishResearcher.js";
import { CRITIC_PROMPT } from "./critic.js";
import { FUNDAMENTALS_ANALYST_PROMPT } from "./fundamentalsAnalyst.js";
// Research agent prompts
import { IDEA_AGENT_SYSTEM_PROMPT } from "./idea-agent.js";
import { NEWS_ANALYST_PROMPT } from "./newsAnalyst.js";
import { RISK_MANAGER_PROMPT } from "./riskManager.js";
// Import for registry
import { TECHNICAL_ANALYST_PROMPT } from "./technicalAnalyst.js";
import { TRADER_PROMPT } from "./trader.js";

// ============================================
// Prompt Registry
// ============================================

export const AGENT_PROMPTS: Record<AgentType, string> = {
  technical_analyst: TECHNICAL_ANALYST_PROMPT,
  news_analyst: NEWS_ANALYST_PROMPT,
  fundamentals_analyst: FUNDAMENTALS_ANALYST_PROMPT,
  bullish_researcher: BULLISH_RESEARCHER_PROMPT,
  bearish_researcher: BEARISH_RESEARCHER_PROMPT,
  trader: TRADER_PROMPT,
  risk_manager: RISK_MANAGER_PROMPT,
  critic: CRITIC_PROMPT,
  idea_agent: IDEA_AGENT_SYSTEM_PROMPT,
  indicator_researcher: INDICATOR_RESEARCHER_SYSTEM_PROMPT,
};

export function getAgentPrompt(agentType: AgentType): string {
  const prompt = AGENT_PROMPTS[agentType];
  if (!prompt) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }
  return prompt;
}

export function getAllAgentPrompts(): Record<AgentType, string> {
  return { ...AGENT_PROMPTS };
}

// Re-export idea agent prompts
export {
  buildFactorZooSummary,
  buildIdeaAgentUserPrompt,
  type HypothesisMemory,
  IDEA_AGENT_SYSTEM_PROMPT,
  type IdeaContext,
} from "./idea-agent.js";
