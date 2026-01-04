/**
 * LLM-as-Judge Evaluation Tests
 *
 * Tests the LLM-as-Judge evaluation framework.
 *
 * @see docs/plans/14-testing.md lines 365-398
 */

import { describe, expect, it } from "bun:test";
import {
  evaluateAgentWithJudge,
  runBatchEvaluation,
  generateEvalReport,
  checkForRegression,
  createMockJudge,
  AGENT_THRESHOLDS,
  SCORE_INTERPRETATION,
  SAMPLE_TEST_CASES,
  type JudgeTestCase,
} from "./llm-judge.js";

// ============================================
// Mock Judge Tests
// ============================================

describe("Mock Judge", () => {
  it("returns score between 0 and 1", async () => {
    const judge = createMockJudge();
    const result = await judge(
      { input: "test" },
      { output: "test output with rationale" },
      "Expected behavior",
      { model: "gemini-3-pro-preview" }
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("boosts score for good patterns", async () => {
    const judge = createMockJudge();

    const goodResult = await judge(
      {},
      { rationale: "test", risk: "managed", confidence: 0.8 },
      "Expected",
      { model: "gemini-3-pro-preview" }
    );

    const badResult = await judge({}, { x: 1 }, "Expected", {
      model: "gemini-3-pro-preview",
    });

    expect(goodResult.score).toBeGreaterThan(badResult.score);
  });

  it("reduces score for error patterns", async () => {
    const judge = createMockJudge();

    const errorResult = await judge(
      {},
      { error: "something went wrong" },
      "Expected",
      { model: "gemini-3-pro-preview" }
    );

    expect(errorResult.score).toBeLessThan(0.7);
  });
});

// ============================================
// Single Evaluation Tests
// ============================================

describe("evaluateAgentWithJudge", () => {
  const testCase: JudgeTestCase = {
    id: "test-1",
    description: "Test case",
    input: { symbol: "AAPL" },
    expectedBehavior: "Should identify trend correctly",
  };

  it("returns JudgeResult with required fields", async () => {
    const result = await evaluateAgentWithJudge(
      "technical_analyst",
      testCase,
      { trend: "bullish", rationale: "Price above MAs" }
    );

    expect(result.testId).toBe("test-1");
    expect(typeof result.score).toBe("number");
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.reasoning).toBe("string");
    expect(result.threshold).toBe(AGENT_THRESHOLDS.technical_analyst);
  });

  it("uses agent-specific threshold", async () => {
    const traderResult = await evaluateAgentWithJudge(
      "trader",
      testCase,
      { action: "BUY", rationale: "Strong setup", risk: "managed" }
    );

    const riskResult = await evaluateAgentWithJudge(
      "risk_manager",
      testCase,
      { verdict: "APPROVE", rationale: "Within limits", risk: "acceptable" }
    );

    expect(traderResult.threshold).toBe(0.8);
    expect(riskResult.threshold).toBe(0.85);
  });

  it("respects threshold override in test case", async () => {
    const customCase: JudgeTestCase = {
      ...testCase,
      threshold: 0.9,
    };

    const result = await evaluateAgentWithJudge(
      "technical_analyst",
      customCase,
      { trend: "bullish" }
    );

    expect(result.threshold).toBe(0.9);
  });
});

// ============================================
// Batch Evaluation Tests
// ============================================

describe("runBatchEvaluation", () => {
  const testCases: JudgeTestCase[] = [
    {
      id: "batch-1",
      description: "Test 1",
      input: {},
      expectedBehavior: "Expected 1",
    },
    {
      id: "batch-2",
      description: "Test 2",
      input: {},
      expectedBehavior: "Expected 2",
    },
    {
      id: "batch-3",
      description: "Test 3",
      input: {},
      expectedBehavior: "Expected 3",
    },
  ];

  const outputs = [
    { rationale: "Good output", risk: "managed" },
    { rationale: "Another good output", confidence: 0.8 },
    { x: 1 }, // Minimal output
  ];

  it("evaluates all test cases", async () => {
    const results = await runBatchEvaluation("trader", testCases, outputs);

    expect(results.results).toHaveLength(3);
    expect(results.stats.total).toBe(3);
  });

  it("calculates correct statistics", async () => {
    const results = await runBatchEvaluation("trader", testCases, outputs);

    expect(results.stats.mean).toBeGreaterThan(0);
    expect(results.stats.min).toBeLessThanOrEqual(results.stats.max);
    expect(results.stats.p50).toBeDefined();
    expect(results.stats.p90).toBeDefined();
    expect(results.stats.p95).toBeDefined();
  });

  it("counts passed and failed correctly", async () => {
    const results = await runBatchEvaluation("trader", testCases, outputs);

    expect(results.stats.passed + results.stats.failed).toBe(results.stats.total);
  });

  it("throws error if counts don't match", async () => {
    await expect(
      runBatchEvaluation("trader", testCases, [outputs[0]])
    ).rejects.toThrow();
  });

  it("includes framework and timestamp", async () => {
    const results = await runBatchEvaluation("trader", testCases, outputs);

    expect(results.config.framework).toBe("deepeval");
    expect(results.timestamp).toBeDefined();
    expect(results.results[0].framework).toBe("deepeval");
  });
});

// ============================================
// Report Generation Tests
// ============================================

describe("generateEvalReport", () => {
  it("generates valid JSON", async () => {
    const testCases: JudgeTestCase[] = [
      {
        id: "report-1",
        description: "Test",
        input: {},
        expectedBehavior: "Expected",
      },
    ];

    const results = await runBatchEvaluation(
      "trader",
      testCases,
      [{ rationale: "test" }]
    );

    const report = generateEvalReport(results);
    const parsed = JSON.parse(report);

    expect(parsed.summary).toBeDefined();
    expect(parsed.statistics).toBeDefined();
    expect(parsed.results).toBeInstanceOf(Array);
    expect(parsed.failures).toBeInstanceOf(Array);
    expect(parsed.timestamp).toBeDefined();
  });

  it("includes pass rate in summary", async () => {
    const testCases: JudgeTestCase[] = [
      {
        id: "report-2",
        description: "Test",
        input: {},
        expectedBehavior: "Expected",
      },
    ];

    const results = await runBatchEvaluation(
      "trader",
      testCases,
      [{ rationale: "test", risk: "managed", confidence: 0.9 }]
    );

    const report = generateEvalReport(results);
    const parsed = JSON.parse(report);

    expect(parsed.summary.passRate).toBeDefined();
    expect(parsed.summary.totalTests).toBe(1);
  });
});

// ============================================
// Regression Detection Tests
// ============================================

describe("checkForRegression", () => {
  it("detects regression when current is worse", () => {
    const current = {
      results: [],
      stats: {
        total: 10,
        passed: 5,
        failed: 5,
        mean: 0.5,
        min: 0.3,
        max: 0.7,
        p50: 0.5,
        p90: 0.65,
        p95: 0.68,
      },
      config: { threshold: 0.8, framework: "deepeval", agentType: "trader" as const },
      timestamp: new Date().toISOString(),
    };

    const baseline = {
      results: [],
      stats: {
        total: 10,
        passed: 8,
        failed: 2,
        mean: 0.8,
        min: 0.6,
        max: 0.95,
        p50: 0.8,
        p90: 0.9,
        p95: 0.92,
      },
      config: { threshold: 0.8, framework: "deepeval", agentType: "trader" as const },
      timestamp: new Date().toISOString(),
    };

    const { hasRegression, details } = checkForRegression(current, baseline);

    expect(hasRegression).toBe(true);
    expect(details).toContain("Regression detected");
  });

  it("passes when current is same or better", () => {
    const current = {
      results: [],
      stats: {
        total: 10,
        passed: 9,
        failed: 1,
        mean: 0.85,
        min: 0.7,
        max: 0.95,
        p50: 0.85,
        p90: 0.92,
        p95: 0.94,
      },
      config: { threshold: 0.8, framework: "deepeval", agentType: "trader" as const },
      timestamp: new Date().toISOString(),
    };

    const baseline = {
      results: [],
      stats: {
        total: 10,
        passed: 8,
        failed: 2,
        mean: 0.8,
        min: 0.6,
        max: 0.9,
        p50: 0.8,
        p90: 0.88,
        p95: 0.89,
      },
      config: { threshold: 0.8, framework: "deepeval", agentType: "trader" as const },
      timestamp: new Date().toISOString(),
    };

    const { hasRegression, details } = checkForRegression(current, baseline);

    expect(hasRegression).toBe(false);
    expect(details).toContain("No regression");
  });

  it("uses configurable regression threshold", () => {
    const current = {
      results: [],
      stats: {
        total: 10,
        passed: 7,
        failed: 3,
        mean: 0.76,
        min: 0.5,
        max: 0.9,
        p50: 0.76,
        p90: 0.85,
        p95: 0.88,
      },
      config: { threshold: 0.8, framework: "deepeval", agentType: "trader" as const },
      timestamp: new Date().toISOString(),
    };

    const baseline = {
      results: [],
      stats: {
        total: 10,
        passed: 8,
        failed: 2,
        mean: 0.8,
        min: 0.6,
        max: 0.9,
        p50: 0.8,
        p90: 0.88,
        p95: 0.89,
      },
      config: { threshold: 0.8, framework: "deepeval", agentType: "trader" as const },
      timestamp: new Date().toISOString(),
    };

    // With 95% threshold, 0.76/0.8 = 0.95, so should pass
    const strictResult = checkForRegression(current, baseline, 0.95);
    expect(strictResult.hasRegression).toBe(false);

    // With 98% threshold, should fail
    const lenientResult = checkForRegression(current, baseline, 0.98);
    expect(lenientResult.hasRegression).toBe(true);
  });
});

// ============================================
// Sample Test Cases Tests
// ============================================

describe("SAMPLE_TEST_CASES", () => {
  it("has test cases for all agent types", () => {
    const agentTypes = Object.keys(AGENT_THRESHOLDS);

    for (const agentType of agentTypes) {
      expect(SAMPLE_TEST_CASES[agentType as keyof typeof SAMPLE_TEST_CASES]).toBeDefined();
      expect(SAMPLE_TEST_CASES[agentType as keyof typeof SAMPLE_TEST_CASES].length).toBeGreaterThan(0);
    }
  });

  it("all test cases have required fields", () => {
    for (const [agentType, testCases] of Object.entries(SAMPLE_TEST_CASES)) {
      for (const tc of testCases) {
        expect(tc.id).toBeDefined();
        expect(tc.description).toBeDefined();
        expect(tc.input).toBeDefined();
        expect(tc.expectedBehavior).toBeDefined();
      }
    }
  });
});

// ============================================
// Scoring Threshold Tests
// ============================================

describe("SCORE_INTERPRETATION", () => {
  it("has correct threshold values", () => {
    expect(SCORE_INTERPRETATION.HARD_FAIL).toBe(0.5);
    expect(SCORE_INTERPRETATION.SOFT_FAIL).toBe(0.8);
    expect(SCORE_INTERPRETATION.PASS).toBe(0.8);
  });
});

describe("AGENT_THRESHOLDS", () => {
  it("risk_manager has highest threshold", () => {
    const maxThreshold = Math.max(...Object.values(AGENT_THRESHOLDS));
    expect(AGENT_THRESHOLDS.risk_manager).toBe(maxThreshold);
  });

  it("all thresholds are between 0.5 and 1", () => {
    for (const threshold of Object.values(AGENT_THRESHOLDS)) {
      expect(threshold).toBeGreaterThanOrEqual(0.5);
      expect(threshold).toBeLessThanOrEqual(1);
    }
  });
});
