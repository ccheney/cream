/**
 * WebSocket Graceful Shutdown
 *
 * Implements graceful shutdown with connection draining, message queue flushing,
 * and event subscription cleanup for zero-downtime deployments.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import type { ServerWebSocket } from "bun";
import type { ConnectionMetadata } from "./handler.js";

// ============================================
// Types
// ============================================

/**
 * Shutdown phase names.
 */
export type ShutdownPhase =
  | "idle"
  | "reject_connections"
  | "warn_clients"
  | "drain_connections"
  | "force_close"
  | "cleanup_subscriptions"
  | "flush_queues"
  | "complete";

/**
 * Shutdown reason.
 */
export type ShutdownReason = "SIGTERM" | "SIGINT" | "manual" | "error";

/**
 * Shutdown configuration.
 */
export interface ShutdownConfig {
  /** Time to wait for clients to disconnect after warning (ms) */
  drainTimeout: number;
  /** Time to wait for queue flush (ms) */
  flushTimeout: number;
  /** Time to wait for subscription cleanup (ms) */
  cleanupTimeout: number;
  /** Maximum total shutdown time (ms) */
  maxShutdownTime: number;
  /** Whether to exit process after shutdown */
  exitProcess: boolean;
}

/**
 * Shutdown state.
 */
export interface ShutdownState {
  /** Current shutdown phase */
  phase: ShutdownPhase;
  /** Reason for shutdown */
  reason: ShutdownReason | null;
  /** Timestamp when shutdown started */
  startedAt: Date | null;
  /** Whether shutdown is in progress */
  isShuttingDown: boolean;
  /** Number of connections at shutdown start */
  initialConnectionCount: number;
  /** Number of connections forcefully closed */
  forcedClosures: number;
  /** Number of messages dropped */
  droppedMessages: number;
}

/**
 * Shutdown event type.
 */
export type ShutdownEventType =
  | "shutdown.initiated"
  | "shutdown.phase_change"
  | "shutdown.connection_warned"
  | "shutdown.connection_drained"
  | "shutdown.connection_forced"
  | "shutdown.queue_flushed"
  | "shutdown.subscriptions_closed"
  | "shutdown.complete"
  | "shutdown.timeout"
  | "shutdown.error";

/**
 * Shutdown log entry.
 */
export interface ShutdownLogEntry {
  timestamp: string;
  event: ShutdownEventType;
  phase: ShutdownPhase;
  reason?: ShutdownReason;
  connectionCount?: number;
  duration?: number;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Shutdown callback types.
 */
export type ShutdownLogCallback = (entry: ShutdownLogEntry) => void;
export type GetConnectionsCallback = () => Map<string, ServerWebSocket<ConnectionMetadata>>;
export type SendMessageCallback = (
  ws: ServerWebSocket<ConnectionMetadata>,
  message: Record<string, unknown>
) => boolean;
export type FlushQueuesCallback = () => Promise<void>;
export type CleanupSubscriptionsCallback = () => Promise<void>;

/**
 * Shutdown dependencies.
 */
export interface ShutdownDependencies {
  getConnections: GetConnectionsCallback;
  sendMessage: SendMessageCallback;
  flushQueues?: FlushQueuesCallback;
  cleanupSubscriptions?: CleanupSubscriptionsCallback;
  onLog?: ShutdownLogCallback;
}

// ============================================
// Constants
// ============================================

/**
 * Default shutdown configuration.
 */
export const DEFAULT_SHUTDOWN_CONFIG: ShutdownConfig = {
  drainTimeout: 30000, // 30s for clients to disconnect
  flushTimeout: 10000, // 10s to flush queues
  cleanupTimeout: 10000, // 10s for subscription cleanup
  maxShutdownTime: 60000, // 60s max total
  exitProcess: true,
};

/**
 * WebSocket close codes.
 */
export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  SHUTDOWN: 1012,
} as const;

// ============================================
// Shutdown Manager
// ============================================

/**
 * Manages graceful WebSocket server shutdown.
 *
 * @example
 * ```ts
 * const shutdown = createShutdownManager({
 *   getConnections: () => connections,
 *   sendMessage: (ws, msg) => { ws.send(JSON.stringify(msg)); return true; },
 *   flushQueues: async () => { batcher.flush(); },
 *   cleanupSubscriptions: async () => { redis.quit(); },
 *   onLog: (entry) => console.log(JSON.stringify(entry)),
 * });
 *
 * // Start signal handlers
 * shutdown.registerSignalHandlers();
 *
 * // Check health (for load balancer)
 * if (!shutdown.isHealthy()) {
 *   return new Response("Service Unavailable", { status: 503 });
 * }
 *
 * // Manual shutdown
 * await shutdown.initiateShutdown("manual");
 * ```
 */
export interface ShutdownManager {
  /** Current shutdown state */
  getState(): ShutdownState;

  /** Check if server is accepting connections */
  isHealthy(): boolean;

  /** Check if shutdown is in progress */
  isShuttingDown(): boolean;

  /** Get current phase */
  getCurrentPhase(): ShutdownPhase;

  /** Register signal handlers (SIGTERM, SIGINT) */
  registerSignalHandlers(): void;

  /** Unregister signal handlers */
  unregisterSignalHandlers(): void;

  /** Initiate graceful shutdown */
  initiateShutdown(reason: ShutdownReason): Promise<void>;

  /** Force immediate shutdown */
  forceShutdown(): void;

  /** Reset state (for testing) */
  reset(): void;
}

/**
 * Create a shutdown manager.
 */
export function createShutdownManager(
  deps: ShutdownDependencies,
  config: Partial<ShutdownConfig> = {}
): ShutdownManager {
  const fullConfig: ShutdownConfig = { ...DEFAULT_SHUTDOWN_CONFIG, ...config };

  const state: ShutdownState = {
    phase: "idle",
    reason: null,
    startedAt: null,
    isShuttingDown: false,
    initialConnectionCount: 0,
    forcedClosures: 0,
    droppedMessages: 0,
  };

  let signalHandlerRegistered = false;
  let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;

  // ----------------------------------------
  // Logging
  // ----------------------------------------

  const log = (
    event: ShutdownEventType,
    message: string,
    metadata?: Record<string, unknown>
  ): void => {
    if (!deps.onLog) return;

    const entry: ShutdownLogEntry = {
      timestamp: new Date().toISOString(),
      event,
      phase: state.phase,
      reason: state.reason ?? undefined,
      connectionCount: deps.getConnections().size,
      duration: state.startedAt ? Date.now() - state.startedAt.getTime() : undefined,
      message,
      metadata,
    };

    deps.onLog(entry);
  };

  // ----------------------------------------
  // Phase Transitions
  // ----------------------------------------

  const setPhase = (phase: ShutdownPhase): void => {
    const previousPhase = state.phase;
    state.phase = phase;

    log("shutdown.phase_change", `Phase transition: ${previousPhase} → ${phase}`, {
      previousPhase,
      newPhase: phase,
    });
  };

  // ----------------------------------------
  // Shutdown Phases
  // ----------------------------------------

  /**
   * Phase 1: Reject new connections.
   * Server marks itself as unhealthy so load balancer stops routing traffic.
   */
  const rejectConnectionsPhase = (): void => {
    setPhase("reject_connections");
    // Health check now returns false
    // New connections will get 503 response
  };

  /**
   * Phase 2: Warn connected clients.
   * Send shutdown warning to all connections.
   */
  const warnClientsPhase = (): void => {
    setPhase("warn_clients");

    const connections = deps.getConnections();
    let warned = 0;

    for (const [_connectionId, ws] of connections) {
      try {
        const success = deps.sendMessage(ws, {
          type: "shutdown_warning",
          message: "Server shutting down. Please reconnect to another server.",
          timeout: fullConfig.drainTimeout / 1000,
          timestamp: new Date().toISOString(),
        });

        if (success) {
          warned++;
        }
      } catch {
        // Connection already closed
      }
    }

    log("shutdown.connection_warned", `Warned ${warned} connections of shutdown`, {
      warnedCount: warned,
      totalConnections: connections.size,
    });
  };

  /**
   * Phase 3: Drain connections.
   * Wait for clients to disconnect gracefully.
   */
  const drainConnectionsPhase = async (): Promise<void> => {
    setPhase("drain_connections");

    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms

    while (Date.now() - startTime < fullConfig.drainTimeout) {
      const connections = deps.getConnections();

      if (connections.size === 0) {
        log("shutdown.connection_drained", "All connections drained successfully", {
          duration: Date.now() - startTime,
        });
        return;
      }

      // Log progress every 5 seconds
      if ((Date.now() - startTime) % 5000 < checkInterval) {
        log("shutdown.connection_drained", `Waiting for ${connections.size} connections to drain`, {
          remainingConnections: connections.size,
          elapsed: Date.now() - startTime,
        });
      }

      await sleep(checkInterval);
    }

    log("shutdown.timeout", `Drain timeout reached with ${deps.getConnections().size} connections`, {
      remainingConnections: deps.getConnections().size,
    });
  };

  /**
   * Phase 4: Force close remaining connections.
   */
  const forceClosePhase = (): void => {
    setPhase("force_close");

    const connections = deps.getConnections();
    let closed = 0;

    for (const [connectionId, ws] of connections) {
      try {
        ws.close(WS_CLOSE_CODES.SHUTDOWN, "Server shutdown");
        closed++;
        state.forcedClosures++;

        log("shutdown.connection_forced", `Force closed connection: ${connectionId}`, {
          connectionId,
        });
      } catch {
        // Already closed
      }
    }

    if (closed > 0) {
      log("shutdown.connection_forced", `Force closed ${closed} connections`, {
        forcedCount: closed,
      });
    }
  };

  /**
   * Phase 5: Cleanup subscriptions.
   * Close Redis connections, gRPC streams, etc.
   */
  const cleanupSubscriptionsPhase = async (): Promise<void> => {
    setPhase("cleanup_subscriptions");

    if (!deps.cleanupSubscriptions) {
      log("shutdown.subscriptions_closed", "No subscription cleanup configured", {});
      return;
    }

    try {
      const cleanup = Promise.race([
        deps.cleanupSubscriptions(),
        sleep(fullConfig.cleanupTimeout).then(() => {
          throw new Error("Subscription cleanup timeout");
        }),
      ]);

      await cleanup;
      log("shutdown.subscriptions_closed", "Subscriptions cleaned up successfully", {});
    } catch (error) {
      log("shutdown.error", `Subscription cleanup failed: ${(error as Error).message}`, {
        error: (error as Error).message,
      });
    }
  };

  /**
   * Phase 6: Flush message queues.
   * Ensure pending messages are sent.
   */
  const flushQueuesPhase = async (): Promise<void> => {
    setPhase("flush_queues");

    if (!deps.flushQueues) {
      log("shutdown.queue_flushed", "No queue flush configured", {});
      return;
    }

    try {
      const flush = Promise.race([
        deps.flushQueues(),
        sleep(fullConfig.flushTimeout).then(() => {
          throw new Error("Queue flush timeout");
        }),
      ]);

      await flush;
      log("shutdown.queue_flushed", "Message queues flushed successfully", {});
    } catch (error) {
      log("shutdown.error", `Queue flush failed: ${(error as Error).message}`, {
        error: (error as Error).message,
      });
    }
  };

  /**
   * Phase 7: Complete shutdown.
   */
  const completePhase = (): void => {
    setPhase("complete");

    const duration = state.startedAt ? Date.now() - state.startedAt.getTime() : 0;

    log("shutdown.complete", `Shutdown complete in ${duration}ms`, {
      duration,
      forcedClosures: state.forcedClosures,
      droppedMessages: state.droppedMessages,
    });

    if (fullConfig.exitProcess) {
      // Give time for final log to flush
      setTimeout(() => {
        process.exit(0);
      }, 100);
    }
  };

  // ----------------------------------------
  // Main Shutdown Sequence
  // ----------------------------------------

  const initiateShutdown = async (reason: ShutdownReason): Promise<void> => {
    if (state.isShuttingDown) {
      log("shutdown.error", "Shutdown already in progress", { existingReason: state.reason });
      return;
    }

    state.isShuttingDown = true;
    state.reason = reason;
    state.startedAt = new Date();
    state.initialConnectionCount = deps.getConnections().size;

    log("shutdown.initiated", `Shutdown initiated: ${reason}`, {
      reason,
      initialConnections: state.initialConnectionCount,
    });

    // Set overall timeout
    shutdownTimeout = setTimeout(() => {
      log("shutdown.timeout", "Maximum shutdown time exceeded, forcing exit", {
        maxTime: fullConfig.maxShutdownTime,
      });
      forceShutdown();
    }, fullConfig.maxShutdownTime);

    try {
      // Execute phases sequentially
      rejectConnectionsPhase();
      warnClientsPhase();
      await drainConnectionsPhase();
      forceClosePhase();
      await cleanupSubscriptionsPhase();
      await flushQueuesPhase();
      completePhase();
    } catch (error) {
      log("shutdown.error", `Shutdown error: ${(error as Error).message}`, {
        error: (error as Error).message,
      });
      forceShutdown();
    } finally {
      if (shutdownTimeout) {
        clearTimeout(shutdownTimeout);
        shutdownTimeout = null;
      }
    }
  };

  const forceShutdown = (): void => {
    log("shutdown.complete", "Forced shutdown", {
      reason: state.reason,
      forcedClosures: state.forcedClosures,
    });

    // Close all connections immediately
    const connections = deps.getConnections();
    for (const [_id, ws] of connections) {
      try {
        ws.close(WS_CLOSE_CODES.SHUTDOWN, "Forced shutdown");
      } catch {
        // Ignore
      }
    }

    if (fullConfig.exitProcess) {
      process.exit(1);
    }
  };

  // ----------------------------------------
  // Signal Handlers
  // ----------------------------------------

  const handleSigterm = (): void => {
    initiateShutdown("SIGTERM");
  };

  const handleSigint = (): void => {
    initiateShutdown("SIGINT");
  };

  const registerSignalHandlers = (): void => {
    if (signalHandlerRegistered) return;

    process.on("SIGTERM", handleSigterm);
    process.on("SIGINT", handleSigint);

    signalHandlerRegistered = true;

    log("shutdown.initiated", "Signal handlers registered (SIGTERM, SIGINT)", {});
  };

  const unregisterSignalHandlers = (): void => {
    if (!signalHandlerRegistered) return;

    process.off("SIGTERM", handleSigterm);
    process.off("SIGINT", handleSigint);

    signalHandlerRegistered = false;
  };

  // ----------------------------------------
  // Public API
  // ----------------------------------------

  return {
    getState(): ShutdownState {
      return { ...state };
    },

    isHealthy(): boolean {
      return !state.isShuttingDown;
    },

    isShuttingDown(): boolean {
      return state.isShuttingDown;
    },

    getCurrentPhase(): ShutdownPhase {
      return state.phase;
    },

    registerSignalHandlers,
    unregisterSignalHandlers,
    initiateShutdown,
    forceShutdown,

    reset(): void {
      state.phase = "idle";
      state.reason = null;
      state.startedAt = null;
      state.isShuttingDown = false;
      state.initialConnectionCount = 0;
      state.forcedClosures = 0;
      state.droppedMessages = 0;

      if (shutdownTimeout) {
        clearTimeout(shutdownTimeout);
        shutdownTimeout = null;
      }
    },
  };
}

// ============================================
// Utilities
// ============================================

/**
 * Sleep for a given duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if server should accept new connections.
 * Use this in the upgrade handler.
 */
export function shouldRejectConnection(manager: ShutdownManager): boolean {
  return manager.isShuttingDown();
}

/**
 * Create a health check handler.
 * Returns 503 during shutdown.
 */
export function createHealthCheckHandler(manager: ShutdownManager) {
  return (): Response => {
    if (!manager.isHealthy()) {
      return new Response(
        JSON.stringify({
          status: "unhealthy",
          reason: "shutting_down",
          phase: manager.getCurrentPhase(),
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        status: "healthy",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };
}

// ============================================
// Exports
// ============================================

export default {
  createShutdownManager,
  shouldRejectConnection,
  createHealthCheckHandler,
  DEFAULT_SHUTDOWN_CONFIG,
  WS_CLOSE_CODES,
};
