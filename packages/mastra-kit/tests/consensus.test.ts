/**
 * Tests for ConsensusGate
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
  ConsensusGate,
  createApprovedCriticOutput,
  createApprovedRiskOutput,
  createNoTradePlan,
  createTimeoutCriticOutput,
  createTimeoutRiskOutput,
  getFallbackAction,
  runConsensusLoop,
  withAgentTimeout,
  wouldPassConsensus,
  type EscalationEvent,
} from "../src/consensus.js";
import type { CriticOutput, DecisionPlan, RiskManagerOutput } from "../src/types.js";

// ============================================
// Test Fixtures
// ============================================

function createTestPlan(cycleId = "test-cycle"): DecisionPlan {
  return {
    cycleId,
    timestamp: new Date().toISOString(),
    decisions: [
      {
        decisionId: "dec-1",
        instrumentId: "AAPL",
        action: "BUY",
        direction: "LONG",
        size: { value: 100, unit: "SHARES" },
        stopLoss: { price: 175, type: "FIXED" },
        takeProfit: { price: 195 },
        strategyFamily: "EQUITY_LONG",
        timeHorizon: "SWING",
        rationale: {
          summary: "Bullish setup",
          bullishFactors: ["Uptrend"],
          bearishFactors: [],
          decisionLogic: "Buy the dip",
          memoryReferences: [],
        },
        thesisState: "ENTERED",
      },
    ],
    portfolioNotes: "Test plan",
  };
}

function createRejectingRiskOutput(): RiskManagerOutput {
  return {
    verdict: "REJECT",
    violations: [
      {
        constraint: "max_position_pct",
        current_value: 15,
        limit: 10,
        severity: "CRITICAL",
        affected_decisions: ["dec-1"],
      },
    ],
    required_changes: [
      {
        decisionId: "dec-1",
        change: "Reduce position size to 10%",
        reason: "Exceeds max position limit",
      },
    ],
    risk_notes: "Position too large",
  };
}

function createRejectingCriticOutput(): CriticOutput {
  return {
    verdict: "REJECT",
    inconsistencies: [
      {
        decisionId: "dec-1",
        issue: "Missing technical support",
        expected: "Support level from Technical Analyst",
        found: "No support level referenced",
      },
    ],
    missing_justifications: [
      {
        decisionId: "dec-1",
        missing: "Entry condition justification",
      },
    ],
    hallucination_flags: [],
    required_changes: [
      {
        decisionId: "dec-1",
        change: "Add technical support level reference",
      },
    ],
  };
}

// ============================================
// Tests
// ============================================

describe("ConsensusGate", () => {
  let gate: ConsensusGate;

  beforeEach(() => {
    gate = new ConsensusGate({ logRejections: false });
  });

  describe("evaluate", () => {
    it("should approve when both approvers approve", () => {
      const result = gate.evaluate({
        plan: createTestPlan(),
        riskManagerOutput: createApprovedRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      });

      expect(result.approved).toBe(true);
      expect(result.riskManagerVerdict).toBe("APPROVE");
      expect(result.criticVerdict).toBe("APPROVE");
      expect(result.rejectionReasons).toHaveLength(0);
    });

    it("should reject when risk manager rejects", () => {
      const result = gate.evaluate({
        plan: createTestPlan(),
        riskManagerOutput: createRejectingRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      });

      expect(result.approved).toBe(false);
      expect(result.riskManagerVerdict).toBe("REJECT");
      expect(result.criticVerdict).toBe("APPROVE");
      expect(result.rejectionReasons.length).toBeGreaterThan(0);
    });

    it("should reject when critic rejects", () => {
      const result = gate.evaluate({
        plan: createTestPlan(),
        riskManagerOutput: createApprovedRiskOutput(),
        criticOutput: createRejectingCriticOutput(),
      });

      expect(result.approved).toBe(false);
      expect(result.riskManagerVerdict).toBe("APPROVE");
      expect(result.criticVerdict).toBe("REJECT");
      expect(result.rejectionReasons.length).toBeGreaterThan(0);
    });

    it("should reject when both reject", () => {
      const result = gate.evaluate({
        plan: createTestPlan(),
        riskManagerOutput: createRejectingRiskOutput(),
        criticOutput: createRejectingCriticOutput(),
      });

      expect(result.approved).toBe(false);
      expect(result.riskManagerVerdict).toBe("REJECT");
      expect(result.criticVerdict).toBe("REJECT");
      expect(result.rejectionReasons.length).toBeGreaterThan(0);
    });

    it("should increment iteration count", () => {
      expect(gate.getIteration()).toBe(0);

      gate.evaluate({
        plan: createTestPlan(),
        riskManagerOutput: createRejectingRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      });

      expect(gate.getIteration()).toBe(1);

      gate.evaluate({
        plan: createTestPlan(),
        riskManagerOutput: createRejectingRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      });

      expect(gate.getIteration()).toBe(2);
    });

    it("should track rejection history", () => {
      gate.evaluate({
        plan: createTestPlan(),
        riskManagerOutput: createRejectingRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      });

      const history = gate.getRejectionHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.iteration).toBe(1);
      expect(history[0]?.riskManagerVerdict).toBe("REJECT");
    });
  });

  describe("canRetry", () => {
    it("should allow retries until max iterations", () => {
      expect(gate.canRetry()).toBe(true);

      gate.evaluate({
        plan: createTestPlan(),
        riskManagerOutput: createRejectingRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      });
      expect(gate.canRetry()).toBe(true);

      gate.evaluate({
        plan: createTestPlan(),
        riskManagerOutput: createRejectingRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      });
      expect(gate.canRetry()).toBe(true);

      gate.evaluate({
        plan: createTestPlan(),
        riskManagerOutput: createRejectingRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      });
      expect(gate.canRetry()).toBe(false);
    });

    it("should respect custom max iterations", () => {
      const customGate = new ConsensusGate({
        maxIterations: 1,
        logRejections: false,
      });

      expect(customGate.canRetry()).toBe(true);

      customGate.evaluate({
        plan: createTestPlan(),
        riskManagerOutput: createRejectingRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      });

      expect(customGate.canRetry()).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset iteration count and history", () => {
      gate.evaluate({
        plan: createTestPlan(),
        riskManagerOutput: createRejectingRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      });

      expect(gate.getIteration()).toBe(1);
      expect(gate.getRejectionHistory()).toHaveLength(1);

      gate.reset();

      expect(gate.getIteration()).toBe(0);
      expect(gate.getRejectionHistory()).toHaveLength(0);
    });
  });
});

describe("Helper Functions", () => {
  describe("createNoTradePlan", () => {
    it("should create empty plan with reason", () => {
      const plan = createNoTradePlan("cycle-123", "Max iterations reached");

      expect(plan.cycleId).toBe("cycle-123");
      expect(plan.decisions).toHaveLength(0);
      expect(plan.portfolioNotes).toContain("NO_TRADE");
      expect(plan.portfolioNotes).toContain("Max iterations reached");
    });
  });

  describe("createApprovedRiskOutput", () => {
    it("should create approved output", () => {
      const output = createApprovedRiskOutput("All good");

      expect(output.verdict).toBe("APPROVE");
      expect(output.violations).toHaveLength(0);
      expect(output.required_changes).toHaveLength(0);
      expect(output.risk_notes).toBe("All good");
    });
  });

  describe("createApprovedCriticOutput", () => {
    it("should create approved output", () => {
      const output = createApprovedCriticOutput();

      expect(output.verdict).toBe("APPROVE");
      expect(output.inconsistencies).toHaveLength(0);
      expect(output.missing_justifications).toHaveLength(0);
      expect(output.hallucination_flags).toHaveLength(0);
    });
  });

  describe("wouldPassConsensus", () => {
    it("should return true when both approve", () => {
      expect(wouldPassConsensus(createApprovedRiskOutput(), createApprovedCriticOutput())).toBe(
        true
      );
    });

    it("should return false when risk rejects", () => {
      expect(wouldPassConsensus(createRejectingRiskOutput(), createApprovedCriticOutput())).toBe(
        false
      );
    });

    it("should return false when critic rejects", () => {
      expect(wouldPassConsensus(createApprovedRiskOutput(), createRejectingCriticOutput())).toBe(
        false
      );
    });
  });
});

describe("runConsensusLoop", () => {
  it("should return immediately on first approval", async () => {
    const gate = new ConsensusGate({ logRejections: false });
    const plan = createTestPlan();

    const result = await runConsensusLoop(
      gate,
      plan,
      async () => ({
        riskManager: createApprovedRiskOutput(),
        critic: createApprovedCriticOutput(),
      }),
      async (p) => p
    );

    expect(result.approved).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it("should iterate on rejection and approve on retry", async () => {
    const gate = new ConsensusGate({ logRejections: false });
    const plan = createTestPlan();
    let callCount = 0;

    const result = await runConsensusLoop(
      gate,
      plan,
      async () => {
        callCount++;
        if (callCount === 1) {
          return {
            riskManager: createRejectingRiskOutput(),
            critic: createApprovedCriticOutput(),
          };
        }
        return {
          riskManager: createApprovedRiskOutput(),
          critic: createApprovedCriticOutput(),
        };
      },
      async (p) => p
    );

    expect(result.approved).toBe(true);
    expect(result.iterations).toBe(2);
  });

  it("should return NO_TRADE after max iterations", async () => {
    const gate = new ConsensusGate({ maxIterations: 2, logRejections: false });
    const plan = createTestPlan();

    const result = await runConsensusLoop(
      gate,
      plan,
      async () => ({
        riskManager: createRejectingRiskOutput(),
        critic: createApprovedCriticOutput(),
      }),
      async (p) => p
    );

    expect(result.approved).toBe(false);
    expect(result.iterations).toBe(2);
    expect(result.plan.decisions).toHaveLength(0);
    expect(result.plan.portfolioNotes).toContain("NO_TRADE");
  });

  it("should treat agent timeout as reject", async () => {
    const gate = new ConsensusGate({
      logRejections: false,
      timeout: { perAgentMs: 10, totalMs: 300000 }, // Very short timeout
    });
    const plan = createTestPlan();

    const result = await runConsensusLoop(
      gate,
      plan,
      async () => {
        // Simulate slow agent response
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          riskManager: createApprovedRiskOutput(),
          critic: createApprovedCriticOutput(),
        };
      },
      async (p) => p
    );

    // Should reject due to timeout and eventually fail after max iterations
    expect(result.approved).toBe(false);
    expect(result.plan.portfolioNotes).toContain("NO_TRADE");
  });
});

// ============================================
// Timeout Handling Tests
// ============================================

describe("Timeout Handling", () => {
  describe("withAgentTimeout", () => {
    it("should return result when promise resolves before timeout", async () => {
      const promise = Promise.resolve("success");
      const result = await withAgentTimeout(promise, 1000, "test-agent");

      expect(result.timedOut).toBe(false);
      if (!result.timedOut) {
        expect(result.result).toBe("success");
      }
    });

    it("should return timeout when promise takes too long", async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve("too late"), 100);
      });
      const result = await withAgentTimeout(promise, 10, "test-agent");

      expect(result.timedOut).toBe(true);
      if (result.timedOut) {
        expect(result.agentName).toBe("test-agent");
        expect(result.result).toBeNull();
      }
    });

    it("should treat errors as timeout for safety", async () => {
      const promise = Promise.reject(new Error("Agent error"));
      const result = await withAgentTimeout(promise, 1000, "error-agent");

      expect(result.timedOut).toBe(true);
      if (result.timedOut) {
        expect(result.agentName).toBe("error-agent");
      }
    });
  });

  describe("createTimeoutRiskOutput", () => {
    it("should create REJECT output for timeout", () => {
      const output = createTimeoutRiskOutput();

      expect(output.verdict).toBe("REJECT");
      expect(output.violations).toHaveLength(0);
      expect(output.risk_notes).toContain("timed out");
    });
  });

  describe("createTimeoutCriticOutput", () => {
    it("should create REJECT output for timeout", () => {
      const output = createTimeoutCriticOutput();

      expect(output.verdict).toBe("REJECT");
      expect(output.inconsistencies).toHaveLength(0);
    });
  });
});

// ============================================
// Total Consensus Timeout Tests
// ============================================

describe("Total Consensus Timeout", () => {
  it("should reject when total timeout exceeded", () => {
    const gate = new ConsensusGate({
      logRejections: false,
      timeout: { perAgentMs: 30000, totalMs: 1 }, // 1ms total timeout
    });
    const plan = createTestPlan();

    // Start cycle and simulate time passing
    gate.startCycle();

    // Wait a bit to exceed the 1ms timeout
    const startTime = Date.now();
    while (Date.now() - startTime < 5) {
      // Busy wait
    }

    expect(gate.isTotalTimeoutExceeded()).toBe(true);
    expect(gate.getRemainingTimeMs()).toBe(0);

    const result = gate.evaluate({
      plan,
      riskManagerOutput: createApprovedRiskOutput(),
      criticOutput: createApprovedCriticOutput(),
    });

    expect(result.approved).toBe(false);
    expect(result.plan.portfolioNotes).toContain("NO_TRADE");
  });

  it("should track remaining time correctly", () => {
    const gate = new ConsensusGate({
      logRejections: false,
      timeout: { perAgentMs: 30000, totalMs: 60000 },
    });

    // Before cycle starts, should return full time
    expect(gate.getRemainingTimeMs()).toBe(60000);

    gate.startCycle();

    // After starting, remaining time should be close to total
    expect(gate.getRemainingTimeMs()).toBeLessThanOrEqual(60000);
    expect(gate.getRemainingTimeMs()).toBeGreaterThan(59000);
  });

  it("should return false for timeout exceeded before cycle starts", () => {
    const gate = new ConsensusGate({ logRejections: false });

    expect(gate.isTotalTimeoutExceeded()).toBe(false);
  });
});

// ============================================
// Escalation Tests
// ============================================

describe("Escalation Policy", () => {
  it("should trigger escalation callback on timeout", () => {
    const escalationEvents: EscalationEvent[] = [];
    const gate = new ConsensusGate({
      logRejections: false,
      timeout: { perAgentMs: 30000, totalMs: 1 },
      escalation: {
        enabled: true,
        onEscalation: (event) => escalationEvents.push(event),
      },
    });
    const plan = createTestPlan();

    gate.startCycle();

    // Wait to exceed timeout
    const startTime = Date.now();
    while (Date.now() - startTime < 5) {
      // Busy wait
    }

    gate.evaluate({
      plan,
      riskManagerOutput: createApprovedRiskOutput(),
      criticOutput: createApprovedCriticOutput(),
    });

    expect(escalationEvents.length).toBeGreaterThan(0);
    expect(escalationEvents[0]?.type).toBe("TIMEOUT");
    expect(escalationEvents[0]?.cycleId).toBe(plan.cycleId);
  });

  it("should not trigger escalation when disabled", () => {
    const escalationEvents: EscalationEvent[] = [];
    const gate = new ConsensusGate({
      logRejections: false,
      timeout: { perAgentMs: 30000, totalMs: 1 },
      escalation: {
        enabled: false,
        onEscalation: (event) => escalationEvents.push(event),
      },
    });
    const plan = createTestPlan();

    gate.startCycle();

    // Wait to exceed timeout
    const startTime = Date.now();
    while (Date.now() - startTime < 5) {
      // Busy wait
    }

    gate.evaluate({
      plan,
      riskManagerOutput: createApprovedRiskOutput(),
      criticOutput: createApprovedCriticOutput(),
    });

    expect(escalationEvents).toHaveLength(0);
  });

  it("should track timeout count for systematic failure detection", () => {
    const gate = new ConsensusGate({ logRejections: false });
    const plan = createTestPlan();

    gate.startCycle();

    expect(gate.getTimeoutCount()).toBe(0);

    // Simulate timeouts
    gate.evaluate(
      {
        plan,
        riskManagerOutput: createApprovedRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      },
      "RISK_MANAGER_TIMEOUT"
    );

    expect(gate.getTimeoutCount()).toBe(1);

    gate.evaluate(
      {
        plan,
        riskManagerOutput: createApprovedRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      },
      "CRITIC_TIMEOUT"
    );

    expect(gate.getTimeoutCount()).toBe(2);
  });

  it("should trigger systematic failure after 3+ timeouts", () => {
    const escalationEvents: EscalationEvent[] = [];
    const gate = new ConsensusGate({
      maxIterations: 10,
      logRejections: false,
      escalation: {
        enabled: true,
        onEscalation: (event) => escalationEvents.push(event),
      },
    });
    const plan = createTestPlan();

    gate.startCycle();

    // Simulate 3 consecutive timeouts
    for (let i = 0; i < 3; i++) {
      gate.evaluate(
        {
          plan,
          riskManagerOutput: createApprovedRiskOutput(),
          criticOutput: createApprovedCriticOutput(),
        },
        "RISK_MANAGER_TIMEOUT"
      );
    }

    const systematicFailure = escalationEvents.find((e) => e.type === "SYSTEMATIC_FAILURE");
    expect(systematicFailure).toBeDefined();
    expect(systematicFailure?.details).toContain("3 consecutive timeouts");
  });

  it("should allow resetting timeout count", () => {
    const gate = new ConsensusGate({ logRejections: false });
    const plan = createTestPlan();

    gate.startCycle();

    gate.evaluate(
      {
        plan,
        riskManagerOutput: createApprovedRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      },
      "RISK_MANAGER_TIMEOUT"
    );

    expect(gate.getTimeoutCount()).toBe(1);

    gate.resetTimeoutCount();

    expect(gate.getTimeoutCount()).toBe(0);
  });
});

// ============================================
// Fallback Action Tests
// ============================================

describe("getFallbackAction", () => {
  it("should return HOLD for BUY action", () => {
    expect(getFallbackAction("BUY")).toBe("HOLD");
  });

  it("should return HOLD for SELL action", () => {
    expect(getFallbackAction("SELL")).toBe("HOLD");
  });

  it("should return HOLD for HOLD action", () => {
    expect(getFallbackAction("HOLD")).toBe("HOLD");
  });

  it("should return HOLD for CLOSE action by default", () => {
    expect(getFallbackAction("CLOSE")).toBe("HOLD");
  });

  it("should return CLOSE for CLOSE action when forceCloseOnFail is true", () => {
    expect(getFallbackAction("CLOSE", true)).toBe("CLOSE");
  });
});

// ============================================
// Timeout Status in Rejection History
// ============================================

describe("Rejection History with Timeout", () => {
  it("should track timeout status in rejection history", () => {
    const gate = new ConsensusGate({ logRejections: false });
    const plan = createTestPlan();

    gate.startCycle();

    gate.evaluate(
      {
        plan,
        riskManagerOutput: createApprovedRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      },
      "RISK_MANAGER_TIMEOUT"
    );

    const history = gate.getRejectionHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.timeoutStatus).toBe("RISK_MANAGER_TIMEOUT");
    expect(history[0]?.riskManagerVerdict).toBe("TIMEOUT");
  });

  it("should track critic timeout status", () => {
    const gate = new ConsensusGate({ logRejections: false });
    const plan = createTestPlan();

    gate.startCycle();

    gate.evaluate(
      {
        plan,
        riskManagerOutput: createApprovedRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      },
      "CRITIC_TIMEOUT"
    );

    const history = gate.getRejectionHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.timeoutStatus).toBe("CRITIC_TIMEOUT");
    expect(history[0]?.criticVerdict).toBe("TIMEOUT");
  });

  it("should include timeout reason in rejection reasons", () => {
    const gate = new ConsensusGate({ logRejections: false });
    const plan = createTestPlan();

    gate.startCycle();

    const result = gate.evaluate(
      {
        plan,
        riskManagerOutput: createApprovedRiskOutput(),
        criticOutput: createApprovedCriticOutput(),
      },
      "RISK_MANAGER_TIMEOUT"
    );

    expect(result.rejectionReasons.some((r) => r.includes("timed out"))).toBe(true);
  });
});
