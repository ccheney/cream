/**
 * Research Trigger Service Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { describe, expect, mock, test } from "bun:test";
import type {
  Factor,
  FactorPerformance,
  FactorZooStats,
  ResearchBudgetStatus,
  ResearchRun,
  TriggerDetectionState,
} from "@cream/domain";
import { DEFAULT_RESEARCH_TRIGGER_CONFIG } from "@cream/domain";
import type { FactorZooRepository } from "@cream/storage";
import { type MarketBetaProvider, ResearchTriggerService } from "./research-trigger";

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
    targetRegimes: null,
    parityReport: null,
    parityValidatedAt: null,
    createdAt: "2025-01-01T00:00:00Z",
    promotedAt: "2025-01-15T00:00:00Z",
    retiredAt: null,
    lastUpdated: "2025-01-20T00:00:00Z",
    ...overrides,
  };
}

function createMockPerformance(
  factorId: string,
  date: string,
  overrides: Partial<FactorPerformance> = {}
): FactorPerformance {
  return {
    id: crypto.randomUUID(),
    factorId,
    date,
    ic: 0.05,
    icir: 0.5,
    sharpe: 1.0,
    weight: 0.1,
    signalCount: 100,
    createdAt: date,
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
    // Add other methods as no-ops
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

function createMockState(overrides: Partial<TriggerDetectionState> = {}): TriggerDetectionState {
  return {
    currentRegime: "BULL_TREND",
    activeRegimes: ["BULL_TREND", "BEAR_TREND"],
    activeFactorIds: ["factor-1", "factor-2"],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================
// Blocking Conditions Tests
// ============================================

describe("ResearchTriggerService - Blocking Conditions", () => {
  test("blocks when in cooldown period", async () => {
    const mockRepo = createMockRepository({
      findActiveResearchRuns: mock(() => Promise.resolve([{ runId: "run-1" } as ResearchRun])),
    });

    const service = new ResearchTriggerService({ factorZoo: mockRepo });
    const result = await service.shouldTriggerResearch(createMockState());

    expect(result.shouldTrigger).toBe(false);
    expect(result.blockingCheck.isBlocked).toBe(true);
    expect(result.blockingCheck.reasons).toContainEqual(expect.stringContaining("Cooldown active"));
  });

  test("blocks when too many active research pipelines", async () => {
    const mockRepo = createMockRepository({
      findActiveResearchRuns: mock(() =>
        Promise.resolve([
          { runId: "run-1", phase: "implementation" } as ResearchRun,
          { runId: "run-2", phase: "stage1" } as ResearchRun,
          { runId: "run-3", phase: "stage2" } as ResearchRun,
        ])
      ),
    });

    const service = new ResearchTriggerService(
      { factorZoo: mockRepo },
      { ...DEFAULT_RESEARCH_TRIGGER_CONFIG, maxActiveResearch: 2 }
    );
    const result = await service.shouldTriggerResearch(createMockState());

    expect(result.shouldTrigger).toBe(false);
    expect(result.blockingCheck.isBlocked).toBe(true);
    expect(result.blockingCheck.reasons).toContainEqual(
      expect.stringContaining("Too many active research pipelines")
    );
  });

  test("blocks when Factor Zoo at capacity", async () => {
    const mockRepo = createMockRepository({
      getStats: mock(() => Promise.resolve(createMockStats({ activeFactors: 35 }))),
    });

    const service = new ResearchTriggerService(
      { factorZoo: mockRepo },
      { ...DEFAULT_RESEARCH_TRIGGER_CONFIG, maxFactorZooSize: 30 }
    );
    const result = await service.shouldTriggerResearch(createMockState());

    expect(result.shouldTrigger).toBe(false);
    expect(result.blockingCheck.isBlocked).toBe(true);
    expect(result.blockingCheck.reasons).toContainEqual(
      expect.stringContaining("Factor Zoo at capacity")
    );
  });

  test("not blocked when all conditions pass", async () => {
    const mockRepo = createMockRepository({
      findActiveResearchRuns: mock(() => Promise.resolve([])),
      getStats: mock(() => Promise.resolve(createMockStats({ activeFactors: 5 }))),
    });

    const service = new ResearchTriggerService({ factorZoo: mockRepo });
    const result = await service.checkBlockingConditions();

    expect(result.isBlocked).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });
});

// ============================================
// Regime Gap Detection Tests
// ============================================

describe("ResearchTriggerService - Regime Gap Detection", () => {
  test("detects regime gap when current regime not covered", async () => {
    const mockRepo = createMockRepository();
    const service = new ResearchTriggerService({ factorZoo: mockRepo });

    const state = createMockState({
      currentRegime: "HIGH_VOL",
      activeRegimes: ["BULL_TREND", "BEAR_TREND"],
    });

    const result = await service.shouldTriggerResearch(state);

    expect(result.shouldTrigger).toBe(true);
    expect(result.trigger?.type).toBe("REGIME_GAP");
    expect(result.trigger?.severity).toBe("HIGH"); // HIGH_VOL is high severity
    expect(result.trigger?.suggestedFocus).toContain("HIGH_VOL");
  });

  test("does not detect regime gap when regime is covered", async () => {
    const mockRepo = createMockRepository();
    const service = new ResearchTriggerService({ factorZoo: mockRepo });

    const state = createMockState({
      currentRegime: "BULL_TREND",
      activeRegimes: ["BULL_TREND", "BEAR_TREND"],
    });

    const result = await service.shouldTriggerResearch(state);

    // Should not trigger regime gap specifically
    const regimeGapTrigger = result.allTriggers.find((t) => t.type === "REGIME_GAP");
    expect(regimeGapTrigger).toBeUndefined();
  });

  test("regime gap has MEDIUM severity for non-volatile regimes", async () => {
    const mockRepo = createMockRepository();
    const service = new ResearchTriggerService({ factorZoo: mockRepo });

    const state = createMockState({
      currentRegime: "RANGE",
      activeRegimes: ["BULL_TREND"],
    });

    const result = await service.shouldTriggerResearch(state);

    expect(result.trigger?.type).toBe("REGIME_GAP");
    expect(result.trigger?.severity).toBe("MEDIUM");
  });
});

// ============================================
// Alpha Decay Detection Tests
// ============================================

describe("ResearchTriggerService - Alpha Decay Detection", () => {
  test("detects alpha decay when IC drops below 50% of peak", async () => {
    const factor = createMockFactor({ factorId: "decaying-factor" });

    // Create performance history with decay
    // Peak IC = 0.10, then drops to 0.04 (< 50% of peak)
    const performanceHistory: FactorPerformance[] = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      performanceHistory.push(
        createMockPerformance(factor.factorId, date.toISOString(), {
          ic: i < 20 ? 0.04 : 0.1, // Recent 20 days have low IC
          sharpe: 1.0,
        })
      );
    }

    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([factor])),
      getPerformanceHistory: mock(() => Promise.resolve(performanceHistory)),
    });

    const service = new ResearchTriggerService({ factorZoo: mockRepo });
    const state = createMockState({ activeRegimes: ["BULL_TREND"] });
    const result = await service.shouldTriggerResearch(state);

    expect(result.allTriggers.some((t) => t.type === "ALPHA_DECAY")).toBe(true);
    const decayTrigger = result.allTriggers.find((t) => t.type === "ALPHA_DECAY");
    expect(decayTrigger?.affectedFactors).toContain("decaying-factor");
  });

  test("does not detect decay when IC is above threshold", async () => {
    const factor = createMockFactor({ factorId: "healthy-factor" });

    // Create performance history with stable IC
    const performanceHistory: FactorPerformance[] = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      performanceHistory.push(
        createMockPerformance(factor.factorId, date.toISOString(), {
          ic: 0.08, // Stable IC well above threshold
          sharpe: 1.0,
        })
      );
    }

    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([factor])),
      getPerformanceHistory: mock(() => Promise.resolve(performanceHistory)),
    });

    const service = new ResearchTriggerService({ factorZoo: mockRepo });
    const state = createMockState({ activeRegimes: ["BULL_TREND"] });
    const result = await service.shouldTriggerResearch(state);

    const decayTrigger = result.allTriggers.find((t) => t.type === "ALPHA_DECAY");
    expect(decayTrigger).toBeUndefined();
  });

  test("skips decay check when insufficient history", async () => {
    const factor = createMockFactor({ factorId: "new-factor" });

    // Only 5 days of history (less than minimum 20)
    const performanceHistory: FactorPerformance[] = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      performanceHistory.push(
        createMockPerformance(factor.factorId, date.toISOString(), {
          ic: 0.02, // Low IC but not enough history
        })
      );
    }

    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([factor])),
      getPerformanceHistory: mock(() => Promise.resolve(performanceHistory)),
    });

    const service = new ResearchTriggerService({ factorZoo: mockRepo });
    const state = createMockState({ activeRegimes: ["BULL_TREND"] });
    const result = await service.shouldTriggerResearch(state);

    const decayTrigger = result.allTriggers.find((t) => t.type === "ALPHA_DECAY");
    expect(decayTrigger).toBeUndefined();
  });
});

// ============================================
// Performance Degradation Tests
// ============================================

describe("ResearchTriggerService - Performance Degradation Detection", () => {
  test("detects performance degradation when Sharpe below threshold", async () => {
    const factor = createMockFactor({ factorId: "underperforming-factor" });

    // Create performance history with low Sharpe
    const performanceHistory: FactorPerformance[] = [];
    for (let i = 0; i < 15; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      performanceHistory.push(
        createMockPerformance(factor.factorId, date.toISOString(), {
          ic: 0.05,
          sharpe: 0.3, // Below 0.5 threshold
        })
      );
    }

    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([factor])),
      getPerformanceHistory: mock(() => Promise.resolve(performanceHistory)),
    });

    const service = new ResearchTriggerService({ factorZoo: mockRepo });
    const state = createMockState({ activeRegimes: ["BULL_TREND"] });
    const result = await service.shouldTriggerResearch(state);

    expect(result.allTriggers.some((t) => t.type === "PERFORMANCE_DEGRADATION")).toBe(true);
    const perfTrigger = result.allTriggers.find((t) => t.type === "PERFORMANCE_DEGRADATION");
    expect(perfTrigger?.affectedFactors).toContain("underperforming-factor");
  });

  test("does not detect degradation when Sharpe is acceptable", async () => {
    const factor = createMockFactor({ factorId: "good-factor" });

    // Create performance history with good Sharpe
    const performanceHistory: FactorPerformance[] = [];
    for (let i = 0; i < 15; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      performanceHistory.push(
        createMockPerformance(factor.factorId, date.toISOString(), {
          ic: 0.05,
          sharpe: 1.2, // Well above 0.5 threshold
        })
      );
    }

    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([factor])),
      getPerformanceHistory: mock(() => Promise.resolve(performanceHistory)),
    });

    const service = new ResearchTriggerService({ factorZoo: mockRepo });
    const state = createMockState({ activeRegimes: ["BULL_TREND"] });
    const result = await service.shouldTriggerResearch(state);

    const perfTrigger = result.allTriggers.find((t) => t.type === "PERFORMANCE_DEGRADATION");
    expect(perfTrigger).toBeUndefined();
  });
});

// ============================================
// Factor Crowding Detection Tests
// ============================================

describe("ResearchTriggerService - Factor Crowding Detection", () => {
  test("detects factor crowding when correlation with market beta is high", async () => {
    const factor = createMockFactor({ factorId: "crowded-factor" });

    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([factor])),
    });

    const mockBetaProvider: MarketBetaProvider = {
      getMarketBeta: mock(() => Promise.resolve(0.9)), // High correlation
    };

    const service = new ResearchTriggerService(
      { factorZoo: mockRepo },
      undefined,
      mockBetaProvider
    );
    const state = createMockState({ activeRegimes: ["BULL_TREND"] });
    const result = await service.shouldTriggerResearch(state);

    expect(result.allTriggers.some((t) => t.type === "FACTOR_CROWDING")).toBe(true);
    const crowdingTrigger = result.allTriggers.find((t) => t.type === "FACTOR_CROWDING");
    expect(crowdingTrigger?.affectedFactors).toContain("crowded-factor");
  });

  test("does not detect crowding when correlation is below threshold", async () => {
    const factor = createMockFactor({ factorId: "orthogonal-factor" });

    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([factor])),
    });

    const mockBetaProvider: MarketBetaProvider = {
      getMarketBeta: mock(() => Promise.resolve(0.3)), // Low correlation
    };

    const service = new ResearchTriggerService(
      { factorZoo: mockRepo },
      undefined,
      mockBetaProvider
    );
    const state = createMockState({ activeRegimes: ["BULL_TREND"] });
    const result = await service.shouldTriggerResearch(state);

    const crowdingTrigger = result.allTriggers.find((t) => t.type === "FACTOR_CROWDING");
    expect(crowdingTrigger).toBeUndefined();
  });

  test("skips crowding check when no market beta provider", async () => {
    const factor = createMockFactor({ factorId: "factor-1" });

    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([factor])),
    });

    // No market beta provider
    const service = new ResearchTriggerService({ factorZoo: mockRepo });
    const state = createMockState({ activeRegimes: ["BULL_TREND"] });
    const result = await service.shouldTriggerResearch(state);

    const crowdingTrigger = result.allTriggers.find((t) => t.type === "FACTOR_CROWDING");
    expect(crowdingTrigger).toBeUndefined();
  });
});

// ============================================
// Severity Tests
// ============================================

describe("ResearchTriggerService - Severity Calculation", () => {
  test("HIGH severity when many factors affected", async () => {
    const factors = [
      createMockFactor({ factorId: "factor-1" }),
      createMockFactor({ factorId: "factor-2" }),
      createMockFactor({ factorId: "factor-3" }),
      createMockFactor({ factorId: "factor-4" }),
    ];

    // Create performance history with low Sharpe for all factors
    const performanceHistory: FactorPerformance[] = [];
    for (let i = 0; i < 15; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      performanceHistory.push(
        createMockPerformance("any", date.toISOString(), {
          ic: 0.05,
          sharpe: 0.3,
        })
      );
    }

    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve(factors)),
      getPerformanceHistory: mock(() => Promise.resolve(performanceHistory)),
    });

    const service = new ResearchTriggerService({ factorZoo: mockRepo });
    const state = createMockState({ activeRegimes: ["BULL_TREND"] });
    const result = await service.shouldTriggerResearch(state);

    const perfTrigger = result.allTriggers.find((t) => t.type === "PERFORMANCE_DEGRADATION");
    expect(perfTrigger?.severity).toBe("HIGH");
  });

  test("LOW severity when single factor affected", async () => {
    const factor = createMockFactor({ factorId: "factor-1" });

    // Create performance history with low Sharpe
    const performanceHistory: FactorPerformance[] = [];
    for (let i = 0; i < 15; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      performanceHistory.push(
        createMockPerformance(factor.factorId, date.toISOString(), {
          ic: 0.05,
          sharpe: 0.3,
        })
      );
    }

    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([factor])),
      getPerformanceHistory: mock(() => Promise.resolve(performanceHistory)),
    });

    const service = new ResearchTriggerService({ factorZoo: mockRepo });
    const state = createMockState({ activeRegimes: ["BULL_TREND"] });
    const result = await service.shouldTriggerResearch(state);

    const perfTrigger = result.allTriggers.find((t) => t.type === "PERFORMANCE_DEGRADATION");
    expect(perfTrigger?.severity).toBe("LOW");
  });
});

// ============================================
// Integration Tests
// ============================================

describe("ResearchTriggerService - Integration", () => {
  test("returns first trigger when multiple conditions met", async () => {
    const mockRepo = createMockRepository();
    const service = new ResearchTriggerService({ factorZoo: mockRepo });

    // Regime gap should be detected first (highest priority)
    const state = createMockState({
      currentRegime: "HIGH_VOL",
      activeRegimes: [],
    });

    const result = await service.shouldTriggerResearch(state);

    expect(result.shouldTrigger).toBe(true);
    expect(result.trigger?.type).toBe("REGIME_GAP"); // First trigger wins
  });

  test("returns all triggers in allTriggers array", async () => {
    const factor = createMockFactor({ factorId: "factor-1" });

    // Create performance history with both decay and low performance
    const performanceHistory: FactorPerformance[] = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      performanceHistory.push(
        createMockPerformance(factor.factorId, date.toISOString(), {
          ic: i < 20 ? 0.02 : 0.1, // Decay condition
          sharpe: 0.3, // Performance degradation condition
        })
      );
    }

    const mockRepo = createMockRepository({
      findActiveFactors: mock(() => Promise.resolve([factor])),
      getPerformanceHistory: mock(() => Promise.resolve(performanceHistory)),
    });

    const mockBetaProvider: MarketBetaProvider = {
      getMarketBeta: mock(() => Promise.resolve(0.9)), // Crowding condition
    };

    const service = new ResearchTriggerService(
      { factorZoo: mockRepo },
      undefined,
      mockBetaProvider
    );
    const state = createMockState({
      currentRegime: "HIGH_VOL",
      activeRegimes: [], // Regime gap condition
    });

    const result = await service.shouldTriggerResearch(state);

    // Should have multiple triggers detected
    expect(result.allTriggers.length).toBeGreaterThanOrEqual(1);
    expect(result.allTriggers.some((t) => t.type === "REGIME_GAP")).toBe(true);
  });

  test("includes checkedAt timestamp", async () => {
    const mockRepo = createMockRepository();
    const service = new ResearchTriggerService({ factorZoo: mockRepo });

    const before = new Date().toISOString();
    const result = await service.shouldTriggerResearch(createMockState());
    const after = new Date().toISOString();

    expect(result.checkedAt).toBeDefined();
    expect(result.checkedAt >= before).toBe(true);
    expect(result.checkedAt <= after).toBe(true);
  });
});
