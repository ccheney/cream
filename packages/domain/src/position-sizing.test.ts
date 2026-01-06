/**
 * Position Sizing Calculator Tests
 */

import { describe, expect, test } from "bun:test";
import {
  calculateAdaptiveAdjustment,
  calculateDeltaAdjustedSize,
  calculateFixedFractional,
  calculateFractionalKelly,
  calculateLiquidityLimit,
  calculateVolatilityTargeted,
  DEFAULT_RISK_LIMITS,
} from "./position-sizing.js";

// ============================================
// Fixed Fractional Tests
// ============================================

describe("calculateFixedFractional", () => {
  const baseInput = {
    accountEquity: 100000,
    price: 100,
    stopLoss: 95,
  };

  test("calculates correct position for 1% risk", () => {
    const result = calculateFixedFractional(baseInput, 0.01);
    // Max risk = $1000, risk per share = $5
    // Quantity = 1000 / 5 = 200 shares
    expect(result.quantity).toBe(200);
    expect(result.dollarRisk).toBe(1000);
    expect(result.riskPercent).toBeCloseTo(0.01);
  });

  test("calculates correct position for 2% risk", () => {
    const result = calculateFixedFractional(baseInput, 0.02);
    // Max risk = $2000, risk per share = $5
    // Quantity = 2000 / 5 = 400 shares
    expect(result.quantity).toBe(400);
    expect(result.dollarRisk).toBe(2000);
  });

  test("includes risk-reward ratio when takeProfit provided", () => {
    const result = calculateFixedFractional({ ...baseInput, takeProfit: 110 }, 0.01);
    // Risk = $5, Reward = $10, RR = 2:1
    expect(result.riskRewardRatio).toBe(2);
  });

  test("handles options with multiplier", () => {
    const result = calculateFixedFractional(
      { ...baseInput, price: 5, stopLoss: 4, multiplier: 100 },
      0.01
    );
    // Risk per contract = $1 * 100 = $100
    // Max risk = $1000, Quantity = 10 contracts
    expect(result.quantity).toBe(10);
    expect(result.notionalValue).toBe(5000);
  });

  test("returns zero quantity when position too small", () => {
    const result = calculateFixedFractional({ accountEquity: 100, price: 100, stopLoss: 50 }, 0.01);
    // Max risk = $1, risk per share = $50
    // Can't buy any shares
    expect(result.quantity).toBe(0);
    expect(result.dollarRisk).toBe(0);
  });

  test("throws on invalid account equity", () => {
    expect(() => calculateFixedFractional({ ...baseInput, accountEquity: -1000 }, 0.01)).toThrow();
  });

  test("throws on stop loss equal to price", () => {
    expect(() => calculateFixedFractional({ ...baseInput, stopLoss: 100 }, 0.01)).toThrow();
  });

  test("throws on invalid risk percent", () => {
    expect(() => calculateFixedFractional(baseInput, 0)).toThrow();
    expect(() => calculateFixedFractional(baseInput, 0.5)).toThrow();
  });

  test("defaults to 1% risk", () => {
    const result = calculateFixedFractional(baseInput);
    expect(result.riskPercent).toBeCloseTo(0.01);
  });
});

// ============================================
// Volatility-Targeted Tests
// ============================================

describe("calculateVolatilityTargeted", () => {
  const baseInput = {
    accountEquity: 100000,
    price: 100,
    stopLoss: 95,
    atr: 2.5, // ATR = $2.50
  };

  test("calculates position based on ATR", () => {
    // ATR stop = 2.5 * 2 = 5
    // Max risk = $1000, Quantity = 1000 / 5 = 200
    const result = calculateVolatilityTargeted(baseInput, 0.01);
    expect(result.quantity).toBe(200);
  });

  test("adjusts for ATR multiplier", () => {
    // ATR stop = 2.5 * 3 = 7.5
    // Max risk = $1000, Quantity = 1000 / 7.5 = 133
    const result = calculateVolatilityTargeted({ ...baseInput, atrMultiplier: 3 }, 0.01);
    expect(result.quantity).toBe(133);
  });

  test("higher volatility = smaller position", () => {
    const lowVol = calculateVolatilityTargeted({ ...baseInput, atr: 1 }, 0.01);
    const highVol = calculateVolatilityTargeted({ ...baseInput, atr: 5 }, 0.01);
    expect(lowVol.quantity).toBeGreaterThan(highVol.quantity);
  });

  test("throws on invalid ATR", () => {
    expect(() => calculateVolatilityTargeted({ ...baseInput, atr: 0 }, 0.01)).toThrow();
  });

  test("returns zero quantity when risk budget too small", () => {
    // Very high ATR relative to account
    const result = calculateVolatilityTargeted(
      { accountEquity: 100, price: 100, stopLoss: 95, atr: 50 },
      0.01
    );
    // Max risk = $1, ATR stop = 50 * 2 = 100
    // Quantity = 1 / 100 = 0
    expect(result.quantity).toBe(0);
    expect(result.dollarRisk).toBe(0);
    expect(result.riskPercent).toBe(0);
    expect(result.notionalValue).toBe(0);
  });

  test("returns zero quantity with risk-reward ratio when takeProfit provided", () => {
    const result = calculateVolatilityTargeted(
      { accountEquity: 100, price: 100, stopLoss: 95, atr: 50, takeProfit: 110 },
      0.01
    );
    expect(result.quantity).toBe(0);
    expect(result.riskRewardRatio).toBe(2); // 10 reward / 5 risk
  });
});

// ============================================
// Fractional Kelly Tests
// ============================================

describe("calculateFractionalKelly", () => {
  const baseInput = {
    accountEquity: 100000,
    price: 100,
    stopLoss: 95,
    winRate: 0.6,
    payoffRatio: 2,
  };

  test("calculates Kelly percentage correctly", () => {
    // Full Kelly = 0.6 - (0.4 / 2) = 0.4 = 40%
    // With 25% fraction: 0.4 * 0.25 = 10%, capped at 2% = 2%
    const result = calculateFractionalKelly(baseInput, 0.02);
    expect(result.riskPercent).toBeLessThanOrEqual(0.02);
    expect(result.quantity).toBeGreaterThan(0);
  });

  test("uses custom Kelly fraction", () => {
    // Use lower winRate/payoff to get lower fullKelly so neither gets capped
    // winRate=0.55, payoffRatio=1.5: Full Kelly = 0.55 - 0.45/1.5 = 0.25
    // Conservative (0.25): 0.25 * 0.25 = 0.0625
    // Aggressive (0.5): 0.25 * 0.5 = 0.125, capped at 0.10
    const conservative = calculateFractionalKelly(
      { ...baseInput, winRate: 0.55, payoffRatio: 1.5, kellyFraction: 0.25 },
      0.1 // Max allowed risk percent
    );
    const aggressive = calculateFractionalKelly(
      { ...baseInput, winRate: 0.55, payoffRatio: 1.5, kellyFraction: 0.5 },
      0.1
    );
    expect(aggressive.quantity).toBeGreaterThan(conservative.quantity);
  });

  test("returns zero for negative Kelly", () => {
    // Low win rate with bad payoff = negative Kelly
    const result = calculateFractionalKelly({ ...baseInput, winRate: 0.3, payoffRatio: 1 }, 0.02);
    // Kelly = 0.3 - (0.7 / 1) = -0.4 (negative)
    expect(result.quantity).toBe(0);
  });

  test("throws on invalid win rate", () => {
    expect(() => calculateFractionalKelly({ ...baseInput, winRate: 1.5 }, 0.02)).toThrow();
    expect(() => calculateFractionalKelly({ ...baseInput, winRate: -0.1 }, 0.02)).toThrow();
  });

  test("throws on invalid payoff ratio", () => {
    expect(() => calculateFractionalKelly({ ...baseInput, payoffRatio: 0 }, 0.02)).toThrow();
  });

  test("throws on invalid kelly fraction", () => {
    expect(() => calculateFractionalKelly({ ...baseInput, kellyFraction: 0 }, 0.02)).toThrow(
      "kellyFraction must be between 0 and 1"
    );
    expect(() => calculateFractionalKelly({ ...baseInput, kellyFraction: 1.5 }, 0.02)).toThrow(
      "kellyFraction must be between 0 and 1"
    );
  });
});

// ============================================
// Adaptive Adjustment Tests
// ============================================

describe("calculateAdaptiveAdjustment", () => {
  test("returns 1.0 with no conditions", () => {
    expect(calculateAdaptiveAdjustment({})).toBe(1.0);
  });

  test("reduces for high VIX", () => {
    const lowVix = calculateAdaptiveAdjustment({ vix: 20 });
    const highVix = calculateAdaptiveAdjustment({ vix: 35 });
    expect(lowVix).toBe(1.0);
    expect(highVix).toBeLessThan(1.0);
  });

  test("reduces for high correlation", () => {
    const lowCorr = calculateAdaptiveAdjustment({ portfolioCorrelation: 0.5 });
    const highCorr = calculateAdaptiveAdjustment({ portfolioCorrelation: 0.9 });
    expect(lowCorr).toBe(1.0);
    expect(highCorr).toBeLessThan(1.0);
  });

  test("50% reduction during drawdown", () => {
    const noDrawdown = calculateAdaptiveAdjustment({ accountDrawdown: 0.05 });
    const inDrawdown = calculateAdaptiveAdjustment({ accountDrawdown: 0.15 });
    expect(noDrawdown).toBe(1.0);
    expect(inDrawdown).toBe(0.5);
  });

  test("combines multiple adjustments", () => {
    const combined = calculateAdaptiveAdjustment({
      vix: 35,
      accountDrawdown: 0.15,
    });
    expect(combined).toBeLessThan(0.5);
  });
});

// ============================================
// Liquidity Limit Tests
// ============================================

describe("calculateLiquidityLimit", () => {
  test("calculates 5% of ADV by default", () => {
    const limit = calculateLiquidityLimit(1000000);
    expect(limit).toBe(50000);
  });

  test("uses custom participation rate", () => {
    const limit = calculateLiquidityLimit(1000000, 0.1);
    expect(limit).toBe(100000);
  });

  test("floors to integer", () => {
    const limit = calculateLiquidityLimit(777);
    expect(limit).toBe(38); // 777 * 0.05 = 38.85 -> 38
  });

  test("throws on invalid volume", () => {
    expect(() => calculateLiquidityLimit(0)).toThrow();
    expect(() => calculateLiquidityLimit(-100)).toThrow();
  });

  test("throws on invalid participation rate", () => {
    expect(() => calculateLiquidityLimit(1000, 0)).toThrow();
    expect(() => calculateLiquidityLimit(1000, 1.5)).toThrow();
  });
});

// ============================================
// Options Delta-Adjusted Tests
// ============================================

describe("calculateDeltaAdjustedSize", () => {
  const baseInput = {
    accountEquity: 100000,
    price: 5, // Option premium
    stopLoss: 2.5,
    delta: 0.5,
    underlyingPrice: 100, // Underlying at $100
    multiplier: 100,
  };

  test("calculates contracts for target delta exposure", () => {
    // With delta 0.5, each contract controls ~$5000 delta exposure
    // (underlying ~$10, delta 0.5, multiplier 100)
    const result = calculateDeltaAdjustedSize(baseInput, 10000);
    expect(result.quantity).toBeGreaterThan(0);
  });

  test("higher delta = fewer contracts for same exposure", () => {
    // With underlyingPrice=100, multiplier=100:
    // deltaPerContract = delta * 100 * 100 = delta * 10000
    // Low delta (0.2): 2000 per contract -> 50000/2000 = 25 contracts
    // High delta (0.8): 8000 per contract -> 50000/8000 = 6 contracts
    const lowDelta = calculateDeltaAdjustedSize({ ...baseInput, delta: 0.2 }, 50000);
    const highDelta = calculateDeltaAdjustedSize({ ...baseInput, delta: 0.8 }, 50000);
    expect(lowDelta.quantity).toBeGreaterThan(highDelta.quantity);
  });

  test("throws on invalid delta", () => {
    expect(() => calculateDeltaAdjustedSize({ ...baseInput, delta: 1.5 }, 10000)).toThrow();
  });

  test("throws on invalid target exposure", () => {
    expect(() => calculateDeltaAdjustedSize(baseInput, -1000)).toThrow();
  });

  test("throws on invalid underlying price", () => {
    expect(() => calculateDeltaAdjustedSize({ ...baseInput, underlyingPrice: 0 }, 10000)).toThrow(
      "underlyingPrice must be positive"
    );
    expect(() => calculateDeltaAdjustedSize({ ...baseInput, underlyingPrice: -50 }, 10000)).toThrow(
      "underlyingPrice must be positive"
    );
  });

  test("returns zero quantity when exposure too small", () => {
    // Very small target delta exposure relative to contract size
    // deltaPerContract = 0.5 * 100 * 100 = 5000
    // contracts = 100 / 5000 = 0
    const result = calculateDeltaAdjustedSize(baseInput, 100);
    expect(result.quantity).toBe(0);
    expect(result.dollarRisk).toBe(0);
    expect(result.riskPercent).toBe(0);
    expect(result.notionalValue).toBe(0);
  });

  test("returns zero quantity with risk-reward when takeProfit provided", () => {
    const result = calculateDeltaAdjustedSize({ ...baseInput, takeProfit: 10 }, 100);
    expect(result.quantity).toBe(0);
    // Risk = 5 - 2.5 = 2.5, Reward = 10 - 5 = 5, RR = 2
    expect(result.riskRewardRatio).toBe(2);
  });
});

// ============================================
// Default Risk Limits Tests
// ============================================

describe("DEFAULT_RISK_LIMITS", () => {
  test("has expected values", () => {
    expect(DEFAULT_RISK_LIMITS.maxRiskPerTrade).toBe(0.02);
    expect(DEFAULT_RISK_LIMITS.maxGrossExposure).toBe(1.0);
    expect(DEFAULT_RISK_LIMITS.minRiskReward).toBe(1.5);
  });
});

// ============================================
// Input Validation Tests
// ============================================

describe("validateInput (via calculateFixedFractional)", () => {
  test("throws on invalid price", () => {
    expect(() =>
      calculateFixedFractional({ accountEquity: 100000, price: 0, stopLoss: 95 }, 0.01)
    ).toThrow("price must be positive");
    expect(() =>
      calculateFixedFractional({ accountEquity: 100000, price: -10, stopLoss: 95 }, 0.01)
    ).toThrow("price must be positive");
  });

  test("throws on invalid stopLoss", () => {
    expect(() =>
      calculateFixedFractional({ accountEquity: 100000, price: 100, stopLoss: 0 }, 0.01)
    ).toThrow("stopLoss must be positive");
    expect(() =>
      calculateFixedFractional({ accountEquity: 100000, price: 100, stopLoss: -5 }, 0.01)
    ).toThrow("stopLoss must be positive");
  });

  test("throws on invalid multiplier", () => {
    expect(() =>
      calculateFixedFractional(
        { accountEquity: 100000, price: 100, stopLoss: 95, multiplier: 0 },
        0.01
      )
    ).toThrow("multiplier must be positive");
    expect(() =>
      calculateFixedFractional(
        { accountEquity: 100000, price: 100, stopLoss: 95, multiplier: -1 },
        0.01
      )
    ).toThrow("multiplier must be positive");
  });
});
