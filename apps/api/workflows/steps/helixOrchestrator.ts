/**
 * HelixDB Integration Orchestrator
 *
 * Unified orchestrator that manages HelixDB integration across the OODA loop,
 * providing consistent client handling, error resilience, and feature flags
 * for gradual rollout.
 *
 * @see docs/plans/01-architecture.md (HelixDB Memory Layer)
 */

import type { HealthCheckResult, HelixClient } from "@cream/helix";
import type { TradeLifecycleEvent } from "@cream/helix-schema";

import {
  type ExternalEventInput,
  executeHelixMemoryUpdate,
  type InfluenceEdgeInput,
  type MemoryUpdateInput,
  type MemoryUpdateResult,
  recordLifecycleEvents,
  type TradeDecisionInput,
} from "./helixMemoryUpdate";
import {
  executeHelixRetrieval,
  PERFORMANCE_TARGETS,
  type RetrievalInput,
  type RetrievalResult,
} from "./helixRetrieval";

// ============================================
// Configuration Types
// ============================================

/**
 * Performance targets for HelixDB operations (milliseconds).
 */
export interface HelixPerformanceTargets {
  /** Maximum time for retrieval operations (default: 50ms) */
  retrievalMaxMs: number;
  /** Maximum time for memory update operations (default: 100ms) */
  updateMaxMs: number;
  /** Maximum time for lifecycle recording (default: 50ms) */
  lifecycleMaxMs: number;
}

/**
 * Configuration for the HelixDB orchestrator.
 */
export interface HelixOrchestratorConfig {
  /** Master switch to enable/disable all HelixDB operations */
  enabled: boolean;
  /** Enable retrieval in Orient phase */
  retrievalEnabled: boolean;
  /** Enable memory updates in Act phase */
  memoryUpdateEnabled: boolean;
  /** Continue trading if HelixDB fails (graceful degradation) */
  fallbackOnError: boolean;
  /** Performance targets for timing metrics */
  performanceTargets: HelixPerformanceTargets;
}

/**
 * Default orchestrator configuration.
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: HelixOrchestratorConfig = {
  enabled: true,
  retrievalEnabled: true,
  memoryUpdateEnabled: true,
  fallbackOnError: true,
  performanceTargets: {
    retrievalMaxMs: 50,
    updateMaxMs: 100,
    lifecycleMaxMs: 50,
  },
};

// ============================================
// Metrics Types
// ============================================

/**
 * Cumulative metrics for monitoring.
 */
export interface HelixMetrics {
  /** Total retrieval operations */
  retrievalCount: number;
  /** Successful retrieval operations */
  retrievalSuccessCount: number;
  /** Total retrieval time (ms) */
  retrievalTotalMs: number;
  /** Retrievals exceeding performance target */
  retrievalSlowCount: number;
  /** Total memory update operations */
  updateCount: number;
  /** Successful memory update operations */
  updateSuccessCount: number;
  /** Total update time (ms) */
  updateTotalMs: number;
  /** Updates exceeding performance target */
  updateSlowCount: number;
  /** Total lifecycle recording operations */
  lifecycleCount: number;
  /** Successful lifecycle operations */
  lifecycleSuccessCount: number;
  /** Total lifecycle time (ms) */
  lifecycleTotalMs: number;
  /** Fallback invocations (operations skipped due to errors) */
  fallbackCount: number;
  /** Last health check result */
  lastHealthCheck: HealthCheckResult | null;
  /** Last health check timestamp */
  lastHealthCheckAt: string | null;
}

/**
 * Result from an orchestrated operation.
 */
export interface OrchestratorResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result data (if successful) */
  data?: T;
  /** Whether fallback was used */
  usedFallback: boolean;
  /** Execution time in milliseconds */
  executionMs: number;
  /** Whether execution exceeded performance target */
  exceededTarget: boolean;
  /** Error message (if failed and fallback not used) */
  error?: string;
}

// ============================================
// Orchestrator Implementation
// ============================================

/**
 * HelixDB Integration Orchestrator
 *
 * Manages all HelixDB operations with:
 * - Feature flags for gradual rollout
 * - Graceful degradation on failures
 * - Performance monitoring
 * - Health checks
 */
export class HelixOrchestrator {
  private metrics: HelixMetrics = {
    retrievalCount: 0,
    retrievalSuccessCount: 0,
    retrievalTotalMs: 0,
    retrievalSlowCount: 0,
    updateCount: 0,
    updateSuccessCount: 0,
    updateTotalMs: 0,
    updateSlowCount: 0,
    lifecycleCount: 0,
    lifecycleSuccessCount: 0,
    lifecycleTotalMs: 0,
    fallbackCount: 0,
    lastHealthCheck: null,
    lastHealthCheckAt: null,
  };

  constructor(
    private readonly client: HelixClient,
    private readonly config: HelixOrchestratorConfig = DEFAULT_ORCHESTRATOR_CONFIG
  ) {}

  // ============================================
  // Orient Phase - Retrieval
  // ============================================

  /**
   * Execute retrieval in the Orient phase.
   *
   * Wraps `executeHelixRetrieval` with timing, error handling, and fallback.
   *
   * @param input - Retrieval input with query embedding and filters
   * @returns Orchestrator result with retrieval data
   */
  async orient(input: RetrievalInput): Promise<OrchestratorResult<RetrievalResult>> {
    const startTime = performance.now();

    // Check if retrieval is enabled
    if (!this.config.enabled || !this.config.retrievalEnabled) {
      return {
        success: true,
        data: this.emptyRetrievalResult(),
        usedFallback: true,
        executionMs: 0,
        exceededTarget: false,
      };
    }

    this.metrics.retrievalCount++;

    try {
      const result = await executeHelixRetrieval(input, this.client);
      const executionMs = performance.now() - startTime;
      const exceededTarget = executionMs > this.config.performanceTargets.retrievalMaxMs;

      if (exceededTarget) {
        this.metrics.retrievalSlowCount++;
      }

      this.metrics.retrievalTotalMs += executionMs;

      // Handle failed result (function returns success: false instead of throwing)
      if (!result.success) {
        if (this.config.fallbackOnError) {
          this.metrics.fallbackCount++;
          return {
            success: true,
            data: this.emptyRetrievalResult(),
            usedFallback: true,
            executionMs,
            exceededTarget,
          };
        }

        return {
          success: false,
          usedFallback: false,
          executionMs,
          exceededTarget,
          error: result.emptyReason ?? "Retrieval failed",
        };
      }

      this.metrics.retrievalSuccessCount++;

      return {
        success: true,
        data: result,
        usedFallback: false,
        executionMs,
        exceededTarget,
      };
    } catch (error) {
      const executionMs = performance.now() - startTime;
      this.metrics.retrievalTotalMs += executionMs;

      if (this.config.fallbackOnError) {
        this.metrics.fallbackCount++;
        return {
          success: true,
          data: this.emptyRetrievalResult(),
          usedFallback: true,
          executionMs,
          exceededTarget: executionMs > this.config.performanceTargets.retrievalMaxMs,
        };
      }

      return {
        success: false,
        usedFallback: false,
        executionMs,
        exceededTarget: executionMs > this.config.performanceTargets.retrievalMaxMs,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================
  // Act Phase - Memory Update
  // ============================================

  /**
   * Execute memory update in the Act phase.
   *
   * Wraps `executeHelixMemoryUpdate` with timing, error handling, and fallback.
   *
   * @param input - Memory update input with decisions and events
   * @returns Orchestrator result with update details
   */
  async act(input: MemoryUpdateInput): Promise<OrchestratorResult<MemoryUpdateResult>> {
    const startTime = performance.now();

    // Check if memory update is enabled
    if (!this.config.enabled || !this.config.memoryUpdateEnabled) {
      return {
        success: true,
        data: this.emptyUpdateResult(),
        usedFallback: true,
        executionMs: 0,
        exceededTarget: false,
      };
    }

    this.metrics.updateCount++;

    try {
      const result = await executeHelixMemoryUpdate(input, this.client);
      const executionMs = performance.now() - startTime;
      const exceededTarget = executionMs > this.config.performanceTargets.updateMaxMs;

      if (exceededTarget) {
        this.metrics.updateSlowCount++;
      }

      this.metrics.updateTotalMs += executionMs;

      // Handle failed result (function returns success: false instead of throwing)
      if (!result.success) {
        if (this.config.fallbackOnError) {
          this.metrics.fallbackCount++;
          return {
            success: true,
            data: this.emptyUpdateResult(),
            usedFallback: true,
            executionMs,
            exceededTarget,
          };
        }

        return {
          success: false,
          usedFallback: false,
          executionMs,
          exceededTarget,
          error: result.errors.join("; ") || "Memory update failed",
        };
      }

      this.metrics.updateSuccessCount++;

      return {
        success: true,
        data: result,
        usedFallback: false,
        executionMs,
        exceededTarget,
      };
    } catch (error) {
      const executionMs = performance.now() - startTime;
      this.metrics.updateTotalMs += executionMs;

      if (this.config.fallbackOnError) {
        this.metrics.fallbackCount++;
        return {
          success: true,
          data: this.emptyUpdateResult(),
          usedFallback: true,
          executionMs,
          exceededTarget: executionMs > this.config.performanceTargets.updateMaxMs,
        };
      }

      return {
        success: false,
        usedFallback: false,
        executionMs,
        exceededTarget: executionMs > this.config.performanceTargets.updateMaxMs,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================
  // Lifecycle Events
  // ============================================

  /**
   * Record trade lifecycle events (fills, closes, cancellations).
   *
   * Called when order fills arrive or positions are closed.
   *
   * @param events - Lifecycle events to record
   * @returns Orchestrator result
   */
  async recordLifecycle(
    events: TradeLifecycleEvent[]
  ): Promise<OrchestratorResult<MemoryUpdateResult>> {
    const startTime = performance.now();

    // Check if memory update is enabled
    if (!this.config.enabled || !this.config.memoryUpdateEnabled) {
      return {
        success: true,
        data: this.emptyUpdateResult(),
        usedFallback: true,
        executionMs: 0,
        exceededTarget: false,
      };
    }

    if (events.length === 0) {
      return {
        success: true,
        data: this.emptyUpdateResult(),
        usedFallback: false,
        executionMs: 0,
        exceededTarget: false,
      };
    }

    this.metrics.lifecycleCount++;

    try {
      const result = await recordLifecycleEvents(events, this.client);
      const executionMs = performance.now() - startTime;
      const exceededTarget = executionMs > this.config.performanceTargets.lifecycleMaxMs;

      this.metrics.lifecycleTotalMs += executionMs;

      if (result.success) {
        this.metrics.lifecycleSuccessCount++;
      }

      return {
        success: result.success,
        data: result,
        usedFallback: false,
        executionMs,
        exceededTarget,
      };
    } catch (error) {
      const executionMs = performance.now() - startTime;
      this.metrics.lifecycleTotalMs += executionMs;

      if (this.config.fallbackOnError) {
        this.metrics.fallbackCount++;
        return {
          success: true,
          data: this.emptyUpdateResult(),
          usedFallback: true,
          executionMs,
          exceededTarget: executionMs > this.config.performanceTargets.lifecycleMaxMs,
        };
      }

      return {
        success: false,
        usedFallback: false,
        executionMs,
        exceededTarget: executionMs > this.config.performanceTargets.lifecycleMaxMs,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================
  // Health & Monitoring
  // ============================================

  /**
   * Perform a health check on the HelixDB connection.
   *
   * @returns Health check result with latency
   */
  async health(): Promise<HealthCheckResult> {
    const result = await this.client.healthCheck();
    this.metrics.lastHealthCheck = result;
    this.metrics.lastHealthCheckAt = new Date().toISOString();
    return result;
  }

  /**
   * Get current metrics for monitoring.
   *
   * @returns Cumulative metrics
   */
  getMetrics(): HelixMetrics {
    return { ...this.metrics };
  }

  /**
   * Get the current configuration.
   *
   * @returns Orchestrator configuration
   */
  getConfig(): HelixOrchestratorConfig {
    return { ...this.config };
  }

  /**
   * Check if the orchestrator is enabled.
   *
   * @returns True if any operations are enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && (this.config.retrievalEnabled || this.config.memoryUpdateEnabled);
  }

  /**
   * Get summary statistics for logging.
   *
   * @returns Summary object
   */
  getSummary(): {
    enabled: boolean;
    retrievalEnabled: boolean;
    memoryUpdateEnabled: boolean;
    retrievalSuccessRate: number;
    updateSuccessRate: number;
    avgRetrievalMs: number;
    avgUpdateMs: number;
    fallbackRate: number;
    healthy: boolean | null;
  } {
    const retrievalSuccessRate =
      this.metrics.retrievalCount > 0
        ? this.metrics.retrievalSuccessCount / this.metrics.retrievalCount
        : 1;

    const updateSuccessRate =
      this.metrics.updateCount > 0 ? this.metrics.updateSuccessCount / this.metrics.updateCount : 1;

    const avgRetrievalMs =
      this.metrics.retrievalCount > 0
        ? this.metrics.retrievalTotalMs / this.metrics.retrievalCount
        : 0;

    const avgUpdateMs =
      this.metrics.updateCount > 0 ? this.metrics.updateTotalMs / this.metrics.updateCount : 0;

    const totalOps = this.metrics.retrievalCount + this.metrics.updateCount;
    const fallbackRate = totalOps > 0 ? this.metrics.fallbackCount / totalOps : 0;

    return {
      enabled: this.config.enabled,
      retrievalEnabled: this.config.retrievalEnabled,
      memoryUpdateEnabled: this.config.memoryUpdateEnabled,
      retrievalSuccessRate,
      updateSuccessRate,
      avgRetrievalMs,
      avgUpdateMs,
      fallbackRate,
      healthy: this.metrics.lastHealthCheck?.healthy ?? null,
    };
  }

  /**
   * Reset metrics (for testing or new trading session).
   */
  resetMetrics(): void {
    this.metrics = {
      retrievalCount: 0,
      retrievalSuccessCount: 0,
      retrievalTotalMs: 0,
      retrievalSlowCount: 0,
      updateCount: 0,
      updateSuccessCount: 0,
      updateTotalMs: 0,
      updateSlowCount: 0,
      lifecycleCount: 0,
      lifecycleSuccessCount: 0,
      lifecycleTotalMs: 0,
      fallbackCount: 0,
      lastHealthCheck: null,
      lastHealthCheckAt: null,
    };
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Create empty retrieval result for fallback.
   */
  private emptyRetrievalResult(): RetrievalResult {
    return {
      success: true,
      decisions: [],
      metrics: {
        vectorSearchMs: 0,
        graphTraversalMs: 0,
        fusionMs: 0,
        totalMs: 0,
      },
      sourceCounts: { vectorOnly: 0, graphOnly: 0, both: 0 },
      emptyReason: "HelixDB retrieval disabled or in fallback mode",
    };
  }

  /**
   * Create empty update result for fallback.
   */
  private emptyUpdateResult(): MemoryUpdateResult {
    return {
      success: true,
      decisions: { successful: [], failed: [], totalProcessed: 0, executionTimeMs: 0 },
      lifecycleEvents: { successful: [], failed: [], totalProcessed: 0, executionTimeMs: 0 },
      externalEvents: { successful: [], failed: [], totalProcessed: 0, executionTimeMs: 0 },
      edges: { successful: [], failed: [], totalProcessed: 0, executionTimeMs: 0 },
      totalExecutionTimeMs: 0,
      errors: [],
      warnings: ["HelixDB memory update disabled or in fallback mode"],
    };
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a HelixDB orchestrator with the given client and config.
 *
 * @param client - HelixDB client instance
 * @param config - Optional configuration (uses defaults if not provided)
 * @returns HelixOrchestrator instance
 */
export function createHelixOrchestrator(
  client: HelixClient,
  config: Partial<HelixOrchestratorConfig> = {}
): HelixOrchestrator {
  const mergedConfig: HelixOrchestratorConfig = {
    ...DEFAULT_ORCHESTRATOR_CONFIG,
    ...config,
    performanceTargets: {
      ...DEFAULT_ORCHESTRATOR_CONFIG.performanceTargets,
      ...config.performanceTargets,
    },
  };

  return new HelixOrchestrator(client, mergedConfig);
}

/**
 * Create a disabled orchestrator for testing or environments without HelixDB.
 *
 * All operations return fallback results immediately.
 *
 * @param client - HelixDB client (won't be used but required for type safety)
 * @returns Disabled HelixOrchestrator instance
 */
export function createDisabledOrchestrator(client: HelixClient): HelixOrchestrator {
  return new HelixOrchestrator(client, {
    ...DEFAULT_ORCHESTRATOR_CONFIG,
    enabled: false,
    retrievalEnabled: false,
    memoryUpdateEnabled: false,
  });
}

// ============================================
// Convenience Types for Trading Cycle
// ============================================

/**
 * Simplified orient input for common use cases.
 */
export interface OrientContext {
  /** Query embedding for similarity search */
  queryEmbedding: number[];
  /** Current symbol being analyzed */
  symbol?: string;
  /** Current market regime */
  regime?: string;
  /** Maximum results to return */
  topK?: number;
}

/**
 * Simplified act input for common use cases.
 */
export interface ActContext {
  /** Trade decisions from the current cycle */
  decisions: TradeDecisionInput[];
  /** External events (news, earnings, etc.) */
  externalEvents?: ExternalEventInput[];
  /** Influence edges connecting events to decisions */
  influenceEdges?: InfluenceEdgeInput[];
}

/**
 * Convert OrientContext to RetrievalInput.
 */
export function toRetrievalInput(ctx: OrientContext): RetrievalInput {
  return {
    queryEmbedding: ctx.queryEmbedding,
    instrumentId: ctx.symbol,
    underlyingSymbol: ctx.symbol,
    regime: ctx.regime,
    topK: ctx.topK ?? PERFORMANCE_TARGETS.totalMs, // Use default topK
  };
}

/**
 * Convert ActContext to MemoryUpdateInput.
 */
export function toMemoryUpdateInput(ctx: ActContext): MemoryUpdateInput {
  return {
    decisions: ctx.decisions,
    lifecycleEvents: [],
    externalEvents: ctx.externalEvents ?? [],
    influenceEdges: ctx.influenceEdges ?? [],
  };
}
