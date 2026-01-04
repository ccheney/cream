/**
 * LLM-as-Judge Evaluation
 *
 * Implements evaluation using LLM as a judge to score agent outputs
 * on subjective criteria that code cannot capture.
 *
 * @see docs/plans/14-testing.md lines 365-398
 */

import type { AgentType, BatchEvalResults, EvalResult } from "../../src/index.js";

// ============================================
// Types
// ============================================

/**
 * Test case for LLM-as-Judge evaluation.
 */
export interface JudgeTestCase {
  /** Unique test case ID */
  id: string;

  /** Test case description */
  description: string;

  /** Input to the agent */
  input: unknown;

  /** Expected behavior/output description for the judge */
  expectedBehavior: string;

  /** Optional expected output for comparison */
  expectedOutput?: unknown;

  /** Agent-specific threshold override */
  threshold?: number;
}

/**
 * Judge evaluation result.
 */
export interface JudgeResult {
  /** Test case ID */
  testId: string;

  /** Score from 0-1 */
  score: number;

  /** Pass/fail based on threshold */
  passed: boolean;

  /** Judge's reasoning */
  reasoning: string;

  /** Threshold used */
  threshold: number;

  /** Detailed breakdown if available */
  breakdown?: {
    completeness: number;
    correctness: number;
    relevance: number;
    coherence: number;
  };
}

/**
 * Judge model configuration.
 */
export interface JudgeConfig {
  /** Model to use for judging */
  model: "gpt-4o" | "gemini-3-pro-preview";

  /** Temperature for judge (lower = more consistent) */
  temperature?: number;

  /** Include detailed reasoning */
  includeReasoning?: boolean;

  /** Timeout in milliseconds */
  timeout?: number;
}

// ============================================
// Default Configuration
// ============================================

/**
 * Default thresholds per agent type.
 */
export const AGENT_THRESHOLDS: Record<AgentType, number> = {
  technical_analyst: 0.75,
  news_analyst: 0.75,
  fundamentals_analyst: 0.75,
  bullish_researcher: 0.7,
  bearish_researcher: 0.7,
  trader: 0.8,
  risk_manager: 0.85,
  critic: 0.8,
};

/**
 * Scoring threshold interpretation.
 */
export const SCORE_INTERPRETATION = {
  /** Hard failure - block merge */
  HARD_FAIL: 0.5,

  /** Soft failure - require review */
  SOFT_FAIL: 0.8,

  /** Pass - no action needed */
  PASS: 0.8,
} as const;

/**
 * Default judge configuration.
 */
export const DEFAULT_JUDGE_CONFIG: JudgeConfig = {
  model: "gemini-3-pro-preview",
  temperature: 0.1,
  includeReasoning: true,
  timeout: 60000,
};

// ============================================
// Mock Judge (for testing without API calls)
// ============================================

/**
 * Mock judge for testing without API calls.
 * Returns deterministic scores based on test case ID patterns.
 */
export function createMockJudge() {
  return async (
    _input: unknown,
    output: unknown,
    expectedBehavior: string,
    _config: JudgeConfig
  ): Promise<{ score: number; reasoning: string }> => {
    // Simulate some latency
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Deterministic scoring based on output content
    const outputStr = JSON.stringify(output).toLowerCase();

    let score = 0.75; // Base score

    // Boost score for good patterns
    if (outputStr.includes("rationale")) {
      score += 0.05;
    }
    if (outputStr.includes("stop") || outputStr.includes("risk")) {
      score += 0.05;
    }
    if (outputStr.includes("confidence")) {
      score += 0.05;
    }

    // Reduce score for bad patterns
    if (outputStr.includes("error")) {
      score -= 0.2;
    }
    if (outputStr.includes("undefined")) {
      score -= 0.1;
    }
    if (outputStr.length < 50) {
      score -= 0.1;
    }

    // Clamp to 0-1
    score = Math.max(0, Math.min(1, score));

    return {
      score,
      reasoning: `Mock judge evaluation. Output length: ${outputStr.length}. Expected: ${expectedBehavior.slice(0, 50)}...`,
    };
  };
}

// ============================================
// Core Functions
// ============================================

/**
 * Evaluate a single agent output using LLM-as-Judge.
 */
export async function evaluateAgentWithJudge(
  agentType: AgentType,
  testCase: JudgeTestCase,
  output: unknown,
  config: JudgeConfig = DEFAULT_JUDGE_CONFIG
): Promise<JudgeResult> {
  const threshold = testCase.threshold ?? AGENT_THRESHOLDS[agentType];

  // Use mock judge for now (real implementation would call LLM API)
  const mockJudge = createMockJudge();
  const { score, reasoning } = await mockJudge(
    testCase.input,
    output,
    testCase.expectedBehavior,
    config
  );

  return {
    testId: testCase.id,
    score,
    passed: score >= threshold,
    reasoning,
    threshold,
  };
}

/**
 * Run batch evaluation for multiple test cases.
 */
export async function runBatchEvaluation(
  agentType: AgentType,
  testCases: JudgeTestCase[],
  outputs: unknown[],
  config: JudgeConfig = DEFAULT_JUDGE_CONFIG
): Promise<BatchEvalResults> {
  if (testCases.length !== outputs.length) {
    throw new Error(
      `Test case count (${testCases.length}) must match output count (${outputs.length})`
    );
  }

  const results: EvalResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const judgeResult = await evaluateAgentWithJudge(agentType, testCases[i], outputs[i], config);

    results.push({
      testId: judgeResult.testId,
      agentType,
      score: judgeResult.score,
      passed: judgeResult.passed,
      metrics: {
        threshold: judgeResult.threshold,
      },
      framework: "deepeval",
      timestamp: new Date().toISOString(),
      metadata: {
        reasoning: judgeResult.reasoning,
      },
    });
  }

  // Calculate statistics
  const scores = results.map((r) => r.score).sort((a, b) => a - b);
  const stats = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    mean: scores.reduce((a, b) => a + b, 0) / scores.length,
    min: scores[0],
    max: scores[scores.length - 1],
    p50: scores[Math.floor(scores.length * 0.5)],
    p90: scores[Math.floor(scores.length * 0.9)],
    p95: scores[Math.floor(scores.length * 0.95)],
  };

  const threshold = AGENT_THRESHOLDS[agentType];

  return {
    results,
    stats,
    config: {
      threshold,
      framework: "deepeval",
      agentType,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate evaluation report in JSON format.
 */
export function generateEvalReport(batchResults: BatchEvalResults): string {
  const report = {
    summary: {
      agentType: batchResults.config.agentType,
      threshold: batchResults.config.threshold,
      totalTests: batchResults.stats.total,
      passed: batchResults.stats.passed,
      failed: batchResults.stats.failed,
      passRate: (batchResults.stats.passed / batchResults.stats.total) * 100,
    },
    statistics: batchResults.stats,
    results: batchResults.results.map((r) => ({
      testId: r.testId,
      score: r.score,
      passed: r.passed,
      reasoning: r.metadata?.reasoning,
    })),
    failures: batchResults.results
      .filter((r) => !r.passed)
      .map((r) => ({
        testId: r.testId,
        score: r.score,
        threshold: r.metrics.threshold,
        reasoning: r.metadata?.reasoning,
      })),
    timestamp: batchResults.timestamp,
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Check if batch results indicate a regression.
 * Returns true if current results are significantly worse than baseline.
 */
export function checkForRegression(
  current: BatchEvalResults,
  baseline: BatchEvalResults,
  regressionThreshold = 0.95
): { hasRegression: boolean; details: string } {
  const currentMean = current.stats.mean;
  const baselineMean = baseline.stats.mean;

  const ratio = currentMean / baselineMean;
  const hasRegression = ratio < regressionThreshold;

  const details = hasRegression
    ? `Regression detected: current mean (${currentMean.toFixed(3)}) is ${((1 - ratio) * 100).toFixed(1)}% worse than baseline (${baselineMean.toFixed(3)})`
    : `No regression: current mean (${currentMean.toFixed(3)}) vs baseline (${baselineMean.toFixed(3)})`;

  return { hasRegression, details };
}

// ============================================
// Sample Test Cases
// ============================================

/**
 * Sample test cases for each agent type.
 */
export const SAMPLE_TEST_CASES: Record<AgentType, JudgeTestCase[]> = {
  technical_analyst: [
    {
      id: "ta-bullish-1",
      description: "Identify bullish trend from moving averages",
      input: {
        symbol: "AAPL",
        price: 185.5,
        sma20: 180,
        sma50: 175,
        rsi: 65,
      },
      expectedBehavior:
        "Correctly identifies bullish trend based on price above moving averages and healthy RSI",
    },
    {
      id: "ta-bearish-1",
      description: "Identify bearish trend from price action",
      input: {
        symbol: "MSFT",
        price: 350,
        sma20: 360,
        sma50: 370,
        rsi: 35,
      },
      expectedBehavior:
        "Correctly identifies bearish trend based on price below moving averages and low RSI",
    },
  ],
  news_analyst: [
    {
      id: "news-positive-1",
      description: "Identify positive sentiment from earnings news",
      input: {
        headline: "Company beats Q4 earnings expectations",
        content: "Revenue up 15% YoY, guidance raised",
      },
      expectedBehavior: "Correctly identifies positive sentiment and bullish implications",
    },
  ],
  fundamentals_analyst: [
    {
      id: "fund-value-1",
      description: "Identify undervalued stock",
      input: {
        symbol: "XYZ",
        pe: 12,
        industryPe: 20,
        pbv: 1.2,
        roe: 18,
      },
      expectedBehavior: "Correctly identifies undervaluation based on PE below industry average",
    },
  ],
  bullish_researcher: [
    {
      id: "bull-case-1",
      description: "Build bullish case from positive catalysts",
      input: {
        catalysts: ["earnings beat", "new product launch", "market expansion"],
      },
      expectedBehavior: "Builds compelling bullish case incorporating all catalysts",
    },
  ],
  bearish_researcher: [
    {
      id: "bear-case-1",
      description: "Build bearish case from risks",
      input: {
        risks: ["margin compression", "competitive pressure", "regulatory risk"],
      },
      expectedBehavior: "Builds compelling bearish case incorporating all risks",
    },
  ],
  trader: [
    {
      id: "trader-decision-1",
      description: "Generate valid trading decision",
      input: {
        analysis: "Strong bullish setup with price above MAs",
        symbol: "AAPL",
      },
      expectedBehavior:
        "Generates complete DecisionPlan with action, size, stop loss, take profit, and rationale",
    },
  ],
  risk_manager: [
    {
      id: "risk-violation-1",
      description: "Detect position size violation",
      input: {
        plan: { size: { quantity: 100000 } },
        constraints: { maxPositionSize: 10000 },
      },
      expectedBehavior: "Correctly identifies position size constraint violation",
    },
  ],
  critic: [
    {
      id: "critic-inconsistency-1",
      description: "Detect logical inconsistency",
      input: {
        rationale: "Bullish outlook",
        action: "SELL",
      },
      expectedBehavior:
        "Correctly identifies inconsistency between bullish rationale and sell action",
    },
  ],
};

export default {
  evaluateAgentWithJudge,
  runBatchEvaluation,
  generateEvalReport,
  checkForRegression,
  createMockJudge,
  AGENT_THRESHOLDS,
  SCORE_INTERPRETATION,
  SAMPLE_TEST_CASES,
};
