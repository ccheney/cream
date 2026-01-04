/**
 * WebSocket Logger Tests
 *
 * Tests for structured WebSocket logging.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import { describe, expect, it } from "bun:test";
import {
  createWebSocketLogger,
  generateCorrelationId,
  shouldLog,
  getTimestamp,
  truncateMessage,
  LOG_LEVEL_PRIORITY,
  DEFAULT_LOGGER_CONFIG,
  type LogLevel,
  type WebSocketEventType,
  type LogEntry,
  type LoggerConfig,
} from "./logger";

// ============================================
// Utility Function Tests
// ============================================

describe("generateCorrelationId", () => {
  it("generates string starting with ws-", () => {
    const id = generateCorrelationId();
    expect(id.startsWith("ws-")).toBe(true);
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateCorrelationId());
    }
    expect(ids.size).toBe(100);
  });

  it("includes timestamp component", () => {
    const id = generateCorrelationId();
    const parts = id.split("-");
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });
});

describe("shouldLog", () => {
  it("logs when level >= minLevel", () => {
    expect(shouldLog("error", "debug")).toBe(true);
    expect(shouldLog("warn", "debug")).toBe(true);
    expect(shouldLog("info", "debug")).toBe(true);
    expect(shouldLog("debug", "debug")).toBe(true);
  });

  it("does not log when level < minLevel", () => {
    expect(shouldLog("debug", "info")).toBe(false);
    expect(shouldLog("debug", "warn")).toBe(false);
    expect(shouldLog("debug", "error")).toBe(false);
  });

  it("info level includes info, warn, error", () => {
    expect(shouldLog("info", "info")).toBe(true);
    expect(shouldLog("warn", "info")).toBe(true);
    expect(shouldLog("error", "info")).toBe(true);
  });
});

describe("getTimestamp", () => {
  it("returns ISO format string", () => {
    const ts = getTimestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("includes milliseconds", () => {
    const ts = getTimestamp();
    expect(ts).toContain(".");
  });

  it("ends with Z (UTC)", () => {
    const ts = getTimestamp();
    expect(ts.endsWith("Z")).toBe(true);
  });
});

describe("truncateMessage", () => {
  it("returns original if under limit", () => {
    const msg = "short message";
    expect(truncateMessage(msg, 100)).toBe(msg);
  });

  it("truncates long messages", () => {
    const msg = "a".repeat(100);
    const truncated = truncateMessage(msg, 50);
    expect(truncated.length).toBeLessThan(msg.length);
  });

  it("adds truncated suffix", () => {
    const msg = "a".repeat(100);
    const truncated = truncateMessage(msg, 50);
    expect(truncated).toContain("[truncated]");
  });
});

// ============================================
// Constants Tests
// ============================================

describe("LOG_LEVEL_PRIORITY", () => {
  it("debug has lowest priority", () => {
    expect(LOG_LEVEL_PRIORITY.debug).toBe(0);
  });

  it("error has highest priority", () => {
    expect(LOG_LEVEL_PRIORITY.error).toBe(3);
  });

  it("priorities are ordered correctly", () => {
    expect(LOG_LEVEL_PRIORITY.debug).toBeLessThan(LOG_LEVEL_PRIORITY.info);
    expect(LOG_LEVEL_PRIORITY.info).toBeLessThan(LOG_LEVEL_PRIORITY.warn);
    expect(LOG_LEVEL_PRIORITY.warn).toBeLessThan(LOG_LEVEL_PRIORITY.error);
  });
});

describe("DEFAULT_LOGGER_CONFIG", () => {
  it("has info level by default", () => {
    expect(DEFAULT_LOGGER_CONFIG.level).toBe("info");
  });

  it("is enabled by default", () => {
    expect(DEFAULT_LOGGER_CONFIG.enabled).toBe(true);
  });

  it("is not pretty by default", () => {
    expect(DEFAULT_LOGGER_CONFIG.pretty).toBe(false);
  });

  it("does not include raw messages by default", () => {
    expect(DEFAULT_LOGGER_CONFIG.includeRawMessages).toBe(false);
  });

  it("has 500 char max raw message length", () => {
    expect(DEFAULT_LOGGER_CONFIG.maxRawMessageLength).toBe(500);
  });
});

// ============================================
// Logger Creation Tests
// ============================================

describe("createWebSocketLogger", () => {
  it("creates logger with default config", () => {
    const logger = createWebSocketLogger();
    expect(logger.config.level).toBe("info");
    expect(logger.config.enabled).toBe(true);
  });

  it("accepts custom config", () => {
    const logger = createWebSocketLogger({ level: "debug", pretty: true });
    expect(logger.config.level).toBe("debug");
    expect(logger.config.pretty).toBe(true);
  });

  it("has setLevel method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.setLevel).toBe("function");
  });

  it("setLevel changes level", () => {
    const logger = createWebSocketLogger();
    logger.setLevel("debug");
    expect(logger.config.level).toBe("debug");
  });
});

// ============================================
// Connection Lifecycle Methods Tests
// ============================================

describe("Logger Connection Methods", () => {
  it("has connectionAttempt method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.connectionAttempt).toBe("function");
  });

  it("has connectionSuccess method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.connectionSuccess).toBe("function");
  });

  it("has connectionFailure method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.connectionFailure).toBe("function");
  });

  it("has connectionClose method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.connectionClose).toBe("function");
  });

  it("has reconnectAttempt method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.reconnectAttempt).toBe("function");
  });
});

// ============================================
// Message Methods Tests
// ============================================

describe("Logger Message Methods", () => {
  it("has messageReceived method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.messageReceived).toBe("function");
  });

  it("has messageSent method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.messageSent).toBe("function");
  });

  it("has messageInvalid method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.messageInvalid).toBe("function");
  });
});

// ============================================
// Subscription Methods Tests
// ============================================

describe("Logger Subscription Methods", () => {
  it("has channelSubscribe method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.channelSubscribe).toBe("function");
  });

  it("has channelUnsubscribe method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.channelUnsubscribe).toBe("function");
  });

  it("has symbolSubscribe method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.symbolSubscribe).toBe("function");
  });

  it("has symbolUnsubscribe method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.symbolUnsubscribe).toBe("function");
  });

  it("has authFailure method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.authFailure).toBe("function");
  });
});

// ============================================
// Other Methods Tests
// ============================================

describe("Logger Other Methods", () => {
  it("has rateLimitExceeded method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.rateLimitExceeded).toBe("function");
  });

  it("has broadcastError method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.broadcastError).toBe("function");
  });

  it("has heartbeatPing method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.heartbeatPing).toBe("function");
  });

  it("has heartbeatPong method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.heartbeatPong).toBe("function");
  });

  it("has heartbeatTimeout method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.heartbeatTimeout).toBe("function");
  });

  it("has log method", () => {
    const logger = createWebSocketLogger();
    expect(typeof logger.log).toBe("function");
  });
});

// ============================================
// Type Tests
// ============================================

describe("LogLevel Type", () => {
  it("includes debug", () => {
    const level: LogLevel = "debug";
    expect(level).toBe("debug");
  });

  it("includes info", () => {
    const level: LogLevel = "info";
    expect(level).toBe("info");
  });

  it("includes warn", () => {
    const level: LogLevel = "warn";
    expect(level).toBe("warn");
  });

  it("includes error", () => {
    const level: LogLevel = "error";
    expect(level).toBe("error");
  });
});

describe("WebSocketEventType Type", () => {
  it("includes connection events", () => {
    const events: WebSocketEventType[] = [
      "connection.attempt",
      "connection.success",
      "connection.failure",
      "connection.close",
      "connection.reconnect",
    ];
    expect(events.length).toBe(5);
  });

  it("includes message events", () => {
    const events: WebSocketEventType[] = [
      "message.received",
      "message.sent",
      "message.invalid",
    ];
    expect(events.length).toBe(3);
  });

  it("includes subscribe events", () => {
    const events: WebSocketEventType[] = [
      "subscribe.channel",
      "subscribe.symbol",
      "unsubscribe.channel",
      "unsubscribe.symbol",
    ];
    expect(events.length).toBe(4);
  });

  it("includes heartbeat events", () => {
    const events: WebSocketEventType[] = [
      "heartbeat.ping",
      "heartbeat.pong",
      "heartbeat.timeout",
    ];
    expect(events.length).toBe(3);
  });
});

describe("LogEntry Type", () => {
  it("has required fields", () => {
    const entry: LogEntry = {
      timestamp: "2026-01-04T12:00:00.000Z",
      level: "info",
      event: "connection.success",
      correlationId: "ws-123-abc",
      message: "Test message",
    };
    expect(entry.timestamp).toBeDefined();
    expect(entry.level).toBeDefined();
    expect(entry.event).toBeDefined();
    expect(entry.correlationId).toBeDefined();
    expect(entry.message).toBeDefined();
  });

  it("has optional connectionId", () => {
    const entry: LogEntry = {
      timestamp: "2026-01-04T12:00:00.000Z",
      level: "info",
      event: "connection.success",
      correlationId: "ws-123",
      connectionId: "conn-456",
      message: "Test",
    };
    expect(entry.connectionId).toBe("conn-456");
  });

  it("has optional userId", () => {
    const entry: LogEntry = {
      timestamp: "2026-01-04T12:00:00.000Z",
      level: "info",
      event: "connection.success",
      correlationId: "ws-123",
      userId: "user-789",
      message: "Test",
    };
    expect(entry.userId).toBe("user-789");
  });

  it("has optional metadata", () => {
    const entry: LogEntry = {
      timestamp: "2026-01-04T12:00:00.000Z",
      level: "info",
      event: "message.received",
      correlationId: "ws-123",
      message: "Test",
      metadata: { type: "subscribe", size: 128 },
    };
    expect(entry.metadata?.type).toBe("subscribe");
    expect(entry.metadata?.size).toBe(128);
  });
});

describe("LoggerConfig Type", () => {
  it("has all required fields", () => {
    const config: LoggerConfig = {
      level: "info",
      enabled: true,
      pretty: false,
      includeRawMessages: false,
      maxRawMessageLength: 500,
    };
    expect(config.level).toBe("info");
    expect(config.enabled).toBe(true);
    expect(config.pretty).toBe(false);
    expect(config.includeRawMessages).toBe(false);
    expect(config.maxRawMessageLength).toBe(500);
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
  it("exports createWebSocketLogger", async () => {
    const module = await import("./logger");
    expect(typeof module.createWebSocketLogger).toBe("function");
  });

  it("exports default as createWebSocketLogger", async () => {
    const module = await import("./logger");
    expect(module.default).toBe(module.createWebSocketLogger);
  });

  it("exports utility functions", async () => {
    const module = await import("./logger");
    expect(typeof module.generateCorrelationId).toBe("function");
    expect(typeof module.shouldLog).toBe("function");
    expect(typeof module.getTimestamp).toBe("function");
    expect(typeof module.truncateMessage).toBe("function");
  });

  it("exports constants", async () => {
    const module = await import("./logger");
    expect(module.LOG_LEVEL_PRIORITY).toBeDefined();
    expect(module.DEFAULT_LOGGER_CONFIG).toBeDefined();
  });
});
