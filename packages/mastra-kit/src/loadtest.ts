/**
 * Load Testing Framework for Trading Cycle
 *
 * Provides utilities for stress testing the consensus gate and trading cycle
 * to validate performance under load.
 *
 * Key metrics:
 * - Latency (p50, p95, p99)
 * - Throughput (cycles/second)
 * - Error rate
 * - Timeout rate
 *
 * Usage:
 *   const runner = new LoadTestRunner(config);
 *   const results = await runner.run({ duration: 60000, concurrency: 10 });
 *   console.log(results.summary);
 */

// ============================================
// Types
// ============================================

/**
 * Load test configuration.
 */
export interface LoadTestConfig {
  /** Name of the test scenario */
  name: string;

  /** Maximum concurrent operations */
  maxConcurrency: number;

  /** Whether to collect detailed timing data */
  collectDetailedMetrics: boolean;

  /** Logger */
  logger?: LoadTestLogger;
}

/**
 * Load test run options.
 */
export interface LoadTestRunOptions {
  /** Duration to run in milliseconds */
  durationMs: number;

  /** Number of concurrent workers */
  concurrency: number;

  /** Target operations per second (0 = unlimited) */
  targetOpsPerSecond?: number;

  /** Ramp-up time in milliseconds (0 = immediate) */
  rampUpMs?: number;
}

/**
 * Single operation result.
 */
export interface OperationResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Operation duration in milliseconds */
  durationMs: number;

  /** Error message if failed */
  error?: string;

  /** Whether the operation timed out */
  timedOut: boolean;

  /** Timestamp when started */
  startedAt: number;

  /** Timestamp when completed */
  completedAt: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Load test results.
 */
export interface LoadTestResults {
  /** Test name */
  name: string;

  /** Total operations completed */
  totalOperations: number;

  /** Successful operations */
  successCount: number;

  /** Failed operations */
  failureCount: number;

  /** Timed out operations */
  timeoutCount: number;

  /** Error rate (0-1) */
  errorRate: number;

  /** Timeout rate (0-1) */
  timeoutRate: number;

  /** Duration of test in ms */
  durationMs: number;

  /** Operations per second */
  throughput: number;

  /** Latency percentiles in ms */
  latency: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };

  /** Concurrency level used */
  concurrency: number;

  /** Individual operation results (if detailed metrics enabled) */
  operations?: OperationResult[];

  /** Summary string */
  summary: string;
}

/**
 * Logger interface.
 */
export interface LoadTestLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

const DEFAULT_LOGGER: LoadTestLogger = {
  info: (msg, data) => console.log(`[LoadTest] ${msg}`, data ?? ""),
  warn: (msg, data) => console.warn(`[LoadTest] ${msg}`, data ?? ""),
  error: (msg, data) => console.error(`[LoadTest] ${msg}`, data ?? ""),
};

const DEFAULT_CONFIG: LoadTestConfig = {
  name: "default",
  maxConcurrency: 100,
  collectDetailedMetrics: false,
};

// ============================================
// Percentile Calculation
// ============================================

/**
 * Calculate percentile from sorted array.
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)] ?? 0;
}

/**
 * Calculate latency statistics from operation results.
 */
function calculateLatencyStats(durations: number[]): LoadTestResults["latency"] {
  if (durations.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const sum = durations.reduce((a, b) => a + b, 0);

  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: sum / durations.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

// ============================================
// Load Test Runner
// ============================================

/**
 * Runs load tests against a target function.
 */
export class LoadTestRunner<T = void> {
  private readonly config: LoadTestConfig;
  private readonly logger: LoadTestLogger;

  constructor(config: Partial<LoadTestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = config.logger ?? DEFAULT_LOGGER;
  }

  /**
   * Run a load test against the provided operation function.
   *
   * @param operation - Async function to test
   * @param options - Run options
   * @returns Test results
   */
  async run(
    operation: () => Promise<T>,
    options: LoadTestRunOptions
  ): Promise<LoadTestResults> {
    const {
      durationMs,
      concurrency,
      targetOpsPerSecond = 0,
      rampUpMs = 0,
    } = options;

    // Validate concurrency
    const effectiveConcurrency = Math.min(concurrency, this.config.maxConcurrency);
    if (concurrency > this.config.maxConcurrency) {
      this.logger.warn(`Concurrency capped to ${this.config.maxConcurrency}`);
    }

    this.logger.info("Starting load test", {
      name: this.config.name,
      durationMs,
      concurrency: effectiveConcurrency,
      targetOpsPerSecond,
    });

    const results: OperationResult[] = [];
    const startTime = Date.now();
    const endTime = startTime + durationMs;
    let running = true;

    // Calculate delay between operations for rate limiting
    const delayMs = targetOpsPerSecond > 0
      ? (1000 / targetOpsPerSecond) * effectiveConcurrency
      : 0;

    // Worker function
    const worker = async (workerId: number): Promise<void> => {
      // Ramp-up delay
      if (rampUpMs > 0) {
        const rampDelay = (workerId / effectiveConcurrency) * rampUpMs;
        await sleep(rampDelay);
      }

      while (running && Date.now() < endTime) {
        const opStart = Date.now();

        try {
          await operation();
          const opEnd = Date.now();

          results.push({
            success: true,
            durationMs: opEnd - opStart,
            timedOut: false,
            startedAt: opStart,
            completedAt: opEnd,
          });
        } catch (error) {
          const opEnd = Date.now();
          const isTimeout = error instanceof Error && error.message.includes("timeout");

          results.push({
            success: false,
            durationMs: opEnd - opStart,
            error: error instanceof Error ? error.message : String(error),
            timedOut: isTimeout,
            startedAt: opStart,
            completedAt: opEnd,
          });
        }

        // Rate limiting delay
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
    };

    // Start workers
    const workers = Array.from({ length: effectiveConcurrency }, (_, i) => worker(i));
    await Promise.all(workers);

    running = false;
    const actualDuration = Date.now() - startTime;

    // Calculate results
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success && !r.timedOut).length;
    const timeoutCount = results.filter((r) => r.timedOut).length;
    const durations = results.map((r) => r.durationMs);
    const latency = calculateLatencyStats(durations);

    const testResults: LoadTestResults = {
      name: this.config.name,
      totalOperations: results.length,
      successCount,
      failureCount,
      timeoutCount,
      errorRate: results.length > 0 ? (failureCount + timeoutCount) / results.length : 0,
      timeoutRate: results.length > 0 ? timeoutCount / results.length : 0,
      durationMs: actualDuration,
      throughput: results.length / (actualDuration / 1000),
      latency,
      concurrency: effectiveConcurrency,
      operations: this.config.collectDetailedMetrics ? results : undefined,
      summary: "",
    };

    // Generate summary
    testResults.summary = this.formatSummary(testResults);

    this.logger.info("Load test complete", {
      name: this.config.name,
      totalOperations: results.length,
      successRate: `${((successCount / results.length) * 100).toFixed(1)}%`,
      throughput: `${testResults.throughput.toFixed(1)} ops/s`,
    });

    return testResults;
  }

  /**
   * Run multiple test scenarios sequentially.
   */
  async runScenarios(
    operation: () => Promise<T>,
    scenarios: Array<{ name: string; options: LoadTestRunOptions }>
  ): Promise<LoadTestResults[]> {
    const results: LoadTestResults[] = [];

    for (const scenario of scenarios) {
      const originalName = this.config.name;
      this.config.name = scenario.name;

      const result = await this.run(operation, scenario.options);
      results.push(result);

      this.config.name = originalName;

      // Brief pause between scenarios
      await sleep(1000);
    }

    return results;
  }

  /**
   * Format results as a summary string.
   */
  private formatSummary(results: LoadTestResults): string {
    return `
Load Test Results: ${results.name}
═══════════════════════════════════════════════
Duration:       ${(results.durationMs / 1000).toFixed(1)}s
Concurrency:    ${results.concurrency}
Total Ops:      ${results.totalOperations}
Throughput:     ${results.throughput.toFixed(1)} ops/s

Success:        ${results.successCount} (${((results.successCount / results.totalOperations) * 100).toFixed(1)}%)
Failures:       ${results.failureCount} (${((results.failureCount / results.totalOperations) * 100).toFixed(1)}%)
Timeouts:       ${results.timeoutCount} (${((results.timeoutCount / results.totalOperations) * 100).toFixed(1)}%)

Latency (ms):
  Min:          ${results.latency.min.toFixed(1)}
  Max:          ${results.latency.max.toFixed(1)}
  Mean:         ${results.latency.mean.toFixed(1)}
  p50:          ${results.latency.p50.toFixed(1)}
  p95:          ${results.latency.p95.toFixed(1)}
  p99:          ${results.latency.p99.toFixed(1)}
═══════════════════════════════════════════════
`.trim();
  }
}

// ============================================
// Scenario Builders
// ============================================

/**
 * Standard load test scenarios.
 */
export const LoadTestScenarios = {
  /**
   * Light load scenario (baseline).
   */
  light: (durationMs = 10000): LoadTestRunOptions => ({
    durationMs,
    concurrency: 2,
    rampUpMs: 0,
  }),

  /**
   * Normal load scenario (typical production).
   */
  normal: (durationMs = 30000): LoadTestRunOptions => ({
    durationMs,
    concurrency: 10,
    rampUpMs: 5000,
  }),

  /**
   * Heavy load scenario (stress test).
   */
  heavy: (durationMs = 60000): LoadTestRunOptions => ({
    durationMs,
    concurrency: 50,
    rampUpMs: 10000,
  }),

  /**
   * Spike scenario (sudden burst).
   */
  spike: (durationMs = 30000): LoadTestRunOptions => ({
    durationMs,
    concurrency: 100,
    rampUpMs: 0, // Immediate spike
  }),

  /**
   * Soak scenario (extended duration).
   */
  soak: (durationMs = 300000): LoadTestRunOptions => ({
    durationMs,
    concurrency: 10,
    rampUpMs: 30000,
  }),
};

// ============================================
// Trading Cycle Load Test
// ============================================

/**
 * Configuration for trading cycle load test.
 */
export interface TradingCycleLoadTestConfig {
  /** Simulated agent latency range in ms [min, max] */
  simulatedAgentLatencyMs: [number, number];

  /** Probability of agent rejection (0-1) */
  rejectionProbability: number;

  /** Probability of timeout (0-1) */
  timeoutProbability: number;

  /** Whether to simulate LLM calls */
  simulateLLMCalls: boolean;
}

const DEFAULT_TRADING_CYCLE_CONFIG: TradingCycleLoadTestConfig = {
  simulatedAgentLatencyMs: [100, 500],
  rejectionProbability: 0.1,
  timeoutProbability: 0.02,
  simulateLLMCalls: false,
};

/**
 * Create a mock trading cycle operation for load testing.
 */
export function createMockTradingCycle(
  config: Partial<TradingCycleLoadTestConfig> = {}
): () => Promise<void> {
  const fullConfig = { ...DEFAULT_TRADING_CYCLE_CONFIG, ...config };
  const [minLatency, maxLatency] = fullConfig.simulatedAgentLatencyMs;

  return async () => {
    // Simulate random latency
    const latency = minLatency + Math.random() * (maxLatency - minLatency);
    await sleep(latency);

    // Simulate timeout
    if (Math.random() < fullConfig.timeoutProbability) {
      throw new Error("Operation timeout");
    }

    // Simulate rejection requiring retry
    if (Math.random() < fullConfig.rejectionProbability) {
      // Simulate retry (additional latency)
      await sleep(latency * 0.5);
    }
  };
}

// ============================================
// Assertions
// ============================================

/**
 * Load test assertions for CI/CD pipelines.
 */
export class LoadTestAssertions {
  private readonly results: LoadTestResults;

  constructor(results: LoadTestResults) {
    this.results = results;
  }

  /**
   * Assert error rate is below threshold.
   */
  errorRateBelow(threshold: number): this {
    if (this.results.errorRate > threshold) {
      throw new Error(
        `Error rate ${(this.results.errorRate * 100).toFixed(1)}% ` +
          `exceeds threshold ${(threshold * 100).toFixed(1)}%`
      );
    }
    return this;
  }

  /**
   * Assert p95 latency is below threshold.
   */
  p95LatencyBelow(thresholdMs: number): this {
    if (this.results.latency.p95 > thresholdMs) {
      throw new Error(
        `p95 latency ${this.results.latency.p95.toFixed(1)}ms ` +
          `exceeds threshold ${thresholdMs}ms`
      );
    }
    return this;
  }

  /**
   * Assert p99 latency is below threshold.
   */
  p99LatencyBelow(thresholdMs: number): this {
    if (this.results.latency.p99 > thresholdMs) {
      throw new Error(
        `p99 latency ${this.results.latency.p99.toFixed(1)}ms ` +
          `exceeds threshold ${thresholdMs}ms`
      );
    }
    return this;
  }

  /**
   * Assert throughput is above threshold.
   */
  throughputAbove(opsPerSecond: number): this {
    if (this.results.throughput < opsPerSecond) {
      throw new Error(
        `Throughput ${this.results.throughput.toFixed(1)} ops/s ` +
          `below threshold ${opsPerSecond} ops/s`
      );
    }
    return this;
  }

  /**
   * Assert timeout rate is below threshold.
   */
  timeoutRateBelow(threshold: number): this {
    if (this.results.timeoutRate > threshold) {
      throw new Error(
        `Timeout rate ${(this.results.timeoutRate * 100).toFixed(1)}% ` +
          `exceeds threshold ${(threshold * 100).toFixed(1)}%`
      );
    }
    return this;
  }

  /**
   * Get results for chaining.
   */
  getResults(): LoadTestResults {
    return this.results;
  }
}

/**
 * Create assertions for load test results.
 */
export function assertLoadTest(results: LoadTestResults): LoadTestAssertions {
  return new LoadTestAssertions(results);
}

// ============================================
// Utilities
// ============================================

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Exports
// ============================================

export default {
  LoadTestRunner,
  LoadTestScenarios,
  createMockTradingCycle,
  assertLoadTest,
  LoadTestAssertions,
};
