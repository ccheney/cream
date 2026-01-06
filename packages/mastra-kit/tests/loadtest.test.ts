/**
 * Tests for Load Testing Framework
 */

import { describe, expect, it } from "bun:test";
import {
  assertLoadTest,
  createMockTradingCycle,
  LoadTestRunner,
  LoadTestScenarios,
} from "../src/loadtest";

// Silent logger for tests
const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ============================================
// LoadTestRunner Tests
// ============================================

describe("LoadTestRunner", () => {
  it("should run a simple load test", async () => {
    const runner = new LoadTestRunner({
      name: "simple-test",
      logger: silentLogger,
    });

    let callCount = 0;
    const operation = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 10));
    };

    const results = await runner.run(operation, {
      durationMs: 100,
      concurrency: 2,
    });

    expect(results.name).toBe("simple-test");
    expect(results.totalOperations).toBeGreaterThan(0);
    expect(results.successCount).toBe(results.totalOperations);
    expect(results.failureCount).toBe(0);
    expect(results.errorRate).toBe(0);
    expect(callCount).toBeGreaterThan(0);
  });

  it("should track failures", async () => {
    const runner = new LoadTestRunner({
      name: "failure-test",
      logger: silentLogger,
    });

    const operation = async () => {
      throw new Error("Test error");
    };

    const results = await runner.run(operation, {
      durationMs: 50,
      concurrency: 1,
    });

    expect(results.failureCount).toBeGreaterThan(0);
    expect(results.errorRate).toBeGreaterThan(0);
  });

  it("should detect timeouts", async () => {
    const runner = new LoadTestRunner({
      name: "timeout-test",
      logger: silentLogger,
    });

    const operation = async () => {
      throw new Error("Operation timeout");
    };

    const results = await runner.run(operation, {
      durationMs: 50,
      concurrency: 1,
    });

    expect(results.timeoutCount).toBeGreaterThan(0);
    expect(results.timeoutRate).toBeGreaterThan(0);
  });

  it("should calculate latency percentiles", async () => {
    const runner = new LoadTestRunner({
      name: "latency-test",
      logger: silentLogger,
    });

    const operation = async () => {
      const delay = 10 + Math.random() * 20;
      await new Promise((resolve) => setTimeout(resolve, delay));
    };

    const results = await runner.run(operation, {
      durationMs: 200,
      concurrency: 2,
    });

    expect(results.latency.min).toBeGreaterThan(0);
    expect(results.latency.max).toBeGreaterThanOrEqual(results.latency.min);
    expect(results.latency.p50).toBeGreaterThan(0);
    expect(results.latency.p95).toBeGreaterThanOrEqual(results.latency.p50);
    expect(results.latency.p99).toBeGreaterThanOrEqual(results.latency.p95);
  });

  it("should collect detailed metrics when enabled", async () => {
    const runner = new LoadTestRunner({
      name: "detailed-test",
      collectDetailedMetrics: true,
      logger: silentLogger,
    });

    const operation = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    };

    const results = await runner.run(operation, {
      durationMs: 50,
      concurrency: 1,
    });

    expect(results.operations).toBeDefined();
    expect(results.operations!.length).toBe(results.totalOperations);
  });

  it("should cap concurrency to max", async () => {
    const runner = new LoadTestRunner({
      name: "cap-test",
      maxConcurrency: 5,
      logger: silentLogger,
    });

    const operation = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    };

    const results = await runner.run(operation, {
      durationMs: 50,
      concurrency: 100, // Request more than max
    });

    expect(results.concurrency).toBe(5); // Should be capped
  });

  it("should calculate throughput", async () => {
    const runner = new LoadTestRunner({
      name: "throughput-test",
      logger: silentLogger,
    });

    const operation = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    };

    const results = await runner.run(operation, {
      durationMs: 100,
      concurrency: 4,
    });

    expect(results.throughput).toBeGreaterThan(0);
  });

  it("should generate summary string", async () => {
    const runner = new LoadTestRunner({
      name: "summary-test",
      logger: silentLogger,
    });

    const operation = async () => {};

    const results = await runner.run(operation, {
      durationMs: 50,
      concurrency: 1,
    });

    expect(results.summary).toContain("summary-test");
    expect(results.summary).toContain("Duration:");
    expect(results.summary).toContain("Throughput:");
    expect(results.summary).toContain("Latency");
  });

  describe("runScenarios", () => {
    it("should run multiple scenarios", async () => {
      const runner = new LoadTestRunner({
        name: "base",
        logger: silentLogger,
      });

      const operation = async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      };

      const scenarios = [
        { name: "scenario-1", options: { durationMs: 30, concurrency: 1 } },
        { name: "scenario-2", options: { durationMs: 30, concurrency: 2 } },
      ];

      const results = await runner.runScenarios(operation, scenarios);

      expect(results).toHaveLength(2);
      expect(results[0]?.name).toBe("scenario-1");
      expect(results[1]?.name).toBe("scenario-2");
    });
  });
});

// ============================================
// LoadTestScenarios Tests
// ============================================

describe("LoadTestScenarios", () => {
  it("should create light scenario", () => {
    const scenario = LoadTestScenarios.light(5000);
    expect(scenario.durationMs).toBe(5000);
    expect(scenario.concurrency).toBe(2);
  });

  it("should create normal scenario", () => {
    const scenario = LoadTestScenarios.normal();
    expect(scenario.durationMs).toBe(30000);
    expect(scenario.concurrency).toBe(10);
    expect(scenario.rampUpMs).toBe(5000);
  });

  it("should create heavy scenario", () => {
    const scenario = LoadTestScenarios.heavy();
    expect(scenario.concurrency).toBe(50);
  });

  it("should create spike scenario", () => {
    const scenario = LoadTestScenarios.spike();
    expect(scenario.concurrency).toBe(100);
    expect(scenario.rampUpMs).toBe(0);
  });

  it("should create soak scenario", () => {
    const scenario = LoadTestScenarios.soak();
    expect(scenario.durationMs).toBe(300000);
  });
});

// ============================================
// createMockTradingCycle Tests
// ============================================

describe("createMockTradingCycle", () => {
  it("should create a mock operation", async () => {
    const mockCycle = createMockTradingCycle({
      simulatedAgentLatencyMs: [10, 20],
      rejectionProbability: 0,
      timeoutProbability: 0,
    });

    const start = Date.now();
    await mockCycle();
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThanOrEqual(10);
    expect(duration).toBeLessThan(100); // Should be quick
  });

  it("should simulate timeouts", async () => {
    const mockCycle = createMockTradingCycle({
      simulatedAgentLatencyMs: [1, 2],
      rejectionProbability: 0,
      timeoutProbability: 1, // Always timeout
    });

    await expect(mockCycle()).rejects.toThrow("timeout");
  });
});

// ============================================
// LoadTestAssertions Tests
// ============================================

describe("LoadTestAssertions", () => {
  const mockResults = (overrides = {}) => ({
    name: "test",
    totalOperations: 100,
    successCount: 95,
    failureCount: 3,
    timeoutCount: 2,
    errorRate: 0.05,
    timeoutRate: 0.02,
    durationMs: 10000,
    throughput: 10,
    latency: {
      min: 50,
      max: 500,
      mean: 150,
      p50: 100,
      p95: 300,
      p99: 450,
    },
    concurrency: 10,
    summary: "test summary",
    ...overrides,
  });

  describe("errorRateBelow", () => {
    it("should pass when error rate is below threshold", () => {
      const assertions = assertLoadTest(mockResults({ errorRate: 0.05 }));
      expect(() => assertions.errorRateBelow(0.1)).not.toThrow();
    });

    it("should fail when error rate exceeds threshold", () => {
      const assertions = assertLoadTest(mockResults({ errorRate: 0.15 }));
      expect(() => assertions.errorRateBelow(0.1)).toThrow("Error rate");
    });
  });

  describe("p95LatencyBelow", () => {
    it("should pass when p95 is below threshold", () => {
      const assertions = assertLoadTest(mockResults());
      expect(() => assertions.p95LatencyBelow(400)).not.toThrow();
    });

    it("should fail when p95 exceeds threshold", () => {
      const assertions = assertLoadTest(mockResults());
      expect(() => assertions.p95LatencyBelow(200)).toThrow("p95 latency");
    });
  });

  describe("p99LatencyBelow", () => {
    it("should pass when p99 is below threshold", () => {
      const assertions = assertLoadTest(mockResults());
      expect(() => assertions.p99LatencyBelow(500)).not.toThrow();
    });

    it("should fail when p99 exceeds threshold", () => {
      const assertions = assertLoadTest(mockResults());
      expect(() => assertions.p99LatencyBelow(400)).toThrow("p99 latency");
    });
  });

  describe("throughputAbove", () => {
    it("should pass when throughput is above threshold", () => {
      const assertions = assertLoadTest(mockResults({ throughput: 20 }));
      expect(() => assertions.throughputAbove(10)).not.toThrow();
    });

    it("should fail when throughput is below threshold", () => {
      const assertions = assertLoadTest(mockResults({ throughput: 5 }));
      expect(() => assertions.throughputAbove(10)).toThrow("Throughput");
    });
  });

  describe("timeoutRateBelow", () => {
    it("should pass when timeout rate is below threshold", () => {
      const assertions = assertLoadTest(mockResults({ timeoutRate: 0.01 }));
      expect(() => assertions.timeoutRateBelow(0.05)).not.toThrow();
    });

    it("should fail when timeout rate exceeds threshold", () => {
      const assertions = assertLoadTest(mockResults({ timeoutRate: 0.1 }));
      expect(() => assertions.timeoutRateBelow(0.05)).toThrow("Timeout rate");
    });
  });

  describe("chaining", () => {
    it("should allow chaining assertions", () => {
      const assertions = assertLoadTest(
        mockResults({
          errorRate: 0.01,
          timeoutRate: 0.01,
          throughput: 100,
        })
      );

      expect(() =>
        assertions
          .errorRateBelow(0.05)
          .timeoutRateBelow(0.05)
          .throughputAbove(50)
          .p95LatencyBelow(400)
      ).not.toThrow();
    });

    it("should return results after chaining", () => {
      const results = mockResults();
      const returned = assertLoadTest(results).errorRateBelow(0.1).getResults();

      expect(returned).toBe(results);
    });
  });
});
