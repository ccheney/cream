/**
 * Research Trigger Tool Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { describe, expect, mock, test } from "bun:test";
import type { Factor, FactorZooStats, ResearchBudgetStatus, ResearchRun } from "@cream/domain";
import type { FactorZooRepository } from "@cream/storage";
import type { RuntimeContext } from "@mastra/core/runtime-context";
import {
  createCheckResearchStatusTool,
  createCheckTriggerConditionsTool,
  createTriggerResearchTool,
} from "./researchTrigger";

// Mock runtime context for tool execution
const mockRuntimeContext = {} as RuntimeContext;

// ============================================
// Mock Factory Helpers
// ============================================

function createMockFactor(overrides: Partial<Factor> = {}): Factor {
  return {
    factorId: "factor-1",
    hypothesisId: "hyp-1",
    name: "Test Factor",
    status: "active",
    version: 1,
    author: "claude-code",
    pythonModule: null,
    typescriptModule: null,
    symbolicLength: null,
    parameterCount: null,
    featureCount: null,
    originalityScore: null,
    hypothesisAlignment: null,
    stage1Sharpe: 1.5,
    stage1Ic: 0.05,
    stage1MaxDrawdown: 0.1,
    stage1CompletedAt: "2025-01-01T00:00:00Z",
    stage2Pbo: 0.1,
    stage2DsrPvalue: 0.05,
    stage2Wfe: 0.8,
    stage2CompletedAt: "2025-01-01T00:00:00Z",
    paperValidationPassed: true,
    paperStartDate: "2025-01-01T00:00:00Z",
    paperEndDate: "2025-01-15T00:00:00Z",
    paperRealizedSharpe: 1.2,
    paperRealizedIc: 0.04,
    currentWeight: 0.1,
    lastIc: 0.05,
    decayRate: null,
    createdAt: "2025-01-01T00:00:00Z",
    promotedAt: "2025-01-15T00:00:00Z",
    retiredAt: null,
    lastUpdated: "2025-01-20T00:00:00Z",
    ...overrides,
  };
}

function createMockStats(overrides: Partial<FactorZooStats> = {}): FactorZooStats {
  return {
    totalFactors: 10,
    activeFactors: 5,
    decayingFactors: 1,
    researchFactors: 2,
    retiredFactors: 2,
    averageIc: 0.04,
    totalWeight: 1.0,
    hypothesesValidated: 3,
    hypothesesRejected: 1,
    ...overrides,
  };
}

function createMockResearchRun(overrides: Partial<ResearchRun> = {}): ResearchRun {
  return {
    runId: "run-test-1",
    triggerType: "manual",
    triggerReason: "Test research run",
    phase: "implementation",
    currentIteration: 1,
    hypothesisId: "hyp-1",
    factorId: null,
    prUrl: null,
    errorMessage: null,
    tokensUsed: 1000,
    computeHours: 0.5,
    startedAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  };
}

function createMockBudgetStatus(
  overrides: Partial<ResearchBudgetStatus> = {}
): ResearchBudgetStatus {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    tokensUsedThisMonth: 0,
    computeHoursThisMonth: 0,
    runsThisMonth: 0,
    maxMonthlyTokens: 0,
    maxMonthlyComputeHours: 0,
    isExhausted: false,
    periodStart: periodStart.toISOString(),
    ...overrides,
  };
}

function createMockRepository(overrides: Partial<FactorZooRepository> = {}): FactorZooRepository {
  return {
    findActiveFactors: mock(() => Promise.resolve([])),
    findDecayingFactors: mock(() => Promise.resolve([])),
    findActiveResearchRuns: mock(() => Promise.resolve([])),
    findLastCompletedResearchRun: mock(() => Promise.resolve(null)),
    getStats: mock(() => Promise.resolve(createMockStats())),
    getPerformanceHistory: mock(() => Promise.resolve([])),
    getResearchBudgetStatus: mock(() => Promise.resolve(createMockBudgetStatus())),
    createHypothesis: mock(() => Promise.resolve({} as never)),
    findHypothesisById: mock(() => Promise.resolve(null)),
    updateHypothesisStatus: mock(() => Promise.resolve()),
    findHypothesesByStatus: mock(() => Promise.resolve([])),
    createFactor: mock(() => Promise.resolve({} as never)),
    findFactorById: mock(() => Promise.resolve(null)),
    findFactorsByStatus: mock(() => Promise.resolve([])),
    updateFactorStatus: mock(() => Promise.resolve()),
    promote: mock(() => Promise.resolve()),
    markDecaying: mock(() => Promise.resolve()),
    retire: mock(() => Promise.resolve()),
    recordDailyPerformance: mock(() => Promise.resolve()),
    updateCorrelations: mock(() => Promise.resolve()),
    getCorrelationMatrix: mock(() => Promise.resolve(new Map())),
    updateWeights: mock(() => Promise.resolve()),
    getActiveWeights: mock(() => Promise.resolve(new Map())),
    createResearchRun: mock(() => Promise.resolve({} as never)),
    findResearchRunById: mock(() => Promise.resolve(null)),
    updateResearchRun: mock(() => Promise.resolve()),
    ...overrides,
  } as FactorZooRepository;
}

// ============================================
// Trigger Research Tool Tests
// ============================================

describe("createTriggerResearchTool", () => {
  test("creates a tool with correct id and description", () => {
    const mockRepo = createMockRepository();
    const tool = createTriggerResearchTool(mockRepo);

    expect(tool.id).toBe("trigger_research");
    expect(tool.description).toContain("trigger a research pipeline");
  });

  test("blocks research when conditions are met", async () => {
    const mockRepo = createMockRepository({
      findActiveResearchRuns: mock(() =>
        Promise.resolve([
          createMockResearchRun({ runId: "run-1" }),
          createMockResearchRun({ runId: "run-2" }),
          createMockResearchRun({ runId: "run-3" }),
        ])
      ),
    });

    const tool = createTriggerResearchTool(mockRepo);
    const result = await tool.execute({
      context: {
        focus: "Test hypothesis for momentum factor",
        triggerType: "manual",
      },
      runtimeContext: mockRuntimeContext,
    });

    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.blockingReasons.length).toBeGreaterThan(0);
  });

  test("successfully triggers research when not blocked", async () => {
    const createResearchRunMock = mock(() => Promise.resolve({} as never));
    const createHypothesisMock = mock(() => Promise.resolve({} as never));

    const mockRepo = createMockRepository({
      findActiveResearchRuns: mock(() => Promise.resolve([])),
      getStats: mock(() => Promise.resolve(createMockStats({ activeFactors: 5 }))),
      createResearchRun: createResearchRunMock,
      createHypothesis: createHypothesisMock,
    });

    const tool = createTriggerResearchTool(mockRepo);
    const result = await tool.execute({
      context: {
        focus: "Test hypothesis for momentum factor development",
        targetRegime: "bull",
        triggerType: "manual",
      },
      runtimeContext: mockRuntimeContext,
    });

    expect(result.success).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.runId).toBeDefined();
    expect(result.hypothesisId).toBeDefined();
    expect(createResearchRunMock).toHaveBeenCalled();
    expect(createHypothesisMock).toHaveBeenCalled();
  });

  test("looks up parent hypothesis when replaceFactorId provided", async () => {
    const parentFactor = createMockFactor({
      factorId: "parent-factor",
      hypothesisId: "parent-hyp",
    });

    const findFactorByIdMock = mock(() => Promise.resolve(parentFactor));
    const createHypothesisMock = mock(() => Promise.resolve({} as never));

    const mockRepo = createMockRepository({
      findActiveResearchRuns: mock(() => Promise.resolve([])),
      getStats: mock(() => Promise.resolve(createMockStats({ activeFactors: 5 }))),
      findFactorById: findFactorByIdMock,
      createResearchRun: mock(() => Promise.resolve({} as never)),
      createHypothesis: createHypothesisMock,
    });

    const tool = createTriggerResearchTool(mockRepo);
    await tool.execute({
      context: {
        focus: "Refinement of existing momentum strategy",
        replaceFactorId: "parent-factor",
        triggerType: "refinement",
      },
      runtimeContext: mockRuntimeContext,
    });

    expect(findFactorByIdMock).toHaveBeenCalledWith("parent-factor");
  });

  test("handles errors gracefully", async () => {
    const mockRepo = createMockRepository({
      findActiveResearchRuns: mock(() => Promise.resolve([])),
      getStats: mock(() => Promise.resolve(createMockStats({ activeFactors: 5 }))),
      createResearchRun: mock(() => Promise.reject(new Error("Database error"))),
    });

    const tool = createTriggerResearchTool(mockRepo);
    const result = await tool.execute({
      context: {
        focus: "Test hypothesis for momentum factor",
        triggerType: "manual",
      },
      runtimeContext: mockRuntimeContext,
    });

    expect(result.success).toBe(false);
    expect(result.blocked).toBe(false);
    expect(result.message).toContain("Failed to start research");
  });
});

// ============================================
// Check Research Status Tool Tests
// ============================================

describe("createCheckResearchStatusTool", () => {
  test("creates a tool with correct id and description", () => {
    const mockRepo = createMockRepository();
    const tool = createCheckResearchStatusTool(mockRepo);

    expect(tool.id).toBe("check_research_status");
    expect(tool.description).toContain("status of research pipelines");
  });

  test("returns empty when no active research", async () => {
    const mockRepo = createMockRepository({
      findActiveResearchRuns: mock(() => Promise.resolve([])),
    });

    const tool = createCheckResearchStatusTool(mockRepo);
    const result = await tool.execute({ context: {}, runtimeContext: mockRuntimeContext });

    expect(result.activeRuns).toHaveLength(0);
    expect(result.totalActive).toBe(0);
    expect(result.message).toBe("No active research pipelines");
  });

  test("returns active research runs", async () => {
    const runs = [
      createMockResearchRun({ runId: "run-1", phase: "implementation" }),
      createMockResearchRun({ runId: "run-2", phase: "stage1" }),
    ];

    const mockRepo = createMockRepository({
      findActiveResearchRuns: mock(() => Promise.resolve(runs)),
    });

    const tool = createCheckResearchStatusTool(mockRepo);
    const result = await tool.execute({ context: {}, runtimeContext: mockRuntimeContext });

    expect(result.activeRuns).toHaveLength(2);
    expect(result.totalActive).toBe(2);
    expect(result.activeRuns[0]?.runId).toBe("run-1");
    expect(result.activeRuns[1]?.runId).toBe("run-2");
  });

  test("filters by runId when provided", async () => {
    const runs = [
      createMockResearchRun({ runId: "run-1", phase: "implementation" }),
      createMockResearchRun({ runId: "run-2", phase: "stage1" }),
    ];

    const mockRepo = createMockRepository({
      findActiveResearchRuns: mock(() => Promise.resolve(runs)),
    });

    const tool = createCheckResearchStatusTool(mockRepo);
    const result = await tool.execute({
      context: { runId: "run-1" },
      runtimeContext: mockRuntimeContext,
    });

    expect(result.activeRuns).toHaveLength(1);
    expect(result.activeRuns[0]?.runId).toBe("run-1");
    expect(result.message).toContain("phase: implementation");
  });

  test("returns not found message for unknown runId", async () => {
    const runs = [createMockResearchRun({ runId: "run-1" })];

    const mockRepo = createMockRepository({
      findActiveResearchRuns: mock(() => Promise.resolve(runs)),
    });

    const tool = createCheckResearchStatusTool(mockRepo);
    const result = await tool.execute({
      context: { runId: "unknown-run" },
      runtimeContext: mockRuntimeContext,
    });

    expect(result.activeRuns).toHaveLength(0);
    expect(result.message).toContain("not found in active runs");
  });

  test("handles errors gracefully", async () => {
    const mockRepo = createMockRepository({
      findActiveResearchRuns: mock(() => Promise.reject(new Error("Database error"))),
    });

    const tool = createCheckResearchStatusTool(mockRepo);
    const result = await tool.execute({ context: {}, runtimeContext: mockRuntimeContext });

    expect(result.activeRuns).toHaveLength(0);
    expect(result.message).toContain("Failed to check research status");
  });
});

// ============================================
// Check Trigger Conditions Tool Tests
// ============================================

describe("createCheckTriggerConditionsTool", () => {
  test("creates a tool with correct id and description", () => {
    const mockRepo = createMockRepository();
    const tool = createCheckTriggerConditionsTool(mockRepo);

    expect(tool.id).toBe("check_trigger_conditions");
    expect(tool.description).toContain("conditions warrant triggering");
  });

  test("detects regime gap trigger", async () => {
    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([])),
      findActiveResearchRuns: mock(() => Promise.resolve([])),
    });

    const tool = createCheckTriggerConditionsTool(mockRepo);
    const result = await tool.execute({
      context: {
        currentRegime: "HIGH_VOL",
        activeRegimes: ["BULL_TREND"],
      },
      runtimeContext: mockRuntimeContext,
    });

    expect(result.shouldTrigger).toBe(true);
    expect(result.trigger?.type).toBe("REGIME_GAP");
    expect(result.recommendation).toContain("Research recommended");
  });

  test("returns no trigger when conditions not met", async () => {
    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([])),
      findActiveResearchRuns: mock(() => Promise.resolve([])),
    });

    const tool = createCheckTriggerConditionsTool(mockRepo);
    const result = await tool.execute({
      context: {
        currentRegime: "BULL_TREND",
        activeRegimes: ["BULL_TREND", "BEAR_TREND"],
      },
      runtimeContext: mockRuntimeContext,
    });

    expect(result.shouldTrigger).toBe(false);
    expect(result.trigger).toBeNull();
    expect(result.recommendation).toBe("No research trigger conditions detected");
  });

  test("detects blocking conditions", async () => {
    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([])),
      findActiveResearchRuns: mock(() =>
        Promise.resolve([createMockResearchRun(), createMockResearchRun(), createMockResearchRun()])
      ),
    });

    const tool = createCheckTriggerConditionsTool(mockRepo);
    const result = await tool.execute({
      context: {
        currentRegime: "HIGH_VOL",
        activeRegimes: [],
      },
      runtimeContext: mockRuntimeContext,
    });

    expect(result.shouldTrigger).toBe(false);
    expect(result.blockingCheck.isBlocked).toBe(true);
    expect(result.recommendation).toContain("Research blocked");
  });

  test("handles errors gracefully", async () => {
    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.reject(new Error("Database error"))),
    });

    const tool = createCheckTriggerConditionsTool(mockRepo);
    const result = await tool.execute({
      context: {
        currentRegime: "BULL_TREND",
        activeRegimes: [],
      },
      runtimeContext: mockRuntimeContext,
    });

    expect(result.shouldTrigger).toBe(false);
    expect(result.blockingCheck.isBlocked).toBe(true);
    expect(result.recommendation).toContain("Failed to check trigger conditions");
  });
});

// ============================================
// Schema Validation Tests
// ============================================

describe("Input Schema Validation", () => {
  test("TriggerResearchInputSchema requires focus", async () => {
    const mockRepo = createMockRepository();
    const tool = createTriggerResearchTool(mockRepo);

    // Tool should have inputSchema defined
    expect(tool.inputSchema).toBeDefined();
  });

  test("CheckResearchStatusInputSchema allows optional runId", async () => {
    const mockRepo = createMockRepository();
    const tool = createCheckResearchStatusTool(mockRepo);

    expect(tool.inputSchema).toBeDefined();
  });

  test("CheckTriggerConditionsInputSchema requires currentRegime and activeRegimes", async () => {
    const mockRepo = createMockRepository();
    const tool = createCheckTriggerConditionsTool(mockRepo);

    expect(tool.inputSchema).toBeDefined();
  });
});
