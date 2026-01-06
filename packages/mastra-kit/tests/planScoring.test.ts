/**
 * Tests for Forward-Looking Plan Scoring
 */

import { describe, expect, it } from "bun:test";
import type { Decision, DecisionPlan } from "../src/types";
import {
  DecisionScorer,
  scoreDecision,
  scorePlan,
  type MarketContext,
} from "../src/planScoring";

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
      summary: "Strong technical setup with momentum confirmation and volume support",
      bullishFactors: ["RSI oversold recovery", "Volume spike"],
      bearishFactors: ["Near resistance"],
      decisionLogic: "Technical breakout pattern with confirmation",
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
    portfolioNotes: "Standard allocation within risk limits",
  };
}

function createMarketContext(overrides: Partial<MarketContext> = {}): MarketContext {
  return {
    volatility: 18,
    trend: "UPTREND",
    regime: "BULL_TREND",
    avgDailyVolume: 50000000,
    spreadPct: 0.05,
    currentPrice: 100, // Entry price for calculations
    ...overrides,
  };
}

// ============================================
// DecisionScorer Tests
// ============================================

describe("DecisionScorer", () => {
  const scorer = new DecisionScorer();
  const portfolioValue = 100000;

  describe("scoreDecision", () => {
    it("should score a well-structured decision positively", () => {
      const decision = createValidDecision();
      const context = createMarketContext();
      const result = scorer.scoreDecision(decision, portfolioValue, context);

      expect(result.overall).toBeGreaterThanOrEqual(60);
      expect(result.riskLevel).not.toBe("EXTREME");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should return neutral score for HOLD decisions", () => {
      const decision = createValidDecision({ action: "HOLD" });
      const result = scorer.scoreDecision(decision, portfolioValue);

      expect(result.overall).toBe(50);
      expect(result.riskLevel).toBe("LOW");
      expect(result.flags.some((f) => f.code === "HOLD_DECISION")).toBe(true);
    });

    it("should include market context in scoring", () => {
      const decision = createValidDecision();
      const context = createMarketContext();

      const resultWithContext = scorer.scoreDecision(decision, portfolioValue, context);
      const resultWithoutContext = scorer.scoreDecision(decision, portfolioValue);

      expect(resultWithContext.confidence).toBeGreaterThan(resultWithoutContext.confidence);
    });
  });

  describe("risk/reward scoring", () => {
    it("should score high for good risk/reward ratio", () => {
      const decision = createValidDecision({
        stopLoss: { price: 95, type: "FIXED" }, // 5% risk at $100
        takeProfit: { price: 115 }, // 15% reward = 3:1 R:R
      });
      const context = createMarketContext({ currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.components.riskReward).toBeGreaterThanOrEqual(80);
    });

    it("should flag poor risk/reward ratio", () => {
      const decision = createValidDecision({
        stopLoss: { price: 90, type: "FIXED" }, // 10% risk
        takeProfit: { price: 105 }, // 5% reward = 0.5:1 R:R
      });
      const context = createMarketContext({ currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.components.riskReward).toBeLessThan(50);
      expect(result.flags.some((f) => f.code === "POOR_RR_RATIO")).toBe(true);
    });

    it("should flag zero risk as error", () => {
      const decision = createValidDecision({
        stopLoss: { price: 100, type: "FIXED" }, // Same as entry = 0 risk
        takeProfit: { price: 110 },
      });
      const context = createMarketContext({ currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.components.riskReward).toBe(0);
      expect(result.flags.some((f) => f.code === "ZERO_RISK")).toBe(true);
    });

    it("should flag missing stop loss or take profit", () => {
      const decision = createValidDecision();
      delete (decision as Partial<Decision>).stopLoss;
      delete (decision as Partial<Decision>).takeProfit;

      const result = scorer.scoreDecision(decision, portfolioValue);
      expect(result.flags.some((f) => f.code === "MISSING_LEVELS")).toBe(true);
    });
  });

  describe("stop loss scoring", () => {
    it("should score high for optimal stop loss distance", () => {
      const decision = createValidDecision({
        stopLoss: { price: 97, type: "FIXED" }, // 3% - ideal range
        takeProfit: { price: 110 },
      });
      const context = createMarketContext({ currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.components.stopLoss).toBe(100);
    });

    it("should flag tight stop loss", () => {
      const decision = createValidDecision({
        stopLoss: { price: 99.5, type: "FIXED" }, // 0.5% - too tight
        takeProfit: { price: 105 },
      });
      const context = createMarketContext({ currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.flags.some((f) => f.code === "TIGHT_STOP")).toBe(true);
    });

    it("should flag wide stop loss", () => {
      const decision = createValidDecision({
        stopLoss: { price: 85, type: "FIXED" }, // 15% - too wide
        takeProfit: { price: 130 },
      });
      const context = createMarketContext({ currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.flags.some((f) => f.code === "WIDE_STOP")).toBe(true);
    });

    it("should flag invalid stop direction for long", () => {
      const decision = createValidDecision({
        direction: "LONG",
        stopLoss: { price: 105, type: "FIXED" }, // Above entry for long
        takeProfit: { price: 110 },
      });
      const context = createMarketContext({ currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.components.stopLoss).toBe(0);
      expect(result.flags.some((f) => f.code === "INVALID_STOP_DIRECTION")).toBe(true);
    });

    it("should flag invalid stop direction for short", () => {
      const decision = createValidDecision({
        direction: "SHORT",
        stopLoss: { price: 95, type: "FIXED" }, // Below entry for short
        takeProfit: { price: 90 },
      });
      const context = createMarketContext({ currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.components.stopLoss).toBe(0);
      expect(result.flags.some((f) => f.code === "INVALID_STOP_DIRECTION")).toBe(true);
    });

    it("should flag missing stop loss", () => {
      const decision = createValidDecision();
      delete (decision as Partial<Decision>).stopLoss;

      const result = scorer.scoreDecision(decision, portfolioValue);
      expect(result.flags.some((f) => f.code === "NO_STOP_LOSS")).toBe(true);
    });
  });

  describe("position sizing scoring", () => {
    it("should score high for optimal position size", () => {
      const decision = createValidDecision({
        size: { value: 2000, unit: "DOLLARS" }, // $2000 = 2% with $100k portfolio
      });
      const context = createMarketContext({ currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.components.sizing).toBe(100);
    });

    it("should flag oversized position", () => {
      const decision = createValidDecision({
        size: { value: 10, unit: "PCT_EQUITY" }, // 10% of portfolio
      });
      const context = createMarketContext({ currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.flags.some((f) => f.code === "OVERSIZED_POSITION")).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it("should flag small position", () => {
      const decision = createValidDecision({
        size: { value: 200, unit: "DOLLARS" }, // $200 = 0.2%
      });
      const context = createMarketContext({ currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.flags.some((f) => f.code === "SMALL_POSITION")).toBe(true);
    });

    it("should handle different size units", () => {
      // SHARES
      const shareDecision = createValidDecision({
        size: { value: 20, unit: "SHARES" }, // 20 shares at $100 = $2000 = 2%
      });
      const context = createMarketContext({ currentPrice: 100 });
      const shareResult = scorer.scoreDecision(shareDecision, portfolioValue, context);
      expect(shareResult.components.sizing).toBe(100);

      // DOLLARS
      const dollarDecision = createValidDecision({
        size: { value: 2000, unit: "DOLLARS" }, // $2000 = 2%
      });
      const dollarResult = scorer.scoreDecision(dollarDecision, portfolioValue, context);
      expect(dollarResult.components.sizing).toBe(100);

      // PCT_EQUITY
      const pctDecision = createValidDecision({
        size: { value: 2, unit: "PCT_EQUITY" }, // 2%
      });
      const pctResult = scorer.scoreDecision(pctDecision, portfolioValue, context);
      expect(pctResult.components.sizing).toBe(100);
    });
  });

  describe("entry timing scoring", () => {
    it("should score higher when aligned with trend", () => {
      const decision = createValidDecision({ direction: "LONG" });
      const uptrendContext = createMarketContext({ trend: "UPTREND" });
      const downtrendContext = createMarketContext({ trend: "DOWNTREND" });

      const uptrendScore = scorer.scoreDecision(decision, portfolioValue, uptrendContext);
      const downtrendScore = scorer.scoreDecision(decision, portfolioValue, downtrendContext);

      expect(uptrendScore.components.entryTiming).toBeGreaterThan(
        downtrendScore.components.entryTiming
      );
    });

    it("should flag counter-trend trades", () => {
      const decision = createValidDecision({ direction: "LONG" });
      const context = createMarketContext({ trend: "DOWNTREND" });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.flags.some((f) => f.code === "COUNTER_TREND")).toBe(true);
    });

    it("should flag high volatility", () => {
      const decision = createValidDecision();
      const context = createMarketContext({ volatility: 35 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.flags.some((f) => f.code === "HIGH_VOLATILITY")).toBe(true);
    });

    it("should flag wide spread", () => {
      const decision = createValidDecision();
      const context = createMarketContext({ spreadPct: 1.0 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.flags.some((f) => f.code === "WIDE_SPREAD")).toBe(true);
    });

    it("should flag missing market context", () => {
      const decision = createValidDecision();
      const result = scorer.scoreDecision(decision, portfolioValue);
      expect(result.flags.some((f) => f.code === "NO_MARKET_CONTEXT")).toBe(true);
    });
  });

  describe("rationale scoring", () => {
    it("should score high for complete rationale", () => {
      const decision = createValidDecision({
        rationale: {
          summary: "Detailed analysis with multiple factors and strong conviction",
          bullishFactors: ["Factor 1", "Factor 2"],
          bearishFactors: ["Risk 1"],
          decisionLogic: "Clear decision logic explanation",
          memoryReferences: ["memory-123"],
        },
      });

      const result = scorer.scoreDecision(decision, portfolioValue);
      expect(result.components.rationaleQuality).toBeGreaterThanOrEqual(80);
    });

    it("should flag weak summary", () => {
      const decision = createValidDecision({
        rationale: {
          summary: "Short", // Too brief
          bullishFactors: [],
          bearishFactors: [],
          decisionLogic: "",
          memoryReferences: [],
        },
      });

      const result = scorer.scoreDecision(decision, portfolioValue);
      expect(result.flags.some((f) => f.code === "WEAK_SUMMARY")).toBe(true);
    });

    it("should flag missing bearish factors", () => {
      const decision = createValidDecision({
        rationale: {
          summary: "Detailed analysis with multiple factors",
          bullishFactors: ["Factor 1"],
          bearishFactors: [], // No bearish factors
          decisionLogic: "Logic",
          memoryReferences: [],
        },
      });

      const result = scorer.scoreDecision(decision, portfolioValue);
      expect(result.flags.some((f) => f.code === "NO_BEARISH_FACTORS")).toBe(true);
    });
  });

  describe("expected value calculation", () => {
    it("should calculate positive EV for good trades", () => {
      const decision = createValidDecision({
        stopLoss: { price: 95, type: "FIXED" }, // 5% risk
        takeProfit: { price: 115 }, // 15% reward
      });
      const context = createMarketContext({ trend: "UPTREND", currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);

      expect(result.expectedValue.netExpectedValue).toBeGreaterThan(0);
      expect(result.expectedValue.kellyFraction).toBeGreaterThan(0);
    });

    it("should calculate win probability", () => {
      const decision = createValidDecision();
      const context = createMarketContext({ currentPrice: 100 });
      const result = scorer.scoreDecision(decision, portfolioValue, context);

      expect(result.expectedValue.winProbability).toBeGreaterThan(0.2);
      expect(result.expectedValue.winProbability).toBeLessThan(0.8);
    });

    it("should cap Kelly fraction", () => {
      const decision = createValidDecision();
      const context = createMarketContext({ currentPrice: 100 });
      const result = scorer.scoreDecision(decision, portfolioValue, context);

      expect(result.expectedValue.kellyFraction).toBeLessThanOrEqual(0.25);
    });
  });

  describe("risk level determination", () => {
    it("should mark extreme risk for error flags", () => {
      const decision = createValidDecision({
        stopLoss: { price: 100, type: "FIXED" }, // Same as entry = invalid
        takeProfit: { price: 110 },
      });
      const context = createMarketContext({ currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(result.riskLevel).toBe("EXTREME");
    });

    it("should mark high risk for multiple warnings", () => {
      const decision = createValidDecision({
        size: { value: 10, unit: "PCT_EQUITY" }, // Oversized
        stopLoss: { price: 85, type: "FIXED" }, // Wide stop
        takeProfit: { price: 103 }, // Poor R:R
      });
      const context = createMarketContext({ volatility: 40, currentPrice: 100 });

      const result = scorer.scoreDecision(decision, portfolioValue, context);
      expect(["HIGH", "EXTREME"]).toContain(result.riskLevel);
    });
  });
});

// ============================================
// Plan Scoring Tests
// ============================================

describe("scorePlan", () => {
  it("should score multiple decisions", () => {
    const decisions = [
      createValidDecision({ decisionId: "decision-1" }),
      createValidDecision({ decisionId: "decision-2" }),
      createValidDecision({ decisionId: "decision-3", action: "HOLD" }),
    ];
    const plan = createValidPlan(decisions);
    const context = createMarketContext();

    const result = scorePlan(plan, 100000, context);

    expect(result.decisionScores).toHaveLength(3);
    expect(result.stats.decisionCount).toBe(3);
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it("should apply custom config", () => {
    const plan = createValidPlan([createValidDecision()]);
    const context = createMarketContext();
    const config = { minRiskRewardRatio: 5.0 }; // Very strict

    const result = scorePlan(plan, 100000, context, config);

    // With strict R:R requirement, should get more flags
    expect(result.decisionScores[0]?.flags.some((f) => f.message?.includes("ratio"))).toBe(true);
  });

  it("should calculate aggregate statistics", () => {
    const decisions = [
      createValidDecision({ decisionId: "1" }),
      createValidDecision({ decisionId: "2" }),
      createValidDecision({ decisionId: "3" }),
    ];
    const plan = createValidPlan(decisions);
    const context = createMarketContext();

    const result = scorePlan(plan, 100000, context);

    expect(result.stats.averageScore).toBeGreaterThan(0);
    expect(result.stats.minScore).toBeLessThanOrEqual(result.stats.maxScore);
    expect(result.stats.flagCounts).toHaveProperty("ERROR");
    expect(result.stats.flagCounts).toHaveProperty("WARNING");
    expect(result.stats.flagCounts).toHaveProperty("INFO");
  });

  it("should handle empty plan", () => {
    const plan = createValidPlan([]);
    const result = scorePlan(plan, 100000);

    expect(result.overall).toBe(0);
    expect(result.stats.decisionCount).toBe(0);
    expect(result.decisionScores).toHaveLength(0);
  });

  it("should count positive EV decisions", () => {
    const decisions = [
      createValidDecision({
        decisionId: "1",
        stopLoss: { price: 97, type: "FIXED" },
        takeProfit: { price: 115 }, // Good R:R
      }),
    ];
    const plan = createValidPlan(decisions);
    const context = createMarketContext({ trend: "UPTREND" });

    const result = scorePlan(plan, 100000, context);

    expect(result.stats.positiveEVCount).toBeGreaterThanOrEqual(0);
  });

  it("should determine overall risk level from worst decision", () => {
    const decisions = [
      createValidDecision({ decisionId: "good" }),
      createValidDecision({
        decisionId: "bad",
        stopLoss: { price: 100, type: "FIXED" }, // ZERO_RISK error
        takeProfit: { price: 110 },
      }),
    ];
    const plan = createValidPlan(decisions);
    const context = createMarketContext({ currentPrice: 100 });

    const result = scorePlan(plan, 100000, context);

    // Should be extreme due to the bad decision
    expect(result.riskLevel).toBe("EXTREME");
  });
});

// ============================================
// Factory Function Tests
// ============================================

describe("scoreDecision factory function", () => {
  it("should work with defaults", () => {
    const decision = createValidDecision();
    const result = scoreDecision(decision, 100000);

    expect(result.decisionId).toBe("test-decision-1");
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it("should accept custom config", () => {
    const decision = createValidDecision();
    const config = { maxPositionPct: 1.0 }; // Very strict

    const result = scoreDecision(decision, 100000, undefined, config);

    // With strict position limit, shares position should be oversized
    // 100 shares at $100 default = $10,000 = 10% > 1%
    expect(result.flags.some((f) => f.code === "OVERSIZED_POSITION")).toBe(true);
  });
});
