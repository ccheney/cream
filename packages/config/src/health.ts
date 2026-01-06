/**
 * Component Health Check System
 *
 * Provides health monitoring for system components with standardized
 * status reporting and aggregation for observability.
 *
 * Features:
 * - Individual component health checks
 * - Dependency health tracking
 * - Aggregated system health status
 * - Health history and trends
 * - Configurable thresholds and intervals
 */

// ============================================
// Types
// ============================================

/**
 * Health status levels.
 */
export type HealthStatus = "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";

/**
 * Individual health check result.
 */
export interface HealthCheckResult {
  /** Component name */
  component: string;

  /** Current status */
  status: HealthStatus;

  /** Status message */
  message: string;

  /** Response time in milliseconds */
  responseTimeMs: number;

  /** Timestamp of check */
  timestamp: string;

  /** Optional details */
  details?: Record<string, unknown>;
}

/**
 * Health check function signature.
 */
export type HealthCheckFn = () => Promise<HealthCheckResult>;

/**
 * Component health configuration.
 */
export interface ComponentHealthConfig {
  /** Component name */
  name: string;

  /** Health check function */
  check: HealthCheckFn;

  /** Check interval in milliseconds */
  intervalMs: number;

  /** Timeout for health check */
  timeoutMs: number;

  /** Number of failures before marking unhealthy */
  failureThreshold: number;

  /** Number of successes before marking healthy */
  successThreshold: number;

  /** Whether this component is critical */
  critical: boolean;
}

/**
 * Aggregated system health status.
 */
export interface SystemHealth {
  /** Overall system status */
  status: HealthStatus;

  /** Individual component statuses */
  components: HealthCheckResult[];

  /** Number of healthy components */
  healthyCount: number;

  /** Number of degraded components */
  degradedCount: number;

  /** Number of unhealthy components */
  unhealthyCount: number;

  /** Timestamp */
  timestamp: string;

  /** Uptime in seconds */
  uptimeSeconds: number;
}

/**
 * Health check configuration.
 */
export interface HealthCheckConfig {
  /** Default check interval */
  defaultIntervalMs: number;

  /** Default timeout */
  defaultTimeoutMs: number;

  /** Default failure threshold */
  defaultFailureThreshold: number;

  /** Default success threshold */
  defaultSuccessThreshold: number;

  /** History size to retain */
  historySize: number;

  /** Enable automatic checking */
  enableAutoCheck: boolean;
}

const DEFAULT_CONFIG: HealthCheckConfig = {
  defaultIntervalMs: 30000, // 30 seconds
  defaultTimeoutMs: 5000, // 5 seconds
  defaultFailureThreshold: 3,
  defaultSuccessThreshold: 1,
  historySize: 100,
  enableAutoCheck: false,
};

// ============================================
// Health Check Registry
// ============================================

/**
 * Registry for managing component health checks.
 */
export class HealthCheckRegistry {
  private readonly config: HealthCheckConfig;
  private readonly components: Map<string, ComponentState> = new Map();
  private readonly history: HealthCheckResult[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly startTime: number;

  constructor(config: Partial<HealthCheckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startTime = Date.now();
  }

  /**
   * Register a component for health checking.
   */
  register(component: Partial<ComponentHealthConfig> & { name: string; check: HealthCheckFn }): void {
    const fullConfig: ComponentHealthConfig = {
      name: component.name,
      check: component.check,
      intervalMs: component.intervalMs ?? this.config.defaultIntervalMs,
      timeoutMs: component.timeoutMs ?? this.config.defaultTimeoutMs,
      failureThreshold: component.failureThreshold ?? this.config.defaultFailureThreshold,
      successThreshold: component.successThreshold ?? this.config.defaultSuccessThreshold,
      critical: component.critical ?? false,
    };

    this.components.set(component.name, {
      config: fullConfig,
      lastResult: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      status: "UNKNOWN",
    });
  }

  /**
   * Unregister a component.
   */
  unregister(name: string): boolean {
    return this.components.delete(name);
  }

  /**
   * Check a specific component's health.
   */
  async checkComponent(name: string): Promise<HealthCheckResult> {
    const state = this.components.get(name);
    if (!state) {
      return {
        component: name,
        status: "UNKNOWN",
        message: "Component not registered",
        responseTimeMs: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    let result: HealthCheckResult;

    try {
      // Run check with timeout
      result = await Promise.race([
        state.config.check(),
        this.createTimeoutPromise(name, state.config.timeoutMs),
      ]);

      // Update consecutive counters
      if (result.status === "HEALTHY") {
        state.consecutiveSuccesses++;
        state.consecutiveFailures = 0;
      } else {
        state.consecutiveFailures++;
        state.consecutiveSuccesses = 0;
      }
    } catch (error) {
      state.consecutiveFailures++;
      state.consecutiveSuccesses = 0;

      result = {
        component: name,
        status: "UNHEALTHY",
        message: error instanceof Error ? error.message : "Health check failed",
        responseTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Determine effective status based on thresholds
    state.status = this.calculateEffectiveStatus(state);
    result.status = state.status;

    // Update state and history
    state.lastResult = result;
    this.addToHistory(result);

    return result;
  }

  /**
   * Check all registered components.
   */
  async checkAll(): Promise<SystemHealth> {
    const results = await Promise.all(
      Array.from(this.components.keys()).map((name) => this.checkComponent(name))
    );

    return this.aggregateResults(results);
  }

  /**
   * Get the last known result for a component.
   */
  getLastResult(name: string): HealthCheckResult | null {
    return this.components.get(name)?.lastResult ?? null;
  }

  /**
   * Get current system health without running new checks.
   */
  getSystemHealth(): SystemHealth {
    const results: HealthCheckResult[] = [];

    for (const [name, state] of this.components) {
      results.push(state.lastResult ?? {
        component: name,
        status: "UNKNOWN",
        message: "Not yet checked",
        responseTimeMs: 0,
        timestamp: new Date().toISOString(),
      });
    }

    return this.aggregateResults(results);
  }

  /**
   * Get health check history.
   */
  getHistory(component?: string): HealthCheckResult[] {
    if (component) {
      return this.history.filter((r) => r.component === component);
    }
    return [...this.history];
  }

  /**
   * Start automatic health checking.
   */
  startAutoCheck(): void {
    if (this.intervalId) {
      return; // Already running
    }

    // Check each component at its configured interval
    this.intervalId = setInterval(async () => {
      await this.checkAll();
    }, this.config.defaultIntervalMs);
  }

  /**
   * Stop automatic health checking.
   */
  stopAutoCheck(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check if any critical components are unhealthy.
   */
  hasCriticalFailure(): boolean {
    for (const state of this.components.values()) {
      if (state.config.critical && state.status === "UNHEALTHY") {
        return true;
      }
    }
    return false;
  }

  /**
   * Get list of unhealthy components.
   */
  getUnhealthyComponents(): string[] {
    const unhealthy: string[] = [];
    for (const [name, state] of this.components) {
      if (state.status === "UNHEALTHY") {
        unhealthy.push(name);
      }
    }
    return unhealthy;
  }

  /**
   * Clear health history.
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  // ============================================
  // Private Methods
  // ============================================

  private createTimeoutPromise(component: string, timeoutMs: number): Promise<HealthCheckResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  private calculateEffectiveStatus(state: ComponentState): HealthStatus {
    if (state.consecutiveFailures >= state.config.failureThreshold) {
      return "UNHEALTHY";
    }
    if (state.consecutiveSuccesses >= state.config.successThreshold) {
      return "HEALTHY";
    }
    if (state.consecutiveFailures > 0) {
      return "DEGRADED";
    }
    return state.status;
  }

  private aggregateResults(results: HealthCheckResult[]): SystemHealth {
    let healthyCount = 0;
    let degradedCount = 0;
    let unhealthyCount = 0;

    for (const result of results) {
      switch (result.status) {
        case "HEALTHY":
          healthyCount++;
          break;
        case "DEGRADED":
          degradedCount++;
          break;
        case "UNHEALTHY":
          unhealthyCount++;
          break;
      }
    }

    // Determine overall status
    let status: HealthStatus;
    if (unhealthyCount > 0 && this.hasCriticalFailure()) {
      status = "UNHEALTHY";
    } else if (unhealthyCount > 0 || degradedCount > 0) {
      status = "DEGRADED";
    } else if (healthyCount > 0) {
      status = "HEALTHY";
    } else {
      status = "UNKNOWN";
    }

    return {
      status,
      components: results,
      healthyCount,
      degradedCount,
      unhealthyCount,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  private addToHistory(result: HealthCheckResult): void {
    this.history.push(result);

    // Trim history if needed
    while (this.history.length > this.config.historySize) {
      this.history.shift();
    }
  }
}

/**
 * Internal component state.
 */
interface ComponentState {
  config: ComponentHealthConfig;
  lastResult: HealthCheckResult | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  status: HealthStatus;
}

// ============================================
// Built-in Health Checks
// ============================================

/**
 * Create a simple HTTP health check.
 */
export function createHttpHealthCheck(
  name: string,
  url: string,
  options: { expectedStatus?: number; timeout?: number } = {}
): { name: string; check: HealthCheckFn } {
  const { expectedStatus = 200, timeout = 5000 } = options;

  return {
    name,
    check: async () => {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseTimeMs = Date.now() - startTime;

        if (response.status === expectedStatus) {
          return {
            component: name,
            status: "HEALTHY",
            message: `HTTP ${response.status}`,
            responseTimeMs,
            timestamp: new Date().toISOString(),
            details: { url, statusCode: response.status },
          };
        }

        return {
          component: name,
          status: "UNHEALTHY",
          message: `Expected ${expectedStatus}, got ${response.status}`,
          responseTimeMs,
          timestamp: new Date().toISOString(),
          details: { url, statusCode: response.status },
        };
      } catch (error) {
        return {
          component: name,
          status: "UNHEALTHY",
          message: error instanceof Error ? error.message : "HTTP check failed",
          responseTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          details: { url },
        };
      }
    },
  };
}

/**
 * Create a memory usage health check.
 */
export function createMemoryHealthCheck(
  name: string,
  options: { warningThresholdMB?: number; criticalThresholdMB?: number } = {}
): { name: string; check: HealthCheckFn } {
  const { warningThresholdMB = 500, criticalThresholdMB = 1000 } = options;

  return {
    name,
    check: async () => {
      const startTime = Date.now();
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
      const responseTimeMs = Date.now() - startTime;

      let status: HealthStatus = "HEALTHY";
      let message = `Heap: ${heapUsedMB.toFixed(1)}MB`;

      if (heapUsedMB >= criticalThresholdMB) {
        status = "UNHEALTHY";
        message = `Critical: ${heapUsedMB.toFixed(1)}MB >= ${criticalThresholdMB}MB`;
      } else if (heapUsedMB >= warningThresholdMB) {
        status = "DEGRADED";
        message = `Warning: ${heapUsedMB.toFixed(1)}MB >= ${warningThresholdMB}MB`;
      }

      return {
        component: name,
        status,
        message,
        responseTimeMs,
        timestamp: new Date().toISOString(),
        details: {
          heapUsedMB: heapUsedMB.toFixed(1),
          heapTotalMB: (memUsage.heapTotal / (1024 * 1024)).toFixed(1),
          rssMB: (memUsage.rss / (1024 * 1024)).toFixed(1),
        },
      };
    },
  };
}

/**
 * Create a custom health check.
 */
export function createCustomHealthCheck(
  name: string,
  checkFn: () => Promise<{ healthy: boolean; message?: string; details?: Record<string, unknown> }>
): { name: string; check: HealthCheckFn } {
  return {
    name,
    check: async () => {
      const startTime = Date.now();
      try {
        const result = await checkFn();
        return {
          component: name,
          status: result.healthy ? "HEALTHY" : "UNHEALTHY",
          message: result.message ?? (result.healthy ? "OK" : "Failed"),
          responseTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          details: result.details,
        };
      } catch (error) {
        return {
          component: name,
          status: "UNHEALTHY",
          message: error instanceof Error ? error.message : "Check failed",
          responseTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      }
    },
  };
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a health check registry.
 */
export function createHealthRegistry(
  config?: Partial<HealthCheckConfig>
): HealthCheckRegistry {
  return new HealthCheckRegistry(config);
}

// ============================================
// Exports
// ============================================

export default {
  HealthCheckRegistry,
  createHealthRegistry,
  createHttpHealthCheck,
  createMemoryHealthCheck,
  createCustomHealthCheck,
};
