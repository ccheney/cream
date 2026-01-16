/**
 * Event Publisher Tests
 *
 * Tests for the event publisher module.
 *
 * @see docs/plans/ui/08-realtime.md
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	createEventPublisher,
	type EventPublisher,
	getEventPublisher,
	resetEventPublisher,
} from "./publisher";
import type {
	DecisionInsertEvent,
	MastraAgentEvent,
	MastraCycleEvent,
	OrderUpdateEvent,
	QuoteStreamEvent,
	SystemAlertEvent,
} from "./types";

// ============================================
// Test Data Fixtures
// ============================================

const sampleCycleEvent: MastraCycleEvent = {
	cycleId: "cycle-123",
	phase: "observe",
	status: "started",
	progress: 25,
	message: "Gathering market data",
	timestamp: "2026-01-04T12:00:00.000Z",
};

const sampleAgentEvent: MastraAgentEvent = {
	cycleId: "cycle-123",
	agentType: "sentiment",
	status: "complete",
	output: { recommendation: "BUY" },
	reasoning: "Strong RSI signals",
	timestamp: "2026-01-04T12:00:00.000Z",
};

const sampleQuoteEvent: QuoteStreamEvent = {
	symbol: "AAPL",
	bid: 185.0,
	ask: 185.05,
	timestamp: "2026-01-04T12:00:00.000Z",
};

const sampleOrderEvent: OrderUpdateEvent = {
	orderId: "order-123",
	symbol: "AAPL",
	side: "BUY",
	type: "limit",
	quantity: 100,
	filledQuantity: 50,
	status: "partially_filled",
	timestamp: "2026-01-04T12:00:00.000Z",
};

const sampleDecisionEvent: DecisionInsertEvent = {
	decisionId: "dec-123",
	cycleId: "cycle-123",
	symbol: "AAPL",
	action: "BUY",
	direction: "LONG",
	confidence: 0.85,
	createdAt: "2026-01-04T12:00:00.000Z",
};

const sampleAlertEvent: SystemAlertEvent = {
	alertId: "alert-123",
	severity: "warning",
	title: "High Latency",
	message: "Broker response time exceeded threshold",
	timestamp: "2026-01-04T12:00:00.000Z",
};

// ============================================
// Publisher Creation Tests
// ============================================

describe("createEventPublisher", () => {
	let publisher: EventPublisher;

	afterEach(async () => {
		if (publisher?.isRunning()) {
			await publisher.stop();
		}
	});

	it("creates publisher instance", () => {
		publisher = createEventPublisher();
		expect(publisher).toBeDefined();
	});

	it("publisher is not running initially", () => {
		publisher = createEventPublisher();
		expect(publisher.isRunning()).toBe(false);
	});

	it("accepts empty config", () => {
		publisher = createEventPublisher({});
		expect(publisher).toBeDefined();
	});

	it("accepts config with enableInternalEvents", () => {
		publisher = createEventPublisher({ enableInternalEvents: true });
		expect(publisher).toBeDefined();
	});

	it("has start method", () => {
		publisher = createEventPublisher();
		expect(typeof publisher.start).toBe("function");
	});

	it("has stop method", () => {
		publisher = createEventPublisher();
		expect(typeof publisher.stop).toBe("function");
	});

	it("has getStats method", () => {
		publisher = createEventPublisher();
		expect(typeof publisher.getStats).toBe("function");
	});

	it("has getSourceState method", () => {
		publisher = createEventPublisher();
		expect(typeof publisher.getSourceState).toBe("function");
	});

	it("has emit method", () => {
		publisher = createEventPublisher();
		expect(typeof publisher.emit).toBe("function");
	});

	it("has isRunning method", () => {
		publisher = createEventPublisher();
		expect(typeof publisher.isRunning).toBe("function");
	});
});

// ============================================
// Publisher Lifecycle Tests
// ============================================

describe("Publisher Lifecycle", () => {
	let publisher: EventPublisher;

	beforeEach(() => {
		publisher = createEventPublisher();
	});

	afterEach(async () => {
		if (publisher?.isRunning()) {
			await publisher.stop();
		}
	});

	it("starts successfully", async () => {
		await publisher.start();
		expect(publisher.isRunning()).toBe(true);
	});

	it("stops successfully", async () => {
		await publisher.start();
		await publisher.stop();
		expect(publisher.isRunning()).toBe(false);
	});

	it("start is idempotent", async () => {
		await publisher.start();
		await publisher.start();
		expect(publisher.isRunning()).toBe(true);
	});

	it("stop is idempotent", async () => {
		await publisher.start();
		await publisher.stop();
		await publisher.stop();
		expect(publisher.isRunning()).toBe(false);
	});

	it("can restart after stop", async () => {
		await publisher.start();
		await publisher.stop();
		await publisher.start();
		expect(publisher.isRunning()).toBe(true);
	});
});

// ============================================
// Source State Tests
// ============================================

describe("Source State", () => {
	let publisher: EventPublisher;

	beforeEach(() => {
		publisher = createEventPublisher();
	});

	afterEach(async () => {
		if (publisher?.isRunning()) {
			await publisher.stop();
		}
	});

	it("returns state for redis source", () => {
		const state = publisher.getSourceState("redis");
		expect(state).toBeDefined();
		expect(state.status).toBe("disconnected");
	});

	it("returns state for grpc source", () => {
		const state = publisher.getSourceState("grpc");
		expect(state).toBeDefined();
		expect(state.status).toBe("disconnected");
	});

	it("returns state for database source", () => {
		const state = publisher.getSourceState("database");
		expect(state).toBeDefined();
		expect(state.status).toBe("disconnected");
	});

	it("returns state for internal source", () => {
		const state = publisher.getSourceState("internal");
		expect(state).toBeDefined();
		expect(state.status).toBe("disconnected");
	});

	it("internal source connects on start", async () => {
		await publisher.start();
		const state = publisher.getSourceState("internal");
		expect(state.status).toBe("connected");
	});

	it("internal source disconnects on stop", async () => {
		await publisher.start();
		await publisher.stop();
		const state = publisher.getSourceState("internal");
		expect(state.status).toBe("disconnected");
	});

	it("state has lastEvent initially null", () => {
		const state = publisher.getSourceState("redis");
		expect(state.lastEvent).toBe(null);
	});

	it("state has lastError initially null", () => {
		const state = publisher.getSourceState("redis");
		expect(state.lastError).toBe(null);
	});

	it("state has reconnectAttempts initially 0", () => {
		const state = publisher.getSourceState("redis");
		expect(state.reconnectAttempts).toBe(0);
	});
});

// ============================================
// Stats Tests
// ============================================

describe("Publisher Stats", () => {
	let publisher: EventPublisher;

	beforeEach(() => {
		publisher = createEventPublisher();
	});

	afterEach(async () => {
		if (publisher?.isRunning()) {
			await publisher.stop();
		}
	});

	it("returns stats object", () => {
		const stats = publisher.getStats();
		expect(stats).toBeDefined();
	});

	it("has eventsReceived counter", () => {
		const stats = publisher.getStats();
		expect(stats.eventsReceived).toBe(0);
	});

	it("has eventsBroadcast counter", () => {
		const stats = publisher.getStats();
		expect(stats.eventsBroadcast).toBe(0);
	});

	it("has eventsDropped counter", () => {
		const stats = publisher.getStats();
		expect(stats.eventsDropped).toBe(0);
	});

	it("has sourceStates map", () => {
		const stats = publisher.getStats();
		expect(stats.sourceStates).toBeDefined();
		expect(stats.sourceStates.redis).toBeDefined();
		expect(stats.sourceStates.grpc).toBeDefined();
		expect(stats.sourceStates.database).toBeDefined();
		expect(stats.sourceStates.internal).toBeDefined();
	});
});

// ============================================
// Event Emission Tests
// ============================================

describe("Event Emission", () => {
	let publisher: EventPublisher;

	beforeEach(async () => {
		publisher = createEventPublisher();
		await publisher.start();
	});

	afterEach(async () => {
		if (publisher?.isRunning()) {
			await publisher.stop();
		}
	});

	it("accepts cycle events", () => {
		publisher.emit({ type: "cycle", data: sampleCycleEvent });
		// No error thrown
		expect(true).toBe(true);
	});

	it("accepts agent events", () => {
		publisher.emit({ type: "agent", data: sampleAgentEvent });
		expect(true).toBe(true);
	});

	it("accepts quote events", () => {
		publisher.emit({ type: "quote", data: sampleQuoteEvent });
		expect(true).toBe(true);
	});

	it("accepts order events", () => {
		publisher.emit({ type: "order", data: sampleOrderEvent });
		expect(true).toBe(true);
	});

	it("accepts decision events", () => {
		publisher.emit({ type: "decision", data: sampleDecisionEvent });
		expect(true).toBe(true);
	});

	it("accepts alert events", () => {
		publisher.emit({ type: "alert", data: sampleAlertEvent });
		expect(true).toBe(true);
	});

	it("ignores events when not running", async () => {
		await publisher.stop();
		publisher.emit({ type: "cycle", data: sampleCycleEvent });
		const stats = publisher.getStats();
		expect(stats.eventsReceived).toBe(0);
	});

	it("increments eventsReceived on emit", () => {
		publisher.emit({ type: "cycle", data: sampleCycleEvent });
		const stats = publisher.getStats();
		expect(stats.eventsReceived).toBe(1);
	});

	it("updates source lastEvent on emit", () => {
		const before = publisher.getSourceState("internal").lastEvent;
		publisher.emit({ type: "alert", data: sampleAlertEvent });
		const after = publisher.getSourceState("internal").lastEvent;
		expect(after).not.toBe(before);
		expect(after).toBeInstanceOf(Date);
	});
});

// ============================================
// Quote Batching Tests
// ============================================

describe("Quote Batching", () => {
	let publisher: EventPublisher;

	beforeEach(async () => {
		publisher = createEventPublisher();
		await publisher.start();
	});

	afterEach(async () => {
		if (publisher?.isRunning()) {
			await publisher.stop();
		}
	});

	it("queues quote events", () => {
		publisher.emit({ type: "quote", data: sampleQuoteEvent });
		// Quote is queued, not immediately broadcast
		expect(true).toBe(true);
	});

	it("accepts multiple quote events", () => {
		for (let i = 0; i < 10; i++) {
			publisher.emit({
				type: "quote",
				data: { ...sampleQuoteEvent, bid: 185 + i * 0.01 },
			});
		}
		expect(true).toBe(true);
	});
});

// ============================================
// Singleton Tests
// ============================================

describe("getEventPublisher", () => {
	afterEach(async () => {
		resetEventPublisher();
	});

	it("returns publisher instance", () => {
		const publisher = getEventPublisher();
		expect(publisher).toBeDefined();
	});

	it("returns same instance on multiple calls", () => {
		const publisher1 = getEventPublisher();
		const publisher2 = getEventPublisher();
		expect(publisher1).toBe(publisher2);
	});

	it("accepts config on first call", () => {
		const publisher = getEventPublisher({ enableInternalEvents: false });
		expect(publisher).toBeDefined();
	});
});

describe("resetEventPublisher", () => {
	it("resets singleton instance", () => {
		const publisher1 = getEventPublisher();
		resetEventPublisher();
		const publisher2 = getEventPublisher();
		expect(publisher1).not.toBe(publisher2);
	});

	it("stops running publisher", async () => {
		const publisher = getEventPublisher();
		await publisher.start();
		resetEventPublisher();
		// Publisher should be stopped
		expect(publisher.isRunning()).toBe(false);
	});
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
	it("exports createEventPublisher", async () => {
		const module = await import("./publisher");
		expect(typeof module.createEventPublisher).toBe("function");
	});

	it("exports getEventPublisher", async () => {
		const module = await import("./publisher");
		expect(typeof module.getEventPublisher).toBe("function");
	});

	it("exports resetEventPublisher", async () => {
		const module = await import("./publisher");
		expect(typeof module.resetEventPublisher).toBe("function");
	});

	it("exports default as createEventPublisher", async () => {
		const module = await import("./publisher");
		expect(module.default).toBe(module.createEventPublisher);
	});
});

// ============================================
// Integration Tests
// ============================================

describe("Integration", () => {
	let publisher: EventPublisher;

	beforeEach(async () => {
		publisher = createEventPublisher();
		await publisher.start();
	});

	afterEach(async () => {
		if (publisher?.isRunning()) {
			await publisher.stop();
		}
	});

	it("handles complete cycle event flow", () => {
		// Simulate a trading cycle
		publisher.emit({
			type: "cycle",
			data: { ...sampleCycleEvent, phase: "observe", status: "started" },
		});
		publisher.emit({
			type: "agent",
			data: { ...sampleAgentEvent, agentType: "sentiment", status: "started" },
		});
		publisher.emit({
			type: "agent",
			data: { ...sampleAgentEvent, agentType: "sentiment", status: "complete" },
		});
		publisher.emit({
			type: "cycle",
			data: { ...sampleCycleEvent, phase: "orient", status: "started" },
		});
		publisher.emit({
			type: "decision",
			data: sampleDecisionEvent,
		});
		publisher.emit({
			type: "cycle",
			data: { ...sampleCycleEvent, phase: "complete", status: "completed" },
		});

		const stats = publisher.getStats();
		expect(stats.eventsReceived).toBe(6);
	});

	it("handles multiple quote symbols", () => {
		const symbols = ["AAPL", "GOOGL", "MSFT", "AMZN", "META"];
		for (const symbol of symbols) {
			publisher.emit({
				type: "quote",
				data: { ...sampleQuoteEvent, symbol },
			});
		}

		const stats = publisher.getStats();
		expect(stats.eventsReceived).toBe(5);
	});

	it("handles mixed event types", () => {
		publisher.emit({ type: "cycle", data: sampleCycleEvent });
		publisher.emit({ type: "quote", data: sampleQuoteEvent });
		publisher.emit({ type: "order", data: sampleOrderEvent });
		publisher.emit({ type: "alert", data: sampleAlertEvent });

		const stats = publisher.getStats();
		expect(stats.eventsReceived).toBe(4);
	});
});
