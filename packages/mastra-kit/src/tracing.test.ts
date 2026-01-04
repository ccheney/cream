/**
 * Agent Tracing Infrastructure Tests
 *
 * Tests the tracing framework for debugging and dataset creation.
 *
 * @see docs/plans/14-testing.md lines 610-644
 */

import { describe, expect, it, beforeEach } from "bun:test";
import {
  trace,
  runAgentWithTracing,
  runCycleWithTracing,
  createSpan,
  getTracesByRunId,
  getTracesByCycleId,
  getAgentTraces,
  getErrorTraces,
  getTraceById,
  exportTracesToDataset,
  createGoldenDataset,
  traceError,
  clearTraces,
  getTraceCount,
  getAllTraces,
  getSamplingRateForEnvironment,
  DEFAULT_LANGSMITH_CONFIG,
  type TracedAgent,
  type AgentInput,
  type TraceMetadata,
  type LangSmithConfig,
} from "./tracing.js";

// ============================================
// Setup
// ============================================

beforeEach(() => {
  clearTraces();
});

// ============================================
// Mock Agent
// ============================================

function createMockAgent(options?: {
  shouldFail?: boolean;
  delay?: number;
}): TracedAgent {
  return {
    name: "trader",
    version: "1.0.0",
    run: async <T>(input: AgentInput): Promise<T> => {
      if (options?.delay) {
        await new Promise((resolve) => setTimeout(resolve, options.delay));
      }
      if (options?.shouldFail) {
        throw new Error("Agent failed");
      }
      return {
        decisions: [{ action: "BUY" }],
        verdict: "APPROVE",
        confidence: 0.85,
      } as T;
    },
  };
}

// ============================================
// Core Tracing Tests
// ============================================

describe("trace", () => {
  it("executes function and returns result", async () => {
    const result = await trace(
      async () => {
        return { value: 42 };
      },
      { name: "test.trace" }
    );

    expect(result.value).toBe(42);
  });

  it("creates trace record", async () => {
    await trace(
      async (span) => {
        span.setAttributes({ "test.key": "test-value" });
        return true;
      },
      { name: "test.trace", metadata: { runId: "run-1", cycleId: "cycle-1" } }
    );

    const traces = getAllTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].attributes["test.key"]).toBe("test-value");
    expect(traces[0].attributes["run_id"]).toBe("run-1");
    expect(traces[0].attributes["cycle_id"]).toBe("cycle-1");
  });

  it("captures errors in trace", async () => {
    try {
      await trace(
        async () => {
          throw new Error("Test error");
        },
        { name: "test.error" }
      );
    } catch {
      // Expected
    }

    const traces = getAllTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].status).toBe("ERROR");
    expect(traces[0].error?.message).toBe("Test error");
  });

  it("records timing information", async () => {
    await trace(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      },
      { name: "test.timing" }
    );

    const traces = getAllTraces();
    expect(traces[0].durationMs).toBeGreaterThanOrEqual(10);
    expect(traces[0].startTime).toBeDefined();
    expect(traces[0].endTime).toBeDefined();
  });
});

// ============================================
// runAgentWithTracing Tests
// ============================================

describe("runAgentWithTracing", () => {
  it("traces agent execution", async () => {
    const agent = createMockAgent();
    const input: AgentInput = { snapshotId: "snap-123" };
    const metadata: TraceMetadata = { runId: "run-1", cycleId: "cycle-1" };

    const result = await runAgentWithTracing(agent, input, metadata);

    expect(result).toBeDefined();
    expect(getTraceCount()).toBe(1);
  });

  it("captures agent metadata in trace", async () => {
    const agent = createMockAgent();
    const input: AgentInput = { snapshotId: "snap-123" };
    const metadata: TraceMetadata = { runId: "run-1", cycleId: "cycle-1" };

    await runAgentWithTracing(agent, input, metadata);

    const traces = getAllTraces();
    expect(traces[0].attributes["agent.name"]).toBe("trader");
    expect(traces[0].attributes["agent.version"]).toBe("1.0.0");
    expect(traces[0].attributes["input.snapshot_id"]).toBe("snap-123");
  });

  it("captures output metadata in trace", async () => {
    const agent = createMockAgent();
    const input: AgentInput = { snapshotId: "snap-123" };
    const metadata: TraceMetadata = { runId: "run-1", cycleId: "cycle-1" };

    await runAgentWithTracing(agent, input, metadata);

    const traces = getAllTraces();
    expect(traces[0].attributes["output.decision_count"]).toBe(1);
    expect(traces[0].attributes["output.verdict"]).toBe("APPROVE");
    expect(traces[0].attributes["output.confidence"]).toBe(0.85);
  });

  it("respects sampling rate", async () => {
    const agent = createMockAgent();
    const input: AgentInput = { snapshotId: "snap-123" };
    const metadata: TraceMetadata = { runId: "run-1", cycleId: "cycle-1" };
    const config: LangSmithConfig = {
      ...DEFAULT_LANGSMITH_CONFIG,
      samplingRate: 0, // Never sample
    };

    await runAgentWithTracing(agent, input, metadata, config);

    // Should still work but no trace recorded (probabilistic)
    expect(getTraceCount()).toBe(0);
  });

  it("skips tracing when disabled", async () => {
    const agent = createMockAgent();
    const input: AgentInput = { snapshotId: "snap-123" };
    const metadata: TraceMetadata = { runId: "run-1", cycleId: "cycle-1" };
    const config: LangSmithConfig = {
      ...DEFAULT_LANGSMITH_CONFIG,
      enabled: false,
    };

    const result = await runAgentWithTracing(agent, input, metadata, config);

    expect(result).toBeDefined();
    expect(getTraceCount()).toBe(0);
  });

  it("captures error when agent fails", async () => {
    const agent = createMockAgent({ shouldFail: true });
    const input: AgentInput = { snapshotId: "snap-123" };
    const metadata: TraceMetadata = { runId: "run-1", cycleId: "cycle-1" };

    try {
      await runAgentWithTracing(agent, input, metadata);
    } catch {
      // Expected
    }

    const traces = getAllTraces();
    expect(traces[0].status).toBe("ERROR");
    expect(traces[0].error?.message).toBe("Agent failed");
  });

  it("records timing duration", async () => {
    const agent = createMockAgent({ delay: 20 });
    const input: AgentInput = { snapshotId: "snap-123" };
    const metadata: TraceMetadata = { runId: "run-1", cycleId: "cycle-1" };

    await runAgentWithTracing(agent, input, metadata);

    const traces = getAllTraces();
    expect(traces[0].attributes["timing.duration_ms"]).toBeGreaterThanOrEqual(20);
  });
});

// ============================================
// runCycleWithTracing Tests
// ============================================

describe("runCycleWithTracing", () => {
  it("traces entire cycle", async () => {
    const metadata: TraceMetadata = { runId: "run-1", cycleId: "cycle-1" };

    const result = await runCycleWithTracing(
      async () => {
        return { success: true };
      },
      metadata
    );

    expect(result.success).toBe(true);
    expect(getTraceCount()).toBe(1);
  });

  it("captures cycle metadata", async () => {
    const metadata: TraceMetadata = {
      runId: "run-1",
      cycleId: "cycle-123",
      environment: "PAPER",
    };

    await runCycleWithTracing(async () => ({}), metadata);

    const traces = getAllTraces();
    expect(traces[0].attributes["cycle.id"]).toBe("cycle-123");
    expect(traces[0].attributes["cycle.run_id"]).toBe("run-1");
    expect(traces[0].attributes["cycle.environment"]).toBe("PAPER");
  });
});

// ============================================
// Trace Retrieval Tests
// ============================================

describe("Trace Retrieval", () => {
  beforeEach(async () => {
    // Create some test traces
    const agent = createMockAgent();
    const input: AgentInput = { snapshotId: "snap-1" };

    await runAgentWithTracing(agent, input, { runId: "run-1", cycleId: "cycle-1" });
    await runAgentWithTracing(agent, input, { runId: "run-1", cycleId: "cycle-2" });
    await runAgentWithTracing(agent, input, { runId: "run-2", cycleId: "cycle-3" });
  });

  it("getTracesByRunId returns traces for run", () => {
    const traces = getTracesByRunId("run-1");
    expect(traces).toHaveLength(2);
  });

  it("getTracesByCycleId returns traces for cycle", () => {
    const traces = getTracesByCycleId("cycle-1");
    expect(traces).toHaveLength(1);
  });

  it("getAgentTraces returns traces for agent in date range", () => {
    const startDate = new Date(Date.now() - 60000);
    const endDate = new Date(Date.now() + 60000);

    const traces = getAgentTraces("trader", startDate, endDate);
    expect(traces).toHaveLength(3);
  });

  it("getErrorTraces returns only error traces", async () => {
    const failingAgent = createMockAgent({ shouldFail: true });

    try {
      await runAgentWithTracing(
        failingAgent,
        { snapshotId: "snap-err" },
        { runId: "run-err", cycleId: "cycle-err" }
      );
    } catch {
      // Expected
    }

    const errorTraces = getErrorTraces();
    expect(errorTraces).toHaveLength(1);
    expect(errorTraces[0].status).toBe("ERROR");
  });

  it("getTraceById returns all spans for trace", async () => {
    const traces = getAllTraces();
    const firstTraceId = traces[0].traceId;

    const traceSpans = getTraceById(firstTraceId);
    expect(traceSpans.length).toBeGreaterThan(0);
    expect(traceSpans[0].traceId).toBe(firstTraceId);
  });
});

// ============================================
// Dataset Export Tests
// ============================================

describe("Dataset Export", () => {
  beforeEach(async () => {
    const agent = createMockAgent();
    await runAgentWithTracing(
      agent,
      { snapshotId: "snap-1" },
      { runId: "run-1", cycleId: "cycle-1" }
    );
    await runAgentWithTracing(
      agent,
      { snapshotId: "snap-2" },
      { runId: "run-2", cycleId: "cycle-2" }
    );
  });

  it("exportTracesToDataset creates examples", () => {
    const traces = getAllTraces();
    const traceIds = traces.map((t) => t.traceId);

    const examples = exportTracesToDataset(traceIds, "test-dataset");

    expect(examples).toHaveLength(2);
    expect(examples[0].id).toContain("test-dataset");
    expect(examples[0].metadata.agentName).toBe("trader");
  });

  it("createGoldenDataset creates dataset from successful traces", () => {
    const examples = createGoldenDataset("trader", 10);

    expect(examples.length).toBeGreaterThan(0);
    expect(examples[0].metadata.agentName).toBe("trader");
  });
});

// ============================================
// Error Tracing Tests
// ============================================

describe("Error Tracing", () => {
  it("traceError captures error context", () => {
    const error = new Error("Test error");

    traceError(error, {
      agentName: "trader",
      runId: "run-1",
      cycleId: "cycle-1",
      snapshotId: "snap-1",
    });

    const traces = getAllTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].status).toBe("ERROR");
    expect(traces[0].error?.message).toBe("Test error");
    expect(traces[0].attributes["agent.name"]).toBe("trader");
  });
});

// ============================================
// Span Tests
// ============================================

describe("createSpan", () => {
  it("creates span with unique ID", () => {
    const span1 = createSpan("test.span1");
    const span2 = createSpan("test.span2");

    expect(span1.spanId).not.toBe(span2.spanId);
  });

  it("allows setting attributes", () => {
    const span = createSpan("test.span");
    span.setAttributes({ key1: "value1", key2: 42 });
    span.end();

    const traces = getAllTraces();
    expect(traces[0].attributes["key1"]).toBe("value1");
    expect(traces[0].attributes["key2"]).toBe(42);
  });

  it("records error", () => {
    const span = createSpan("test.span");
    span.recordError(new Error("Span error"));
    span.end();

    const traces = getAllTraces();
    expect(traces[0].status).toBe("ERROR");
    expect(traces[0].error?.message).toBe("Span error");
  });
});

// ============================================
// Configuration Tests
// ============================================

describe("Configuration", () => {
  it("getSamplingRateForEnvironment returns correct rates", () => {
    expect(getSamplingRateForEnvironment("BACKTEST")).toBe(1.0);
    expect(getSamplingRateForEnvironment("PAPER")).toBe(1.0);
    expect(getSamplingRateForEnvironment("LIVE")).toBe(0.1);
  });

  it("DEFAULT_LANGSMITH_CONFIG has correct defaults", () => {
    expect(DEFAULT_LANGSMITH_CONFIG.projectName).toBe("cream-trading-system");
    expect(DEFAULT_LANGSMITH_CONFIG.environment).toBe("PAPER");
    expect(DEFAULT_LANGSMITH_CONFIG.samplingRate).toBe(1.0);
    expect(DEFAULT_LANGSMITH_CONFIG.enabled).toBe(true);
  });
});

// ============================================
// Utility Tests
// ============================================

describe("Utility Functions", () => {
  it("clearTraces removes all traces", async () => {
    const agent = createMockAgent();
    await runAgentWithTracing(
      agent,
      { snapshotId: "snap-1" },
      { runId: "run-1", cycleId: "cycle-1" }
    );

    expect(getTraceCount()).toBe(1);

    clearTraces();

    expect(getTraceCount()).toBe(0);
  });

  it("getTraceCount returns correct count", async () => {
    expect(getTraceCount()).toBe(0);

    const agent = createMockAgent();
    await runAgentWithTracing(
      agent,
      { snapshotId: "snap-1" },
      { runId: "run-1", cycleId: "cycle-1" }
    );
    await runAgentWithTracing(
      agent,
      { snapshotId: "snap-2" },
      { runId: "run-2", cycleId: "cycle-2" }
    );

    expect(getTraceCount()).toBe(2);
  });

  it("getAllTraces returns copy of trace store", async () => {
    const agent = createMockAgent();
    await runAgentWithTracing(
      agent,
      { snapshotId: "snap-1" },
      { runId: "run-1", cycleId: "cycle-1" }
    );

    const traces = getAllTraces();
    traces.push({} as any); // Modify returned array

    // Original store should be unchanged
    expect(getTraceCount()).toBe(1);
  });
});
