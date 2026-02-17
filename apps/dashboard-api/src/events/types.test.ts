import { describe, expect, it } from "bun:test";
import {
	BaseEventSchema,
	type BroadcastEvent,
	type BroadcastTarget,
	type DatabaseCdcConfig,
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
} from "./types";

describe("EventSource Type", () => {
	it("includes all sources", () => {
		const sources: EventSource[] = ["redis", "grpc", "database", "internal"];
		expect(sources).toEqual(["redis", "grpc", "database", "internal"]);
	});
});

describe("SourceStatus Type", () => {
	it("includes all statuses", () => {
		const statuses: SourceStatus[] = ["connecting", "connected", "disconnected", "error"];
		expect(statuses).toEqual(["connecting", "connected", "disconnected", "error"]);
	});
});

describe("REDIS_CHANNELS", () => {
	it("has expected channel patterns", () => {
		expect(REDIS_CHANNELS.CYCLE).toBe("mastra:cycle:*");
		expect(REDIS_CHANNELS.AGENT).toBe("mastra:agent:*");
		expect(REDIS_CHANNELS.ALERT).toBe("system:alert:*");
	});
});

describe("BaseEventSchema", () => {
	it("validates valid event", () => {
		const event = {
			id: "evt-123",
			source: "redis",
			type: "cycle.started",
			timestamp: "2026-01-04T12:00:00.000Z",
			payload: { data: "test" },
		};
		expect(BaseEventSchema.safeParse(event).success).toBe(true);
	});

	it("requires id", () => {
		const event = {
			source: "redis",
			type: "test",
			timestamp: "2026-01-04T12:00:00.000Z",
			payload: {},
		};
		expect(BaseEventSchema.safeParse(event).success).toBe(false);
	});

	it("accepts valid sources and rejects invalid source", () => {
		for (const source of ["redis", "grpc", "database", "internal"]) {
			const event = {
				id: "evt-123",
				source,
				type: "test",
				timestamp: "2026-01-04T12:00:00.000Z",
				payload: {},
			};
			expect(BaseEventSchema.safeParse(event).success).toBe(true);
		}
		const invalid = {
			id: "evt-123",
			source: "unknown",
			type: "test",
			timestamp: "2026-01-04T12:00:00.000Z",
			payload: {},
		};
		expect(BaseEventSchema.safeParse(invalid).success).toBe(false);
	});
});

describe("MastraCycleEventSchema", () => {
	it("validates valid cycle event", () => {
		const event = {
			cycleId: "cycle-123",
			phase: "observe",
			status: "started",
			timestamp: "2026-01-04T12:00:00.000Z",
		};
		expect(MastraCycleEventSchema.safeParse(event).success).toBe(true);
	});

	it("accepts all phases and statuses", () => {
		for (const phase of ["observe", "orient", "decide", "act", "complete"]) {
			const event = {
				cycleId: "cycle-123",
				phase,
				status: "started",
				timestamp: "2026-01-04T12:00:00.000Z",
			};
			expect(MastraCycleEventSchema.safeParse(event).success).toBe(true);
		}
		for (const status of ["started", "progress", "completed", "failed"]) {
			const event = {
				cycleId: "cycle-123",
				phase: "observe",
				status,
				timestamp: "2026-01-04T12:00:00.000Z",
			};
			expect(MastraCycleEventSchema.safeParse(event).success).toBe(true);
		}
	});

	it("accepts optional progress and enforces range", () => {
		const valid = {
			cycleId: "cycle-123",
			phase: "orient",
			status: "progress",
			progress: 50,
			timestamp: "2026-01-04T12:00:00.000Z",
		};
		const parsed = MastraCycleEventSchema.safeParse(valid);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.progress).toBe(50);
		}
		for (const progress of [-1, 101, 200]) {
			const invalid = { ...valid, progress };
			expect(MastraCycleEventSchema.safeParse(invalid).success).toBe(false);
		}
	});
});

describe("MastraAgentEventSchema", () => {
	it("validates valid agent event", () => {
		const event = {
			cycleId: "cycle-123",
			agentType: "sentiment",
			status: "started",
			timestamp: "2026-01-04T12:00:00.000Z",
		};
		expect(MastraAgentEventSchema.safeParse(event).success).toBe(true);
	});

	it("validates all agent types and statuses", () => {
		for (const agentType of [
			"sentiment",
			"fundamentals",
			"bullish",
			"bearish",
			"trader",
			"risk",
			"critic",
		]) {
			const event = {
				cycleId: "cycle-123",
				agentType,
				status: "complete",
				timestamp: "2026-01-04T12:00:00.000Z",
			};
			expect(MastraAgentEventSchema.safeParse(event).success).toBe(true);
		}
		for (const status of ["started", "thinking", "complete", "error"]) {
			const event = {
				cycleId: "cycle-123",
				agentType: "trader",
				status,
				timestamp: "2026-01-04T12:00:00.000Z",
			};
			expect(MastraAgentEventSchema.safeParse(event).success).toBe(true);
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
		expect(MastraAgentEventSchema.safeParse(event).success).toBe(true);
	});
});

describe("QuoteStreamEventSchema", () => {
	it("validates valid quote event", () => {
		const event = {
			symbol: "AAPL",
			bid: 185.0,
			ask: 185.05,
			timestamp: "2026-01-04T12:00:00.000Z",
		};
		expect(QuoteStreamEventSchema.safeParse(event).success).toBe(true);
	});

	it("allows optional quote fields", () => {
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
		expect(QuoteStreamEventSchema.safeParse(event).success).toBe(true);
	});

	it("requires symbol", () => {
		const event = { bid: 185.0, ask: 185.05, timestamp: "2026-01-04T12:00:00.000Z" };
		expect(QuoteStreamEventSchema.safeParse(event).success).toBe(false);
	});
});

describe("OrderUpdateEventSchema - basic validation", () => {
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
		expect(OrderUpdateEventSchema.safeParse(event).success).toBe(true);
	});
});

describe("OrderUpdateEventSchema - enum coverage", () => {
	it("validates all sides, types, and statuses", () => {
		for (const side of ["BUY", "SELL"]) {
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
			expect(OrderUpdateEventSchema.safeParse(event).success).toBe(true);
		}
		for (const type of ["market", "limit", "stop", "stop_limit"]) {
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
			expect(OrderUpdateEventSchema.safeParse(event).success).toBe(true);
		}
		for (const status of [
			"pending",
			"open",
			"partially_filled",
			"filled",
			"cancelled",
			"rejected",
			"expired",
		]) {
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
			expect(OrderUpdateEventSchema.safeParse(event).success).toBe(true);
		}
	});
});

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
		expect(DecisionInsertEventSchema.safeParse(event).success).toBe(true);
	});

	it("validates all actions and directions", () => {
		for (const action of ["BUY", "SELL", "HOLD", "CLOSE"]) {
			const event = {
				decisionId: "dec-123",
				cycleId: "cycle-123",
				symbol: "AAPL",
				action,
				direction: "LONG",
				confidence: 0.5,
				createdAt: "2026-01-04T12:00:00.000Z",
			};
			expect(DecisionInsertEventSchema.safeParse(event).success).toBe(true);
		}
		for (const direction of ["LONG", "SHORT", "FLAT"]) {
			const event = {
				decisionId: "dec-123",
				cycleId: "cycle-123",
				symbol: "AAPL",
				action: "BUY",
				direction,
				confidence: 0.5,
				createdAt: "2026-01-04T12:00:00.000Z",
			};
			expect(DecisionInsertEventSchema.safeParse(event).success).toBe(true);
		}
	});

	it("enforces confidence range", () => {
		for (const confidence of [-0.1, 1.1, 2]) {
			const event = {
				decisionId: "dec-123",
				cycleId: "cycle-123",
				symbol: "AAPL",
				action: "BUY",
				direction: "LONG",
				confidence,
				createdAt: "2026-01-04T12:00:00.000Z",
			};
			expect(DecisionInsertEventSchema.safeParse(event).success).toBe(false);
		}
	});
});

describe("SystemAlertEventSchema", () => {
	it("validates alert event and severities", () => {
		const valid = {
			alertId: "alert-123",
			severity: "warning",
			title: "High Latency",
			message: "Broker response time exceeded threshold",
			timestamp: "2026-01-04T12:00:00.000Z",
		};
		expect(SystemAlertEventSchema.safeParse(valid).success).toBe(true);
		for (const severity of ["info", "warning", "error", "critical"]) {
			expect(
				SystemAlertEventSchema.safeParse({
					...valid,
					severity,
					title: "Test Alert",
					message: "Test message",
				}).success,
			).toBe(true);
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
		expect(SystemAlertEventSchema.safeParse(event).success).toBe(true);
	});
});

describe("HealthCheckEventSchema", () => {
	it("validates health event and all status values", () => {
		const base = {
			version: "0.1.0",
			uptime: 3600,
			connections: 42,
			sources: { redis: "connected", grpc: "connected" },
			timestamp: "2026-01-04T12:00:00.000Z",
		};
		expect(HealthCheckEventSchema.safeParse({ ...base, status: "healthy" }).success).toBe(true);
		for (const status of ["healthy", "degraded", "unhealthy"]) {
			expect(HealthCheckEventSchema.safeParse({ ...base, status, sources: {} }).success).toBe(true);
		}
	});
});

describe("Config Types", () => {
	it("supports Redis and gRPC config fields", () => {
		const redis: RedisConfig = {
			url: "redis://localhost:6379",
			password: "secret",
			db: 1,
			maxRetries: 3,
			retryDelayMs: 1000,
		};
		const grpc: GrpcConfig = {
			host: "localhost",
			port: 50052,
			useTls: true,
			maxRetries: 5,
			retryDelayMs: 2000,
		};
		expect(redis.url).toBeDefined();
		expect(grpc.port).toBe(50052);
	});

	it("supports CDC and publisher config", () => {
		const db: DatabaseCdcConfig = { pollIntervalMs: 1000, tables: ["decisions", "orders"] };
		const publisher: EventPublisherConfig = {
			redis: { url: "redis://localhost:6379" },
			grpc: { host: "localhost", port: 50052 },
			database: { pollIntervalMs: 1000, tables: ["decisions"] },
			enableInternalEvents: true,
		};
		expect(db.tables).toBeDefined();
		expect(publisher.redis).toBeDefined();
		expect(publisher.grpc).toBeDefined();
		expect(publisher.database).toBeDefined();
	});
});

describe("State Types", () => {
	it("supports SourceState and PublisherStats", () => {
		const state: SourceState = {
			status: "connected",
			lastEvent: new Date(),
			lastError: null,
			reconnectAttempts: 0,
		};
		const stats: PublisherStats = {
			eventsReceived: 100,
			eventsBroadcast: 95,
			eventsDropped: 5,
			sourceStates: {
				redis: { status: "connected", lastEvent: null, lastError: null, reconnectAttempts: 0 },
				grpc: { status: "connected", lastEvent: null, lastError: null, reconnectAttempts: 0 },
				database: {
					status: "disconnected",
					lastEvent: null,
					lastError: null,
					reconnectAttempts: 0,
				},
				internal: { status: "connected", lastEvent: null, lastError: null, reconnectAttempts: 0 },
			},
		};
		expect(state.lastError).toBe(null);
		expect(stats.eventsBroadcast).toBe(95);
	});
});

describe("Broadcast Types", () => {
	it("supports BroadcastTarget variants", () => {
		const channelTarget: BroadcastTarget = { channel: "quotes" };
		const symbolTarget: BroadcastTarget = { channel: "quotes", symbol: "AAPL" };
		const broadcastTarget: BroadcastTarget = { channel: null };
		expect(channelTarget.channel).toBe("quotes");
		expect(symbolTarget.symbol).toBe("AAPL");
		expect(broadcastTarget.channel).toBe(null);
	});

	it("supports BroadcastEvent structure", () => {
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
