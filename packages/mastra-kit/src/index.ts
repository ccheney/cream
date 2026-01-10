/**
 * @cream/mastra-kit - Agent Prompts and Tools
 *
 * This package provides:
 * - Agent configurations for the 8-agent network
 * - System prompts optimized for Gemini
 * - Consensus gate with dual-approval (Risk Manager + Critic)
 * - Agent tools
 * - Tracing infrastructure
 *
 * @see docs/plans/05-agents.md
 */

export const PACKAGE_NAME = "@cream/mastra-kit";
export const VERSION = "0.1.0";

// ============================================
// Agent Types and Configuration
// ============================================

export * from "./agents/index.js";
export * from "./chaos.js";
export * from "./consensus.js";
export * from "./escalation.js";
export * from "./outcomeScoring.js";
export * from "./planScoring.js";
export * from "./prompts/index.js";
export * from "./qualityScore.js";
export * from "./tools/index.js";
export * from "./types.js";

// ============================================
// Services
// ============================================

export * from "./services/index.js";

// ============================================
// Observability
// ============================================

export * from "./observability/index.js";

// ============================================
// MCP Clients
// ============================================

export * from "./mcp/index.js";

// ============================================
// Agent Types
// ============================================

/**
 * Agent types in the trading system.
 */
export const AGENT_TYPES = [
  "technical_analyst",
  "news_analyst",
  "fundamentals_analyst",
  "bullish_researcher",
  "bearish_researcher",
  "trader",
  "risk_manager",
  "critic",
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];
