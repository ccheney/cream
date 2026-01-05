/**
 * Connection Monitor Tests
 *
 * Tests for WebSocket connection monitoring with exponential backoff.
 *
 * @see docs/plans/ui/28-states.md lines 89-96
 */

import { describe, expect, it } from "bun:test";
import {
  ConnectionMonitor,
  type ConnectionMonitorOptions,
  type ConnectionMonitorState,
  type ConnectionStatus,
  calculateBackoff,
  createConnectionMonitor,
  DEFAULT_OPTIONS,
  getBackoffSequence,
} from "./connection-monitor.js";

// ============================================
// calculateBackoff Tests
// ============================================

describe("calculateBackoff", () => {
  it("returns initial backoff for first retry", () => {
    const delay = calculateBackoff(0, 1000, 32000, 2);
    expect(delay).toBe(1000);
  });

  it("doubles delay for each retry", () => {
    expect(calculateBackoff(0)).toBe(1000);
    expect(calculateBackoff(1)).toBe(2000);
    expect(calculateBackoff(2)).toBe(4000);
    expect(calculateBackoff(3)).toBe(8000);
    expect(calculateBackoff(4)).toBe(16000);
    expect(calculateBackoff(5)).toBe(32000);
  });

  it("respects max backoff", () => {
    const delay = calculateBackoff(10, 1000, 32000, 2);
    expect(delay).toBe(32000);
  });

  it("handles custom initial backoff", () => {
    const delay = calculateBackoff(0, 500, 32000, 2);
    expect(delay).toBe(500);
  });

  it("handles custom max backoff", () => {
    const delay = calculateBackoff(5, 1000, 10000, 2);
    expect(delay).toBe(10000);
  });

  it("handles custom multiplier", () => {
    expect(calculateBackoff(0, 1000, 100000, 3)).toBe(1000);
    expect(calculateBackoff(1, 1000, 100000, 3)).toBe(3000);
    expect(calculateBackoff(2, 1000, 100000, 3)).toBe(9000);
  });

  it("uses default values when not provided", () => {
    const delay = calculateBackoff(0);
    expect(delay).toBe(DEFAULT_OPTIONS.initialBackoff);
  });
});

// ============================================
// getBackoffSequence Tests
// ============================================

describe("getBackoffSequence", () => {
  it("generates default sequence", () => {
    const sequence = getBackoffSequence();
    expect(sequence.length).toBe(10);
    expect(sequence[0]).toBe(1000);
    expect(sequence[1]).toBe(2000);
    expect(sequence[9]).toBe(32000); // capped at max
  });

  it("generates custom sequence", () => {
    const sequence = getBackoffSequence({
      initialBackoff: 500,
      maxBackoff: 8000,
      backoffMultiplier: 2,
      maxRetries: 5,
    });
    expect(sequence.length).toBe(5);
    expect(sequence[0]).toBe(500);
    expect(sequence[1]).toBe(1000);
    expect(sequence[4]).toBe(8000); // capped at max
  });

  it("handles single retry", () => {
    const sequence = getBackoffSequence({ maxRetries: 1 });
    expect(sequence.length).toBe(1);
    expect(sequence[0]).toBe(1000);
  });

  it("handles zero retries", () => {
    const sequence = getBackoffSequence({ maxRetries: 0 });
    expect(sequence.length).toBe(0);
  });
});

// ============================================
// DEFAULT_OPTIONS Tests
// ============================================

describe("DEFAULT_OPTIONS", () => {
  it("has correct initial backoff", () => {
    expect(DEFAULT_OPTIONS.initialBackoff).toBe(1000);
  });

  it("has correct max backoff", () => {
    expect(DEFAULT_OPTIONS.maxBackoff).toBe(32000);
  });

  it("has correct backoff multiplier", () => {
    expect(DEFAULT_OPTIONS.backoffMultiplier).toBe(2);
  });

  it("has correct max retries", () => {
    expect(DEFAULT_OPTIONS.maxRetries).toBe(10);
  });
});

// ============================================
// ConnectionMonitor Class Tests
// ============================================

describe("ConnectionMonitor", () => {
  describe("initial state", () => {
    it("starts with disconnected status", () => {
      const monitor = new ConnectionMonitor();
      expect(monitor.status).toBe("disconnected");
    });

    it("starts with zero retry count", () => {
      const monitor = new ConnectionMonitor();
      expect(monitor.retryCount).toBe(0);
    });

    it("starts with zero next retry time", () => {
      const monitor = new ConnectionMonitor();
      expect(monitor.nextRetryIn).toBe(0);
    });

    it("starts with null last disconnected at", () => {
      const monitor = new ConnectionMonitor();
      expect(monitor.lastDisconnectedAt).toBeNull();
    });
  });

  describe("state getter", () => {
    it("returns complete state object", () => {
      const monitor = new ConnectionMonitor();
      const state = monitor.state;
      expect(state).toHaveProperty("status");
      expect(state).toHaveProperty("retryCount");
      expect(state).toHaveProperty("nextRetryIn");
      expect(state).toHaveProperty("lastDisconnectedAt");
    });
  });

  describe("onConnected", () => {
    it("sets status to connected", () => {
      const monitor = new ConnectionMonitor();
      monitor.onConnected();
      expect(monitor.status).toBe("connected");
    });

    it("resets retry count", () => {
      const monitor = new ConnectionMonitor();
      monitor.onDisconnected();
      monitor.onConnected();
      expect(monitor.retryCount).toBe(0);
    });

    it("calls onReconnectSuccess callback", () => {
      let called = false;
      const monitor = new ConnectionMonitor({
        onReconnectSuccess: () => {
          called = true;
        },
      });
      monitor.onConnected();
      expect(called).toBe(true);
    });

    it("calls onStatusChange callback", () => {
      let lastStatus: ConnectionStatus | null = null;
      const monitor = new ConnectionMonitor({
        onStatusChange: (status) => {
          lastStatus = status;
        },
      });
      monitor.onConnected();
      expect(lastStatus).toBe("connected" as any);
    });
  });

  describe("onDisconnected", () => {
    it("sets status to disconnected initially", () => {
      const monitor = new ConnectionMonitor();
      monitor.onConnected();
      monitor.onDisconnected();
      // Will immediately transition to reconnecting
      expect(["disconnected", "reconnecting"]).toContain(monitor.status);
    });

    it("records last disconnected time when coming from connected", () => {
      const monitor = new ConnectionMonitor();
      monitor.onConnected();
      monitor.onDisconnected();
      expect(monitor.lastDisconnectedAt).toBeInstanceOf(Date);
    });
  });

  describe("manualReconnect", () => {
    it("resets retry count", () => {
      const monitor = new ConnectionMonitor();
      monitor.onDisconnected();
      monitor.manualReconnect();
      expect(monitor.retryCount).toBe(0);
    });

    it("sets status to reconnecting", () => {
      const monitor = new ConnectionMonitor();
      monitor.manualReconnect();
      expect(monitor.status).toBe("reconnecting");
    });

    it("resets next retry time", () => {
      const monitor = new ConnectionMonitor();
      monitor.manualReconnect();
      expect(monitor.nextRetryIn).toBe(0);
    });
  });

  describe("cancel", () => {
    it("sets status to disconnected", () => {
      const monitor = new ConnectionMonitor();
      monitor.onDisconnected();
      monitor.cancel();
      expect(monitor.status).toBe("disconnected");
    });

    it("resets next retry time", () => {
      const monitor = new ConnectionMonitor();
      monitor.cancel();
      expect(monitor.nextRetryIn).toBe(0);
    });
  });

  describe("reset", () => {
    it("resets all state", () => {
      const monitor = new ConnectionMonitor();
      monitor.onDisconnected();
      monitor.reset();
      expect(monitor.status).toBe("disconnected");
      expect(monitor.retryCount).toBe(0);
      expect(monitor.nextRetryIn).toBe(0);
      expect(monitor.lastDisconnectedAt).toBeNull();
    });
  });

  describe("destroy", () => {
    it("clears timers without throwing", () => {
      const monitor = new ConnectionMonitor();
      monitor.onDisconnected();
      expect(() => monitor.destroy()).not.toThrow();
    });
  });
});

// ============================================
// createConnectionMonitor Factory Tests
// ============================================

describe("createConnectionMonitor", () => {
  it("creates a ConnectionMonitor instance", () => {
    const monitor = createConnectionMonitor();
    expect(monitor).toBeInstanceOf(ConnectionMonitor);
  });

  it("accepts options", () => {
    const monitor = createConnectionMonitor({
      maxRetries: 5,
    });
    expect(monitor).toBeInstanceOf(ConnectionMonitor);
  });
});

// ============================================
// Type Tests
// ============================================

describe("ConnectionStatus Type", () => {
  it("supports all status values", () => {
    const statuses: ConnectionStatus[] = ["connected", "disconnected", "reconnecting", "failed"];
    expect(statuses.length).toBe(4);
  });
});

describe("ConnectionMonitorOptions Type", () => {
  it("all fields are optional", () => {
    const options: ConnectionMonitorOptions = {};
    expect(options.initialBackoff).toBeUndefined();
  });

  it("supports all options", () => {
    const options: ConnectionMonitorOptions = {
      initialBackoff: 500,
      maxBackoff: 16000,
      backoffMultiplier: 1.5,
      maxRetries: 5,
      onStatusChange: () => {},
      onReconnectSuccess: () => {},
      onReconnectFailed: () => {},
    };
    expect(options.initialBackoff).toBe(500);
    expect(options.maxRetries).toBe(5);
  });
});

describe("ConnectionMonitorState Type", () => {
  it("has correct shape", () => {
    const state: ConnectionMonitorState = {
      status: "connected",
      retryCount: 0,
      nextRetryIn: 0,
      lastDisconnectedAt: null,
    };
    expect(state.status).toBe("connected");
  });
});

// ============================================
// Callback Tests
// ============================================

describe("Callbacks", () => {
  it("onStatusChange receives status and retry count", () => {
    let receivedStatus: ConnectionStatus | null = null;
    let receivedRetryCount: number | null = null;
    const monitor = new ConnectionMonitor({
      onStatusChange: (status, retryCount) => {
        receivedStatus = status;
        receivedRetryCount = retryCount;
      },
    });
    monitor.onConnected();
    expect(receivedStatus).toBe("connected" as any);
    expect(receivedRetryCount).toBe(0 as any);
  });

  it("onReconnectSuccess is called on connection", () => {
    let called = false;
    const monitor = new ConnectionMonitor({
      onReconnectSuccess: () => {
        called = true;
      },
    });
    monitor.onConnected();
    expect(called).toBe(true);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles rapid connect/disconnect cycles", () => {
    const monitor = new ConnectionMonitor();
    monitor.onConnected();
    monitor.onDisconnected();
    monitor.onConnected();
    monitor.onDisconnected();
    monitor.onConnected();
    expect(monitor.status).toBe("connected");
  });

  it("handles disconnect before connect", () => {
    const monitor = new ConnectionMonitor();
    monitor.onDisconnected();
    expect(["disconnected", "reconnecting"]).toContain(monitor.status);
  });

  it("handles multiple manual reconnect calls", () => {
    const monitor = new ConnectionMonitor();
    monitor.manualReconnect();
    monitor.manualReconnect();
    monitor.manualReconnect();
    expect(monitor.retryCount).toBe(0);
  });

  it("handles destroy while reconnecting", () => {
    const monitor = new ConnectionMonitor();
    monitor.onDisconnected();
    expect(() => monitor.destroy()).not.toThrow();
  });

  it("handles options with zero initial backoff", () => {
    const delay = calculateBackoff(0, 0, 32000, 2);
    expect(delay).toBe(0);
  });

  it("handles options with negative values", () => {
    // Should handle gracefully (Math.min/pow still work)
    const delay = calculateBackoff(0, -100, 32000, 2);
    expect(delay).toBe(-100);
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
  it("exports calculateBackoff function", async () => {
    const module = await import("./connection-monitor.js");
    expect(typeof module.calculateBackoff).toBe("function");
  });

  it("exports getBackoffSequence function", async () => {
    const module = await import("./connection-monitor.js");
    expect(typeof module.getBackoffSequence).toBe("function");
  });

  it("exports DEFAULT_OPTIONS", async () => {
    const module = await import("./connection-monitor.js");
    expect(typeof module.DEFAULT_OPTIONS).toBe("object");
  });

  it("exports ConnectionMonitor class", async () => {
    const module = await import("./connection-monitor.js");
    expect(typeof module.ConnectionMonitor).toBe("function");
  });

  it("exports createConnectionMonitor factory", async () => {
    const module = await import("./connection-monitor.js");
    expect(typeof module.createConnectionMonitor).toBe("function");
  });

  it("exports default as ConnectionMonitor", async () => {
    const module = await import("./connection-monitor.js");
    expect(module.default).toBe(module.ConnectionMonitor);
  });
});
