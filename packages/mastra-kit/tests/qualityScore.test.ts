/**
 * Tests for Quality Score Integration
 */

import { describe, expect, it, beforeEach } from "bun:test";
import {
  QualityScoreService,
  createQualityScoreService,
  type QualityScore,
} from "../src/qualityScore";
import type { Decision, DecisionPlan } from "../src/types";
import type { CompletedTrade } from "../src/outcomeScoring";
import type { DecisionQualityScore, MarketContext } from "../src/planScoring";

// ============================================
// Test Helpers
// ============================================

function createValidDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    decisionId: "test-decision-1",
    instrumentId: "AAPL",
    action: "BUY",
    direction: "LONG",
    size: { value: 100, unit: "SHARES" },
    stopLoss: { price: 95, type: "FIXED" },
    takeProfit: { price: 115 },
    strategyFamily: "EQUITY_LONG",
    timeHorizon: "SWING",
    rationale: {
      summary: "Strong technical setup with momentum confirmation",
      bullishFactors: ["RSI oversold recovery", "Volume spike"],
      bearishFactors: ["Near resistance"],
      decisionLogic: "Technical breakout pattern",
      memoryReferences: ["memory-123"],
    },
    thesisState: "ENTERED",
    ...overrides,
  };
}

function createValidPlan(decisions: Decision[] = [createValidDecision()]): DecisionPlan {
  return {
    cycleId: "2026-01-04T15:00:00Z",
    timestamp: new Date().toISOString(),
    decisions,
    portfolioNotes: "Standard allocation",
  };
}

function createMarketContext(overrides: Partial<MarketContext> = {}): MarketContext {
  return {
    volatility: 18,
    trend: "UPTREND",
    regime: "BULL_TREND",
    avgDailyVolume: 50000000,
    spreadPct: 0.05,
    currentPrice: 100,
    ...overrides,
  };
}

function createCompletedTrade(overrides: Partial<CompletedTrade> = {}): CompletedTrade {
  return {
    decisionId: "test-decision-1",
    instrumentId: "AAPL",
    direction: "LONG",
    entryPrice: 100,
    exitPrice: 110,
    expectedEntryPrice: 100,
    expectedExitPrice: 115,
    quantity: 100,
    entryTime: "2026-01-01T10:00:00Z",
    exitTime: "2026-01-04T14:00:00Z",
    stopLossPrice: 95,
    exitReason: "TAKE_PROFIT",
    benchmarkReturn: 2,
    ...overrides,
  };
}

// ============================================
// QualityScoreService Tests
// ============================================

describe("QualityScoreService", () => {
  let service: QualityScoreService;

  beforeEach(() => {
    service = new QualityScoreService();
  });

  describe("scoreDecision", () => {
    it("should score a decision and return quality score", () => {
      const decision = createValidDecision();
      const context = createMarketContext();
      const result = service.scoreDecision(decision, 100000, context);

      expect(result.scoreType).toBe("DECISION");
      expect(result.targetId).toBe("test-decision-1");
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);
      expect(result.planScore).toBeDefined();
      expect(result.riskLevel).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it("should cache decision scores", () => {
      const decision = createValidDecision();
      service.scoreDecision(decision, 100000);

      // Score outcome - should find cached plan score
      const trade = createCompletedTrade();
      const outcomeResult = service.scoreOutcome(trade);

      expect(outcomeResult.outcomeScore?.planScore).toBeDefined();
    });
  });

  describe("scorePlan", () => {
    it("should score a plan with multiple decisions", () => {
      const decisions = [
        createValidDecision({ decisionId: "d1" }),
        createValidDecision({ decisionId: "d2" }),
      ];
      const plan = createValidPlan(decisions);
      const context = createMarketContext();

      const result = service.scorePlan(plan, 100000, context);

      expect(result.scoreType).toBe("PLAN");
      expect(result.targetId).toBe(plan.cycleId);
      expect(result.planScore).toBeDefined();
    });

    it("should handle empty plan", () => {
      const plan = createValidPlan([]);
      const result = service.scorePlan(plan, 100000);

      expect(result.overall).toBe(0);
    });
  });

  describe("scoreOutcome", () => {
    it("should score a completed trade", () => {
      const trade = createCompletedTrade();
      const result = service.scoreOutcome(trade);

      expect(result.scoreType).toBe("OUTCOME");
      expect(result.targetId).toBe(trade.decisionId);
      expect(result.outcomeScore).toBeDefined();
      expect(result.overall).toBeGreaterThan(0);
    });

    it("should use cached plan score when available", () => {
      const decision = createValidDecision();
      service.scoreDecision(decision, 100000, createMarketContext());

      const trade = createCompletedTrade();
      const result = service.scoreOutcome(trade);

      expect(result.outcomeScore?.planScore).toBeDefined();
    });

    it("should record feedback when plan score available", () => {
      const decision = createValidDecision();
      service.scoreDecision(decision, 100000, createMarketContext());

      const trade = createCompletedTrade();
      service.scoreOutcome(trade);

      const feedback = service.getFeedbackHistory();
      expect(feedback.length).toBe(1);
      expect(feedback[0]?.decisionId).toBe("test-decision-1");
    });
  });

  describe("scoreCombined", () => {
    it("should combine pre and post execution scores", () => {
      const decision = createValidDecision();
      const preScore = service.scoreDecision(decision, 100000, createMarketContext());

      const trade = createCompletedTrade();
      const result = service.scoreCombined(trade);

      expect(result.scoreType).toBe("COMBINED");
      expect(result.planScore).toBeDefined();
      expect(result.outcomeScore).toBeDefined();
      expect(result.predictionAccuracy).toBeDefined();
    });

    it("should calculate prediction accuracy", () => {
      const decision = createValidDecision();
      service.scoreDecision(decision, 100000, createMarketContext());

      const trade = createCompletedTrade(); // Profitable trade
      const result = service.scoreCombined(trade);

      expect(result.predictionAccuracy).toBeDefined();
      expect(result.predictionAccuracy?.directionCorrect).toBeDefined();
      expect(result.predictionAccuracy?.accuracyScore).toBeGreaterThan(0);
    });

    it("should handle missing pre-score", () => {
      const trade = createCompletedTrade({ decisionId: "unknown" });
      const result = service.scoreCombined(trade);

      expect(result.scoreType).toBe("COMBINED");
      expect(result.planScore).toBeUndefined();
      expect(result.predictionAccuracy).toBeUndefined();
      expect(result.outcomeScore).toBeDefined();
      expect(result.overall).toBe(result.outcomeScore!.outcomeScore);
    });

    it("should use provided pre-score over cached", () => {
      const mockPreScore: DecisionQualityScore = {
        decisionId: "test-decision-1",
        overall: 90,
        components: {
          riskReward: 90,
          stopLoss: 90,
          sizing: 90,
          entryTiming: 90,
          rationaleQuality: 90,
        },
        riskLevel: "LOW",
        expectedValue: {
          winProbability: 0.7,
          expectedGain: 0.15,
          expectedLoss: 0.05,
          netExpectedValue: 0.08,
          kellyFraction: 0.2,
        },
        flags: [],
        recommendations: [],
        confidence: 0.9,
      };

      const trade = createCompletedTrade();
      const result = service.scoreCombined(trade, mockPreScore);

      expect(result.planScore).toEqual(mockPreScore);
    });
  });

  describe("risk level", () => {
    it("should derive LOW risk from profitable outcome", () => {
      const trade = createCompletedTrade({ exitPrice: 110 }); // Profitable
      const result = service.scoreOutcome(trade);

      expect(result.riskLevel).toBe("LOW");
    });

    it("should derive HIGH risk from large loss", () => {
      const trade = createCompletedTrade({
        exitPrice: 85, // 15% loss
        exitReason: "STOP_LOSS",
      });
      const result = service.scoreOutcome(trade);

      expect(result.riskLevel).toBe("HIGH");
    });

    it("should combine risk levels from pre and post scores", () => {
      // Create decision with HIGH risk
      const decision = createValidDecision({
        stopLoss: { price: 100, type: "FIXED" }, // Invalid - same as entry
        takeProfit: { price: 110 },
      });
      service.scoreDecision(decision, 100000, createMarketContext({ currentPrice: 100 }));

      const trade = createCompletedTrade();
      const result = service.scoreCombined(trade);

      // Should take worst risk level
      expect(["HIGH", "EXTREME"]).toContain(result.riskLevel);
    });
  });
});

// ============================================
// Feedback System Tests
// ============================================

describe("Feedback System", () => {
  let service: QualityScoreService;

  beforeEach(() => {
    service = new QualityScoreService({ enableFeedback: true });
  });

  describe("getFeedbackHistory", () => {
    it("should return empty array initially", () => {
      expect(service.getFeedbackHistory()).toHaveLength(0);
    });

    it("should record feedback after combined scoring", () => {
      const decision = createValidDecision();
      service.scoreDecision(decision, 100000, createMarketContext());

      const trade = createCompletedTrade();
      service.scoreCombined(trade);

      const history = service.getFeedbackHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.decisionId).toBe("test-decision-1");
      expect(history[0]?.predictedReturn).toBeDefined();
      expect(history[0]?.actualReturn).toBe(10); // 10% gain
    });

    it("should respect maxFeedbackEntries", () => {
      const smallService = new QualityScoreService({
        enableFeedback: true,
        maxFeedbackEntries: 3,
      });

      for (let i = 0; i < 5; i++) {
        const decision = createValidDecision({ decisionId: `d${i}` });
        smallService.scoreDecision(decision, 100000, createMarketContext());

        const trade = createCompletedTrade({ decisionId: `d${i}` });
        smallService.scoreCombined(trade);
      }

      const history = smallService.getFeedbackHistory();
      expect(history).toHaveLength(3);
      // Should have the latest 3 entries
      expect(history[0]?.decisionId).toBe("d2");
      expect(history[2]?.decisionId).toBe("d4");
    });
  });

  describe("getFeedbackSummary", () => {
    it("should return zero values for empty history", () => {
      const summary = service.getFeedbackSummary();

      expect(summary.totalEntries).toBe(0);
      expect(summary.directionAccuracyRate).toBe(0);
      expect(summary.averageReturnError).toBe(0);
    });

    it("should calculate summary statistics", () => {
      // Create some winning trades
      for (let i = 0; i < 3; i++) {
        const decision = createValidDecision({ decisionId: `win${i}` });
        service.scoreDecision(decision, 100000, createMarketContext());

        const trade = createCompletedTrade({
          decisionId: `win${i}`,
          exitPrice: 110, // Profitable
        });
        service.scoreCombined(trade);
      }

      // Create a losing trade
      const losingDecision = createValidDecision({ decisionId: "lose1" });
      service.scoreDecision(losingDecision, 100000, createMarketContext());

      const losingTrade = createCompletedTrade({
        decisionId: "lose1",
        exitPrice: 90, // Loss
        exitReason: "STOP_LOSS",
      });
      service.scoreCombined(losingTrade);

      const summary = service.getFeedbackSummary();

      expect(summary.totalEntries).toBe(4);
      expect(summary.directionAccuracyRate).toBe(0.75); // 3 of 4 correct
      expect(summary.averagePreScore).toBeGreaterThan(0);
      expect(summary.averagePostScore).toBeGreaterThan(0);
    });

    it("should calculate calibration metrics", () => {
      // Create high confidence winning trade
      const highConfWin = createValidDecision({ decisionId: "hc-win" });
      service.scoreDecision(highConfWin, 100000, createMarketContext());
      service.scoreCombined(createCompletedTrade({
        decisionId: "hc-win",
        exitPrice: 120, // Big win
      }));

      // Create high confidence losing trade (overconfident)
      const highConfLoss = createValidDecision({ decisionId: "hc-loss" });
      service.scoreDecision(highConfLoss, 100000, createMarketContext());
      service.scoreCombined(createCompletedTrade({
        decisionId: "hc-loss",
        exitPrice: 90,
        exitReason: "STOP_LOSS",
      }));

      const summary = service.getFeedbackSummary();

      expect(summary.calibration.highConfidenceCorrect).toBeGreaterThanOrEqual(0);
      expect(summary.calibration.overconfidentRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe("clearFeedbackHistory", () => {
    it("should clear all feedback entries", () => {
      const decision = createValidDecision();
      service.scoreDecision(decision, 100000, createMarketContext());
      service.scoreCombined(createCompletedTrade());

      expect(service.getFeedbackHistory()).toHaveLength(1);

      service.clearFeedbackHistory();

      expect(service.getFeedbackHistory()).toHaveLength(0);
    });
  });
});

// ============================================
// Prediction Accuracy Tests
// ============================================

describe("Prediction Accuracy", () => {
  let service: QualityScoreService;

  beforeEach(() => {
    service = new QualityScoreService();
  });

  it("should mark direction correct for winning trade with positive EV prediction", () => {
    const decision = createValidDecision();
    service.scoreDecision(decision, 100000, createMarketContext());

    const trade = createCompletedTrade({ exitPrice: 110 }); // Profitable
    const result = service.scoreCombined(trade);

    expect(result.predictionAccuracy?.directionCorrect).toBe(true);
  });

  it("should mark direction wrong for losing trade with positive EV prediction", () => {
    const decision = createValidDecision();
    service.scoreDecision(decision, 100000, createMarketContext());

    const trade = createCompletedTrade({
      exitPrice: 90, // Loss
      exitReason: "STOP_LOSS",
    });
    const result = service.scoreCombined(trade);

    expect(result.predictionAccuracy?.directionCorrect).toBe(false);
  });

  it("should calculate return difference", () => {
    const decision = createValidDecision();
    service.scoreDecision(decision, 100000, createMarketContext());

    const trade = createCompletedTrade({ exitPrice: 105 }); // 5% return
    const result = service.scoreCombined(trade);

    expect(result.predictionAccuracy?.returnDifferenceAbs).toBeDefined();
    expect(result.predictionAccuracy?.returnDifferenceAbs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// Factory Function Tests
// ============================================

describe("createQualityScoreService", () => {
  it("should create service with default config", () => {
    const service = createQualityScoreService();
    expect(service).toBeInstanceOf(QualityScoreService);
  });

  it("should create service with custom config", () => {
    const service = createQualityScoreService({
      planWeight: 0.3,
      outcomeWeight: 0.7,
      enableFeedback: false,
    });

    const decision = createValidDecision();
    service.scoreDecision(decision, 100000, createMarketContext());

    const trade = createCompletedTrade();
    service.scoreCombined(trade);

    // Feedback should be disabled
    expect(service.getFeedbackHistory()).toHaveLength(0);
  });
});

// ============================================
// Integration Tests
// ============================================

describe("Integration", () => {
  it("should handle complete workflow: decision -> trade -> feedback", () => {
    const service = new QualityScoreService();

    // 1. Score decision before execution
    const decision = createValidDecision();
    const context = createMarketContext();
    const preScore = service.scoreDecision(decision, 100000, context);

    expect(preScore.scoreType).toBe("DECISION");
    expect(preScore.overall).toBeGreaterThan(50);

    // 2. Trade completes
    const trade = createCompletedTrade({
      exitPrice: 112, // Good win
      exitReason: "TAKE_PROFIT",
    });

    // 3. Score outcome and combine
    const combinedScore = service.scoreCombined(trade);

    expect(combinedScore.scoreType).toBe("COMBINED");
    expect(combinedScore.planScore).toBeDefined();
    expect(combinedScore.outcomeScore).toBeDefined();
    expect(combinedScore.predictionAccuracy?.directionCorrect).toBe(true);

    // 4. Check feedback recorded
    const feedback = service.getFeedbackHistory();
    expect(feedback.length).toBe(1);
    expect(feedback[0]?.actualReturn).toBe(12); // 12% gain

    // 5. Check feedback summary
    const summary = service.getFeedbackSummary();
    expect(summary.totalEntries).toBe(1);
    expect(summary.directionAccuracyRate).toBe(1); // 100% so far
  });

  it("should track multiple trades and provide portfolio-level insights", () => {
    const service = new QualityScoreService();
    const context = createMarketContext();

    // Create and score multiple decisions/trades
    const trades = [
      { id: "t1", exitPrice: 115, reason: "TAKE_PROFIT" as const },
      { id: "t2", exitPrice: 105, reason: "TAKE_PROFIT" as const },
      { id: "t3", exitPrice: 92, reason: "STOP_LOSS" as const },
      { id: "t4", exitPrice: 108, reason: "TAKE_PROFIT" as const },
    ];

    const outcomeScores = trades.map(({ id, exitPrice, reason }) => {
      const decision = createValidDecision({ decisionId: id });
      service.scoreDecision(decision, 100000, context);

      const trade = createCompletedTrade({
        decisionId: id,
        exitPrice,
        exitReason: reason,
      });
      const result = service.scoreCombined(trade);
      return result.outcomeScore!;
    });

    // Get portfolio summary
    const summary = service.getOutcomeSummary(outcomeScores);

    expect(summary.totalTrades).toBe(4);
    expect(summary.winningTrades).toBe(3);
    expect(summary.losingTrades).toBe(1);
    expect(summary.winRate).toBe(0.75);

    // Check feedback summary
    const feedbackSummary = service.getFeedbackSummary();
    expect(feedbackSummary.totalEntries).toBe(4);
  });
});
