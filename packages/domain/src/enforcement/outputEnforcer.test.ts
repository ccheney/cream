/**
 * Tests for Output Enforcement
 */

import { describe, expect, it, beforeEach, mock } from "bun:test";
import {
  OutputEnforcer,
  createOutputEnforcer,
  parseAndValidateJSON,
  runPreflightChecks,
  createFallbackPlan,
  type MarketContext,
  type PositionInfo,
  type TraderAgentInterface,
} from "./outputEnforcer";
import type { DecisionPlan } from "../schemas/decision-plan";

// ============================================
// Test Fixtures
// ============================================

function createValidDecisionPlan(): DecisionPlan {
  return {
    cycleId: "test-cycle-1",
    asOfTimestamp: "2026-01-05T15:00:00Z",
    environment: "PAPER",
    decisions: [
      {
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
          entryLimitPrice: 150,
          exitOrderType: "MARKET",
          timeInForce: "DAY",
        },
        riskLevels: {
          stopLossLevel: 140,
          takeProfitLevel: 165,
          denomination: "UNDERLYING_PRICE",
        },
        strategyFamily: "TREND",
        rationale: "Strong momentum signals",
        confidence: 0.8,
      },
    ],
  };
}

function createMarketContext(overrides: Partial<MarketContext> = {}): MarketContext {
  return {
    marketOpen: true,
    currentTime: new Date("2026-01-05T15:00:00Z"),
    buyingPower: 100000,
    marginUsage: 0.3,
    maxMarginUsage: 0.9,
    currentPositions: new Map(),
    ...overrides,
  };
}

function createPosition(
  instrumentId: string,
  quantity: number,
  avgEntryPrice = 150
): PositionInfo {
  return {
    instrumentId,
    quantity,
    avgEntryPrice,
    marketValue: Math.abs(quantity) * avgEntryPrice,
  };
}

// ============================================
// OutputEnforcer Tests
// ============================================

describe("OutputEnforcer", () => {
  let enforcer: OutputEnforcer;

  beforeEach(() => {
    enforcer = new OutputEnforcer();
  });

  describe("parseAndValidateJSON", () => {
    it("should parse valid JSON", async () => {
      const plan = createValidDecisionPlan();
      const response = JSON.stringify(plan);

      const result = await enforcer.parseAndValidateJSON(response);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.cycleId).toBe("test-cycle-1");
      }
    });

    it("should fail on malformed JSON", async () => {
      const response = "not valid json";

      const result = await enforcer.parseAndValidateJSON(response);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("JSON_PARSE");
      }
    });

    it("should fail on missing required fields", async () => {
      const response = JSON.stringify({ cycleId: "test" }); // Missing required fields

      const result = await enforcer.parseAndValidateJSON(response);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("SCHEMA_VALIDATION");
      }
    });

    it("should retry with callback on failure", async () => {
      const malformedResponse = "invalid";
      const validPlan = createValidDecisionPlan();
      const retryCallback = mock(async () => JSON.stringify(validPlan));

      const result = await enforcer.parseAndValidateJSON(malformedResponse, retryCallback);

      expect(retryCallback).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
    });

    it("should fail after retry if still invalid", async () => {
      const malformedResponse = "invalid";
      const retryCallback = mock(async () => "still invalid");

      const result = await enforcer.parseAndValidateJSON(malformedResponse, retryCallback);

      expect(retryCallback).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.attemptCount).toBe(2);
      }
    });
  });

  describe("parseJSONOnce", () => {
    it("should parse valid JSON without retry", () => {
      const plan = createValidDecisionPlan();
      const response = JSON.stringify(plan);

      const result = enforcer.parseJSONOnce(response);

      expect(result.ok).toBe(true);
    });

    it("should fail on invalid JSON without retry", () => {
      const result = enforcer.parseJSONOnce("invalid");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.attemptCount).toBe(1);
      }
    });
  });

  describe("runPreflightChecks", () => {
    describe("market hours", () => {
      it("should pass when market is open", () => {
        const plan = createValidDecisionPlan();
        const context = createMarketContext({ marketOpen: true });

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.errors.some((e) => e.type === "MARKET_CLOSED")).toBe(false);
      });

      it("should fail when market is closed", () => {
        const plan = createValidDecisionPlan();
        const context = createMarketContext({ marketOpen: false });

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.type === "MARKET_CLOSED")).toBe(true);
      });
    });

    describe("buying power", () => {
      it("should pass with sufficient buying power", () => {
        const plan = createValidDecisionPlan();
        const context = createMarketContext({ buyingPower: 100000 });

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.errors.some((e) => e.type === "INSUFFICIENT_BUYING_POWER")).toBe(false);
      });

      it("should fail with insufficient buying power", () => {
        const plan = createValidDecisionPlan();
        // Plan has 100 shares at $150 = $15,000 estimated cost
        const context = createMarketContext({ buyingPower: 1000 });

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.type === "INSUFFICIENT_BUYING_POWER")).toBe(true);
      });

      it("should warn when using more than 80% of buying power", () => {
        const plan = createValidDecisionPlan();
        // Plan has 100 shares at $150 = $15,000 estimated cost
        const context = createMarketContext({ buyingPower: 17000 });

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.warnings.some((e) => e.type === "INSUFFICIENT_BUYING_POWER")).toBe(true);
      });
    });

    describe("margin", () => {
      it("should fail when margin exceeded", () => {
        const plan = createValidDecisionPlan();
        const context = createMarketContext({
          marginUsage: 0.95,
          maxMarginUsage: 0.9,
        });

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.type === "MARGIN_EXCEEDED")).toBe(true);
      });
    });

    describe("action conflicts", () => {
      it("should fail BUY when position already exists", () => {
        const plan = createValidDecisionPlan();
        const positions = new Map([["AAPL", createPosition("AAPL", 50)]]);
        const context = createMarketContext({ currentPositions: positions });

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.type === "ACTION_CONFLICT")).toBe(true);
        expect(result.errors[0]?.message).toContain("Cannot BUY");
      });

      it("should fail SELL when position already exists", () => {
        const plan: DecisionPlan = {
          ...createValidDecisionPlan(),
          decisions: [
            {
              ...createValidDecisionPlan().decisions[0]!,
              action: "SELL",
              size: {
                quantity: 100,
                unit: "SHARES",
                targetPositionQuantity: -100,
              },
            },
          ],
        };
        const positions = new Map([["AAPL", createPosition("AAPL", -50)]]);
        const context = createMarketContext({ currentPositions: positions });

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.type === "ACTION_CONFLICT")).toBe(true);
        expect(result.errors[0]?.message).toContain("Cannot SELL");
      });

      it("should fail INCREASE when no position exists", () => {
        const plan: DecisionPlan = {
          ...createValidDecisionPlan(),
          decisions: [
            {
              ...createValidDecisionPlan().decisions[0]!,
              action: "INCREASE",
            },
          ],
        };
        const context = createMarketContext();

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.type === "ACTION_CONFLICT")).toBe(true);
        expect(result.errors[0]?.message).toContain("Cannot INCREASE");
      });

      it("should fail REDUCE when no position exists", () => {
        const plan: DecisionPlan = {
          ...createValidDecisionPlan(),
          decisions: [
            {
              ...createValidDecisionPlan().decisions[0]!,
              action: "REDUCE",
            },
          ],
        };
        const context = createMarketContext();

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.type === "ACTION_CONFLICT")).toBe(true);
        expect(result.errors[0]?.message).toContain("Cannot REDUCE");
      });

      it("should fail HOLD when no position exists", () => {
        const plan: DecisionPlan = {
          ...createValidDecisionPlan(),
          decisions: [
            {
              ...createValidDecisionPlan().decisions[0]!,
              action: "HOLD",
            },
          ],
        };
        const context = createMarketContext();

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.type === "ACTION_CONFLICT")).toBe(true);
        expect(result.errors[0]?.message).toContain("Cannot HOLD");
      });

      it("should allow NO_TRADE action without position", () => {
        const plan: DecisionPlan = {
          ...createValidDecisionPlan(),
          decisions: [
            {
              ...createValidDecisionPlan().decisions[0]!,
              action: "NO_TRADE",
              size: {
                quantity: 0,
                unit: "SHARES",
                targetPositionQuantity: 0,
              },
            },
          ],
        };
        const context = createMarketContext();

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.errors.some((e) => e.type === "ACTION_CONFLICT")).toBe(false);
      });
    });

    describe("size validation", () => {
      it("should fail on negative size quantity", () => {
        const plan: DecisionPlan = {
          ...createValidDecisionPlan(),
          decisions: [
            {
              ...createValidDecisionPlan().decisions[0]!,
              size: {
                quantity: -100, // Invalid
                unit: "SHARES",
                targetPositionQuantity: 100,
              },
            },
          ],
        };
        const context = createMarketContext();

        const result = enforcer.runPreflightChecks(plan, context);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.type === "INVALID_SIZE")).toBe(true);
      });
    });

    describe("estimated cost", () => {
      it("should calculate estimated cost for new entries", () => {
        const plan = createValidDecisionPlan();
        const context = createMarketContext();

        const result = enforcer.runPreflightChecks(plan, context);

        // 100 shares * $150 = $15,000
        expect(result.estimatedCost).toBe(15000);
      });
    });
  });

  describe("requestPlanRevision", () => {
    it("should fail when no trader agent configured", async () => {
      const result = await enforcer.requestPlanRevision(
        "original",
        [{ type: "MARKET_CLOSED", message: "Market closed", severity: "ERROR" }],
        createMarketContext()
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("No trader agent");
      }
    });

    it("should request revision from trader agent", async () => {
      const validPlan = createValidDecisionPlan();
      const mockAgent: TraderAgentInterface = {
        requestRevision: mock(async () => JSON.stringify(validPlan)),
      };
      const enforcerWithAgent = new OutputEnforcer({ traderAgent: mockAgent });

      const result = await enforcerWithAgent.requestPlanRevision(
        "original",
        [{ type: "MARKET_CLOSED", message: "Market closed", severity: "ERROR" }],
        createMarketContext()
      );

      expect(mockAgent.requestRevision).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
    });

    it("should handle trader agent errors", async () => {
      const mockAgent: TraderAgentInterface = {
        requestRevision: mock(async () => {
          throw new Error("Agent error");
        }),
      };
      const enforcerWithAgent = new OutputEnforcer({ traderAgent: mockAgent });

      const result = await enforcerWithAgent.requestPlanRevision(
        "original",
        [{ type: "MARKET_CLOSED", message: "Market closed", severity: "ERROR" }],
        createMarketContext()
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("Agent error");
      }
    });
  });

  describe("enforce (full pipeline)", () => {
    it("should pass valid plan through pipeline", async () => {
      const plan = createValidDecisionPlan();
      const context = createMarketContext();

      const result = await enforcer.enforce(JSON.stringify(plan), context);

      expect(result.success).toBe(true);
      expect(result.fallbackTriggered).toBe(false);
      expect(result.decisionPlan).toBeDefined();
    });

    it("should trigger fallback on parse failure", async () => {
      const context = createMarketContext();

      const result = await enforcer.enforce("invalid json", context);

      expect(result.success).toBe(false);
      expect(result.fallbackTriggered).toBe(true);
      expect(result.fallbackReason).toContain("JSON parsing failed");
    });

    it("should trigger fallback on preflight failure", async () => {
      const plan = createValidDecisionPlan();
      const context = createMarketContext({ marketOpen: false });

      const result = await enforcer.enforce(JSON.stringify(plan), context);

      expect(result.success).toBe(false);
      expect(result.fallbackTriggered).toBe(true);
      expect(result.preflightErrors?.some((e) => e.type === "MARKET_CLOSED")).toBe(true);
    });

    it("should request revision and succeed if revised plan is valid", async () => {
      const plan = createValidDecisionPlan();
      plan.decisions[0]!.action = "INCREASE"; // Will fail preflight

      const revisedPlan = createValidDecisionPlan(); // Valid

      const mockAgent: TraderAgentInterface = {
        requestRevision: mock(async () => JSON.stringify(revisedPlan)),
      };
      const enforcerWithAgent = new OutputEnforcer({ traderAgent: mockAgent });

      const context = createMarketContext();

      const result = await enforcerWithAgent.enforce(JSON.stringify(plan), context);

      expect(mockAgent.requestRevision).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.fallbackTriggered).toBe(false);
    });

    it("should skip preflight when configured", async () => {
      const plan = createValidDecisionPlan();
      const context = createMarketContext({ marketOpen: false }); // Would normally fail

      const enforcerSkipPreflight = new OutputEnforcer({ skipPreflight: true });
      const result = await enforcerSkipPreflight.enforce(JSON.stringify(plan), context);

      expect(result.success).toBe(true);
      expect(result.fallbackTriggered).toBe(false);
    });
  });
});

// ============================================
// Factory Function Tests
// ============================================

describe("createOutputEnforcer", () => {
  it("should create enforcer with default options", () => {
    const enforcer = createOutputEnforcer();
    expect(enforcer).toBeInstanceOf(OutputEnforcer);
  });

  it("should create enforcer with custom options", () => {
    const enforcer = createOutputEnforcer({ maxRevisionAttempts: 2 });
    expect(enforcer).toBeInstanceOf(OutputEnforcer);
  });
});

describe("parseAndValidateJSON (standalone)", () => {
  it("should parse valid JSON", async () => {
    const plan = createValidDecisionPlan();
    const result = await parseAndValidateJSON(JSON.stringify(plan));

    expect(result.ok).toBe(true);
  });
});

describe("runPreflightChecks (standalone)", () => {
  it("should run preflight checks", () => {
    const plan = createValidDecisionPlan();
    const context = createMarketContext();

    const result = runPreflightChecks(plan, context);

    expect(result.valid).toBe(true);
  });
});

// ============================================
// createFallbackPlan Tests
// ============================================

describe("createFallbackPlan", () => {
  it("should create fallback plan with HOLD actions", () => {
    const positions = new Map([
      ["AAPL", createPosition("AAPL", 100)],
      ["GOOGL", createPosition("GOOGL", -50)],
    ]);

    const plan = createFallbackPlan("fallback-cycle", positions);

    expect(plan.cycleId).toBe("fallback-cycle");
    expect(plan.decisions).toHaveLength(2);
    expect(plan.decisions[0]?.action).toBe("HOLD");
    expect(plan.decisions[1]?.action).toBe("HOLD");
    expect(plan.portfolioNotes).toContain("Fallback");
  });

  it("should skip flat positions", () => {
    const positions = new Map([
      ["AAPL", createPosition("AAPL", 100)],
      ["FLAT", createPosition("FLAT", 0)],
    ]);

    const plan = createFallbackPlan("fallback-cycle", positions);

    expect(plan.decisions).toHaveLength(1);
    expect(plan.decisions[0]?.instrument.instrumentId).toBe("AAPL");
  });

  it("should handle empty positions", () => {
    const positions = new Map<string, PositionInfo>();

    const plan = createFallbackPlan("fallback-cycle", positions);

    expect(plan.decisions).toHaveLength(0);
  });

  it("should set appropriate risk levels based on direction", () => {
    const positions = new Map([
      ["LONG", createPosition("LONG", 100, 100)], // Long position
      ["SHORT", createPosition("SHORT", -50, 100)], // Short position
    ]);

    const plan = createFallbackPlan("fallback-cycle", positions);

    const longDecision = plan.decisions.find((d) => d.instrument.instrumentId === "LONG");
    const shortDecision = plan.decisions.find((d) => d.instrument.instrumentId === "SHORT");

    // Long: stop below entry, take profit above
    expect(longDecision?.riskLevels.stopLossLevel).toBeLessThan(100);
    expect(longDecision?.riskLevels.takeProfitLevel).toBeGreaterThan(100);

    // Short: stop above entry, take profit below
    expect(shortDecision?.riskLevels.stopLossLevel).toBeGreaterThan(100);
    expect(shortDecision?.riskLevels.takeProfitLevel).toBeLessThan(100);
  });
});

// ============================================
// Integration Tests
// ============================================

describe("Integration", () => {
  it("should handle complete enforcement workflow", async () => {
    const validPlan = createValidDecisionPlan();
    const context = createMarketContext();

    const enforcer = createOutputEnforcer();
    const result = await enforcer.enforce(JSON.stringify(validPlan), context);

    expect(result.success).toBe(true);
    expect(result.decisionPlan?.cycleId).toBe("test-cycle-1");
    expect(result.attemptCount).toBe(1);
  });

  it("should handle retry and revision workflow", async () => {
    // First response is malformed
    const malformedResponse = "not json";
    const validPlan = createValidDecisionPlan();

    const retryCallback = mock(async () => JSON.stringify(validPlan));
    const context = createMarketContext();

    const enforcer = createOutputEnforcer();
    const result = await enforcer.enforce(malformedResponse, context, retryCallback);

    expect(retryCallback).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });
});
