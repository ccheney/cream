import { describe, expect, it } from "bun:test";
import {
  Action,
  type Decision,
  DecisionPlanSchema,
  DecisionSchema,
  getDecisionDirection,
  RiskLevelsSchema,
  validateDecisionPlan,
  validateRiskLevels,
} from "./decision";

// ============================================
// Enum Tests
// ============================================

describe("Action enum", () => {
  it("accepts valid actions", () => {
    expect(Action.parse("BUY")).toBe("BUY");
    expect(Action.parse("SELL")).toBe("SELL");
    expect(Action.parse("HOLD")).toBe("HOLD");
    expect(Action.parse("INCREASE")).toBe("INCREASE");
    expect(Action.parse("REDUCE")).toBe("REDUCE");
    expect(Action.parse("NO_TRADE")).toBe("NO_TRADE");
  });

  it("rejects invalid actions", () => {
    expect(() => Action.parse("CLOSE")).toThrow();
    expect(() => Action.parse("OPEN")).toThrow();
  });
});

// ============================================
// RiskLevels Tests - CORE REQUIREMENT
// ============================================

describe("RiskLevelsSchema", () => {
  it("accepts valid risk levels", () => {
    const result = RiskLevelsSchema.parse({
      stopLossLevel: 95.0,
      takeProfitLevel: 110.0,
      denomination: "UNDERLYING_PRICE",
    });
    expect(result.stopLossLevel).toBe(95.0);
    expect(result.takeProfitLevel).toBe(110.0);
  });

  it("requires positive stopLossLevel", () => {
    expect(() =>
      RiskLevelsSchema.parse({
        stopLossLevel: -10,
        takeProfitLevel: 110.0,
        denomination: "UNDERLYING_PRICE",
      })
    ).toThrow();
  });

  it("requires positive takeProfitLevel", () => {
    expect(() =>
      RiskLevelsSchema.parse({
        stopLossLevel: 95.0,
        takeProfitLevel: -10,
        denomination: "UNDERLYING_PRICE",
      })
    ).toThrow();
  });

  it("requires stop and profit to be different", () => {
    expect(() =>
      RiskLevelsSchema.parse({
        stopLossLevel: 100.0,
        takeProfitLevel: 100.0,
        denomination: "UNDERLYING_PRICE",
      })
    ).toThrow();
  });

  it("requires denomination", () => {
    expect(() =>
      RiskLevelsSchema.parse({
        stopLossLevel: 95.0,
        takeProfitLevel: 110.0,
      })
    ).toThrow();
  });
});

// ============================================
// Decision Schema Tests
// ============================================

describe("DecisionSchema", () => {
  const validDecision = {
    instrument: {
      instrumentId: "AAPL",
      instrumentType: "EQUITY",
    },
    action: "BUY",
    size: {
      quantity: 100,
      unit: "SHARES",
      targetPositionQuantity: 100,
    },
    orderPlan: {
      entryOrderType: "LIMIT",
      entryLimitPrice: 150.0,
      exitOrderType: "MARKET",
      timeInForce: "DAY",
    },
    riskLevels: {
      stopLossLevel: 145.0,
      takeProfitLevel: 160.0,
      denomination: "UNDERLYING_PRICE",
    },
    strategyFamily: "TREND",
    rationale: "Strong uptrend with bullish momentum indicators",
    confidence: 0.75,
  };

  it("accepts valid decision with all fields", () => {
    const result = DecisionSchema.parse(validDecision);
    expect(result.action).toBe("BUY");
    expect(result.riskLevels.stopLossLevel).toBe(145.0);
  });

  it("FAILS without riskLevels (mandatory stop-loss)", () => {
    const noRiskLevels = { ...validDecision };
    delete (noRiskLevels as Record<string, unknown>).riskLevels;
    expect(() => DecisionSchema.parse(noRiskLevels)).toThrow();
  });

  it("FAILS with missing stopLossLevel", () => {
    const missingStop = {
      ...validDecision,
      riskLevels: {
        takeProfitLevel: 160.0,
        denomination: "UNDERLYING_PRICE",
      },
    };
    expect(() => DecisionSchema.parse(missingStop)).toThrow();
  });

  it("FAILS with missing takeProfitLevel", () => {
    const missingTakeProfit = {
      ...validDecision,
      riskLevels: {
        stopLossLevel: 145.0,
        denomination: "UNDERLYING_PRICE",
      },
    };
    expect(() => DecisionSchema.parse(missingTakeProfit)).toThrow();
  });

  it("requires LIMIT price when order type is LIMIT", () => {
    const noLimitPrice = {
      ...validDecision,
      orderPlan: {
        entryOrderType: "LIMIT",
        exitOrderType: "MARKET",
        timeInForce: "DAY",
      },
    };
    expect(() => DecisionSchema.parse(noLimitPrice)).toThrow();
  });

  it("allows MARKET order without limit price", () => {
    const marketOrder = {
      ...validDecision,
      orderPlan: {
        entryOrderType: "MARKET",
        exitOrderType: "MARKET",
        timeInForce: "DAY",
      },
    };
    const result = DecisionSchema.parse(marketOrder);
    expect(result.orderPlan.entryOrderType).toBe("MARKET");
  });

  it("requires optionContract for OPTION instruments", () => {
    const optionWithoutContract = {
      ...validDecision,
      instrument: {
        instrumentId: "AAPL240120C00150000",
        instrumentType: "OPTION",
      },
    };
    expect(() => DecisionSchema.parse(optionWithoutContract)).toThrow();
  });

  it("accepts OPTION with contract details", () => {
    const validOption = {
      ...validDecision,
      instrument: {
        instrumentId: "AAPL240120C00150000",
        instrumentType: "OPTION",
        optionContract: {
          underlying: "AAPL",
          expiration: "2024-01-20",
          strike: 150.0,
          optionType: "CALL",
        },
      },
    };
    const result = DecisionSchema.parse(validOption);
    expect(result.instrument.instrumentType).toBe("OPTION");
  });
});

// ============================================
// Direction Detection Tests
// ============================================

describe("getDecisionDirection", () => {
  const baseDecision: Decision = {
    instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
    action: "BUY",
    size: { quantity: 100, unit: "SHARES", targetPositionQuantity: 100 },
    orderPlan: {
      entryOrderType: "LIMIT",
      entryLimitPrice: 150,
      exitOrderType: "MARKET",
      timeInForce: "DAY",
    },
    riskLevels: {
      stopLossLevel: 145,
      takeProfitLevel: 160,
      denomination: "UNDERLYING_PRICE",
    },
    strategyFamily: "TREND",
    rationale: "Test decision for direction detection",
    confidence: 0.5,
  };

  it("detects LONG for BUY action", () => {
    const decision = { ...baseDecision, action: "BUY" as const };
    expect(getDecisionDirection(decision)).toBe("LONG");
  });

  it("detects SHORT for SELL action", () => {
    const decision = { ...baseDecision, action: "SELL" as const };
    expect(getDecisionDirection(decision)).toBe("SHORT");
  });

  it("detects LONG for positive target position", () => {
    const decision = {
      ...baseDecision,
      action: "HOLD" as const,
      size: { quantity: 0, unit: "SHARES" as const, targetPositionQuantity: 100 },
    };
    expect(getDecisionDirection(decision)).toBe("LONG");
  });

  it("detects SHORT for negative target position", () => {
    const decision = {
      ...baseDecision,
      action: "HOLD" as const,
      size: { quantity: 0, unit: "SHARES" as const, targetPositionQuantity: -100 },
    };
    expect(getDecisionDirection(decision)).toBe("SHORT");
  });

  it("detects FLAT for zero target position", () => {
    const decision = {
      ...baseDecision,
      action: "REDUCE" as const,
      size: { quantity: 100, unit: "SHARES" as const, targetPositionQuantity: 0 },
    };
    expect(getDecisionDirection(decision)).toBe("FLAT");
  });

  it("detects SHORT for NO_TRADE with negative target position", () => {
    const decision = {
      ...baseDecision,
      action: "NO_TRADE" as const,
      size: { quantity: 0, unit: "SHARES" as const, targetPositionQuantity: -50 },
    };
    expect(getDecisionDirection(decision)).toBe("SHORT");
  });

  it("detects FLAT for NO_TRADE with zero target position", () => {
    const decision = {
      ...baseDecision,
      action: "NO_TRADE" as const,
      size: { quantity: 0, unit: "SHARES" as const, targetPositionQuantity: 0 },
    };
    expect(getDecisionDirection(decision)).toBe("FLAT");
  });

  it("detects LONG for REDUCE with positive target position", () => {
    const decision = {
      ...baseDecision,
      action: "REDUCE" as const,
      size: { quantity: 50, unit: "SHARES" as const, targetPositionQuantity: 50 },
    };
    expect(getDecisionDirection(decision)).toBe("LONG");
  });

  it("detects SHORT for REDUCE with negative target position", () => {
    const decision = {
      ...baseDecision,
      action: "REDUCE" as const,
      size: { quantity: 50, unit: "SHARES" as const, targetPositionQuantity: -50 },
    };
    expect(getDecisionDirection(decision)).toBe("SHORT");
  });

  it("detects LONG for INCREASE with positive target position", () => {
    const decision = {
      ...baseDecision,
      action: "INCREASE" as const,
      size: { quantity: 50, unit: "SHARES" as const, targetPositionQuantity: 150 },
    };
    expect(getDecisionDirection(decision)).toBe("LONG");
  });

  it("detects SHORT for INCREASE with negative target position", () => {
    const decision = {
      ...baseDecision,
      action: "INCREASE" as const,
      size: { quantity: 50, unit: "SHARES" as const, targetPositionQuantity: -150 },
    };
    expect(getDecisionDirection(decision)).toBe("SHORT");
  });
});

// ============================================
// Risk Validation Tests
// ============================================

describe("validateRiskLevels", () => {
  const longDecision: Decision = {
    instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
    action: "BUY",
    size: { quantity: 100, unit: "SHARES", targetPositionQuantity: 100 },
    orderPlan: {
      entryOrderType: "LIMIT",
      entryLimitPrice: 100,
      exitOrderType: "MARKET",
      timeInForce: "DAY",
    },
    riskLevels: {
      stopLossLevel: 95, // 5% below entry
      takeProfitLevel: 110, // 10% above entry
      denomination: "UNDERLYING_PRICE",
    },
    strategyFamily: "TREND",
    rationale: "Test LONG position risk validation",
    confidence: 0.7,
  };

  const shortDecision: Decision = {
    ...longDecision,
    action: "SELL",
    size: { quantity: 100, unit: "SHARES", targetPositionQuantity: -100 },
    riskLevels: {
      stopLossLevel: 105, // 5% above entry (loss for short)
      takeProfitLevel: 90, // 10% below entry (profit for short)
      denomination: "UNDERLYING_PRICE",
    },
  };

  describe("LONG positions", () => {
    it("validates correct LONG risk levels", () => {
      const result = validateRiskLevels(longDecision, 100);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails when stop is above entry for LONG", () => {
      const badLong = {
        ...longDecision,
        riskLevels: {
          stopLossLevel: 105, // Above entry - wrong!
          takeProfitLevel: 110,
          denomination: "UNDERLYING_PRICE" as const,
        },
      };
      const result = validateRiskLevels(badLong, 100);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("fails when take-profit is below entry for LONG", () => {
      const badLong = {
        ...longDecision,
        riskLevels: {
          stopLossLevel: 95,
          takeProfitLevel: 95, // Below entry - wrong!
          denomination: "UNDERLYING_PRICE" as const,
        },
      };
      const result = validateRiskLevels(badLong, 100);
      expect(result.valid).toBe(false);
    });

    it("calculates risk-reward ratio", () => {
      const result = validateRiskLevels(longDecision, 100);
      // Risk: 100 - 95 = 5
      // Reward: 110 - 100 = 10
      // Ratio: 10/5 = 2.0
      expect(result.riskRewardRatio).toBe(2.0);
    });

    it("warns on low risk-reward ratio", () => {
      const lowRR = {
        ...longDecision,
        riskLevels: {
          stopLossLevel: 90, // 10% risk
          takeProfitLevel: 105, // 5% reward = 0.5 ratio
          denomination: "UNDERLYING_PRICE" as const,
        },
      };
      const result = validateRiskLevels(lowRR, 100);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("below minimum 1.5:1");
    });
  });

  describe("SHORT positions", () => {
    it("validates correct SHORT risk levels", () => {
      const result = validateRiskLevels(shortDecision, 100);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails when stop is below entry for SHORT", () => {
      const badShort = {
        ...shortDecision,
        riskLevels: {
          stopLossLevel: 95, // Below entry - wrong for short!
          takeProfitLevel: 90,
          denomination: "UNDERLYING_PRICE" as const,
        },
      };
      const result = validateRiskLevels(badShort, 100);
      expect(result.valid).toBe(false);
    });

    it("fails when take-profit is above entry for SHORT", () => {
      const badShort = {
        ...shortDecision,
        riskLevels: {
          stopLossLevel: 105,
          takeProfitLevel: 105, // Above entry - wrong for short!
          denomination: "UNDERLYING_PRICE" as const,
        },
      };
      const result = validateRiskLevels(badShort, 100);
      expect(result.valid).toBe(false);
    });
  });

  describe("FLAT positions", () => {
    it("skips detailed validation for FLAT direction", () => {
      const flatDecision: Decision = {
        ...longDecision,
        action: "REDUCE",
        size: { quantity: 100, unit: "SHARES", targetPositionQuantity: 0 },
      };
      const result = validateRiskLevels(flatDecision, 100);
      expect(result.valid).toBe(true);
      expect(result.riskRewardRatio).toBeNull();
    });
  });

  describe("stop distance warnings", () => {
    it("warns when stop distance exceeds 5x profit target", () => {
      const highStopDecision: Decision = {
        ...longDecision,
        riskLevels: {
          stopLossLevel: 40, // 60 points risk
          takeProfitLevel: 110, // 10 points reward - stop is 6x the profit target
          denomination: "UNDERLYING_PRICE",
        },
      };
      const result = validateRiskLevels(highStopDecision, 100);
      expect(result.warnings.some((w) => w.includes("5x profit target"))).toBe(true);
    });
  });
});

// ============================================
// DecisionPlan Tests
// ============================================

describe("DecisionPlanSchema", () => {
  const validPlan = {
    cycleId: "2026-01-04T15:00:00Z",
    asOfTimestamp: "2026-01-04T15:00:00Z",
    environment: "PAPER",
    decisions: [
      {
        instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
        action: "BUY",
        size: { quantity: 100, unit: "SHARES", targetPositionQuantity: 100 },
        orderPlan: {
          entryOrderType: "LIMIT",
          entryLimitPrice: 150,
          exitOrderType: "MARKET",
          timeInForce: "DAY",
        },
        riskLevels: {
          stopLossLevel: 145,
          takeProfitLevel: 160,
          denomination: "UNDERLYING_PRICE",
        },
        strategyFamily: "TREND",
        rationale: "Strong uptrend with bullish momentum",
        confidence: 0.75,
      },
    ],
    portfolioNotes: "Single position entry",
  };

  it("accepts valid decision plan", () => {
    const result = DecisionPlanSchema.parse(validPlan);
    expect(result.decisions.length).toBe(1);
    expect(result.environment).toBe("PAPER");
  });

  it("requires valid ISO timestamp", () => {
    const badTimestamp = {
      ...validPlan,
      asOfTimestamp: "not-a-timestamp",
    };
    expect(() => DecisionPlanSchema.parse(badTimestamp)).toThrow();
  });

  it("requires valid environment", () => {
    const badEnv = {
      ...validPlan,
      environment: "PRODUCTION",
    };
    expect(() => DecisionPlanSchema.parse(badEnv)).toThrow();
  });
});

describe("validateDecisionPlan", () => {
  const validPlan = {
    cycleId: "2026-01-04T15:00:00Z",
    asOfTimestamp: "2026-01-04T15:00:00Z",
    environment: "PAPER",
    decisions: [
      {
        instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
        action: "BUY",
        size: { quantity: 100, unit: "SHARES", targetPositionQuantity: 100 },
        orderPlan: {
          entryOrderType: "LIMIT",
          entryLimitPrice: 150,
          exitOrderType: "MARKET",
          timeInForce: "DAY",
        },
        riskLevels: {
          stopLossLevel: 145,
          takeProfitLevel: 160,
          denomination: "UNDERLYING_PRICE",
        },
        strategyFamily: "TREND",
        rationale: "Strong uptrend with bullish momentum",
        confidence: 0.75,
      },
    ],
  };

  it("validates complete plan with entry prices", () => {
    const entryPrices = new Map([["AAPL", 150]]);
    const result = validateDecisionPlan(validPlan, entryPrices);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("fails with invalid risk levels", () => {
    const badPlan = {
      ...validPlan,
      decisions: [
        {
          ...validPlan.decisions[0],
          riskLevels: {
            stopLossLevel: 160, // Above entry - wrong for BUY!
            takeProfitLevel: 170,
            denomination: "UNDERLYING_PRICE",
          },
        },
      ],
    };
    const entryPrices = new Map([["AAPL", 150]]);
    const result = validateDecisionPlan(badPlan, entryPrices);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns warnings for low risk-reward", () => {
    const lowRRPlan = {
      ...validPlan,
      decisions: [
        {
          ...validPlan.decisions[0],
          riskLevels: {
            stopLossLevel: 140, // 10 points risk
            takeProfitLevel: 155, // 5 points reward = 0.5 ratio
            denomination: "UNDERLYING_PRICE",
          },
        },
      ],
    };
    const entryPrices = new Map([["AAPL", 150]]);
    const result = validateDecisionPlan(lowRRPlan, entryPrices);
    expect(result.success).toBe(true); // Warnings don't cause failure
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns schema errors for invalid plan structure", () => {
    const invalidPlan = {
      cycleId: "2026-01-04T15:00:00Z",
      asOfTimestamp: "invalid-timestamp", // Invalid timestamp format
      environment: "PAPER",
      decisions: [],
    };
    const entryPrices = new Map<string, number>();
    const result = validateDecisionPlan(invalidPlan, entryPrices);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("asOfTimestamp"))).toBe(true);
  });
});
