/**
 * Multi-Agent Coordination Tests
 *
 * Tests handoffs and data integrity through the trader → risk → critic pipeline.
 *
 * @see docs/plans/14-testing.md lines 478-517
 */

import { describe, expect, it } from "bun:test";
import {
  createMockCriticAgent,
  createMockRiskManagerAgent,
  createMockTraderAgent,
  createTestSnapshot,
  type DecisionPlan,
  executePipeline,
  validateDecisionPlan,
  verifyHandoffIntegrity,
  withTimeout,
} from "./orchestration.js";

// ============================================
// Pipeline Data Integrity Tests
// ============================================

describe("Pipeline Data Integrity", () => {
  it("trader → risk → critic pipeline maintains data integrity", async () => {
    const snapshot = createTestSnapshot();

    const traderAgent = createMockTraderAgent();
    const riskAgent = createMockRiskManagerAgent();
    const criticAgent = createMockCriticAgent();

    // Step 1: Trader generates plan
    const plan = await traderAgent.run(snapshot);
    const validation = validateDecisionPlan(plan);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Step 2: Risk manager validates
    const riskResult = await riskAgent.run({ plan, snapshot });
    expect(riskResult.planPassedThrough).toMatchObject({
      id: plan.id,
      symbol: plan.symbol,
      action: plan.action,
    });

    // Verify handoff integrity
    const handoff = verifyHandoffIntegrity(plan, riskResult.planPassedThrough);
    expect(handoff.intact).toBe(true);
    expect(handoff.differences).toHaveLength(0);

    // Step 3: Critic reviews
    const criticResult = await criticAgent.run({
      plan: riskResult.approvedPlan!,
      snapshot,
    });
    expect(criticResult.originalPlanId).toBe(plan.id);
  });

  it("plan ID preserved through entire pipeline", async () => {
    const snapshot = createTestSnapshot();

    const result = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      createMockRiskManagerAgent(),
      createMockCriticAgent()
    );

    expect(result.status).toBe("COMPLETE");
    expect(result.traderResult?.id).toBe(result.plan?.id);
    expect(result.criticResult?.originalPlanId).toBe(result.traderResult?.id);
  });

  it("plan data not corrupted through pipeline", async () => {
    const snapshot = createTestSnapshot();

    const result = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      createMockRiskManagerAgent(),
      createMockCriticAgent()
    );

    expect(result.status).toBe("COMPLETE");

    // Verify all critical fields preserved
    const original = result.traderResult!;
    const final = result.plan!;

    expect(final.symbol).toBe(original.symbol);
    expect(final.action).toBe(original.action);
    expect(final.direction).toBe(original.direction);
    expect(final.size).toEqual(original.size);
    expect(final.stopLoss).toBe(original.stopLoss);
    expect(final.takeProfit).toBe(original.takeProfit);
  });
});

// ============================================
// Agent Timeout Handling Tests
// ============================================

describe("Agent Timeout Handling", () => {
  it("withTimeout completes before timeout", async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve("done"), 10);
    });

    const result = await withTimeout(promise, 1000, { fallback: "SKIP" });

    expect(result.status).toBe("COMPLETE");
    expect(result.value).toBe("done");
  });

  it("withTimeout returns SKIP on timeout", async () => {
    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve("done"), 1000);
    });

    const result = await withTimeout(slowPromise, 10, { fallback: "SKIP" });

    expect(result.status).toBe("SKIP");
  });

  it("withTimeout returns fallback value on timeout", async () => {
    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve("done"), 1000);
    });

    const result = await withTimeout(slowPromise, 10, {
      fallback: "fallback-value",
    });

    expect(result.status).toBe("SKIP");
    expect(result.value).toBe("fallback-value");
  });

  it("withTimeout calls onTimeout callback", async () => {
    let callbackCalled = false;

    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve("done"), 1000);
    });

    await withTimeout(slowPromise, 10, {
      fallback: "SKIP",
      onTimeout: () => {
        callbackCalled = true;
      },
    });

    expect(callbackCalled).toBe(true);
  });

  it("handles agent timeout gracefully in pipeline", async () => {
    const snapshot = createTestSnapshot({ complexity: "extreme" });

    // Create a slow trader agent
    const slowTrader = createMockTraderAgent({ delay: 1000 });

    const result = await executePipeline(
      snapshot,
      slowTrader,
      createMockRiskManagerAgent(),
      createMockCriticAgent(),
      { timeoutMs: 50 }
    );

    expect(result.status).toBe("TIMEOUT");
  });

  it("timeout triggers gracefully without hanging", async () => {
    const startTime = Date.now();

    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve("done"), 10000);
    });

    await withTimeout(slowPromise, 50, { fallback: "SKIP" });

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(200); // Should complete quickly, not hang
  });
});

// ============================================
// Error Propagation Tests
// ============================================

describe("Error Propagation", () => {
  it("trader failure stops pipeline", async () => {
    const snapshot = createTestSnapshot();

    const failingTrader = createMockTraderAgent({
      shouldFail: true,
      failureMessage: "Trader crashed",
    });

    const result = await executePipeline(
      snapshot,
      failingTrader,
      createMockRiskManagerAgent(),
      createMockCriticAgent()
    );

    expect(result.status).toBe("TRADER_FAILED");
    expect(result.error?.message).toBe("Trader crashed");
    expect(result.riskResult).toBeUndefined();
    expect(result.criticResult).toBeUndefined();
  });

  it("risk manager rejection stops pipeline", async () => {
    const snapshot = createTestSnapshot();

    const rejectingRisk = createMockRiskManagerAgent({
      shouldReject: true,
      rejectionReason: "Position size exceeds limit",
    });

    const result = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      rejectingRisk,
      createMockCriticAgent(),
      { stopOnRiskReject: true }
    );

    expect(result.status).toBe("RISK_REJECTED");
    expect(result.traderResult).toBeDefined();
    expect(result.riskResult?.verdict).toBe("REJECT");
    expect(result.riskResult?.rejectionReason).toBe("Position size exceeds limit");
    expect(result.criticResult).toBeUndefined();
  });

  it("critic rejection marks plan as failed", async () => {
    const snapshot = createTestSnapshot();

    const rejectingCritic = createMockCriticAgent({
      shouldReject: true,
      rejectionIssues: ["Logical inconsistency detected"],
    });

    const result = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      createMockRiskManagerAgent(),
      rejectingCritic
    );

    expect(result.status).toBe("CRITIC_REJECTED");
    expect(result.traderResult).toBeDefined();
    expect(result.riskResult).toBeDefined();
    expect(result.criticResult?.verdict).toBe("REJECT");
    expect(result.criticResult?.issues).toContain("Logical inconsistency detected");
  });

  it("errors propagate correctly with full context", async () => {
    const snapshot = createTestSnapshot();

    const failingTrader = createMockTraderAgent({
      shouldFail: true,
      failureMessage: "API timeout",
    });

    const result = await executePipeline(
      snapshot,
      failingTrader,
      createMockRiskManagerAgent(),
      createMockCriticAgent()
    );

    expect(result.status).toBe("TRADER_FAILED");
    expect(result.error).toBeInstanceOf(Error);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("partial results not committed on failure", async () => {
    const snapshot = createTestSnapshot();

    // Risk manager will fail after trader succeeds
    const rejectingRisk = createMockRiskManagerAgent({ shouldReject: true });

    const result = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      rejectingRisk,
      createMockCriticAgent()
    );

    expect(result.status).toBe("RISK_REJECTED");
    expect(result.plan).toBeUndefined(); // No final plan committed
    expect(result.traderResult).toBeDefined(); // But we have the trader result for debugging
  });
});

// ============================================
// Consensus Flow Tests
// ============================================

describe("Consensus Flow", () => {
  it("risk APPROVE + critic APPROVE → plan executed", async () => {
    const snapshot = createTestSnapshot();

    const result = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      createMockRiskManagerAgent(), // Will approve
      createMockCriticAgent() // Will approve
    );

    expect(result.status).toBe("COMPLETE");
    expect(result.plan).toBeDefined();
    expect(result.riskResult?.verdict).toBe("APPROVE");
    expect(result.criticResult?.verdict).toBe("APPROVE");
  });

  it("risk REJECT → plan stops (critic not called)", async () => {
    const snapshot = createTestSnapshot();

    const rejectingRisk = createMockRiskManagerAgent({
      shouldReject: true,
      rejectionReason: "Risk limit exceeded",
    });

    const result = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      rejectingRisk,
      createMockCriticAgent(),
      { stopOnRiskReject: true }
    );

    expect(result.status).toBe("RISK_REJECTED");
    expect(result.riskResult?.verdict).toBe("REJECT");
    expect(result.criticResult).toBeUndefined(); // Critic not called
  });

  it("risk APPROVE + critic REJECT → plan rejected", async () => {
    const snapshot = createTestSnapshot();

    const rejectingCritic = createMockCriticAgent({
      shouldReject: true,
      rejectionIssues: ["Rationale insufficient"],
    });

    const result = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      createMockRiskManagerAgent(),
      rejectingCritic
    );

    expect(result.status).toBe("CRITIC_REJECTED");
    expect(result.riskResult?.verdict).toBe("APPROVE");
    expect(result.criticResult?.verdict).toBe("REJECT");
    expect(result.plan).toBeUndefined();
  });

  it("consensus requires BOTH risk AND critic approval", async () => {
    const snapshot = createTestSnapshot();

    // Both approve
    const result1 = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      createMockRiskManagerAgent(),
      createMockCriticAgent()
    );
    expect(result1.status).toBe("COMPLETE");

    // Risk rejects
    const result2 = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      createMockRiskManagerAgent({ shouldReject: true }),
      createMockCriticAgent()
    );
    expect(result2.status).toBe("RISK_REJECTED");

    // Critic rejects
    const result3 = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      createMockRiskManagerAgent(),
      createMockCriticAgent({ shouldReject: true })
    );
    expect(result3.status).toBe("CRITIC_REJECTED");
  });
});

// ============================================
// Handoff Verification Tests
// ============================================

describe("Handoff Verification", () => {
  it("risk manager receives exact plan from trader", async () => {
    const snapshot = createTestSnapshot();

    const traderAgent = createMockTraderAgent();
    const riskAgent = createMockRiskManagerAgent();

    const plan = await traderAgent.run(snapshot);
    const riskResult = await riskAgent.run({ plan, snapshot });

    // Verify exact match
    const integrity = verifyHandoffIntegrity(plan, riskResult.planPassedThrough);
    expect(integrity.intact).toBe(true);
    expect(integrity.differences).toHaveLength(0);
  });

  it("critic receives approved plan from risk manager", async () => {
    const snapshot = createTestSnapshot();

    const traderAgent = createMockTraderAgent();
    const riskAgent = createMockRiskManagerAgent();
    const criticAgent = createMockCriticAgent();

    const plan = await traderAgent.run(snapshot);
    const riskResult = await riskAgent.run({ plan, snapshot });

    expect(riskResult.verdict).toBe("APPROVE");
    expect(riskResult.approvedPlan).toBeDefined();

    const criticResult = await criticAgent.run({
      plan: riskResult.approvedPlan!,
      snapshot,
    });

    expect(criticResult.originalPlanId).toBe(plan.id);
  });

  it("execution engine receives final approved plan", async () => {
    const snapshot = createTestSnapshot();

    const result = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      createMockRiskManagerAgent(),
      createMockCriticAgent()
    );

    expect(result.status).toBe("COMPLETE");
    expect(result.plan).toBeDefined();

    // The final plan should be the same as what trader generated
    const integrity = verifyHandoffIntegrity(result.traderResult!, result.plan!);
    expect(integrity.intact).toBe(true);
  });

  it("no data loss or transformation in handoffs", async () => {
    const snapshot = createTestSnapshot();

    const result = await executePipeline(
      snapshot,
      createMockTraderAgent(),
      createMockRiskManagerAgent(),
      createMockCriticAgent()
    );

    expect(result.status).toBe("COMPLETE");

    // Check all fields preserved
    const original = result.traderResult!;
    const passed = result.riskResult?.planPassedThrough;
    const final = result.plan!;

    // Trader → Risk handoff
    expect(passed?.id).toBe(original.id);
    expect(passed?.symbol).toBe(original.symbol);
    expect(passed?.action).toBe(original.action);
    expect(passed?.direction).toBe(original.direction);
    expect(passed?.size.quantity).toBe(original.size.quantity);
    expect(passed?.size.unit).toBe(original.size.unit);
    expect(passed?.stopLoss).toBe(original.stopLoss);
    expect(passed?.takeProfit).toBe(original.takeProfit);
    expect(passed?.confidence).toBe(original.confidence);
    expect(passed?.rationale).toBe(original.rationale);

    // Risk → Critic → Final handoff
    expect(final.id).toBe(original.id);
    expect(final.symbol).toBe(original.symbol);
    expect(final.action).toBe(original.action);
  });
});

// ============================================
// validateDecisionPlan Tests
// ============================================

describe("validateDecisionPlan", () => {
  it("validates correct plan", () => {
    const plan: DecisionPlan = {
      id: "test-123",
      symbol: "AAPL",
      action: "BUY",
      direction: "LONG",
      size: { quantity: 100, unit: "SHARES" },
      stopLoss: 145,
      takeProfit: 160,
      confidence: 0.8,
      rationale: "Strong bullish momentum",
      timestamp: new Date().toISOString(),
    };

    const result = validateDecisionPlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects missing fields", () => {
    const incompletePlan = {
      id: "test-123",
      symbol: "AAPL",
      // Missing other required fields
    };

    const result = validateDecisionPlan(incompletePlan);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid action", () => {
    const badPlan = {
      id: "test-123",
      symbol: "AAPL",
      action: "INVALID",
      direction: "LONG",
      size: { quantity: 100, unit: "SHARES" },
      stopLoss: 145,
      takeProfit: 160,
      confidence: 0.8,
      rationale: "Test",
      timestamp: new Date().toISOString(),
    };

    const result = validateDecisionPlan(badPlan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid action");
  });

  it("rejects confidence outside 0-1", () => {
    const badPlan = {
      id: "test-123",
      symbol: "AAPL",
      action: "BUY",
      direction: "LONG",
      size: { quantity: 100, unit: "SHARES" },
      stopLoss: 145,
      takeProfit: 160,
      confidence: 1.5, // Invalid
      rationale: "Test",
      timestamp: new Date().toISOString(),
    };

    const result = validateDecisionPlan(badPlan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid confidence");
  });
});

// ============================================
// createTestSnapshot Tests
// ============================================

describe("createTestSnapshot", () => {
  it("creates bullish snapshot by default", () => {
    const snapshot = createTestSnapshot();

    expect(snapshot.id).toBeDefined();
    expect(snapshot.symbol).toBe("AAPL");
    expect(snapshot.price).toBe(100);
    expect(snapshot.indicators.sma20).toBeLessThan(snapshot.price); // Bullish
  });

  it("creates bearish snapshot when specified", () => {
    const snapshot = createTestSnapshot({ bullish: false });

    expect(snapshot.indicators.sma20).toBeGreaterThan(snapshot.price); // Bearish
    expect(snapshot.indicators.rsi).toBe(35);
  });

  it("respects custom options", () => {
    const snapshot = createTestSnapshot({
      symbol: "MSFT",
      price: 200,
      complexity: "extreme",
    });

    expect(snapshot.symbol).toBe("MSFT");
    expect(snapshot.price).toBe(200);
    expect(snapshot.complexity).toBe("extreme");
  });
});

// ============================================
// verifyHandoffIntegrity Tests
// ============================================

describe("verifyHandoffIntegrity", () => {
  it("detects identical plans", () => {
    const plan: DecisionPlan = {
      id: "test-123",
      symbol: "AAPL",
      action: "BUY",
      direction: "LONG",
      size: { quantity: 100, unit: "SHARES" },
      stopLoss: 145,
      takeProfit: 160,
      confidence: 0.8,
      rationale: "Test",
      timestamp: new Date().toISOString(),
    };

    const result = verifyHandoffIntegrity(plan, { ...plan });
    expect(result.intact).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it("detects changes in id", () => {
    const original: DecisionPlan = {
      id: "original-123",
      symbol: "AAPL",
      action: "BUY",
      direction: "LONG",
      size: { quantity: 100, unit: "SHARES" },
      stopLoss: 145,
      takeProfit: 160,
      confidence: 0.8,
      rationale: "Test",
      timestamp: new Date().toISOString(),
    };

    const modified = { ...original, id: "modified-456" };

    const result = verifyHandoffIntegrity(original, modified);
    expect(result.intact).toBe(false);
    expect(result.differences).toContain("id changed");
  });

  it("detects changes in multiple fields", () => {
    const original: DecisionPlan = {
      id: "test-123",
      symbol: "AAPL",
      action: "BUY",
      direction: "LONG",
      size: { quantity: 100, unit: "SHARES" },
      stopLoss: 145,
      takeProfit: 160,
      confidence: 0.8,
      rationale: "Test",
      timestamp: new Date().toISOString(),
    };

    const modified: DecisionPlan = {
      ...original,
      symbol: "MSFT",
      action: "SELL",
      confidence: 0.5,
    };

    const result = verifyHandoffIntegrity(original, modified);
    expect(result.intact).toBe(false);
    expect(result.differences).toContain("symbol changed");
    expect(result.differences).toContain("action changed");
    expect(result.differences).toContain("confidence changed");
  });
});
