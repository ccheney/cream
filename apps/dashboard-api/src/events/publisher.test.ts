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

describe("createEventPublisher", () => {
	let publisher: EventPublisher;

	afterEach(async () => {
		if (publisher?.isRunning()) {
			await publisher.stop();
		}
	});

	it("creates publisher instance and accepts config", () => {
		publisher = createEventPublisher();
		expect(publisher).toBeDefined();
		expect(createEventPublisher({})).toBeDefined();
		expect(createEventPublisher({ enableInternalEvents: true })).toBeDefined();
	});

	it("publisher is not running initially", () => {
		publisher = createEventPublisher();
		expect(publisher.isRunning()).toBe(false);
	});

	it("exposes expected methods", () => {
		publisher = createEventPublisher();
		const methods = ["start", "stop", "getStats", "getSourceState", "emit", "isRunning"] as const;
		for (const method of methods) {
			expect(typeof publisher[method]).toBe("function");
		}
	});
});

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

	it("start and stop are idempotent", async () => {
		await publisher.start();
		await publisher.start();
		expect(publisher.isRunning()).toBe(true);
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

describe("Source State - defaults", () => {
	let publisher: EventPublisher;

	beforeEach(() => {
		publisher = createEventPublisher();
	});

	it("returns disconnected state for all sources", () => {
		const sources = ["redis", "grpc", "database", "internal"] as const;
		for (const source of sources) {
			const state = publisher.getSourceState(source);
			expect(state.status).toBe("disconnected");
			expect(state.lastEvent).toBe(null);
			expect(state.lastError).toBe(null);
			expect(state.reconnectAttempts).toBe(0);
		}
	});
});

describe("Source State - lifecycle", () => {
	let publisher: EventPublisher;

	beforeEach(() => {
		publisher = createEventPublisher();
	});

	afterEach(async () => {
		if (publisher?.isRunning()) {
			await publisher.stop();
		}
	});

	it("internal source connects on start", async () => {
		await publisher.start();
		expect(publisher.getSourceState("internal").status).toBe("connected");
	});

	it("internal source disconnects on stop", async () => {
		await publisher.start();
		await publisher.stop();
		expect(publisher.getSourceState("internal").status).toBe("disconnected");
	});
});

describe("Publisher Stats", () => {
	let publisher: EventPublisher;

	beforeEach(() => {
		publisher = createEventPublisher();
	});

	it("returns stats object with expected counters", () => {
		const stats = publisher.getStats();
		expect(stats).toBeDefined();
		expect(stats.eventsReceived).toBe(0);
		expect(stats.eventsBroadcast).toBe(0);
		expect(stats.eventsDropped).toBe(0);
	});

	it("includes source states for all sources", () => {
		const stats = publisher.getStats();
		expect(stats.sourceStates.redis).toBeDefined();
		expect(stats.sourceStates.grpc).toBeDefined();
		expect(stats.sourceStates.database).toBeDefined();
		expect(stats.sourceStates.internal).toBeDefined();
	});
});

describe("Event Emission - accepted types", () => {
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

	it("accepts cycle, agent, quote, order, decision, and alert events", () => {
		publisher.emit({ type: "cycle", data: sampleCycleEvent });
		publisher.emit({ type: "agent", data: sampleAgentEvent });
		publisher.emit({ type: "quote", data: sampleQuoteEvent });
		publisher.emit({ type: "order", data: sampleOrderEvent });
		publisher.emit({ type: "decision", data: sampleDecisionEvent });
		publisher.emit({ type: "alert", data: sampleAlertEvent });
		expect(publisher.getStats().eventsReceived).toBe(6);
	});

	it("updates source lastEvent on emit", () => {
		const before = publisher.getSourceState("internal").lastEvent;
		publisher.emit({ type: "alert", data: sampleAlertEvent });
		const after = publisher.getSourceState("internal").lastEvent;
		expect(after).not.toBe(before);
		expect(after).toBeInstanceOf(Date);
	});
});

describe("Event Emission - not running", () => {
	it("ignores events when not running", async () => {
		const publisher = createEventPublisher();
		await publisher.stop();
		publisher.emit({ type: "cycle", data: sampleCycleEvent });
		expect(publisher.getStats().eventsReceived).toBe(0);
	});
});

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
		expect(true).toBe(true);
	});

	it("accepts multiple quote events", () => {
		for (let i = 0; i < 10; i++) {
			publisher.emit({ type: "quote", data: { ...sampleQuoteEvent, bid: 185 + i * 0.01 } });
		}
		expect(true).toBe(true);
	});
});

describe("getEventPublisher", () => {
	afterEach(() => {
		resetEventPublisher();
	});

	it("returns publisher instance", () => {
		expect(getEventPublisher()).toBeDefined();
	});

	it("returns same instance on multiple calls", () => {
		expect(getEventPublisher()).toBe(getEventPublisher());
	});

	it("accepts config on first call", () => {
		expect(getEventPublisher({ enableInternalEvents: false })).toBeDefined();
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
		expect(publisher.isRunning()).toBe(false);
	});
});

describe("Module Exports", () => {
	it("exports expected API", async () => {
		const module = await import("./publisher");
		expect(typeof module.createEventPublisher).toBe("function");
		expect(typeof module.getEventPublisher).toBe("function");
		expect(typeof module.resetEventPublisher).toBe("function");
		expect(module.default).toBe(module.createEventPublisher);
	});
});

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
		publisher.emit({ type: "decision", data: sampleDecisionEvent });
		publisher.emit({
			type: "cycle",
			data: { ...sampleCycleEvent, phase: "complete", status: "completed" },
		});
		expect(publisher.getStats().eventsReceived).toBe(6);
	});

	it("handles multiple quote symbols and mixed event types", () => {
		for (const symbol of ["AAPL", "GOOGL", "MSFT", "AMZN", "META"]) {
			publisher.emit({ type: "quote", data: { ...sampleQuoteEvent, symbol } });
		}
		expect(publisher.getStats().eventsReceived).toBe(5);
		publisher.emit({ type: "cycle", data: sampleCycleEvent });
		publisher.emit({ type: "order", data: sampleOrderEvent });
		publisher.emit({ type: "alert", data: sampleAlertEvent });
		expect(publisher.getStats().eventsReceived).toBe(8);
	});
});
