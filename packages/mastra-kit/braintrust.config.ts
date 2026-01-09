/**
 * Braintrust Configuration
 *
 * Configuration for Braintrust evaluation logging and AutoEvals.
 *
 * @see docs/plans/14-testing.md line 294
 */

import { Eval } from "braintrust";

// ============================================
// Project Configuration
// ============================================

/**
 * Braintrust project name.
 */
export const BRAINTRUST_PROJECT = "cream-trading-system";

/**
 * Environment-specific experiment naming.
 */
export function getExperimentName(env: string, suffix?: string): string {
  const timestamp = new Date().toISOString().split("T")[0];
  const base = `${env.toLowerCase()}-${timestamp}`;
  return suffix ? `${base}-${suffix}` : base;
}

// ============================================
// Evaluation Configuration
// ============================================

/**
 * Default evaluation configuration.
 */
export const DEFAULT_EVAL_CONFIG = {
  /**
   * Maximum concurrent evaluations.
   */
  maxConcurrency: 4,

  /**
   * Timeout per evaluation in milliseconds.
   */
  timeout: 60000,

  /**
   * Retry failed evaluations.
   */
  maxRetries: 3,

  /**
   * Score thresholds.
   */
  thresholds: {
    pass: 0.8,
    softFail: 0.5,
    hardFail: 0.3,
  },
};

// ============================================
// Agent Evaluation Configs
// ============================================

/**
 * Agent-specific evaluation configurations.
 */
export const AGENT_EVAL_CONFIGS = {
  technical_analyst: {
    scoreThreshold: 0.75,
    metrics: ["coherence", "relevance", "accuracy"],
  },
  trader: {
    scoreThreshold: 0.8,
    metrics: ["decision_quality", "risk_assessment", "rationale"],
  },
  risk_manager: {
    scoreThreshold: 0.85,
    metrics: ["constraint_detection", "risk_identification", "completeness"],
  },
  critic: {
    scoreThreshold: 0.8,
    metrics: ["inconsistency_detection", "logical_analysis", "thoroughness"],
  },
} as const;

// ============================================
// Scorer Definitions
// ============================================

/**
 * Custom scorer for trading decision quality.
 */
export function createDecisionQualityScorer() {
  return {
    name: "decision_quality",
    scorer: async (args: { input: unknown; output: unknown; expected?: unknown }) => {
      const output = args.output as Record<string, unknown>;

      // Check required fields
      const hasAction = typeof output?.action === "string";
      const hasSize = typeof output?.size === "object";
      const hasRiskLevels = typeof output?.riskLevels === "object";
      const hasRationale = typeof output?.rationale === "string";

      const score =
        (hasAction ? 0.25 : 0) +
        (hasSize ? 0.25 : 0) +
        (hasRiskLevels ? 0.25 : 0) +
        (hasRationale ? 0.25 : 0);

      return {
        name: "decision_quality",
        score,
        metadata: {
          hasAction,
          hasSize,
          hasRiskLevels,
          hasRationale,
        },
      };
    },
  };
}

/**
 * Custom scorer for risk identification.
 */
export function createRiskIdentificationScorer() {
  return {
    name: "risk_identification",
    scorer: async (args: { input: unknown; output: unknown; expected?: unknown }) => {
      const output = String(args.output || "").toLowerCase();

      // Check for risk-related keywords
      const riskKeywords = [
        "stop loss",
        "risk",
        "drawdown",
        "position size",
        "exposure",
        "volatility",
        "constraint",
        "limit",
      ];

      const foundKeywords = riskKeywords.filter((kw) => output.includes(kw));
      const score = Math.min(foundKeywords.length / 4, 1);

      return {
        name: "risk_identification",
        score,
        metadata: {
          foundKeywords,
          keywordCount: foundKeywords.length,
        },
      };
    },
  };
}

// ============================================
// Evaluation Runner
// ============================================

/**
 * Initialize Braintrust evaluation for an agent.
 */
export async function initAgentEval(
  agentName: keyof typeof AGENT_EVAL_CONFIGS,
  experimentSuffix?: string
) {
  const experimentName = getExperimentName("paper", experimentSuffix);

  // NOTE: This is a placeholder. The Eval() function requires data, task, and scores
  // properties which should be provided by the caller when actually running evaluations.
  // See Braintrust documentation for complete Evaluator configuration.
  return Eval(BRAINTRUST_PROJECT, {
    experimentName: `${agentName}-${experimentName}`,
    maxConcurrency: DEFAULT_EVAL_CONFIG.maxConcurrency,
    timeout: DEFAULT_EVAL_CONFIG.timeout,
    data: () => [], // Placeholder - should be provided by caller
    task: async () => {}, // Placeholder - should be provided by caller
    scores: [], // Placeholder - should be provided by caller
  });
}

export default {
  project: BRAINTRUST_PROJECT,
  getExperimentName,
  defaultConfig: DEFAULT_EVAL_CONFIG,
  agentConfigs: AGENT_EVAL_CONFIGS,
  scorers: {
    decisionQuality: createDecisionQualityScorer,
    riskIdentification: createRiskIdentificationScorer,
  },
};
