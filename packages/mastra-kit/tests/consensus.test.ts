/**
 * Tests for ConsensusGate
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
  ConsensusGate,
  createApprovedCriticOutput,
  createApprovedRiskOutput,
  createNoTradePlan,
  runConsensusLoop,
  wouldPassConsensus,
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
});
