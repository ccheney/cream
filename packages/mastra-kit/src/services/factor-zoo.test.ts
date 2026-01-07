/**
 * Factor Zoo Service Tests
 *
 * Unit tests for the FactorZooService implementing AlphaForge Algorithm 2.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Factor, FactorPerformance, FactorZooStats } from "@cream/domain";
import type { FactorZooRepository } from "@cream/storage";
import {
  createFactorZooService,
  DEFAULT_FACTOR_ZOO_CONFIG,
  type FactorZooEventEmitter,
  FactorZooService,
} from "./factor-zoo.js";

// ============================================
// Mock Repository Factory
// ============================================

function createMockRepository(): FactorZooRepository {
  return {
    findActiveFactors: mock(() => Promise.resolve([])),
    findDecayingFactors: mock(() => Promise.resolve([])),
    findFactorById: mock(() => Promise.resolve(null)),
    getPerformanceHistory: mock(() => Promise.resolve([])),
    getActiveWeights: mock(() => Promise.resolve(new Map())),
    updateWeights: mock(() => Promise.resolve()),
    markDecaying: mock(() => Promise.resolve()),
    getStats: mock(() =>
      Promise.resolve({
        totalFactors: 0,
        activeFactors: 0,
        decayingFactors: 0,
        researchFactors: 0,
        retiredFactors: 0,
        averageIc: 0,
        totalWeight: 0,
        hypothesesValidated: 0,
        hypothesesRejected: 0,
      })
    ),
    getCorrelationMatrix: mock(() => Promise.resolve(new Map())),
    // Other methods required by FactorZooRepository but not used
    createFactor: mock(() => Promise.resolve()),
    updateFactor: mock(() => Promise.resolve()),
    deleteFactor: mock(() => Promise.resolve()),
    createHypothesis: mock(() => Promise.resolve()),
    findHypothesisById: mock(() => Promise.resolve(null)),
    updateHypothesis: mock(() => Promise.resolve()),
    createResearchRun: mock(() => Promise.resolve()),
    findResearchRunById: mock(() => Promise.resolve(null)),
    findActiveResearchRuns: mock(() => Promise.resolve([])),
    updateResearchRun: mock(() => Promise.resolve()),
    recordPerformance: mock(() => Promise.resolve()),
    getRecentPerformance: mock(() => Promise.resolve([])),
    getLastPerformance: mock(() => Promise.resolve(null)),
    updateCorrelation: mock(() => Promise.resolve()),
    findBlockingConditions: mock(() =>
      Promise.resolve({ cooldownActive: false, activeRunCount: 0, factorCount: 0 })
    ),
  } as unknown as FactorZooRepository;
}

function createMockFactor(overrides: Partial<Factor> = {}): Factor {
  const now = new Date().toISOString();
  return {
    factorId: `factor-${Math.random().toString(36).slice(2, 8)}`,
    hypothesisId: "hypo-123",
    name: "Test Factor",
    status: "active",
    version: 1,
    author: "test",
    pythonModule: null,
    typescriptModule: null,
    symbolicLength: null,
    parameterCount: null,
    featureCount: null,
    originalityScore: null,
    hypothesisAlignment: null,
    stage1Sharpe: null,
    stage1Ic: null,
    stage1MaxDrawdown: null,
    stage1CompletedAt: null,
    stage2Pbo: null,
    stage2DsrPvalue: null,
    stage2Wfe: null,
    stage2CompletedAt: null,
    paperValidationPassed: false,
    paperStartDate: null,
    paperEndDate: null,
    paperRealizedSharpe: null,
    paperRealizedIc: null,
    currentWeight: 0.1,
    lastIc: null,
    decayRate: null,
    createdAt: now,
    promotedAt: null,
    retiredAt: null,
    lastUpdated: now,
    ...overrides,
  };
}

function createMockPerformance(factorId: string, ic: number, daysAgo = 0): FactorPerformance {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    id: `perf-${factorId}-${daysAgo}`,
    factorId,
    date: date.toISOString().split("T")[0] ?? date.toISOString(),
    ic,
    icir: ic * 10, // Simplified ICIR
    sharpe: 1.0,
    weight: 0.1,
    signalCount: 100,
    createdAt: date.toISOString(),
  };
}

/**
 * Create performance history with some variance to achieve a target ICIR
 * For ICIR = mean / std, we need std = mean / icir
 */
function createPerformanceHistoryWithVariance(
  factorId: string,
  meanIc: number,
  days: number
): FactorPerformance[] {
  // To get ICIR > 0.3 with mean = meanIc, we need std < meanIc / 0.3
  // Let's use a 10% std relative to mean
  const stdDev = meanIc * 0.1;
  return Array.from({ length: days }, (_, i) => {
    // Alternate above and below mean to create variance
    const variance = (i % 2 === 0 ? 1 : -1) * stdDev;
    return createMockPerformance(factorId, meanIc + variance, days - 1 - i);
  });
}

// ============================================
// FactorZooService Tests
// ============================================

describe("FactorZooService", () => {
  let mockRepo: FactorZooRepository;
  let service: FactorZooService;

  beforeEach(() => {
    mockRepo = createMockRepository();
    service = new FactorZooService(mockRepo);
  });

  describe("constructor", () => {
    test("uses default config when not provided", () => {
      const svc = createFactorZooService({ factorZoo: mockRepo });
      expect(svc).toBeInstanceOf(FactorZooService);
    });

    test("merges custom config with defaults", () => {
      const svc = new FactorZooService(mockRepo, { icThreshold: 0.05 });
      expect(svc).toBeInstanceOf(FactorZooService);
    });
  });

  describe("updateDailyWeights", () => {
    test("returns empty result when no active factors", async () => {
      const result = await service.updateDailyWeights();

      expect(result.qualifyingCount).toBe(0);
      expect(result.selectedCount).toBe(0);
      expect(result.weights.size).toBe(0);
      expect(result.zeroedFactors).toHaveLength(0);
    });

    test("skips factors without enough history", async () => {
      const factor = createMockFactor();
      (mockRepo.findActiveFactors as ReturnType<typeof mock>).mockResolvedValue([factor]);
      (mockRepo.getPerformanceHistory as ReturnType<typeof mock>).mockResolvedValue([
        createMockPerformance(factor.factorId, 0.05, 0),
        createMockPerformance(factor.factorId, 0.04, 1),
      ]); // Only 2 days, less than 5 minimum

      const result = await service.updateDailyWeights();

      expect(result.qualifyingCount).toBe(0);
    });

    test("filters factors below IC threshold", async () => {
      const factor = createMockFactor();
      (mockRepo.findActiveFactors as ReturnType<typeof mock>).mockResolvedValue([factor]);
      // IC = 0.01, below threshold of 0.02
      (mockRepo.getPerformanceHistory as ReturnType<typeof mock>).mockResolvedValue([
        createMockPerformance(factor.factorId, 0.01, 0),
        createMockPerformance(factor.factorId, 0.01, 1),
        createMockPerformance(factor.factorId, 0.01, 2),
        createMockPerformance(factor.factorId, 0.01, 3),
        createMockPerformance(factor.factorId, 0.01, 4),
      ]);

      const result = await service.updateDailyWeights();

      expect(result.qualifyingCount).toBe(0);
      expect(result.zeroedFactors).toContain(factor.factorId);
    });

    test("selects qualifying factors and computes IC-weighted weights", async () => {
      const factor1 = createMockFactor({ factorId: "factor-1" });
      const factor2 = createMockFactor({ factorId: "factor-2" });

      (mockRepo.findActiveFactors as ReturnType<typeof mock>).mockResolvedValue([factor1, factor2]);

      // Factor 1: mean IC = 0.04 (qualifies)
      // Factor 2: mean IC = 0.06 (qualifies)
      // Both have variance so ICIR > 0.3
      (mockRepo.getPerformanceHistory as ReturnType<typeof mock>).mockImplementation(
        async (factorId: string, _days: number) => {
          const meanIc = factorId === "factor-1" ? 0.04 : 0.06;
          return createPerformanceHistoryWithVariance(factorId, meanIc, 10);
        }
      );

      const result = await service.updateDailyWeights();

      expect(result.qualifyingCount).toBe(2);
      expect(result.selectedCount).toBe(2);

      // Weight should be IC / total IC
      // Factor 1: 0.04 / 0.10 = 0.4
      // Factor 2: 0.06 / 0.10 = 0.6
      expect(result.weights.get("factor-1")).toBeCloseTo(0.4);
      expect(result.weights.get("factor-2")).toBeCloseTo(0.6);
    });

    test("respects maxFactors limit", async () => {
      // Create 15 factors
      const factors = Array.from({ length: 15 }, (_, i) =>
        createMockFactor({ factorId: `factor-${i}` })
      );

      (mockRepo.findActiveFactors as ReturnType<typeof mock>).mockResolvedValue(factors);
      (mockRepo.getPerformanceHistory as ReturnType<typeof mock>).mockImplementation(
        async (factorId: string, _days: number) => {
          // Give each factor unique IC for sorting (higher index = higher IC)
          const index = Number.parseInt(factorId.split("-")[1] ?? "0", 10);
          const meanIc = 0.03 + index * 0.001;
          return createPerformanceHistoryWithVariance(factorId, meanIc, 10);
        }
      );

      const result = await service.updateDailyWeights();

      expect(result.qualifyingCount).toBe(15);
      expect(result.selectedCount).toBe(DEFAULT_FACTOR_ZOO_CONFIG.maxFactors);

      // Should have zeroed 5 factors (15 - 10)
      expect(result.zeroedFactors).toHaveLength(5);
    });

    test("persists weights to repository", async () => {
      const factor = createMockFactor();
      (mockRepo.findActiveFactors as ReturnType<typeof mock>).mockResolvedValue([factor]);
      (mockRepo.getPerformanceHistory as ReturnType<typeof mock>).mockResolvedValue([
        createMockPerformance(factor.factorId, 0.05, 0),
        createMockPerformance(factor.factorId, 0.05, 1),
        createMockPerformance(factor.factorId, 0.05, 2),
        createMockPerformance(factor.factorId, 0.05, 3),
        createMockPerformance(factor.factorId, 0.05, 4),
      ]);

      await service.updateDailyWeights();

      expect(mockRepo.updateWeights).toHaveBeenCalledTimes(1);
    });
  });

  describe("computeMegaAlpha", () => {
    test("returns zero when no weights", async () => {
      (mockRepo.getActiveWeights as ReturnType<typeof mock>).mockResolvedValue(new Map());

      const signals = new Map([["factor-1", 0.5]]);
      const result = await service.computeMegaAlpha(signals);

      expect(result.value).toBe(0);
      expect(result.contributingFactors).toHaveLength(0);
    });

    test("computes weighted sum of signals", async () => {
      (mockRepo.getActiveWeights as ReturnType<typeof mock>).mockResolvedValue(
        new Map([
          ["factor-1", 0.4],
          ["factor-2", 0.6],
        ])
      );

      const signals = new Map([
        ["factor-1", 1.0],
        ["factor-2", 0.5],
      ]);

      const result = await service.computeMegaAlpha(signals);

      // 0.4 * 1.0 + 0.6 * 0.5 = 0.4 + 0.3 = 0.7
      expect(result.value).toBeCloseTo(0.7);
      expect(result.contributingFactors).toContain("factor-1");
      expect(result.contributingFactors).toContain("factor-2");
    });

    test("ignores signals for factors with zero weight", async () => {
      (mockRepo.getActiveWeights as ReturnType<typeof mock>).mockResolvedValue(
        new Map([
          ["factor-1", 1.0],
          ["factor-2", 0],
        ])
      );

      const signals = new Map([
        ["factor-1", 0.5],
        ["factor-2", 100.0], // High value but zero weight
      ]);

      const result = await service.computeMegaAlpha(signals);

      expect(result.value).toBeCloseTo(0.5);
      expect(result.contributingFactors).toEqual(["factor-1"]);
    });

    test("ignores signals for unknown factors", async () => {
      (mockRepo.getActiveWeights as ReturnType<typeof mock>).mockResolvedValue(
        new Map([["factor-1", 1.0]])
      );

      const signals = new Map([
        ["factor-1", 0.5],
        ["unknown-factor", 100.0],
      ]);

      const result = await service.computeMegaAlpha(signals);

      expect(result.value).toBeCloseTo(0.5);
      expect(result.contributingFactors).toEqual(["factor-1"]);
    });
  });

  describe("computeMegaAlphaForSymbols", () => {
    test("computes mega-alpha for multiple symbols", async () => {
      (mockRepo.getActiveWeights as ReturnType<typeof mock>).mockResolvedValue(
        new Map([
          ["factor-1", 0.5],
          ["factor-2", 0.5],
        ])
      );

      const symbolSignals = new Map([
        [
          "AAPL",
          new Map([
            ["factor-1", 1.0],
            ["factor-2", 0.5],
          ]),
        ],
        [
          "GOOGL",
          new Map([
            ["factor-1", -0.5],
            ["factor-2", 1.0],
          ]),
        ],
      ]);

      const results = await service.computeMegaAlphaForSymbols(symbolSignals);

      expect(results.size).toBe(2);

      // AAPL: 0.5 * 1.0 + 0.5 * 0.5 = 0.75
      expect(results.get("AAPL")?.value).toBeCloseTo(0.75);

      // GOOGL: 0.5 * -0.5 + 0.5 * 1.0 = 0.25
      expect(results.get("GOOGL")?.value).toBeCloseTo(0.25);
    });
  });

  describe("checkDecay", () => {
    test("returns empty array when no active factors", async () => {
      const results = await service.checkDecay();
      expect(results).toHaveLength(0);
    });

    test("detects decaying factors", async () => {
      const factor = createMockFactor({ factorId: "decaying-factor" });
      (mockRepo.findActiveFactors as ReturnType<typeof mock>).mockResolvedValue([factor]);

      // Create history where peak IC is 0.10 and recent average is well below 50% of peak
      // Peak IC = 0.10, decay threshold = 0.5, so recentIC needs to be < 0.05
      // Recent IC is the mean of all history, so we need most values to be low
      const history = Array.from({ length: 20 }, (_, i) => {
        // One day with peak IC, rest are very low
        const ic = i === 0 ? 0.1 : 0.01;
        return createMockPerformance(factor.factorId, ic, 19 - i);
      });
      (mockRepo.getPerformanceHistory as ReturnType<typeof mock>).mockResolvedValue(history);

      const results = await service.checkDecay();

      expect(results).toHaveLength(1);
      expect(results[0]?.isDecaying).toBe(true);
      expect(results[0]?.peakIC).toBe(0.1);
      // Mean IC = (0.10 + 19 * 0.01) / 20 = 0.29 / 20 = 0.0145
      expect(results[0]?.recentIC).toBeLessThan(0.05); // Below 50% of peak
    });

    test("marks decaying factors in repository", async () => {
      const factor = createMockFactor({ factorId: "decaying-factor" });
      (mockRepo.findActiveFactors as ReturnType<typeof mock>).mockResolvedValue([factor]);

      // Peak IC = 0.10, most values = 0.01, mean < 50% of peak
      const history = Array.from({ length: 20 }, (_, i) => {
        const ic = i === 0 ? 0.1 : 0.01;
        return createMockPerformance(factor.factorId, ic, 19 - i);
      });
      (mockRepo.getPerformanceHistory as ReturnType<typeof mock>).mockResolvedValue(history);

      await service.checkDecay();

      expect(mockRepo.markDecaying).toHaveBeenCalled();
    });

    test("emits event for decaying factors", async () => {
      const mockEmitter: FactorZooEventEmitter = {
        emit: mock(() => Promise.resolve()),
      };

      const serviceWithEmitter = new FactorZooService(mockRepo, undefined, mockEmitter);

      const factor = createMockFactor({ factorId: "decaying-factor" });
      (mockRepo.findActiveFactors as ReturnType<typeof mock>).mockResolvedValue([factor]);

      // Peak IC = 0.10, most values = 0.01, mean < 50% of peak
      const history = Array.from({ length: 20 }, (_, i) => {
        const ic = i === 0 ? 0.1 : 0.01;
        return createMockPerformance(factor.factorId, ic, 19 - i);
      });
      (mockRepo.getPerformanceHistory as ReturnType<typeof mock>).mockResolvedValue(history);

      await serviceWithEmitter.checkDecay();

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        "factor_decay",
        expect.objectContaining({
          factorId: factor.factorId,
        })
      );
    });

    test("healthy factors not marked as decaying", async () => {
      const factor = createMockFactor();
      (mockRepo.findActiveFactors as ReturnType<typeof mock>).mockResolvedValue([factor]);

      // Consistent IC of 0.05 - no decay
      const history = Array.from({ length: 20 }, (_, i) =>
        createMockPerformance(factor.factorId, 0.05, 19 - i)
      );
      (mockRepo.getPerformanceHistory as ReturnType<typeof mock>).mockResolvedValue(history);

      const results = await service.checkDecay();

      expect(results).toHaveLength(1);
      expect(results[0]?.isDecaying).toBe(false);
      expect(mockRepo.markDecaying).not.toHaveBeenCalled();
    });
  });

  describe("checkFactorDecay", () => {
    test("returns null for non-existent factor", async () => {
      const result = await service.checkFactorDecay("unknown-factor");
      expect(result).toBeNull();
    });

    test("returns null for non-active factor", async () => {
      const factor = createMockFactor({ status: "retired" });
      (mockRepo.findFactorById as ReturnType<typeof mock>).mockResolvedValue(factor);

      const result = await service.checkFactorDecay(factor.factorId);
      expect(result).toBeNull();
    });

    test("returns null when insufficient history", async () => {
      const factor = createMockFactor();
      (mockRepo.findFactorById as ReturnType<typeof mock>).mockResolvedValue(factor);
      (mockRepo.getPerformanceHistory as ReturnType<typeof mock>).mockResolvedValue([
        createMockPerformance(factor.factorId, 0.05, 0),
      ]);

      const result = await service.checkFactorDecay(factor.factorId);
      expect(result).toBeNull();
    });

    test("returns decay status for valid factor", async () => {
      const factor = createMockFactor();
      (mockRepo.findFactorById as ReturnType<typeof mock>).mockResolvedValue(factor);

      const history = Array.from({ length: 20 }, (_, i) =>
        createMockPerformance(factor.factorId, 0.05, 19 - i)
      );
      (mockRepo.getPerformanceHistory as ReturnType<typeof mock>).mockResolvedValue(history);

      const result = await service.checkFactorDecay(factor.factorId);

      expect(result).not.toBeNull();
      expect(result?.factorId).toBe(factor.factorId);
      expect(result?.isDecaying).toBe(false);
    });
  });

  describe("getActiveFactors", () => {
    test("delegates to repository", async () => {
      const factors = [createMockFactor()];
      (mockRepo.findActiveFactors as ReturnType<typeof mock>).mockResolvedValue(factors);

      const result = await service.getActiveFactors();

      expect(result).toEqual(factors);
      expect(mockRepo.findActiveFactors).toHaveBeenCalledTimes(1);
    });
  });

  describe("getDecayingFactors", () => {
    test("delegates to repository", async () => {
      const factors = [createMockFactor({ status: "decaying" as Factor["status"] })];
      (mockRepo.findDecayingFactors as ReturnType<typeof mock>).mockResolvedValue(factors);

      const result = await service.getDecayingFactors();

      expect(result).toEqual(factors);
      expect(mockRepo.findDecayingFactors).toHaveBeenCalledTimes(1);
    });
  });

  describe("getCurrentWeights", () => {
    test("delegates to repository", async () => {
      const weights = new Map([["factor-1", 0.5]]);
      (mockRepo.getActiveWeights as ReturnType<typeof mock>).mockResolvedValue(weights);

      const result = await service.getCurrentWeights();

      expect(result).toEqual(weights);
      expect(mockRepo.getActiveWeights).toHaveBeenCalledTimes(1);
    });
  });

  describe("getStats", () => {
    test("delegates to repository", async () => {
      const stats: FactorZooStats = {
        totalFactors: 10,
        activeFactors: 5,
        decayingFactors: 2,
        researchFactors: 1,
        retiredFactors: 2,
        averageIc: 0.05,
        totalWeight: 1.0,
        hypothesesValidated: 3,
        hypothesesRejected: 1,
      };
      (mockRepo.getStats as ReturnType<typeof mock>).mockResolvedValue(stats);

      const result = await service.getStats();

      expect(result).toEqual(stats);
      expect(mockRepo.getStats).toHaveBeenCalledTimes(1);
    });
  });

  describe("getQualifyingFactors", () => {
    test("returns factors meeting thresholds", async () => {
      const factor1 = createMockFactor({ factorId: "qualifies" });
      const factor2 = createMockFactor({ factorId: "fails" });

      (mockRepo.findActiveFactors as ReturnType<typeof mock>).mockResolvedValue([factor1, factor2]);

      (mockRepo.getPerformanceHistory as ReturnType<typeof mock>).mockImplementation(
        async (factorId: string, _days: number) => {
          if (factorId === "qualifies") {
            // IC = 0.05 (above 0.02), ICIR will be high with variance
            return createPerformanceHistoryWithVariance(factorId, 0.05, 10);
          } else {
            // IC = 0.01 (below 0.02 threshold)
            return createPerformanceHistoryWithVariance(factorId, 0.01, 10);
          }
        }
      );

      const result = await service.getQualifyingFactors();

      expect(result).toHaveLength(1);
      expect(result[0]?.factorId).toBe("qualifies");
    });
  });

  describe("getCorrelationMatrix", () => {
    test("delegates to repository", async () => {
      const matrix = new Map([["factor-1", new Map([["factor-2", 0.5]])]]);
      (mockRepo.getCorrelationMatrix as ReturnType<typeof mock>).mockResolvedValue(matrix);

      const result = await service.getCorrelationMatrix();

      expect(result).toEqual(matrix);
      expect(mockRepo.getCorrelationMatrix).toHaveBeenCalledTimes(1);
    });
  });
});

describe("createFactorZooService", () => {
  test("creates service with repository", () => {
    const mockRepo = createMockRepository();
    const service = createFactorZooService({ factorZoo: mockRepo });

    expect(service).toBeInstanceOf(FactorZooService);
  });

  test("creates service with custom config", () => {
    const mockRepo = createMockRepository();
    const service = createFactorZooService({ factorZoo: mockRepo }, { maxFactors: 5 });

    expect(service).toBeInstanceOf(FactorZooService);
  });

  test("creates service with event emitter", () => {
    const mockRepo = createMockRepository();
    const mockEmitter: FactorZooEventEmitter = {
      emit: mock(() => Promise.resolve()),
    };

    const service = createFactorZooService({
      factorZoo: mockRepo,
      eventEmitter: mockEmitter,
    });

    expect(service).toBeInstanceOf(FactorZooService);
  });
});

describe("DEFAULT_FACTOR_ZOO_CONFIG", () => {
  test("has expected default values", () => {
    expect(DEFAULT_FACTOR_ZOO_CONFIG.icThreshold).toBe(0.02);
    expect(DEFAULT_FACTOR_ZOO_CONFIG.icirThreshold).toBe(0.3);
    expect(DEFAULT_FACTOR_ZOO_CONFIG.maxFactors).toBe(10);
    expect(DEFAULT_FACTOR_ZOO_CONFIG.lookbackDays).toBe(20);
    expect(DEFAULT_FACTOR_ZOO_CONFIG.decayThreshold).toBe(0.5);
    expect(DEFAULT_FACTOR_ZOO_CONFIG.decayWindow).toBe(20);
  });
});
