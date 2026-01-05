/**
 * Tests for WebSocket Graceful Shutdown
 *
 * @see shutdown.ts
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  createShutdownManager,
  shouldRejectConnection,
  createHealthCheckHandler,
  DEFAULT_SHUTDOWN_CONFIG,
  WS_CLOSE_CODES,
  type ShutdownManager,
  type ShutdownDependencies,
  type ShutdownLogEntry,
  type ShutdownPhase,
  type ShutdownConfig,
} from "./shutdown.js";
import type { ServerWebSocket } from "bun";
import type { ConnectionMetadata } from "./handler.js";

// ============================================
// Test Utilities
// ============================================

/**
 * Create mock WebSocket.
 */
function createMockWebSocket(
  connectionId: string
): ServerWebSocket<ConnectionMetadata> & { closeCalls: Array<{ code: number; reason: string }> } {
  const closeCalls: Array<{ code: number; reason: string }> = [];

  return {
    data: {
      connectionId,
      userId: `user-${connectionId}`,
      connectedAt: new Date(),
      lastPing: new Date(),
      channels: new Set(),
      symbols: new Set(),
    },
    close(code?: number, reason?: string) {
      closeCalls.push({ code: code ?? 1000, reason: reason ?? "" });
    },
    send() {
      return 0;
    },
    closeCalls,
    // Stubs for other ServerWebSocket methods
    cork: () => undefined,
    ping: () => undefined,
    pong: () => undefined,
    subscribe: () => undefined,
    unsubscribe: () => undefined,
    isSubscribed: () => false,
    publish: () => undefined,
    publishText: () => undefined,
    publishBinary: () => undefined,
    remoteAddress: "127.0.0.1",
    binaryType: "arraybuffer" as const,
    readyState: 1,
  } as unknown as ServerWebSocket<ConnectionMetadata> & {
    closeCalls: Array<{ code: number; reason: string }>;
  };
}

/**
 * Create mock dependencies.
 */
function createMockDependencies(): ShutdownDependencies & {
  connections: Map<string, ServerWebSocket<ConnectionMetadata>>;
  logs: ShutdownLogEntry[];
  sentMessages: Array<{ connectionId: string; message: Record<string, unknown> }>;
  flushCalled: boolean;
  cleanupCalled: boolean;
} {
  const connections = new Map<
    string,
    ServerWebSocket<ConnectionMetadata> & { closeCalls: Array<{ code: number; reason: string }> }
  >();
  const logs: ShutdownLogEntry[] = [];
  const sentMessages: Array<{ connectionId: string; message: Record<string, unknown> }> = [];
  let flushCalled = false;
  let cleanupCalled = false;

  return {
    connections,
    logs,
    sentMessages,
    get flushCalled() {
      return flushCalled;
    },
    get cleanupCalled() {
      return cleanupCalled;
    },

    getConnections: () => connections as Map<string, ServerWebSocket<ConnectionMetadata>>,

    sendMessage: (ws, message) => {
      sentMessages.push({ connectionId: ws.data.connectionId, message });
      return true;
    },

    flushQueues: async () => {
      flushCalled = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    },

    cleanupSubscriptions: async () => {
      cleanupCalled = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    },

    onLog: (entry) => {
      logs.push(entry);
    },
  };
}

/**
 * Fast shutdown config for tests.
 */
const TEST_CONFIG: Partial<ShutdownConfig> = {
  drainTimeout: 100,
  flushTimeout: 100,
  cleanupTimeout: 100,
  maxShutdownTime: 500,
  exitProcess: false, // Don't exit during tests
};

// ============================================
// Tests: ShutdownManager Creation
// ============================================

describe("createShutdownManager", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("creates manager with initial state", () => {
    const state = manager.getState();

    expect(state.phase).toBe("idle");
    expect(state.reason).toBe(null);
    expect(state.startedAt).toBe(null);
    expect(state.isShuttingDown).toBe(false);
    expect(state.initialConnectionCount).toBe(0);
    expect(state.forcedClosures).toBe(0);
    expect(state.droppedMessages).toBe(0);
  });

  it("reports healthy when not shutting down", () => {
    expect(manager.isHealthy()).toBe(true);
    expect(manager.isShuttingDown()).toBe(false);
    expect(manager.getCurrentPhase()).toBe("idle");
  });

  it("can reset state", async () => {
    await manager.initiateShutdown("manual");

    manager.reset();

    const state = manager.getState();
    expect(state.phase).toBe("idle");
    expect(state.isShuttingDown).toBe(false);
  });
});

// ============================================
// Tests: Shutdown Initiation
// ============================================

describe("initiateShutdown", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("sets shutting down state", async () => {
    const promise = manager.initiateShutdown("manual");

    // Check immediately after starting
    expect(manager.isShuttingDown()).toBe(true);
    expect(manager.isHealthy()).toBe(false);

    await promise;
  });

  it("records shutdown reason", async () => {
    await manager.initiateShutdown("SIGTERM");

    const state = manager.getState();
    expect(state.reason).toBe("SIGTERM");
  });

  it("records start time", async () => {
    const before = Date.now();
    await manager.initiateShutdown("manual");
    const after = Date.now();

    const state = manager.getState();
    expect(state.startedAt).not.toBe(null);
    expect(state.startedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(state.startedAt!.getTime()).toBeLessThanOrEqual(after);
  });

  it("logs shutdown initiated event", async () => {
    await manager.initiateShutdown("manual");

    const initiatedLog = deps.logs.find((l) => l.event === "shutdown.initiated");
    expect(initiatedLog).toBeDefined();
    expect(initiatedLog!.message).toContain("manual");
  });

  it("prevents duplicate shutdown", async () => {
    // First shutdown
    const p1 = manager.initiateShutdown("manual");
    // Second shutdown attempt immediately after (should be ignored)
    const p2 = manager.initiateShutdown("SIGTERM");

    await Promise.all([p1, p2]);

    // Should only have one initiated log (the second attempt is ignored)
    const initiatedLogs = deps.logs.filter((l) => l.event === "shutdown.initiated");
    expect(initiatedLogs.length).toBe(1);
    expect(initiatedLogs[0]?.message).toContain("manual");

    // Should have an error log about duplicate shutdown
    const errorLog = deps.logs.find(
      (l) => l.event === "shutdown.error" && l.message.includes("already in progress")
    );
    expect(errorLog).toBeDefined();
  });
});

// ============================================
// Tests: Shutdown Phases
// ============================================

describe("Shutdown Phases", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("progresses through all phases", async () => {
    await manager.initiateShutdown("manual");

    const phases = deps.logs
      .filter((l) => l.event === "shutdown.phase_change")
      .map((l) => l.phase);

    expect(phases).toContain("reject_connections");
    expect(phases).toContain("warn_clients");
    expect(phases).toContain("drain_connections");
    expect(phases).toContain("force_close");
    expect(phases).toContain("cleanup_subscriptions");
    expect(phases).toContain("flush_queues");
    expect(phases).toContain("complete");
  });

  it("completes with final phase", async () => {
    await manager.initiateShutdown("manual");

    expect(manager.getCurrentPhase()).toBe("complete");
  });
});

// ============================================
// Tests: Client Warning
// ============================================

describe("Client Warning Phase", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("sends warning to all connected clients", async () => {
    // Add mock connections
    deps.connections.set("conn-1", createMockWebSocket("conn-1"));
    deps.connections.set("conn-2", createMockWebSocket("conn-2"));
    deps.connections.set("conn-3", createMockWebSocket("conn-3"));

    await manager.initiateShutdown("manual");

    // Should have sent warnings to all 3 connections
    expect(deps.sentMessages.length).toBe(3);

    for (const msg of deps.sentMessages) {
      expect(msg.message.type).toBe("shutdown_warning");
      expect(msg.message.timeout).toBeDefined();
    }
  });

  it("logs warning count", async () => {
    deps.connections.set("conn-1", createMockWebSocket("conn-1"));
    deps.connections.set("conn-2", createMockWebSocket("conn-2"));

    await manager.initiateShutdown("manual");

    const warnedLog = deps.logs.find((l) => l.event === "shutdown.connection_warned");
    expect(warnedLog).toBeDefined();
    expect(warnedLog!.message).toContain("2");
  });

  it("handles send failures gracefully", async () => {
    deps.connections.set("conn-1", createMockWebSocket("conn-1"));

    // Override sendMessage to fail
    deps.sendMessage = () => false;

    // Should not throw
    await manager.initiateShutdown("manual");

    expect(manager.getCurrentPhase()).toBe("complete");
  });
});

// ============================================
// Tests: Connection Draining
// ============================================

describe("Connection Draining Phase", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("waits for connections to close", async () => {
    deps.connections.set("conn-1", createMockWebSocket("conn-1"));

    // Simulate client disconnecting after 20ms (before drain timeout)
    setTimeout(() => {
      deps.connections.delete("conn-1");
    }, 20);

    await manager.initiateShutdown("manual");

    // Check that all connections were eventually drained (or force closed)
    // The drain phase logs show progress
    const drainLogs = deps.logs.filter((l) => l.event === "shutdown.connection_drained");
    expect(drainLogs.length).toBeGreaterThan(0);
  });

  it("times out if connections don't close", async () => {
    deps.connections.set("conn-1", createMockWebSocket("conn-1"));
    // Connection never closes

    await manager.initiateShutdown("manual");

    const timeoutLog = deps.logs.find(
      (l) => l.event === "shutdown.timeout" && l.message.includes("Drain timeout")
    );
    expect(timeoutLog).toBeDefined();
  });
});

// ============================================
// Tests: Force Close
// ============================================

describe("Force Close Phase", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("force closes remaining connections", async () => {
    const ws1 = createMockWebSocket("conn-1");
    const ws2 = createMockWebSocket("conn-2");
    deps.connections.set("conn-1", ws1);
    deps.connections.set("conn-2", ws2);

    await manager.initiateShutdown("manual");

    expect(ws1.closeCalls.length).toBe(1);
    expect(ws1.closeCalls[0]?.code).toBe(WS_CLOSE_CODES.SHUTDOWN);

    expect(ws2.closeCalls.length).toBe(1);
    expect(ws2.closeCalls[0]?.code).toBe(WS_CLOSE_CODES.SHUTDOWN);
  });

  it("records forced closure count", async () => {
    deps.connections.set("conn-1", createMockWebSocket("conn-1"));
    deps.connections.set("conn-2", createMockWebSocket("conn-2"));

    await manager.initiateShutdown("manual");

    const state = manager.getState();
    expect(state.forcedClosures).toBe(2);
  });

  it("logs forced closures", async () => {
    deps.connections.set("conn-1", createMockWebSocket("conn-1"));

    await manager.initiateShutdown("manual");

    const forcedLog = deps.logs.find((l) => l.event === "shutdown.connection_forced");
    expect(forcedLog).toBeDefined();
  });
});

// ============================================
// Tests: Queue Flushing
// ============================================

describe("Queue Flushing Phase", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("calls flush queues callback", async () => {
    await manager.initiateShutdown("manual");

    expect(deps.flushCalled).toBe(true);
  });

  it("logs successful flush", async () => {
    await manager.initiateShutdown("manual");

    const flushLog = deps.logs.find(
      (l) => l.event === "shutdown.queue_flushed" && l.message.includes("successfully")
    );
    expect(flushLog).toBeDefined();
  });

  it("handles missing flush callback", async () => {
    deps.flushQueues = undefined;

    await manager.initiateShutdown("manual");

    const flushLog = deps.logs.find((l) => l.event === "shutdown.queue_flushed");
    expect(flushLog).toBeDefined();
    expect(flushLog!.message).toContain("No queue flush configured");
  });

  it("handles flush timeout", async () => {
    deps.flushQueues = async () => {
      // Simulate long-running flush
      await new Promise((resolve) => setTimeout(resolve, 1000));
    };

    await manager.initiateShutdown("manual");

    const errorLog = deps.logs.find(
      (l) => l.event === "shutdown.error" && l.message.includes("flush")
    );
    expect(errorLog).toBeDefined();
  });
});

// ============================================
// Tests: Subscription Cleanup
// ============================================

describe("Subscription Cleanup Phase", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("calls cleanup subscriptions callback", async () => {
    await manager.initiateShutdown("manual");

    expect(deps.cleanupCalled).toBe(true);
  });

  it("logs successful cleanup", async () => {
    await manager.initiateShutdown("manual");

    const cleanupLog = deps.logs.find(
      (l) => l.event === "shutdown.subscriptions_closed" && l.message.includes("successfully")
    );
    expect(cleanupLog).toBeDefined();
  });

  it("handles missing cleanup callback", async () => {
    deps.cleanupSubscriptions = undefined;

    await manager.initiateShutdown("manual");

    const cleanupLog = deps.logs.find((l) => l.event === "shutdown.subscriptions_closed");
    expect(cleanupLog).toBeDefined();
    expect(cleanupLog!.message).toContain("No subscription cleanup configured");
  });
});

// ============================================
// Tests: Health Check
// ============================================

describe("Health Check Integration", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("returns healthy when not shutting down", () => {
    expect(manager.isHealthy()).toBe(true);
  });

  it("returns unhealthy during shutdown", async () => {
    const promise = manager.initiateShutdown("manual");

    expect(manager.isHealthy()).toBe(false);

    await promise;
  });

  describe("createHealthCheckHandler", () => {
    it("returns 200 when healthy", () => {
      const handler = createHealthCheckHandler(manager);
      const response = handler();

      expect(response.status).toBe(200);
    });

    it("returns 503 when shutting down", async () => {
      const handler = createHealthCheckHandler(manager);

      const promise = manager.initiateShutdown("manual");

      const response = handler();
      expect(response.status).toBe(503);

      const body = (await response.json()) as { status: string; reason: string };
      expect(body.status).toBe("unhealthy");
      expect(body.reason).toBe("shutting_down");

      await promise;
    });
  });
});

// ============================================
// Tests: shouldRejectConnection
// ============================================

describe("shouldRejectConnection", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("returns false when not shutting down", () => {
    expect(shouldRejectConnection(manager)).toBe(false);
  });

  it("returns true during shutdown", async () => {
    const promise = manager.initiateShutdown("manual");

    expect(shouldRejectConnection(manager)).toBe(true);

    await promise;
  });
});

// ============================================
// Tests: Shutdown Completion
// ============================================

describe("Shutdown Completion", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("logs completion with duration", async () => {
    await manager.initiateShutdown("manual");

    const completeLog = deps.logs.find((l) => l.event === "shutdown.complete");
    expect(completeLog).toBeDefined();
    expect(completeLog!.duration).toBeDefined();
    expect(completeLog!.duration).toBeGreaterThanOrEqual(0);
  });

  it("logs completion with metrics", async () => {
    deps.connections.set("conn-1", createMockWebSocket("conn-1"));

    await manager.initiateShutdown("manual");

    const completeLog = deps.logs.find((l) => l.event === "shutdown.complete");
    expect(completeLog).toBeDefined();
    expect(completeLog!.metadata?.forcedClosures).toBe(1);
  });
});

// ============================================
// Tests: Force Shutdown
// ============================================

describe("forceShutdown", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("immediately closes all connections", () => {
    const ws1 = createMockWebSocket("conn-1");
    const ws2 = createMockWebSocket("conn-2");
    deps.connections.set("conn-1", ws1);
    deps.connections.set("conn-2", ws2);

    manager.forceShutdown();

    expect(ws1.closeCalls.length).toBe(1);
    expect(ws2.closeCalls.length).toBe(1);
  });

  it("logs forced shutdown", () => {
    manager.forceShutdown();

    const forceLog = deps.logs.find(
      (l) => l.event === "shutdown.complete" && l.message.includes("Forced")
    );
    expect(forceLog).toBeDefined();
  });
});

// ============================================
// Tests: Signal Handlers
// ============================================

describe("Signal Handlers", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("can register signal handlers", () => {
    // Should not throw
    manager.registerSignalHandlers();
  });

  it("can unregister signal handlers", () => {
    manager.registerSignalHandlers();
    // Should not throw
    manager.unregisterSignalHandlers();
  });

  it("logs signal handler registration", () => {
    manager.registerSignalHandlers();

    const registerLog = deps.logs.find((l) => l.message.includes("Signal handlers registered"));
    expect(registerLog).toBeDefined();
  });

  it("prevents duplicate registration", () => {
    manager.registerSignalHandlers();
    deps.logs = [];
    manager.registerSignalHandlers();

    // Should not log again
    const registerLogs = deps.logs.filter((l) => l.message.includes("Signal handlers"));
    expect(registerLogs.length).toBe(0);
  });
});

// ============================================
// Tests: Configuration
// ============================================

describe("Configuration", () => {
  it("uses default config when none provided", () => {
    const deps = createMockDependencies();
    const manager = createShutdownManager(deps);

    // Manager should work with defaults
    expect(manager.isHealthy()).toBe(true);
  });

  it("merges custom config with defaults", async () => {
    const deps = createMockDependencies();
    const manager = createShutdownManager(deps, {
      drainTimeout: 50,
      exitProcess: false,
    });

    deps.connections.set("conn-1", createMockWebSocket("conn-1"));

    await manager.initiateShutdown("manual");

    // Should complete (with fast drain timeout)
    expect(manager.getCurrentPhase()).toBe("complete");
  });
});

// ============================================
// Tests: Constants
// ============================================

describe("Constants", () => {
  it("has correct default config values", () => {
    expect(DEFAULT_SHUTDOWN_CONFIG.drainTimeout).toBe(30000);
    expect(DEFAULT_SHUTDOWN_CONFIG.flushTimeout).toBe(10000);
    expect(DEFAULT_SHUTDOWN_CONFIG.cleanupTimeout).toBe(10000);
    expect(DEFAULT_SHUTDOWN_CONFIG.maxShutdownTime).toBe(60000);
    expect(DEFAULT_SHUTDOWN_CONFIG.exitProcess).toBe(true);
  });

  it("has correct WebSocket close codes", () => {
    expect(WS_CLOSE_CODES.NORMAL).toBe(1000);
    expect(WS_CLOSE_CODES.GOING_AWAY).toBe(1001);
    expect(WS_CLOSE_CODES.SHUTDOWN).toBe(1012);
  });
});

// ============================================
// Tests: Edge Cases
// ============================================

describe("Edge Cases", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("handles empty connections gracefully", async () => {
    // No connections
    await manager.initiateShutdown("manual");

    expect(manager.getCurrentPhase()).toBe("complete");
  });

  it("handles connection close errors", async () => {
    const errorWs = {
      ...createMockWebSocket("conn-1"),
      close() {
        throw new Error("Already closed");
      },
    } as unknown as ServerWebSocket<ConnectionMetadata>;

    deps.connections.set("conn-1", errorWs);

    // Should not throw
    await manager.initiateShutdown("manual");

    expect(manager.getCurrentPhase()).toBe("complete");
  });

  it("handles send message errors during warning", async () => {
    deps.connections.set("conn-1", createMockWebSocket("conn-1"));
    deps.sendMessage = () => {
      throw new Error("Send failed");
    };

    // Should not throw
    await manager.initiateShutdown("manual");

    expect(manager.getCurrentPhase()).toBe("complete");
  });

  it("handles cleanup callback errors", async () => {
    deps.cleanupSubscriptions = async () => {
      throw new Error("Cleanup failed");
    };

    await manager.initiateShutdown("manual");

    const errorLog = deps.logs.find((l) => l.event === "shutdown.error");
    expect(errorLog).toBeDefined();
    expect(errorLog!.message).toContain("Cleanup failed");

    // Should still complete
    expect(manager.getCurrentPhase()).toBe("complete");
  });

  it("handles flush callback errors", async () => {
    deps.flushQueues = async () => {
      throw new Error("Flush failed");
    };

    await manager.initiateShutdown("manual");

    const errorLog = deps.logs.find(
      (l) => l.event === "shutdown.error" && l.message.includes("Flush")
    );
    expect(errorLog).toBeDefined();

    // Should still complete
    expect(manager.getCurrentPhase()).toBe("complete");
  });
});

// ============================================
// Tests: Logging
// ============================================

describe("Logging", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("logs all events with timestamps", async () => {
    await manager.initiateShutdown("manual");

    for (const log of deps.logs) {
      expect(log.timestamp).toBeDefined();
      expect(new Date(log.timestamp).getTime()).not.toBeNaN();
    }
  });

  it("includes phase in all log entries", async () => {
    await manager.initiateShutdown("manual");

    for (const log of deps.logs) {
      expect(log.phase).toBeDefined();
    }
  });

  it("includes connection count in log entries", async () => {
    deps.connections.set("conn-1", createMockWebSocket("conn-1"));

    await manager.initiateShutdown("manual");

    const logsWithCount = deps.logs.filter((l) => l.connectionCount !== undefined);
    expect(logsWithCount.length).toBeGreaterThan(0);
  });

  it("works without onLog callback", async () => {
    const depsNoLog = createMockDependencies();
    depsNoLog.onLog = undefined;
    const managerNoLog = createShutdownManager(depsNoLog, TEST_CONFIG);

    // Should not throw
    await managerNoLog.initiateShutdown("manual");

    expect(managerNoLog.getCurrentPhase()).toBe("complete");
  });
});

// ============================================
// Tests: State Snapshots
// ============================================

describe("State Snapshots", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let manager: ShutdownManager;

  beforeEach(() => {
    deps = createMockDependencies();
    manager = createShutdownManager(deps, TEST_CONFIG);
  });

  it("getState returns immutable snapshot", async () => {
    const state1 = manager.getState();
    await manager.initiateShutdown("manual");
    const state2 = manager.getState();

    expect(state1.isShuttingDown).toBe(false);
    expect(state2.isShuttingDown).toBe(true);
  });

  it("tracks initial connection count", async () => {
    deps.connections.set("conn-1", createMockWebSocket("conn-1"));
    deps.connections.set("conn-2", createMockWebSocket("conn-2"));
    deps.connections.set("conn-3", createMockWebSocket("conn-3"));

    await manager.initiateShutdown("manual");

    const state = manager.getState();
    expect(state.initialConnectionCount).toBe(3);
  });
});
