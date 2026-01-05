/**
 * Test Helpers for Behavioral Property Tests
 *
 * Helper functions to create test scenarios for agent invariant testing.
 *
 * @see docs/plans/14-testing.md lines 425-476
 */

import type { Decision, DecisionPlan } from "@cream/domain";

// ============================================
// Types
// ============================================

/**
 * Violation types for Risk Manager testing
 */
export type RiskViolationType =
  | "per_instrument_limit" // Single position too large
  | "portfolio_limit" // Total allocation too large
  | "greeks_limit" // Delta/Gamma/Vega limits exceeded
  | "leverage_limit" // Notional exceeds equity * leverage
  | "correlation_limit"; // Too correlated with existing positions

/**
 * Mismatch types for Critic testing
 */
export type CriticMismatchType =
  | "regime_mismatch" // Bullish rationale but bearish regime
  | "volume_mismatch" // Momentum play but low volume
  | "setup_mismatch" // Breakout setup but range regime
  | "confidence_mismatch"; // High confidence but weak signals

/**
 * Risk Manager verdict
 */
export interface RiskManagerVerdict {
  verdict: "APPROVE" | "REJECT";
  violations: string[];
  riskMetrics: {
    portfolioRisk: number;
    positionRisk: number;
    correlationRisk: number;
  };
  notes?: string;
}

/**
 * Critic verdict
 */
export interface CriticVerdict {
  verdict: "APPROVE" | "REJECT";
  issues: string[];
  suggestions: string[];
  score: number;
}

/**
 * Consensus result
 */
export interface ConsensusResult {
  approved: boolean;
  riskManagerVerdict: RiskManagerVerdict;
  criticVerdict: CriticVerdict;
}

// ============================================
// Plan Creation Helpers
// ============================================

/**
 * Create a valid base decision for testing
 */
export function createValidDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    instrument: {
      instrumentId: "AAPL",
      instrumentType: "EQUITY",
    },
    action: "BUY",
    size: {
      quantity: 10,
      unit: "SHARES",
      targetPositionQuantity: 10,
    },
    orderPlan: {
      entryOrderType: "LIMIT",
      entryLimitPrice: 175.0,
      exitOrderType: "MARKET",
      timeInForce: "DAY",
    },
    riskLevels: {
      stopLossLevel: 170.0,
      takeProfitLevel: 185.0,
      denomination: "UNDERLYING_PRICE",
    },
    strategyFamily: "TREND",
    rationale: "Strong uptrend with momentum confirmation above key moving averages",
    confidence: 0.8,
    ...overrides,
  };
}

/**
 * Create a valid decision plan for testing
 */
export function createValidPlan(decisions: Decision[] = [createValidDecision()]): DecisionPlan {
  return {
    cycleId: `test-cycle-${Date.now()}`,
    asOfTimestamp: new Date().toISOString(),
    environment: "BACKTEST",
    decisions,
  };
}

/**
 * Create a plan with a specific risk violation
 */
export function createPlanWithViolation(violationType: RiskViolationType): DecisionPlan {
  switch (violationType) {
    case "per_instrument_limit":
      // Position size exceeds 5% of portfolio
      return createValidPlan([
        createValidDecision({
          size: {
            quantity: 10000, // Way too many shares
            unit: "SHARES",
            targetPositionQuantity: 10000,
          },
          rationale: "Large position despite 5% per-instrument limit",
        }),
      ]);

    case "portfolio_limit":
      // Multiple positions totaling over 100% allocation
      return createValidPlan([
        createValidDecision({
          instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
          size: { quantity: 5000, unit: "SHARES", targetPositionQuantity: 5000 },
        }),
        createValidDecision({
          instrument: { instrumentId: "MSFT", instrumentType: "EQUITY" },
          size: { quantity: 5000, unit: "SHARES", targetPositionQuantity: 5000 },
        }),
        createValidDecision({
          instrument: { instrumentId: "GOOG", instrumentType: "EQUITY" },
          size: { quantity: 5000, unit: "SHARES", targetPositionQuantity: 5000 },
        }),
      ]);

    case "greeks_limit":
      // Options position with excessive delta
      return createValidPlan([
        createValidDecision({
          instrument: {
            instrumentId: "AAPL250117C00200000",
            instrumentType: "OPTION",
            optionContract: {
              underlying: "AAPL",
              expiration: "2025-01-17",
              strike: 200,
              optionType: "CALL",
            },
          },
          size: { quantity: 1000, unit: "CONTRACTS", targetPositionQuantity: 1000 },
          rationale: "Large options position exceeding delta limits",
        }),
      ]);

    case "leverage_limit":
      // Notional exceeds equity * max leverage
      return createValidPlan([
        createValidDecision({
          size: { quantity: 50000, unit: "SHARES", targetPositionQuantity: 50000 },
          rationale: "Position notional exceeds leverage limit",
        }),
      ]);

    case "correlation_limit":
      // Highly correlated positions
      return createValidPlan([
        createValidDecision({
          instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
        }),
        createValidDecision({
          instrument: { instrumentId: "MSFT", instrumentType: "EQUITY" },
        }),
        createValidDecision({
          instrument: { instrumentId: "GOOG", instrumentType: "EQUITY" },
        }),
        createValidDecision({
          instrument: { instrumentId: "META", instrumentType: "EQUITY" },
        }),
        createValidDecision({
          instrument: { instrumentId: "AMZN", instrumentType: "EQUITY" },
        }),
      ]);

    default:
      return createValidPlan();
  }
}

/**
 * Create a plan with a specific rationale/data mismatch for Critic testing
 */
export function createPlanWithMismatch(mismatchType: CriticMismatchType): {
  plan: DecisionPlan;
  regime: string;
  signals: Record<string, number>;
} {
  switch (mismatchType) {
    case "regime_mismatch":
      return {
        plan: createValidPlan([
          createValidDecision({
            action: "BUY",
            rationale: "Bullish breakout with strong momentum and trend continuation",
          }),
        ]),
        regime: "BEAR_TREND", // Bearish regime contradicts bullish rationale
        signals: { trend: -0.8, momentum: -0.5 },
      };

    case "volume_mismatch":
      return {
        plan: createValidPlan([
          createValidDecision({
            action: "BUY",
            strategyFamily: "TREND",
            rationale: "High volume breakout with momentum confirmation",
          }),
        ]),
        regime: "BULL_TREND",
        signals: { volume_ratio: 0.3, momentum: 0.2 }, // Low volume contradicts claim
      };

    case "setup_mismatch":
      return {
        plan: createValidPlan([
          createValidDecision({
            action: "BUY",
            strategyFamily: "TREND",
            rationale: "Breakout above resistance with continuation pattern",
          }),
        ]),
        regime: "RANGE", // Range regime contradicts breakout setup
        signals: { trend: 0.1, atr_percentile: 20 },
      };

    case "confidence_mismatch":
      return {
        plan: createValidPlan([
          createValidDecision({
            confidence: 0.95, // Very high confidence
            rationale: "Mixed signals with uncertain direction",
          }),
        ]),
        regime: "RANGE",
        signals: { rsi: 50, macd: 0.01, trend: 0.05 }, // Weak signals
      };

    default:
      return {
        plan: createValidPlan(),
        regime: "BULL_TREND",
        signals: { trend: 0.5, momentum: 0.6 },
      };
  }
}

/**
 * Create a high confidence setup for position limit testing
 */
export function createHighConfidenceSetup(confidence = 0.99): DecisionPlan {
  return createValidPlan([
    createValidDecision({
      confidence,
      rationale: `Extremely high conviction trade with ${(confidence * 100).toFixed(0)}% confidence`,
      size: {
        quantity: 1000, // Large but should still respect limits
        unit: "SHARES",
        targetPositionQuantity: 1000,
      },
    }),
  ]);
}

/**
 * Create a plan missing stop-loss for validation testing
 */
export function createPlanMissingStopLoss(): DecisionPlan {
  const decision = createValidDecision();
  // @ts-expect-error - Intentionally deleting required field for testing
  delete decision.riskLevels;
  return createValidPlan([decision]);
}

/**
 * Create a plan with invalid stop-loss level
 */
export function createPlanWithInvalidStopLoss(direction: "LONG" | "SHORT"): DecisionPlan {
  if (direction === "LONG") {
    // Stop-loss above entry for long position (invalid)
    return createValidPlan([
      createValidDecision({
        action: "BUY",
        orderPlan: {
          entryOrderType: "LIMIT",
          entryLimitPrice: 175.0,
          exitOrderType: "MARKET",
          timeInForce: "DAY",
        },
        riskLevels: {
          stopLossLevel: 180.0, // Above entry - invalid for long
          takeProfitLevel: 190.0,
          denomination: "UNDERLYING_PRICE",
        },
      }),
    ]);
  } else {
    // Stop-loss below entry for short position (invalid)
    return createValidPlan([
      createValidDecision({
        action: "SELL",
        size: { quantity: 10, unit: "SHARES", targetPositionQuantity: -10 },
        orderPlan: {
          entryOrderType: "LIMIT",
          entryLimitPrice: 175.0,
          exitOrderType: "MARKET",
          timeInForce: "DAY",
        },
        riskLevels: {
          stopLossLevel: 170.0, // Below entry - invalid for short
          takeProfitLevel: 160.0,
          denomination: "UNDERLYING_PRICE",
        },
      }),
    ]);
  }
}

// ============================================
// Verdict Creation Helpers
// ============================================

/**
 * Create a Risk Manager APPROVE verdict
 */
export function createRiskApproveVerdict(): RiskManagerVerdict {
  return {
    verdict: "APPROVE",
    violations: [],
    riskMetrics: {
      portfolioRisk: 0.02,
      positionRisk: 0.01,
      correlationRisk: 0.15,
    },
    notes: "All risk constraints satisfied",
  };
}

/**
 * Create a Risk Manager REJECT verdict
 */
export function createRiskRejectVerdict(violations: string[]): RiskManagerVerdict {
  return {
    verdict: "REJECT",
    violations,
    riskMetrics: {
      portfolioRisk: 0.08,
      positionRisk: 0.06,
      correlationRisk: 0.75,
    },
    notes: "Position rejected due to risk limit violations",
  };
}

/**
 * Create a Critic APPROVE verdict
 */
export function createCriticApproveVerdict(): CriticVerdict {
  return {
    verdict: "APPROVE",
    issues: [],
    suggestions: ["Consider scaling in over multiple entries"],
    score: 0.9,
  };
}

/**
 * Create a Critic REJECT verdict
 */
export function createCriticRejectVerdict(issues: string[]): CriticVerdict {
  return {
    verdict: "REJECT",
    issues,
    suggestions: ["Wait for confirmation", "Reduce position size"],
    score: 0.4,
  };
}

// ============================================
// Constraint Limits
// ============================================

/**
 * Standard constraint limits for testing
 */
export const CONSTRAINT_LIMITS = {
  /** Maximum position size as fraction of portfolio (5%) */
  MAX_POSITION_SIZE: 0.05,
  /** Maximum portfolio allocation (100%) */
  MAX_PORTFOLIO_ALLOCATION: 1.0,
  /** Maximum leverage (2x) */
  MAX_LEVERAGE: 2.0,
  /** Maximum delta per position (1000) */
  MAX_DELTA_PER_POSITION: 1000,
  /** Maximum correlation with existing positions (0.7) */
  MAX_CORRELATION: 0.7,
  /** Minimum risk-reward ratio (1.5) */
  MIN_RISK_REWARD: 1.5,
};

/**
 * Check if a position size violates per-instrument limit
 */
export function violatesPerInstrumentLimit(positionValue: number, portfolioValue: number): boolean {
  return positionValue / portfolioValue > CONSTRAINT_LIMITS.MAX_POSITION_SIZE;
}

/**
 * Check if total allocation violates portfolio limit
 */
export function violatesPortfolioLimit(totalAllocation: number): boolean {
  return totalAllocation > CONSTRAINT_LIMITS.MAX_PORTFOLIO_ALLOCATION;
}

/**
 * Check if leverage violates limit
 */
export function violatesLeverageLimit(notionalValue: number, equity: number): boolean {
  return notionalValue > equity * CONSTRAINT_LIMITS.MAX_LEVERAGE;
}
