/**
 * Behavioral Property Tests for Agent Invariants
 *
 * These tests verify that agent behavioral invariants hold regardless
 * of specific output content. All tests use mock LLM for deterministic,
 * fast execution.
 *
 * @see docs/plans/14-testing.md lines 425-476
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { DecisionPlanSchema, validateRiskLevels, getDecisionDirection } from "@cream/domain";
import {
  createMockLLM,
  createMockLLMWithDefaults,
  type MockLLM,
} from "../../../mocks/src";
import {
  createValidDecision,
  createValidPlan,
  createPlanWithViolation,
  createPlanWithMismatch,
  createHighConfidenceSetup,
  createPlanMissingStopLoss,
  createPlanWithInvalidStopLoss,
  createRiskApproveVerdict,
  createRiskRejectVerdict,
  createCriticApproveVerdict,
  createCriticRejectVerdict,
  CONSTRAINT_LIMITS,
  violatesPerInstrumentLimit,
  violatesPortfolioLimit,
  violatesLeverageLimit,
  type RiskManagerVerdict,
  type CriticVerdict,
  type ConsensusResult,
} from "./helpers";

// ============================================
// Test Infrastructure
// ============================================

/**
 * Simulate Risk Manager evaluation
 *
 * In production, this would call the actual Risk Manager agent.
 * For property testing, we use predefined rules.
 */
function evaluateRiskManager(
  plan: ReturnType<typeof createValidPlan>,
  portfolioValue: number = 100000
): RiskManagerVerdict {
  const violations: string[] = [];

  for (const decision of plan.decisions) {
    const positionValue = decision.size.quantity * 175; // Assume $175/share

    // Check per-instrument limit
    if (violatesPerInstrumentLimit(positionValue, portfolioValue)) {
      violations.push(
        `Position size ${decision.size.quantity} shares exceeds 5% limit for ${decision.instrument.instrumentId}`
      );
    }
  }

  // Check portfolio limit
  const totalValue = plan.decisions.reduce(
    (sum, d) => sum + d.size.quantity * 175,
    0
  );
  if (violatesPortfolioLimit(totalValue / portfolioValue)) {
    violations.push(
      `Total allocation ${((totalValue / portfolioValue) * 100).toFixed(1)}% exceeds portfolio limit`
    );
  }

  // Check leverage
  if (violatesLeverageLimit(totalValue, portfolioValue)) {
    violations.push(`Notional ${totalValue} exceeds leverage limit`);
  }

  // Check options Greeks (simplified)
  for (const decision of plan.decisions) {
    if (decision.instrument.instrumentType === "OPTION") {
      if (decision.size.quantity > CONSTRAINT_LIMITS.MAX_DELTA_PER_POSITION / 100) {
        violations.push(`Options position exceeds delta limit`);
      }
    }
  }

  if (violations.length > 0) {
    return createRiskRejectVerdict(violations);
  }
  return createRiskApproveVerdict();
}

/**
 * Simulate Critic evaluation
 *
 * Checks for rationale/data mismatches.
 */
function evaluateCritic(
  plan: ReturnType<typeof createValidPlan>,
  regime: string,
  signals: Record<string, number>
): CriticVerdict {
  const issues: string[] = [];

  for (const decision of plan.decisions) {
    const rationale = decision.rationale.toLowerCase();

    // Check regime mismatch
    if (rationale.includes("bullish") && regime === "BEAR_TREND") {
      issues.push("Bullish rationale contradicts bearish regime");
    }
    if (rationale.includes("breakout") && regime === "RANGE") {
      issues.push("Breakout setup contradicts range-bound regime");
    }

    // Check volume mismatch
    if (
      rationale.includes("volume") &&
      signals.volume_ratio !== undefined &&
      signals.volume_ratio < 1.0
    ) {
      issues.push("Volume-based rationale but volume below average");
    }

    // Check confidence mismatch
    if (decision.confidence > 0.9) {
      const signalStrength = Math.abs(signals.trend || 0);
      if (signalStrength < 0.2) {
        issues.push("High confidence but weak trend signal");
      }
    }
  }

  if (issues.length > 0) {
    return createCriticRejectVerdict(issues);
  }
  return createCriticApproveVerdict();
}

/**
 * Determine consensus from Risk Manager and Critic verdicts
 */
function determineConsensus(
  riskVerdict: RiskManagerVerdict,
  criticVerdict: CriticVerdict
): ConsensusResult {
  return {
    approved: riskVerdict.verdict === "APPROVE" && criticVerdict.verdict === "APPROVE",
    riskManagerVerdict: riskVerdict,
    criticVerdict: criticVerdict,
  };
}

// ============================================
// Risk Manager Invariant Tests
// ============================================

describe("Agent Behavioral Properties", () => {
  describe("Risk Manager Invariants", () => {
    /**
     * INVARIANT: Risk manager ALWAYS rejects when constraints violated
     */
    test("rejects when per-instrument limit violated", () => {
      const plan = createPlanWithViolation("per_instrument_limit");
      const verdict = evaluateRiskManager(plan);

      expect(verdict.verdict).toBe("REJECT");
      expect(verdict.violations.length).toBeGreaterThan(0);
      expect(verdict.violations.some((v) => v.includes("5%"))).toBe(true);
    });

    test("rejects when portfolio limit violated", () => {
      const plan = createPlanWithViolation("portfolio_limit");
      const verdict = evaluateRiskManager(plan);

      expect(verdict.verdict).toBe("REJECT");
      expect(verdict.violations.length).toBeGreaterThan(0);
      expect(
        verdict.violations.some(
          (v) => v.includes("portfolio") || v.includes("allocation") || v.includes("leverage")
        )
      ).toBe(true);
    });

    test("rejects when Greeks limit violated", () => {
      const plan = createPlanWithViolation("greeks_limit");
      const verdict = evaluateRiskManager(plan);

      expect(verdict.verdict).toBe("REJECT");
      expect(verdict.violations.length).toBeGreaterThan(0);
      expect(verdict.violations.some((v) => v.includes("delta"))).toBe(true);
    });

    test("rejects when leverage limit violated", () => {
      const plan = createPlanWithViolation("leverage_limit");
      const verdict = evaluateRiskManager(plan);

      expect(verdict.verdict).toBe("REJECT");
      expect(verdict.violations.some((v) => v.includes("leverage"))).toBe(true);
    });

    test("approves when all constraints satisfied", () => {
      const plan = createValidPlan();
      const verdict = evaluateRiskManager(plan);

      expect(verdict.verdict).toBe("APPROVE");
      expect(verdict.violations).toHaveLength(0);
    });

    test("violations array is always present", () => {
      const plan = createPlanWithViolation("per_instrument_limit");
      const verdict = evaluateRiskManager(plan);

      expect(Array.isArray(verdict.violations)).toBe(true);
    });
  });

  // ============================================
  // Critic Invariant Tests
  // ============================================

  describe("Critic Invariants", () => {
    /**
     * INVARIANT: Critic ALWAYS rejects when rationale doesn't match data
     */
    test("rejects when bullish rationale contradicts bearish regime", () => {
      const { plan, regime, signals } = createPlanWithMismatch("regime_mismatch");
      const verdict = evaluateCritic(plan, regime, signals);

      expect(verdict.verdict).toBe("REJECT");
      expect(verdict.issues.length).toBeGreaterThan(0);
      expect(
        verdict.issues.some((i) => i.includes("regime") || i.includes("contradicts"))
      ).toBe(true);
    });

    test("rejects when momentum play claims high volume but volume is low", () => {
      const { plan, regime, signals } = createPlanWithMismatch("volume_mismatch");
      const verdict = evaluateCritic(plan, regime, signals);

      expect(verdict.verdict).toBe("REJECT");
      expect(verdict.issues.some((i) => i.includes("volume"))).toBe(true);
    });

    test("rejects when breakout setup contradicts range regime", () => {
      const { plan, regime, signals } = createPlanWithMismatch("setup_mismatch");
      const verdict = evaluateCritic(plan, regime, signals);

      expect(verdict.verdict).toBe("REJECT");
      expect(
        verdict.issues.some((i) => i.includes("breakout") || i.includes("range"))
      ).toBe(true);
    });

    test("rejects high confidence with weak signals", () => {
      const { plan, regime, signals } = createPlanWithMismatch("confidence_mismatch");
      const verdict = evaluateCritic(plan, regime, signals);

      expect(verdict.verdict).toBe("REJECT");
      expect(verdict.issues.some((i) => i.includes("confidence"))).toBe(true);
    });

    test("approves when rationale matches data", () => {
      const plan = createValidPlan();
      const verdict = evaluateCritic(plan, "BULL_TREND", { trend: 0.6, momentum: 0.5 });

      expect(verdict.verdict).toBe("APPROVE");
      expect(verdict.issues).toHaveLength(0);
    });
  });

  // ============================================
  // Position Limits Invariant Tests
  // ============================================

  describe("Position Limits Invariants", () => {
    /**
     * INVARIANT: No agent EVER exceeds position limits regardless of confidence
     */
    test("respects position limits even with 99% confidence", () => {
      const plan = createHighConfidenceSetup(0.99);
      const verdict = evaluateRiskManager(plan);

      // Position limit is enforced regardless of confidence
      const decision = plan.decisions[0];
      const positionValue = decision.size.quantity * 175;
      const portfolioValue = 100000;

      if (violatesPerInstrumentLimit(positionValue, portfolioValue)) {
        expect(verdict.verdict).toBe("REJECT");
      } else {
        expect(verdict.verdict).toBe("APPROVE");
      }
    });

    test("respects position limits with 50% confidence", () => {
      const plan = createHighConfidenceSetup(0.5);
      const verdict = evaluateRiskManager(plan);

      // Same limits apply regardless of confidence
      const decision = plan.decisions[0];
      const positionValue = decision.size.quantity * 175;
      const portfolioValue = 100000;

      if (violatesPerInstrumentLimit(positionValue, portfolioValue)) {
        expect(verdict.verdict).toBe("REJECT");
      } else {
        expect(verdict.verdict).toBe("APPROVE");
      }
    });

    test("total allocation never exceeds portfolio limit", () => {
      const plan = createPlanWithViolation("portfolio_limit");
      const verdict = evaluateRiskManager(plan);

      expect(verdict.verdict).toBe("REJECT");
    });

    test("leverage never exceeds max leverage limit", () => {
      const plan = createPlanWithViolation("leverage_limit");
      const verdict = evaluateRiskManager(plan);

      expect(verdict.verdict).toBe("REJECT");
      expect(verdict.violations.some((v) => v.includes("leverage"))).toBe(true);
    });

    test("constraint limits are defined correctly", () => {
      expect(CONSTRAINT_LIMITS.MAX_POSITION_SIZE).toBe(0.05);
      expect(CONSTRAINT_LIMITS.MAX_PORTFOLIO_ALLOCATION).toBe(1.0);
      expect(CONSTRAINT_LIMITS.MAX_LEVERAGE).toBe(2.0);
    });
  });

  // ============================================
  // Stop-Loss Invariant Tests
  // ============================================

  describe("Stop-Loss Invariants", () => {
    /**
     * INVARIANT: All BUY/SELL decisions MUST have stop_loss
     */
    test("schema rejects decision without riskLevels", () => {
      const plan = createPlanMissingStopLoss();
      const result = DecisionPlanSchema.safeParse(plan);

      expect(result.success).toBe(false);
    });

    test("validates stop-loss is below entry for LONG position", () => {
      const plan = createPlanWithInvalidStopLoss("LONG");
      const decision = plan.decisions[0];
      const entryPrice = decision.orderPlan.entryLimitPrice!;

      const validationResult = validateRiskLevels(decision, entryPrice);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.some((e) => e.includes("stopLossLevel"))).toBe(true);
    });

    test("validates stop-loss is above entry for SHORT position", () => {
      const plan = createPlanWithInvalidStopLoss("SHORT");
      const decision = plan.decisions[0];
      const entryPrice = decision.orderPlan.entryLimitPrice!;

      const validationResult = validateRiskLevels(decision, entryPrice);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.some((e) => e.includes("stopLossLevel"))).toBe(true);
    });

    test("valid stop-loss passes validation for LONG", () => {
      const decision = createValidDecision();
      const entryPrice = decision.orderPlan.entryLimitPrice!;

      const validationResult = validateRiskLevels(decision, entryPrice);

      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
    });
  });

  // ============================================
  // Schema Validation Invariant Tests
  // ============================================

  describe("Schema Validation Invariants", () => {
    /**
     * INVARIANT: All agent outputs MUST pass DecisionPlan schema validation
     */
    test("valid plan passes schema validation", () => {
      const plan = createValidPlan();
      const result = DecisionPlanSchema.safeParse(plan);

      expect(result.success).toBe(true);
    });

    test("plan with missing cycleId fails validation", () => {
      const plan = createValidPlan();
      // @ts-expect-error - Intentionally invalid
      delete plan.cycleId;
      const result = DecisionPlanSchema.safeParse(plan);

      expect(result.success).toBe(false);
    });

    test("plan with invalid environment fails validation", () => {
      const plan = createValidPlan();
      // @ts-expect-error - Intentionally invalid
      plan.environment = "PRODUCTION";
      const result = DecisionPlanSchema.safeParse(plan);

      expect(result.success).toBe(false);
    });

    test("decision with invalid action fails validation", () => {
      const decision = createValidDecision();
      // @ts-expect-error - Intentionally invalid
      decision.action = "EXECUTE";

      const plan = createValidPlan([decision]);
      const result = DecisionPlanSchema.safeParse(plan);

      expect(result.success).toBe(false);
    });

    test("decision with empty rationale fails validation", () => {
      const decision = createValidDecision({
        rationale: "", // Empty rationale - should fail min length
      });

      const plan = createValidPlan([decision]);
      const result = DecisionPlanSchema.safeParse(plan);

      expect(result.success).toBe(false);
    });

    test("decision with confidence out of range fails validation", () => {
      const decision = createValidDecision({
        confidence: 1.5, // > 1.0
      });

      const plan = createValidPlan([decision]);
      const result = DecisionPlanSchema.safeParse(plan);

      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // Consensus Invariant Tests
  // ============================================

  describe("Consensus Invariants", () => {
    /**
     * INVARIANT: Plan proceeds ONLY when BOTH Risk Manager AND Critic approve
     */
    test("rejects when Risk Manager REJECT + Critic APPROVE", () => {
      const plan = createValidPlan();
      const riskVerdict = createRiskRejectVerdict(["Test violation"]);
      const criticVerdict = createCriticApproveVerdict();

      const consensus = determineConsensus(riskVerdict, criticVerdict);

      expect(consensus.approved).toBe(false);
      expect(consensus.riskManagerVerdict.verdict).toBe("REJECT");
      expect(consensus.criticVerdict.verdict).toBe("APPROVE");
    });

    test("rejects when Risk Manager APPROVE + Critic REJECT", () => {
      const plan = createValidPlan();
      const riskVerdict = createRiskApproveVerdict();
      const criticVerdict = createCriticRejectVerdict(["Rationale mismatch"]);

      const consensus = determineConsensus(riskVerdict, criticVerdict);

      expect(consensus.approved).toBe(false);
      expect(consensus.riskManagerVerdict.verdict).toBe("APPROVE");
      expect(consensus.criticVerdict.verdict).toBe("REJECT");
    });

    test("rejects when Risk Manager REJECT + Critic REJECT", () => {
      const plan = createValidPlan();
      const riskVerdict = createRiskRejectVerdict(["Position too large"]);
      const criticVerdict = createCriticRejectVerdict(["Weak signals"]);

      const consensus = determineConsensus(riskVerdict, criticVerdict);

      expect(consensus.approved).toBe(false);
    });

    test("approves when Risk Manager APPROVE + Critic APPROVE", () => {
      const plan = createValidPlan();
      const riskVerdict = createRiskApproveVerdict();
      const criticVerdict = createCriticApproveVerdict();

      const consensus = determineConsensus(riskVerdict, criticVerdict);

      expect(consensus.approved).toBe(true);
      expect(consensus.riskManagerVerdict.verdict).toBe("APPROVE");
      expect(consensus.criticVerdict.verdict).toBe("APPROVE");
    });

    test("all four consensus combinations behave correctly", () => {
      const combinations: [RiskManagerVerdict, CriticVerdict, boolean][] = [
        [createRiskApproveVerdict(), createCriticApproveVerdict(), true],
        [createRiskApproveVerdict(), createCriticRejectVerdict([""]), false],
        [createRiskRejectVerdict([""]), createCriticApproveVerdict(), false],
        [createRiskRejectVerdict([""]), createCriticRejectVerdict([""]), false],
      ];

      for (const [riskVerdict, criticVerdict, expectedApproved] of combinations) {
        const consensus = determineConsensus(riskVerdict, criticVerdict);
        expect(consensus.approved).toBe(expectedApproved);
      }
    });
  });

  // ============================================
  // Mock LLM Integration Tests
  // ============================================

  describe("Mock LLM Integration", () => {
    let mockLLM: MockLLM;

    beforeEach(() => {
      mockLLM = createMockLLMWithDefaults();
    });

    test("mock LLM returns deterministic responses", async () => {
      const response1 = await mockLLM.complete("risk_manager:APPROVE");
      const response2 = await mockLLM.complete("risk_manager:APPROVE");

      expect(response1).toBe(response2);
    });

    test("mock LLM risk manager approve response has correct structure", async () => {
      const response = await mockLLM.completeJSON<RiskManagerVerdict>(
        "risk_manager:APPROVE"
      );

      expect(response.verdict).toBe("APPROVE");
      expect(Array.isArray(response.violations)).toBe(true);
      expect(response.violations).toHaveLength(0);
    });

    test("mock LLM risk manager reject response has violations", async () => {
      const response = await mockLLM.completeJSON<RiskManagerVerdict>(
        "risk_manager:REJECT"
      );

      expect(response.verdict).toBe("REJECT");
      expect(response.violations.length).toBeGreaterThan(0);
    });

    test("mock LLM critic responses follow expected structure", async () => {
      const approveResponse = await mockLLM.completeJSON<CriticVerdict>(
        "critic:APPROVE"
      );

      expect(approveResponse.verdict).toBe("APPROVE");
      expect(Array.isArray(approveResponse.issues)).toBe(true);

      const rejectResponse = await mockLLM.completeJSON<CriticVerdict>(
        "critic:REJECT"
      );

      expect(rejectResponse.verdict).toBe("REJECT");
      expect(rejectResponse.issues.length).toBeGreaterThan(0);
    });

    test("tests run fast (no real LLM calls)", () => {
      const startTime = Date.now();

      // Run multiple operations that would be slow with real LLM
      for (let i = 0; i < 10; i++) {
        const plan = createValidPlan();
        evaluateRiskManager(plan);
        evaluateCritic(plan, "BULL_TREND", { trend: 0.5 });
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });
  });
});
