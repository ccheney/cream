/**
 * Tests for Retrospective Outcome Scoring
 */

import { describe, expect, it } from "bun:test";
import {
  type CompletedTrade,
  getOutcomeSummary,
  type OutcomeScore,
  OutcomeScorer,
  scoreOutcome,
  scoreOutcomes,
} from "../src/outcomeScoring";
import type { DecisionQualityScore } from "../src/planScoring";

// ============================================
// Test Helpers
// ============================================

function createCompletedTrade(overrides: Partial<CompletedTrade> = {}): CompletedTrade {
  return {
    decisionId: "test-decision-1",
    instrumentId: "AAPL",
    direction: "LONG",
    entryPrice: 100,
    exitPrice: 110, // 10% gain
    expectedEntryPrice: 100,
    expectedExitPrice: 115, // Expected 15% gain
    quantity: 100,
    entryTime: "2026-01-01T10:00:00Z",
    exitTime: "2026-01-04T14:00:00Z", // ~76 hours later
    stopLossPrice: 95,
    exitReason: "TAKE_PROFIT",
    benchmarkReturn: 2, // 2% benchmark return
    ...overrides,
  };
}

function createPlanScore(overrides: Partial<DecisionQualityScore> = {}): DecisionQualityScore {
  return {
    decisionId: "test-decision-1",
    overall: 75,
    components: {
      riskReward: 80,
      stopLoss: 100,
      sizing: 80,
      entryTiming: 70,
      rationaleQuality: 75,
    },
    riskLevel: "LOW",
    expectedValue: {
      winProbability: 0.6,
      expectedGain: 0.15,
      expectedLoss: 0.05,
      netExpectedValue: 0.07,
      kellyFraction: 0.15,
    },
    flags: [],
    recommendations: [],
    confidence: 0.8,
    ...overrides,
  };
}

// ============================================
// OutcomeScorer Tests
// ============================================

describe("OutcomeScorer", () => {
  const scorer = new OutcomeScorer();

  describe("scoreOutcome", () => {
    it("should score a profitable long trade", () => {
      const trade = createCompletedTrade();
      const result = scorer.scoreOutcome(trade);

      expect(result.decisionId).toBe("test-decision-1");
      expect(result.realizedReturn).toBe(10); // 10% gain
      expect(result.realizedPnL).toBe(1000); // 100 shares * $10 gain
      expect(result.outcomeScore).toBeGreaterThan(50);
      expect(result.flags.some((f) => f.code === "PROFITABLE")).toBe(true);
    });

    it("should score a losing long trade", () => {
      const trade = createCompletedTrade({
        exitPrice: 90, // 10% loss
        exitReason: "STOP_LOSS",
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.realizedReturn).toBe(-10);
      expect(result.realizedPnL).toBe(-1000);
      expect(result.outcomeScore).toBeLessThan(50);
      expect(result.flags.some((f) => f.code === "LOSS")).toBe(true);
      expect(result.metrics.hitStopLoss).toBe(true);
    });

    it("should score a profitable short trade", () => {
      const trade = createCompletedTrade({
        direction: "SHORT",
        entryPrice: 100,
        exitPrice: 90, // 10% gain on short
        expectedEntryPrice: 100,
        expectedExitPrice: 85,
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.realizedReturn).toBe(10); // 10% gain
      expect(result.realizedPnL).toBe(1000);
      expect(result.flags.some((f) => f.code === "PROFITABLE")).toBe(true);
    });

    it("should score a losing short trade", () => {
      const trade = createCompletedTrade({
        direction: "SHORT",
        entryPrice: 100,
        exitPrice: 110, // 10% loss on short
        expectedEntryPrice: 100,
        expectedExitPrice: 85,
        exitReason: "STOP_LOSS",
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.realizedReturn).toBe(-10);
      expect(result.realizedPnL).toBe(-1000);
      expect(result.flags.some((f) => f.code === "LOSS")).toBe(true);
    });

    it("should include plan score when provided", () => {
      const trade = createCompletedTrade();
      const planScore = createPlanScore();
      const result = scorer.scoreOutcome(trade, planScore);

      expect(result.planScore).toBeDefined();
      expect(result.planScore?.overall).toBe(75);
    });

    it("should flag big winners", () => {
      const trade = createCompletedTrade({
        exitPrice: 108, // 8% gain
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.flags.some((f) => f.code === "BIG_WINNER")).toBe(true);
    });

    it("should flag big losers", () => {
      const trade = createCompletedTrade({
        exitPrice: 92, // 8% loss
        exitReason: "STOP_LOSS",
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.flags.some((f) => f.code === "BIG_LOSER")).toBe(true);
    });
  });

  describe("holding duration", () => {
    it("should calculate holding duration correctly", () => {
      const trade = createCompletedTrade({
        entryTime: "2026-01-01T10:00:00Z",
        exitTime: "2026-01-02T10:00:00Z", // Exactly 24 hours
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.holdingDurationHours).toBe(24);
    });

    it("should handle partial hours", () => {
      const trade = createCompletedTrade({
        entryTime: "2026-01-01T10:00:00Z",
        exitTime: "2026-01-01T12:30:00Z", // 2.5 hours
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.holdingDurationHours).toBe(2.5);
    });
  });

  describe("slippage and execution quality", () => {
    it("should score perfect execution high", () => {
      const trade = createCompletedTrade({
        entryPrice: 100,
        expectedEntryPrice: 100, // No entry slippage
        exitPrice: 110,
        expectedExitPrice: 110, // No exit slippage
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.executionQuality).toBeGreaterThanOrEqual(90);
      expect(result.metrics.entrySlippagePct).toBe(0);
      expect(result.metrics.exitSlippagePct).toBeCloseTo(0, 1);
    });

    it("should penalize entry slippage for long", () => {
      const trade = createCompletedTrade({
        entryPrice: 101, // Paid 1% more than expected
        expectedEntryPrice: 100,
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.metrics.entrySlippagePct).toBe(1); // 1% slippage
      expect(result.executionQuality).toBeLessThan(100);
    });

    it("should penalize exit slippage for long", () => {
      const trade = createCompletedTrade({
        exitPrice: 110,
        expectedExitPrice: 115, // Got 5 less than expected
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.metrics.exitSlippagePct).toBeCloseTo(4.35, 1); // ~4.35% less than expected
    });

    it("should flag high slippage", () => {
      const trade = createCompletedTrade({
        entryPrice: 102, // 2% worse entry
        expectedEntryPrice: 100,
        exitPrice: 108, // 5% worse exit
        expectedExitPrice: 115,
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.flags.some((f) => f.code === "HIGH_SLIPPAGE")).toBe(true);
    });

    it("should reward better-than-expected execution", () => {
      const trade = createCompletedTrade({
        entryPrice: 99, // Paid 1% less than expected (good)
        expectedEntryPrice: 100,
        exitPrice: 116, // Got 1% more than expected (good)
        expectedExitPrice: 115,
      });
      const result = scorer.scoreOutcome(trade);

      // Negative slippage means better execution
      expect(result.metrics.entrySlippagePct).toBe(-1);
    });
  });

  describe("attribution", () => {
    it("should attribute return to market, alpha, and timing", () => {
      const trade = createCompletedTrade({
        benchmarkReturn: 2, // Market returned 2%
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.attribution.marketContribution).toBe(2); // beta=1 * 2%
      expect(result.attribution.totalReturn).toBe(10); // Total 10% return
      // Alpha = 10 - 2 - timing
      expect(result.attribution.alphaContribution).toBeDefined();
    });

    it("should handle no benchmark data", () => {
      const trade = createCompletedTrade({
        benchmarkReturn: undefined,
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.attribution.marketContribution).toBe(0);
    });

    it("should use configured beta", () => {
      const highBetaScorer = new OutcomeScorer({ assumedBeta: 1.5 });
      const trade = createCompletedTrade({
        benchmarkReturn: 2,
      });
      const result = highBetaScorer.scoreOutcome(trade);

      expect(result.attribution.marketContribution).toBe(3); // 1.5 * 2%
    });
  });

  describe("prediction accuracy", () => {
    it("should reward correct positive prediction", () => {
      const trade = createCompletedTrade(); // Profitable
      const planScore = createPlanScore({
        expectedValue: { ...createPlanScore().expectedValue, netExpectedValue: 0.05 }, // Predicted positive
      });

      const result = scorer.scoreOutcome(trade, planScore);

      // Should score higher due to correct prediction
      expect(result.outcomeScore).toBeGreaterThan(60);
    });

    it("should penalize wrong prediction", () => {
      const trade = createCompletedTrade({
        exitPrice: 90, // Loss
        exitReason: "STOP_LOSS",
      });
      const planScore = createPlanScore({
        expectedValue: { ...createPlanScore().expectedValue, netExpectedValue: 0.05 }, // Predicted positive
      });

      const result = scorer.scoreOutcome(trade, planScore);

      // Score should be lower due to wrong prediction
      expect(result.outcomeScore).toBeLessThan(50);
    });
  });

  describe("risk/reward achieved", () => {
    it("should calculate achieved R:R for profitable trade", () => {
      const trade = createCompletedTrade({
        entryPrice: 100,
        exitPrice: 115, // Hit full target
        expectedExitPrice: 115,
        stopLossPrice: 95, // 5 risk for 15 reward planned
      });
      const result = scorer.scoreOutcome(trade);

      // Risk was 5, reward achieved is 15, so R:R = 3
      expect(result.metrics.achievedRiskRewardRatio).toBeCloseTo(3, 1);
      expect(result.flags.some((f) => f.code === "GOOD_RR_ACHIEVED")).toBe(true);
    });

    it("should calculate negative R:R for losing trade", () => {
      const trade = createCompletedTrade({
        entryPrice: 100,
        exitPrice: 95, // Hit stop loss
        expectedExitPrice: 115,
        stopLossPrice: 95,
        exitReason: "STOP_LOSS",
      });
      const result = scorer.scoreOutcome(trade);

      // Lost 1R
      expect(result.metrics.achievedRiskRewardRatio).toBeCloseTo(-1, 1);
      expect(result.flags.some((f) => f.code === "NEGATIVE_RR")).toBe(true);
    });
  });

  describe("exit reason flags", () => {
    it("should flag take profit exit", () => {
      const trade = createCompletedTrade({ exitReason: "TAKE_PROFIT" });
      const result = scorer.scoreOutcome(trade);

      expect(result.flags.some((f) => f.code === "HIT_TARGET")).toBe(true);
    });

    it("should flag stop loss exit", () => {
      const trade = createCompletedTrade({
        exitPrice: 95,
        exitReason: "STOP_LOSS",
      });
      const result = scorer.scoreOutcome(trade);

      expect(result.flags.some((f) => f.code === "STOP_LOSS_WORKED")).toBe(true);
    });

    it("should flag time exit", () => {
      const trade = createCompletedTrade({ exitReason: "TIME_EXIT" });
      const result = scorer.scoreOutcome(trade);

      expect(result.flags.some((f) => f.code === "TIME_EXIT")).toBe(true);
    });
  });
});

// ============================================
// Batch Scoring Tests
// ============================================

describe("scoreOutcomes", () => {
  it("should score multiple trades", () => {
    const trades = [
      createCompletedTrade({ decisionId: "trade-1" }),
      createCompletedTrade({ decisionId: "trade-2", exitPrice: 95, exitReason: "STOP_LOSS" }),
      createCompletedTrade({ decisionId: "trade-3", exitPrice: 105 }),
    ];

    const results = scoreOutcomes(trades);

    expect(results).toHaveLength(3);
    expect(results[0]?.decisionId).toBe("trade-1");
    expect(results[1]?.decisionId).toBe("trade-2");
  });

  it("should use plan scores when provided", () => {
    const trades = [
      createCompletedTrade({ decisionId: "trade-1" }),
      createCompletedTrade({ decisionId: "trade-2" }),
    ];
    const planScores = new Map<string, DecisionQualityScore>([
      ["trade-1", createPlanScore({ decisionId: "trade-1", overall: 80 })],
      ["trade-2", createPlanScore({ decisionId: "trade-2", overall: 60 })],
    ]);

    const results = scoreOutcomes(trades, planScores);

    expect(results[0]?.planScore?.overall).toBe(80);
    expect(results[1]?.planScore?.overall).toBe(60);
  });
});

// ============================================
// Summary Statistics Tests
// ============================================

describe("getOutcomeSummary", () => {
  it("should calculate summary for winning trades", () => {
    const scores: OutcomeScore[] = [
      { ...createOutcomeScore(), realizedReturn: 10, outcomeScore: 80, executionQuality: 90 },
      { ...createOutcomeScore(), realizedReturn: 5, outcomeScore: 70, executionQuality: 85 },
      { ...createOutcomeScore(), realizedReturn: 8, outcomeScore: 75, executionQuality: 88 },
    ];

    const summary = getOutcomeSummary(scores);

    expect(summary.totalTrades).toBe(3);
    expect(summary.winningTrades).toBe(3);
    expect(summary.losingTrades).toBe(0);
    expect(summary.winRate).toBe(1);
    expect(summary.averageReturn).toBeCloseTo(7.67, 1);
    expect(summary.totalReturn).toBe(23);
    expect(summary.profitFactor).toBe(Infinity); // No losses
  });

  it("should calculate summary for mixed trades", () => {
    const scores: OutcomeScore[] = [
      { ...createOutcomeScore(), realizedReturn: 10, outcomeScore: 80, executionQuality: 90 },
      { ...createOutcomeScore(), realizedReturn: -5, outcomeScore: 40, executionQuality: 85 },
      { ...createOutcomeScore(), realizedReturn: 8, outcomeScore: 75, executionQuality: 88 },
      { ...createOutcomeScore(), realizedReturn: -3, outcomeScore: 45, executionQuality: 82 },
    ];

    const summary = getOutcomeSummary(scores);

    expect(summary.totalTrades).toBe(4);
    expect(summary.winningTrades).toBe(2);
    expect(summary.losingTrades).toBe(2);
    expect(summary.winRate).toBe(0.5);
    expect(summary.averageWinner).toBe(9); // (10 + 8) / 2
    expect(summary.averageLoser).toBe(4); // (5 + 3) / 2
    expect(summary.totalReturn).toBe(10); // 10 - 5 + 8 - 3
    expect(summary.profitFactor).toBeCloseTo(2.25, 2); // 18 / 8
  });

  it("should handle empty array", () => {
    const summary = getOutcomeSummary([]);

    expect(summary.totalTrades).toBe(0);
    expect(summary.winRate).toBe(0);
    expect(summary.profitFactor).toBe(0);
    expect(summary.averageOutcomeScore).toBe(0);
  });

  it("should calculate attribution summary", () => {
    const scores: OutcomeScore[] = [
      {
        ...createOutcomeScore(),
        attribution: {
          marketContribution: 2,
          alphaContribution: 5,
          timingContribution: 1,
          totalReturn: 8,
        },
      },
      {
        ...createOutcomeScore(),
        attribution: {
          marketContribution: 1,
          alphaContribution: 3,
          timingContribution: -1,
          totalReturn: 3,
        },
      },
    ];

    const summary = getOutcomeSummary(scores);

    expect(summary.attribution.marketContribution).toBe(3);
    expect(summary.attribution.alphaContribution).toBe(8);
    expect(summary.attribution.timingContribution).toBe(0);
    expect(summary.attribution.totalReturn).toBe(11);
  });

  it("should calculate average holding duration", () => {
    const scores: OutcomeScore[] = [
      { ...createOutcomeScore(), holdingDurationHours: 24 },
      { ...createOutcomeScore(), holdingDurationHours: 48 },
      { ...createOutcomeScore(), holdingDurationHours: 72 },
    ];

    const summary = getOutcomeSummary(scores);

    expect(summary.averageHoldingHours).toBe(48);
  });
});

// ============================================
// Factory Function Tests
// ============================================

describe("scoreOutcome factory function", () => {
  it("should work with defaults", () => {
    const trade = createCompletedTrade();
    const result = scoreOutcome(trade);

    expect(result.decisionId).toBe("test-decision-1");
    expect(result.realizedReturn).toBe(10);
  });

  it("should accept custom config", () => {
    const trade = createCompletedTrade();
    const config = { assumedBeta: 2.0 };
    const result = scoreOutcome(trade, undefined, config);

    // With beta=2, market contribution should be 2 * benchmark return
    expect(result.attribution.marketContribution).toBe(4); // 2 * 2%
  });
});

// ============================================
// Test Helper Functions
// ============================================

function createOutcomeScore(overrides: Partial<OutcomeScore> = {}): OutcomeScore {
  return {
    decisionId: "test",
    realizedReturn: 5,
    realizedPnL: 500,
    holdingDurationHours: 48,
    executionQuality: 85,
    outcomeScore: 70,
    attribution: {
      marketContribution: 1,
      alphaContribution: 3,
      timingContribution: 1,
      totalReturn: 5,
    },
    flags: [],
    metrics: {
      entrySlippagePct: 0.1,
      exitSlippagePct: 0.2,
      totalSlippagePct: 0.3,
      hitStopLoss: false,
      hitTakeProfit: true,
    },
    ...overrides,
  };
}
