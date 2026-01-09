/**
 * Agent Configuration Schema
 *
 * Defines configuration for the 8-agent consensus network.
 *
 * @see docs/plans/11-configuration.md for full specification
 * @see docs/plans/05-agents.md for agent specifications
 */

import { z } from "zod";

// ============================================
// Agent Names
// ============================================

/**
 * Agent identifiers
 */
export const AgentName = z.enum([
  "technical_analyst",
  "news_sentiment_analyst",
  "fundamentals_macro_analyst",
  "bullish_research",
  "bearish_research",
  "trader",
  "risk_manager",
  "critic",
]);
export type AgentName = z.infer<typeof AgentName>;

// ============================================
// Individual Agent Configuration
// ============================================

/**
 * Configuration for a single agent
 */
export const AgentSettingsSchema = z.object({
  /**
   * Whether this agent is enabled
   */
  enabled: z.boolean().default(true),

  /**
   * Optional custom prompt template path
   *
   * If not specified, uses default from 05-agents.md
   */
  prompt_template: z.string().optional(),

  /**
   * Agent-specific model override
   *
   * If not specified, uses global LLM config
   */
  model_id: z.string().optional(),

  /**
   * Maximum retries for this agent
   */
  max_retries: z.number().int().nonnegative().default(2),
});
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

// ============================================
// Consensus Configuration
// ============================================

/**
 * Required approvers for consensus
 */
export const RequiredApprovers = z.array(AgentName);
export type RequiredApprovers = z.infer<typeof RequiredApprovers>;

/**
 * Consensus mechanism configuration
 */
export const ConsensusConfigSchema = z.object({
  /**
   * Agents that must approve for a plan to proceed
   *
   * Default: risk_manager and critic must both approve
   */
  required_approvers: RequiredApprovers.default(["risk_manager", "critic"]),

  /**
   * Maximum iterations for consensus loop
   *
   * Prevents infinite loops in disagreement scenarios
   */
  iteration_cap: z.number().int().min(1).max(10).default(3),
});
export type ConsensusConfig = z.infer<typeof ConsensusConfigSchema>;

// ============================================
// Complete Agents Configuration
// ============================================

/**
 * Complete agents configuration
 */
export const AgentsConfigSchema = z.object({
  /**
   * Consensus mechanism settings
   */
  consensus: ConsensusConfigSchema.optional(),

  /**
   * Technical Analyst configuration
   */
  technical_analyst: AgentSettingsSchema.optional(),

  /**
   * News & Sentiment Analyst configuration
   */
  news_sentiment_analyst: AgentSettingsSchema.optional(),

  /**
   * Fundamentals & Macro Analyst configuration
   */
  fundamentals_macro_analyst: AgentSettingsSchema.optional(),

  /**
   * Bullish Research Agent configuration
   */
  bullish_research: AgentSettingsSchema.optional(),

  /**
   * Bearish Research Agent configuration
   */
  bearish_research: AgentSettingsSchema.optional(),

  /**
   * Trader Agent configuration
   */
  trader: AgentSettingsSchema.optional(),

  /**
   * Risk Manager Agent configuration
   */
  risk_manager: AgentSettingsSchema.optional(),

  /**
   * Critic Agent configuration
   */
  critic: AgentSettingsSchema.optional(),
});
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;
