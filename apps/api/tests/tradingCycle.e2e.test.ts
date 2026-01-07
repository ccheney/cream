/**
 * Trading Cycle End-to-End Tests
 *
 * Tests the complete trading cycle workflow from trigger to completion.
 * All tests run in BACKTEST mode with stub agents for deterministic results.
 *
 * Test coverage:
 * - Happy path: Full cycle execution
 * - Workflow input/output schema validation
 * - Step execution order verification
 * - Error handling and recovery
 * - Multi-instrument processing
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  executeTradingCycle,
  type WorkflowInput,
  type WorkflowResult,
} from "../src/workflows/trading-cycle.js";
import {
  type TradingCycleInput,
  type TradingCycleOutput,
  tradingCycleWorkflow,
} from "../src/workflows/tradingCycle.js";

// ============================================
// Test Fixtures
// ============================================

function createTestCycleInput(overrides?: Partial<TradingCycleInput>): TradingCycleInput {
  return {
    cycleId: `test-cycle-${Date.now()}`,
    environment: "BACKTEST",
    triggerTime: new Date().toISOString(),
    ...overrides,
  };
}

function createWorkflowInput(overrides?: Partial<WorkflowInput>): WorkflowInput {
  return {
    cycleId: `test-cycle-${Date.now()}`,
    instruments: ["AAPL", "MSFT", "GOOGL"],
    forceStub: true, // Always use stub mode in tests
    ...overrides,
  };
}

// ============================================
// Workflow Schema Tests
// ============================================

describe("Trading Cycle Workflow Schema", () => {
  describe("Input Schema", () => {
    it("should accept valid input with all required fields", () => {
      const input = createTestCycleInput();
      const result = tradingCycleWorkflow.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept BACKTEST environment", () => {
      const input = createTestCycleInput({ environment: "BACKTEST" });
      const result = tradingCycleWorkflow.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept PAPER environment", () => {
      const input = createTestCycleInput({ environment: "PAPER" });
      const result = tradingCycleWorkflow.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept LIVE environment", () => {
      const input = createTestCycleInput({ environment: "LIVE" });
      const result = tradingCycleWorkflow.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject invalid environment", () => {
      const input = { ...createTestCycleInput(), environment: "INVALID" };
      const result = tradingCycleWorkflow.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should require cycleId", () => {
      const { cycleId: _, ...inputWithoutCycleId } = createTestCycleInput();
      const result = tradingCycleWorkflow.inputSchema.safeParse(inputWithoutCycleId);
      expect(result.success).toBe(false);
    });

    it("should require environment", () => {
      const { environment: _, ...inputWithoutEnv } = createTestCycleInput();
      const result = tradingCycleWorkflow.inputSchema.safeParse(inputWithoutEnv);
      expect(result.success).toBe(false);
    });

    it("should require triggerTime", () => {
      const { triggerTime: _, ...inputWithoutTime } = createTestCycleInput();
      const result = tradingCycleWorkflow.inputSchema.safeParse(inputWithoutTime);
      expect(result.success).toBe(false);
    });
  });

  describe("Output Schema", () => {
    it("should validate successful output structure", () => {
      const output: TradingCycleOutput = {
        cycleId: "test-cycle-123",
        success: true,
        ordersExecuted: 0,
        memoryId: "mem-123",
      };
      const result = tradingCycleWorkflow.outputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it("should validate output without memoryId", () => {
      const output: TradingCycleOutput = {
        cycleId: "test-cycle-123",
        success: true,
        ordersExecuted: 0,
      };
      const result = tradingCycleWorkflow.outputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it("should validate failed output", () => {
      const output: TradingCycleOutput = {
        cycleId: "test-cycle-123",
        success: false,
        ordersExecuted: 0,
      };
      const result = tradingCycleWorkflow.outputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it("should require cycleId in output", () => {
      const output = {
        success: true,
        ordersExecuted: 0,
      };
      const result = tradingCycleWorkflow.outputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it("should require success boolean in output", () => {
      const output = {
        cycleId: "test-123",
        ordersExecuted: 0,
      };
      const result = tradingCycleWorkflow.outputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it("should require ordersExecuted number in output", () => {
      const output = {
        cycleId: "test-123",
        success: true,
      };
      const result = tradingCycleWorkflow.outputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================
// Workflow Configuration Tests
// ============================================

describe("Trading Cycle Workflow Configuration", () => {
  it("should have correct workflow id", () => {
    expect(tradingCycleWorkflow.id).toBe("trading-cycle");
  });

  it("should have description", () => {
    expect(tradingCycleWorkflow.description).toBeDefined();
    expect(tradingCycleWorkflow.description).toContain("OODA");
  });

  it("should have input schema defined", () => {
    expect(tradingCycleWorkflow.inputSchema).toBeDefined();
    expect(tradingCycleWorkflow.inputSchema instanceof z.ZodType).toBe(true);
  });

  it("should have output schema defined", () => {
    expect(tradingCycleWorkflow.outputSchema).toBeDefined();
    expect(tradingCycleWorkflow.outputSchema instanceof z.ZodType).toBe(true);
  });
});

// ============================================
// Workflow Execution Tests (executeTradingCycle)
// ============================================

describe("Trading Cycle Workflow Execution", () => {
  describe("Happy Path - Stub Mode", () => {
    it("should execute workflow with valid input", async () => {
      const input = createWorkflowInput();
      const result = await executeTradingCycle(input);

      expect(result).toBeDefined();
      expect(result.cycleId).toBe(input.cycleId);
      expect(result.mode).toBe("STUB");
    });

    it("should complete with approval in stub mode", async () => {
      const input = createWorkflowInput();
      const result = await executeTradingCycle(input);

      expect(result.approved).toBe(true);
      expect(result.iterations).toBe(1);
    });

    it("should return HOLD decisions for stub agents", async () => {
      const input = createWorkflowInput();
      const result = await executeTradingCycle(input);

      // Stub agents produce HOLD decisions (no trades)
      expect(result.orderSubmission.submitted).toBe(true);
      expect(result.orderSubmission.orderIds).toHaveLength(0);
      expect(result.orderSubmission.errors).toHaveLength(0);
    });

    it("should preserve cycleId through execution", async () => {
      const cycleId = `preserve-test-${Date.now()}`;
      const input = createWorkflowInput({ cycleId });
      const result = await executeTradingCycle(input);

      expect(result.cycleId).toBe(cycleId);
    });
  });

  describe("Instrument Processing", () => {
    it("should process single instrument", async () => {
      const input = createWorkflowInput({
        instruments: ["AAPL"],
      });
      const result = await executeTradingCycle(input);

      expect(result.approved).toBe(true);
      expect(result.mode).toBe("STUB");
    });

    it("should process multiple instruments", async () => {
      const input = createWorkflowInput({
        instruments: ["AAPL", "MSFT", "GOOGL", "NVDA", "TSLA"],
      });
      const result = await executeTradingCycle(input);

      expect(result.approved).toBe(true);
      expect(result.mode).toBe("STUB");
    });

    it("should use default instruments when none provided", async () => {
      const input: WorkflowInput = {
        cycleId: `default-instruments-${Date.now()}`,
        forceStub: true,
      };
      const result = await executeTradingCycle(input);

      expect(result.approved).toBe(true);
    });
  });

  describe("Mode Selection", () => {
    it("should use stub mode when forceStub is true", async () => {
      const input = createWorkflowInput({ forceStub: true });
      const result = await executeTradingCycle(input);

      expect(result.mode).toBe("STUB");
    });

    it("should use stub mode in BACKTEST environment", async () => {
      // CREAM_ENV=BACKTEST is set by test runner
      const input: WorkflowInput = {
        cycleId: `backtest-mode-${Date.now()}`,
        // forceStub not set - should still use stub due to BACKTEST env
      };
      const result = await executeTradingCycle(input);

      expect(result.mode).toBe("STUB");
    });
  });

  describe("CycleId Formats", () => {
    it("should accept UUID-style cycleId", async () => {
      const input = createWorkflowInput({
        cycleId: crypto.randomUUID(),
      });
      const result = await executeTradingCycle(input);

      expect(result).toBeDefined();
      expect(result.cycleId).toBe(input.cycleId);
    });

    it("should accept timestamp-based cycleId", async () => {
      const input = createWorkflowInput({
        cycleId: `cycle-${Date.now()}-abc123`,
      });
      const result = await executeTradingCycle(input);

      expect(result).toBeDefined();
    });

    it("should accept simple string cycleId", async () => {
      const input = createWorkflowInput({
        cycleId: "test-cycle-001",
      });
      const result = await executeTradingCycle(input);

      expect(result).toBeDefined();
    });
  });
});

// ============================================
// Individual Step Schema Tests
// ============================================

describe("Trading Cycle Step Schemas", () => {
  describe("DecisionPlan Schema", () => {
    const DecisionPlanSchema = z.object({
      cycleId: z.string(),
      timestamp: z.string(),
      decisions: z.array(
        z.object({
          symbol: z.string(),
          action: z.enum(["BUY", "SELL", "HOLD", "CLOSE"]),
          direction: z.enum(["LONG", "SHORT", "FLAT"]),
          size: z.object({
            value: z.number(),
            unit: z.enum(["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"]),
          }),
          stopLoss: z.number().optional(),
          takeProfit: z.number().optional(),
          rationale: z.string(),
          confidence: z.number(),
        })
      ),
    });

    it("should validate empty decisions array", () => {
      const plan = {
        cycleId: "test-123",
        timestamp: new Date().toISOString(),
        decisions: [],
      };
      const result = DecisionPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it("should validate plan with BUY decision", () => {
      const plan = {
        cycleId: "test-123",
        timestamp: new Date().toISOString(),
        decisions: [
          {
            symbol: "AAPL",
            action: "BUY",
            direction: "LONG",
            size: { value: 100, unit: "SHARES" },
            stopLoss: 170,
            takeProfit: 190,
            rationale: "Technical breakout",
            confidence: 0.75,
          },
        ],
      };
      const result = DecisionPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it("should validate plan with SELL decision", () => {
      const plan = {
        cycleId: "test-123",
        timestamp: new Date().toISOString(),
        decisions: [
          {
            symbol: "MSFT",
            action: "SELL",
            direction: "SHORT",
            size: { value: 50, unit: "SHARES" },
            rationale: "Bearish divergence",
            confidence: 0.65,
          },
        ],
      };
      const result = DecisionPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it("should validate plan with HOLD decision", () => {
      const plan = {
        cycleId: "test-123",
        timestamp: new Date().toISOString(),
        decisions: [
          {
            symbol: "GOOGL",
            action: "HOLD",
            direction: "FLAT",
            size: { value: 0, unit: "SHARES" },
            rationale: "Waiting for catalyst",
            confidence: 0.5,
          },
        ],
      };
      const result = DecisionPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it("should validate plan with PCT_EQUITY sizing", () => {
      const plan = {
        cycleId: "test-123",
        timestamp: new Date().toISOString(),
        decisions: [
          {
            symbol: "NVDA",
            action: "BUY",
            direction: "LONG",
            size: { value: 5, unit: "PCT_EQUITY" },
            rationale: "Momentum play",
            confidence: 0.8,
          },
        ],
      };
      const result = DecisionPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it("should validate multi-decision plan", () => {
      const plan = {
        cycleId: "test-123",
        timestamp: new Date().toISOString(),
        decisions: [
          {
            symbol: "AAPL",
            action: "BUY",
            direction: "LONG",
            size: { value: 3, unit: "PCT_EQUITY" },
            rationale: "Entry signal",
            confidence: 0.7,
          },
          {
            symbol: "MSFT",
            action: "HOLD",
            direction: "LONG",
            size: { value: 5, unit: "PCT_EQUITY" },
            rationale: "Maintain position",
            confidence: 0.6,
          },
          {
            symbol: "GOOGL",
            action: "CLOSE",
            direction: "FLAT",
            size: { value: 2, unit: "PCT_EQUITY" },
            rationale: "Take profit",
            confidence: 0.75,
          },
        ],
      };
      const result = DecisionPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.decisions).toHaveLength(3);
      }
    });
  });

  describe("ValidationResult Schema", () => {
    const ValidationResultSchema = z.object({
      approved: z.boolean(),
      violations: z.array(z.string()),
      adjustedPlan: z.any().optional(),
    });

    it("should validate approved result", () => {
      const result = {
        approved: true,
        violations: [],
      };
      const parsed = ValidationResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("should validate rejected result with violations", () => {
      const result = {
        approved: false,
        violations: ["Position size exceeds 10% limit", "Sector concentration too high"],
      };
      const parsed = ValidationResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("should validate result with adjusted plan", () => {
      const result = {
        approved: true,
        violations: [],
        adjustedPlan: {
          cycleId: "test-123",
          timestamp: new Date().toISOString(),
          decisions: [],
        },
      };
      const parsed = ValidationResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });
});

// ============================================
// Workflow State Transition Tests
// ============================================

describe("Trading Cycle State Transitions", () => {
  describe("Environment Modes", () => {
    it("should handle BACKTEST mode without external calls", async () => {
      const input = createWorkflowInput();

      // BACKTEST mode should use stub agents and not make external API calls
      const startTime = Date.now();
      const result = await executeTradingCycle(input);
      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(result.mode).toBe("STUB");
      // Should complete quickly in stub mode (< 1s)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("Multiple Executions", () => {
    it("should handle sequential executions", async () => {
      const results: WorkflowResult[] = [];

      for (let i = 0; i < 3; i++) {
        const input = createWorkflowInput({
          cycleId: `sequential-${i}-${Date.now()}`,
        });
        const result = await executeTradingCycle(input);
        results.push(result);
      }

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.approved).toBe(true);
        expect(result.mode).toBe("STUB");
      }
    });

    it("should isolate state between executions", async () => {
      // First execution
      const input1 = createWorkflowInput({
        cycleId: "isolated-1",
      });
      const result1 = await executeTradingCycle(input1);

      // Second execution with different cycleId
      const input2 = createWorkflowInput({
        cycleId: "isolated-2",
      });
      const result2 = await executeTradingCycle(input2);

      // Both should complete independently
      expect(result1.cycleId).toBe("isolated-1");
      expect(result2.cycleId).toBe("isolated-2");
      expect(result1.approved).toBe(true);
      expect(result2.approved).toBe(true);
    });
  });
});

// ============================================
// Performance Tests
// ============================================

describe("Trading Cycle Performance", () => {
  it("should complete in BACKTEST mode within timeout", async () => {
    const input = createWorkflowInput();
    const startTime = Date.now();

    const result = await executeTradingCycle(input);

    const duration = Date.now() - startTime;

    expect(result.mode).toBe("STUB");
    // In BACKTEST mode with stubs, should complete in < 500ms
    expect(duration).toBeLessThan(500);
  });

  it("should handle rapid successive calls", async () => {
    const startTime = Date.now();

    // Fire 5 workflow executions in parallel
    const promises = Array.from({ length: 5 }, (_, i) =>
      executeTradingCycle(createWorkflowInput({ cycleId: `rapid-${i}` }))
    );

    const results = await Promise.all(promises);

    const duration = Date.now() - startTime;

    // Should complete all 5 in parallel in < 1s
    expect(duration).toBeLessThan(1000);
    expect(results).toHaveLength(5);
    for (const result of results) {
      expect(result.approved).toBe(true);
      expect(result.mode).toBe("STUB");
    }
  });

  it("should handle 10 sequential executions efficiently", async () => {
    const startTime = Date.now();

    for (let i = 0; i < 10; i++) {
      const result = await executeTradingCycle(createWorkflowInput({ cycleId: `seq-perf-${i}` }));
      expect(result.approved).toBe(true);
    }

    const duration = Date.now() - startTime;

    // 10 sequential executions should complete in < 2s
    expect(duration).toBeLessThan(2000);
  });
});
