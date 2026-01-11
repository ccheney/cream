/**
 * Event Types Tests
 *
 * Tests for event type definitions and schemas.
 *
 * @see docs/plans/ui/08-realtime.md
 */

import { describe, expect, it } from "bun:test";
import {
  BaseEventSchema,
  type BroadcastEvent,
  type BroadcastTarget,
  DecisionInsertEventSchema,
  type EventPublisherConfig,
  type EventSource,
  type GrpcConfig,
  HealthCheckEventSchema,
  MastraAgentEventSchema,
  MastraCycleEventSchema,
  OrderUpdateEventSchema,
  type PublisherStats,
  QuoteStreamEventSchema,
  REDIS_CHANNELS,
  type RedisConfig,
  type SourceState,
  type SourceStatus,
  SystemAlertEventSchema,
  type TursoCdcConfig,
} from "./types";

// ============================================
// Event Source Type Tests
// ============================================

describe("EventSource Type", () => {
  it("includes redis", () => {
    const source: EventSource = "redis";
    expect(source).toBe("redis");
  });

  it("includes grpc", () => {
    const source: EventSource = "grpc";
    expect(source).toBe("grpc");
  });

  it("includes turso", () => {
    const source: EventSource = "turso";
    expect(source).toBe("turso");
  });

  it("includes internal", () => {
    const source: EventSource = "internal";
    expect(source).toBe("internal");
  });
});

describe("SourceStatus Type", () => {
  it("includes connecting", () => {
    const status: SourceStatus = "connecting";
    expect(status).toBe("connecting");
  });

  it("includes connected", () => {
    const status: SourceStatus = "connected";
    expect(status).toBe("connected");
  });

  it("includes disconnected", () => {
    const status: SourceStatus = "disconnected";
    expect(status).toBe("disconnected");
  });

  it("includes error", () => {
    const status: SourceStatus = "error";
    expect(status).toBe("error");
  });
});

// ============================================
// Redis Channels Tests
// ============================================

describe("REDIS_CHANNELS", () => {
  it("has CYCLE channel pattern", () => {
    expect(REDIS_CHANNELS.CYCLE).toBe("mastra:cycle:*");
  });

  it("has AGENT channel pattern", () => {
    expect(REDIS_CHANNELS.AGENT).toBe("mastra:agent:*");
  });

  it("has ALERT channel pattern", () => {
    expect(REDIS_CHANNELS.ALERT).toBe("system:alert:*");
  });
});

// ============================================
// BaseEvent Schema Tests
// ============================================

describe("BaseEventSchema", () => {
  it("validates valid event", () => {
    const event = {
      id: "evt-123",
      source: "redis",
      type: "cycle.started",
      timestamp: "2026-01-04T12:00:00.000Z",
      payload: { data: "test" },
    };
    const result = BaseEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("requires id field", () => {
    const event = {
      source: "redis",
      type: "test",
      timestamp: "2026-01-04T12:00:00.000Z",
      payload: {},
    };
    const result = BaseEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("validates source enum", () => {
    const validSources = ["redis", "grpc", "turso", "internal"];
    for (const source of validSources) {
      const event = {
        id: "evt-123",
        source,
        type: "test",
        timestamp: "2026-01-04T12:00:00.000Z",
        payload: {},
      };
      const result = BaseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid source", () => {
    const event = {
      id: "evt-123",
      source: "unknown",
      type: "test",
      timestamp: "2026-01-04T12:00:00.000Z",
      payload: {},
    };
    const result = BaseEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

// ============================================
// MastraCycleEvent Schema Tests
// ============================================

describe("MastraCycleEventSchema", () => {
  it("validates valid cycle event", () => {
    const event = {
      cycleId: "cycle-123",
      phase: "observe",
      status: "started",
      timestamp: "2026-01-04T12:00:00.000Z",
    };
    const result = MastraCycleEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("validates all phases", () => {
    const phases = ["observe", "orient", "decide", "act", "complete"];
    for (const phase of phases) {
      const event = {
        cycleId: "cycle-123",
        phase,
        status: "started",
        timestamp: "2026-01-04T12:00:00.000Z",
      };
      const result = MastraCycleEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it("validates all statuses", () => {
    const statuses = ["started", "progress", "completed", "failed"];
    for (const status of statuses) {
      const event = {
        cycleId: "cycle-123",
        phase: "observe",
        status,
        timestamp: "2026-01-04T12:00:00.000Z",
      };
      const result = MastraCycleEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it("allows optional progress", () => {
    const event = {
      cycleId: "cycle-123",
      phase: "orient",
      status: "progress",
      progress: 50,
      timestamp: "2026-01-04T12:00:00.000Z",
    };
    const result = MastraCycleEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.progress).toBe(50);
    }
  });

  it("validates progress range (0-100)", () => {
    const invalidProgress = [-1, 101, 200];
    for (const progress of invalidProgress) {
      const event = {
        cycleId: "cycle-123",
        phase: "orient",
        status: "progress",
        progress,
        timestamp: "2026-01-04T12:00:00.000Z",
      };
      const result = MastraCycleEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    }
  });
});

// ============================================
// MastraAgentEvent Schema Tests
// ============================================

describe("MastraAgentEventSchema", () => {
  it("validates valid agent event", () => {
    const event = {
      cycleId: "cycle-123",
      agentType: "sentiment",
      status: "started",
      timestamp: "2026-01-04T12:00:00.000Z",
    };
    const result = MastraAgentEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("validates all agent types", () => {
    const agentTypes = [
      "sentiment",
      "fundamentals",
      "bullish",
      "bearish",
      "trader",
      "risk",
      "critic",
    ];
    for (const agentType of agentTypes) {
      const event = {
        cycleId: "cycle-123",
        agentType,
        status: "complete",
        timestamp: "2026-01-04T12:00:00.000Z",
      };
      const result = MastraAgentEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it("validates all statuses", () => {
    const statuses = ["started", "thinking", "complete", "error"];
    for (const status of statuses) {
      const event = {
        cycleId: "cycle-123",
        agentType: "trader",
        status,
        timestamp: "2026-01-04T12:00:00.000Z",
      };
      const result = MastraAgentEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it("allows optional output and reasoning", () => {
    const event = {
      cycleId: "cycle-123",
      agentType: "trader",
      status: "complete",
      output: { recommendation: "BUY" },
      reasoning: "Strong technical signals",
      timestamp: "2026-01-04T12:00:00.000Z",
    };
    const result = MastraAgentEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });
});

// ============================================
// QuoteStreamEvent Schema Tests
// ============================================

describe("QuoteStreamEventSchema", () => {
  it("validates valid quote event", () => {
    const event = {
      symbol: "AAPL",
      bid: 185.0,
      ask: 185.05,
      timestamp: "2026-01-04T12:00:00.000Z",
    };
    const result = QuoteStreamEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("allows optional fields", () => {
    const event = {
      symbol: "AAPL",
      bid: 185.0,
      ask: 185.05,
      bidSize: 100,
      askSize: 200,
      last: 185.02,
      lastSize: 50,
      volume: 1000000,
      timestamp: "2026-01-04T12:00:00.000Z",
    };
    const result = QuoteStreamEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("requires symbol", () => {
    const event = {
      bid: 185.0,
      ask: 185.05,
      timestamp: "2026-01-04T12:00:00.000Z",
    };
    const result = QuoteStreamEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

// ============================================
// OrderUpdateEvent Schema Tests
// ============================================

describe("OrderUpdateEventSchema", () => {
  it("validates valid order event", () => {
    const event = {
      orderId: "order-123",
      symbol: "AAPL",
      side: "BUY",
      type: "limit",
      quantity: 100,
      filledQuantity: 50,
      price: 185.0,
      status: "partially_filled",
      timestamp: "2026-01-04T12:00:00.000Z",
    };
    const result = OrderUpdateEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("validates all sides", () => {
    const sides = ["BUY", "SELL"];
    for (const side of sides) {
      const event = {
        orderId: "order-123",
        symbol: "AAPL",
        side,
        type: "market",
        quantity: 100,
        filledQuantity: 0,
        status: "pending",
        timestamp: "2026-01-04T12:00:00.000Z",
      };
      const result = OrderUpdateEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it("validates all order types", () => {
    const types = ["market", "limit", "stop", "stop_limit"];
    for (const type of types) {
      const event = {
        orderId: "order-123",
        symbol: "AAPL",
        side: "BUY",
        type,
        quantity: 100,
        filledQuantity: 0,
        status: "pending",
        timestamp: "2026-01-04T12:00:00.000Z",
      };
      const result = OrderUpdateEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it("validates all statuses", () => {
    const statuses = [
      "pending",
      "open",
      "partially_filled",
      "filled",
      "cancelled",
      "rejected",
      "expired",
    ];
    for (const status of statuses) {
      const event = {
        orderId: "order-123",
        symbol: "AAPL",
        side: "BUY",
        type: "limit",
        quantity: 100,
        filledQuantity: 0,
        status,
        timestamp: "2026-01-04T12:00:00.000Z",
      };
      const result = OrderUpdateEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });
});

// ============================================
// DecisionInsertEvent Schema Tests
// ============================================

describe("DecisionInsertEventSchema", () => {
  it("validates valid decision event", () => {
    const event = {
      decisionId: "dec-123",
      cycleId: "cycle-123",
      symbol: "AAPL",
      action: "BUY",
      direction: "LONG",
      confidence: 0.85,
      createdAt: "2026-01-04T12:00:00.000Z",
    };
    const result = DecisionInsertEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("validates all actions", () => {
    const actions = ["BUY", "SELL", "HOLD", "CLOSE"];
    for (const action of actions) {
      const event = {
        decisionId: "dec-123",
        cycleId: "cycle-123",
        symbol: "AAPL",
        action,
        direction: "LONG",
        confidence: 0.5,
        createdAt: "2026-01-04T12:00:00.000Z",
      };
      const result = DecisionInsertEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it("validates all directions", () => {
    const directions = ["LONG", "SHORT", "FLAT"];
    for (const direction of directions) {
      const event = {
        decisionId: "dec-123",
        cycleId: "cycle-123",
        symbol: "AAPL",
        action: "BUY",
        direction,
        confidence: 0.5,
        createdAt: "2026-01-04T12:00:00.000Z",
      };
      const result = DecisionInsertEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it("validates confidence range (0-1)", () => {
    const invalidConfidence = [-0.1, 1.1, 2];
    for (const confidence of invalidConfidence) {
      const event = {
        decisionId: "dec-123",
        cycleId: "cycle-123",
        symbol: "AAPL",
        action: "BUY",
        direction: "LONG",
        confidence,
        createdAt: "2026-01-04T12:00:00.000Z",
      };
      const result = DecisionInsertEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    }
  });
});

// ============================================
// SystemAlertEvent Schema Tests
// ============================================

describe("SystemAlertEventSchema", () => {
  it("validates valid alert event", () => {
    const event = {
      alertId: "alert-123",
      severity: "warning",
      title: "High Latency",
      message: "Broker response time exceeded threshold",
      timestamp: "2026-01-04T12:00:00.000Z",
    };
    const result = SystemAlertEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("validates all severities", () => {
    const severities = ["info", "warning", "error", "critical"];
    for (const severity of severities) {
      const event = {
        alertId: "alert-123",
        severity,
        title: "Test Alert",
        message: "Test message",
        timestamp: "2026-01-04T12:00:00.000Z",
      };
      const result = SystemAlertEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it("allows optional source", () => {
    const event = {
      alertId: "alert-123",
      severity: "info",
      title: "Test Alert",
      message: "Test message",
      source: "broker-adapter",
      timestamp: "2026-01-04T12:00:00.000Z",
    };
    const result = SystemAlertEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });
});

// ============================================
// HealthCheckEvent Schema Tests
// ============================================

describe("HealthCheckEventSchema", () => {
  it("validates valid health event", () => {
    const event = {
      status: "healthy",
      version: "0.1.0",
      uptime: 3600,
      connections: 42,
      sources: {
        redis: "connected",
        grpc: "connected",
      },
      timestamp: "2026-01-04T12:00:00.000Z",
    };
    const result = HealthCheckEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("validates all status values", () => {
    const statuses = ["healthy", "degraded", "unhealthy"];
    for (const status of statuses) {
      const event = {
        status,
        version: "0.1.0",
        uptime: 3600,
        connections: 42,
        sources: {},
        timestamp: "2026-01-04T12:00:00.000Z",
      };
      const result = HealthCheckEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });
});

// ============================================
// Configuration Type Tests
// ============================================

describe("RedisConfig Type", () => {
  it("has required url field", () => {
    const config: RedisConfig = {
      url: "redis://localhost:6379",
    };
    expect(config.url).toBeDefined();
  });

  it("has optional fields", () => {
    const config: RedisConfig = {
      url: "redis://localhost:6379",
      password: "secret",
      db: 1,
      maxRetries: 3,
      retryDelayMs: 1000,
    };
    expect(config.password).toBe("secret");
    expect(config.db).toBe(1);
  });
});

describe("GrpcConfig Type", () => {
  it("has required host and port", () => {
    const config: GrpcConfig = {
      host: "localhost",
      port: 50051,
    };
    expect(config.host).toBeDefined();
    expect(config.port).toBeDefined();
  });

  it("has optional fields", () => {
    const config: GrpcConfig = {
      host: "localhost",
      port: 50051,
      useTls: true,
      maxRetries: 5,
      retryDelayMs: 2000,
    };
    expect(config.useTls).toBe(true);
  });
});

describe("TursoCdcConfig Type", () => {
  it("has required fields", () => {
    const config: TursoCdcConfig = {
      pollIntervalMs: 1000,
      tables: ["decisions", "orders"],
    };
    expect(config.pollIntervalMs).toBeDefined();
    expect(config.tables).toBeDefined();
  });
});

describe("EventPublisherConfig Type", () => {
  it("allows empty config", () => {
    const config: EventPublisherConfig = {};
    expect(config).toBeDefined();
  });

  it("accepts all optional fields", () => {
    const config: EventPublisherConfig = {
      redis: { url: "redis://localhost:6379" },
      grpc: { host: "localhost", port: 50051 },
      turso: { pollIntervalMs: 1000, tables: ["decisions"] },
      enableInternalEvents: true,
    };
    expect(config.redis).toBeDefined();
    expect(config.grpc).toBeDefined();
    expect(config.turso).toBeDefined();
  });
});

// ============================================
// State Type Tests
// ============================================

describe("SourceState Type", () => {
  it("has required fields", () => {
    const state: SourceState = {
      status: "connected",
      lastEvent: new Date(),
      lastError: null,
      reconnectAttempts: 0,
    };
    expect(state.status).toBeDefined();
    expect(state.lastEvent).toBeDefined();
    expect(state.lastError).toBe(null);
  });
});

describe("PublisherStats Type", () => {
  it("has required fields", () => {
    const stats: PublisherStats = {
      eventsReceived: 100,
      eventsBroadcast: 95,
      eventsDropped: 5,
      sourceStates: {
        redis: { status: "connected", lastEvent: null, lastError: null, reconnectAttempts: 0 },
        grpc: { status: "connected", lastEvent: null, lastError: null, reconnectAttempts: 0 },
        turso: { status: "disconnected", lastEvent: null, lastError: null, reconnectAttempts: 0 },
        internal: { status: "connected", lastEvent: null, lastError: null, reconnectAttempts: 0 },
      },
    };
    expect(stats.eventsReceived).toBe(100);
    expect(stats.eventsBroadcast).toBe(95);
  });
});

// ============================================
// Broadcast Type Tests
// ============================================

describe("BroadcastTarget Type", () => {
  it("supports channel targeting", () => {
    const target: BroadcastTarget = {
      channel: "quotes",
    };
    expect(target.channel).toBe("quotes");
  });

  it("supports symbol targeting", () => {
    const target: BroadcastTarget = {
      channel: "quotes",
      symbol: "AAPL",
    };
    expect(target.symbol).toBe("AAPL");
  });

  it("supports null channel (broadcast all)", () => {
    const target: BroadcastTarget = {
      channel: null,
    };
    expect(target.channel).toBe(null);
  });
});

describe("BroadcastEvent Type", () => {
  it("has target and message", () => {
    const event: BroadcastEvent = {
      target: { channel: "orders" },
      message: {
        type: "order",
        data: {
          id: "00000000-0000-0000-0000-000000000123",
          symbol: "AAPL",
          side: "buy",
          orderType: "limit",
          status: "pending",
          quantity: 100,
          filledQty: 0,
          timestamp: "2026-01-04T12:00:00.000Z",
        },
      },
    };
    expect(event.target).toBeDefined();
    expect(event.message).toBeDefined();
  });
});
