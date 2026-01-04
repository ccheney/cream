/**
 * @cream/mastra-kit - Agent Prompts, Tools, and Evaluation Utilities
 *
 * This package provides:
 * - Agent prompt templates
 * - Agent tool definitions
 * - Evaluation framework integrations (LangSmith, Braintrust, Promptfoo)
 * - Tracing infrastructure
 *
 * @see docs/plans/05-agents.md
 * @see docs/plans/14-testing.md
 */

export const PACKAGE_NAME = "@cream/mastra-kit";
export const VERSION = "0.1.0";

// ============================================
// Evaluation Framework Exports
// ============================================

export { default as braintrustConfig } from "../braintrust.config.js";

// ============================================
// Placeholder Exports
// ============================================

/**
 * Placeholder for agent definitions.
 * Full implementation coming in Phase 4.
 */
export function placeholder(): string {
  return "Mastra Kit - Coming in Phase 4";
}

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

// ============================================
// Evaluation Types
// ============================================

/**
 * Evaluation result from any framework.
 */
export interface EvalResult {
  /** Test case identifier */
  testId: string;

  /** Agent being evaluated */
  agentType: AgentType;

  /** Score (0-1) */
  score: number;

  /** Pass/fail based on threshold */
  passed: boolean;

  /** Detailed metrics */
  metrics: Record<string, number>;

  /** Evaluation framework used */
  framework: "deepeval" | "langsmith" | "braintrust" | "promptfoo";

  /** Timestamp */
  timestamp: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Batch evaluation results.
 */
export interface BatchEvalResults {
  /** Individual results */
  results: EvalResult[];

  /** Aggregate statistics */
  stats: {
    total: number;
    passed: number;
    failed: number;
    mean: number;
    min: number;
    max: number;
    p50: number;
    p90: number;
    p95: number;
  };

  /** Evaluation configuration */
  config: {
    threshold: number;
    framework: string;
    agentType: AgentType;
  };

  /** Timestamp */
  timestamp: string;
}
