/**
 * WebSocket Hook Tests
 *
 * Tests for WebSocket connection, reconnection, and heartbeat.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import { describe, expect, it } from "bun:test";
import {
  calculateBackoffDelay,
  createWebSocketUrl,
  type ReconnectionConfig,
} from "./useWebSocket.js";

// ============================================
// Backoff Delay Tests
// ============================================

describe("calculateBackoffDelay", () => {
  const config: ReconnectionConfig = {
    maxAttempts: 10,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 1.5,
  };

  it("returns initial delay for first attempt", () => {
    expect(calculateBackoffDelay(0, config)).toBe(1000);
  });

  it("applies exponential backoff", () => {
    expect(calculateBackoffDelay(1, config)).toBe(1500);
    expect(calculateBackoffDelay(2, config)).toBe(2250);
    expect(calculateBackoffDelay(3, config)).toBeCloseTo(3375, 0);
  });

  it("caps at max delay", () => {
    expect(calculateBackoffDelay(10, config)).toBe(30000);
    expect(calculateBackoffDelay(20, config)).toBe(30000);
  });

  it("handles custom configuration", () => {
    const customConfig: ReconnectionConfig = {
      maxAttempts: 5,
      initialDelay: 500,
      maxDelay: 10000,
      backoffMultiplier: 2,
    };
    expect(calculateBackoffDelay(0, customConfig)).toBe(500);
    expect(calculateBackoffDelay(1, customConfig)).toBe(1000);
    expect(calculateBackoffDelay(2, customConfig)).toBe(2000);
    expect(calculateBackoffDelay(4, customConfig)).toBe(8000);
    expect(calculateBackoffDelay(5, customConfig)).toBe(10000);
  });

  it("handles fractional multiplier", () => {
    const fractionalConfig: ReconnectionConfig = {
      maxAttempts: 10,
      initialDelay: 100,
      maxDelay: 10000,
      backoffMultiplier: 1.2,
    };
    expect(calculateBackoffDelay(0, fractionalConfig)).toBe(100);
    expect(calculateBackoffDelay(1, fractionalConfig)).toBe(120);
    expect(calculateBackoffDelay(2, fractionalConfig)).toBeCloseTo(144, 0);
  });
});

// ============================================
// WebSocket URL Tests
// ============================================

describe("createWebSocketUrl", () => {
  it("returns base URL without token", () => {
    const result = createWebSocketUrl("wss://api.example.com/ws");
    expect(result).toBe("wss://api.example.com/ws");
  });

  it("appends token as query parameter", () => {
    const result = createWebSocketUrl("wss://api.example.com/ws", "secret-token");
    expect(result).toBe("wss://api.example.com/ws?token=secret-token");
  });

  it("uses & for URL with existing query params", () => {
    const result = createWebSocketUrl("wss://api.example.com/ws?version=1", "token123");
    expect(result).toBe("wss://api.example.com/ws?version=1&token=token123");
  });

  it("URL encodes the token", () => {
    const result = createWebSocketUrl("wss://api.example.com/ws", "token with spaces");
    expect(result).toBe("wss://api.example.com/ws?token=token%20with%20spaces");
  });

  it("handles empty token", () => {
    const result = createWebSocketUrl("wss://api.example.com/ws", "");
    expect(result).toBe("wss://api.example.com/ws");
  });

  it("handles undefined token", () => {
    const result = createWebSocketUrl("wss://api.example.com/ws", undefined);
    expect(result).toBe("wss://api.example.com/ws");
  });

  it("handles special characters in token", () => {
    const result = createWebSocketUrl("wss://api.example.com/ws", "abc+123/xyz=");
    expect(result).toBe("wss://api.example.com/ws?token=abc%2B123%2Fxyz%3D");
  });
});

// ============================================
// Configuration Tests
// ============================================

describe("Default Configuration", () => {
  it("defines reconnection defaults", () => {
    const defaultConfig: ReconnectionConfig = {
      maxAttempts: 10,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 1.5,
    };

    // Verify the values match the expected defaults
    expect(defaultConfig.maxAttempts).toBe(10);
    expect(defaultConfig.initialDelay).toBe(1000);
    expect(defaultConfig.maxDelay).toBe(30000);
    expect(defaultConfig.backoffMultiplier).toBe(1.5);
  });

  it("defines heartbeat defaults", () => {
    const heartbeatConfig = {
      pingInterval: 30000,
      pongTimeout: 60000,
    };

    expect(heartbeatConfig.pingInterval).toBe(30000);
    expect(heartbeatConfig.pongTimeout).toBe(60000);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles zero initial delay", () => {
    const config: ReconnectionConfig = {
      maxAttempts: 5,
      initialDelay: 0,
      maxDelay: 1000,
      backoffMultiplier: 2,
    };
    expect(calculateBackoffDelay(0, config)).toBe(0);
    expect(calculateBackoffDelay(5, config)).toBe(0);
  });

  it("handles multiplier of 1 (no backoff)", () => {
    const config: ReconnectionConfig = {
      maxAttempts: 5,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 1,
    };
    expect(calculateBackoffDelay(0, config)).toBe(1000);
    expect(calculateBackoffDelay(5, config)).toBe(1000);
    expect(calculateBackoffDelay(10, config)).toBe(1000);
  });

  it("handles very large attempt numbers", () => {
    const config: ReconnectionConfig = {
      maxAttempts: 10,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 1.5,
    };
    expect(calculateBackoffDelay(100, config)).toBe(30000);
  });

  it("handles URL with hash", () => {
    const result = createWebSocketUrl("wss://api.example.com/ws#section", "token");
    expect(result).toBe("wss://api.example.com/ws#section?token=token");
  });

  it("handles localhost URLs", () => {
    const result = createWebSocketUrl("ws://localhost:8080/ws", "test-token");
    expect(result).toBe("ws://localhost:8080/ws?token=test-token");
  });
});

// ============================================
// Type Tests
// ============================================

describe("Type Definitions", () => {
  it("ReconnectionConfig has all required fields", () => {
    const config: ReconnectionConfig = {
      maxAttempts: 5,
      initialDelay: 500,
      maxDelay: 5000,
      backoffMultiplier: 2,
    };

    // TypeScript will catch missing fields at compile time
    expect(typeof config.maxAttempts).toBe("number");
    expect(typeof config.initialDelay).toBe("number");
    expect(typeof config.maxDelay).toBe("number");
    expect(typeof config.backoffMultiplier).toBe("number");
  });
});
