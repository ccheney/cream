import { describe, expect, it } from "bun:test";
import type { ServerMessage } from "@cream/domain/websocket";
import {
	aggregateQuotes,
	batchQuoteEvents,
	type MappableEvent,
	mapAgentEvent,
	mapAlertEvent,
	mapCycleEvent,
	mapDecisionEvent,
	mapEvent,
	mapHealthCheckEvent,
	mapOrderEvent,
	mapQuoteEvent,
} from "./mappers";
import type {
	DecisionInsertEvent,
	HealthCheckEvent,
	MastraAgentEvent,
	MastraCycleEvent,
	OrderUpdateEvent,
	QuoteStreamEvent,
	SystemAlertEvent,
} from "./types";

const expectMessageType = <T extends ServerMessage["type"]>(
	message: ServerMessage,
	type: T,
): Extract<ServerMessage, { type: T }> => {
	expect(message.type).toBe(type);
	if (message.type !== type) {
		throw new Error(`Expected message type ${type}`);
	}
	return message as Extract<ServerMessage, { type: T }>;
};

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
	bidSize: 100,
	askSize: 200,
	last: 185.02,
	lastSize: 50,
	volume: 1000000,
	timestamp: "2026-01-04T12:00:00.000Z",
};

const sampleOrderEvent: OrderUpdateEvent = {
	orderId: "order-123",
	symbol: "AAPL",
	side: "BUY",
	type: "limit",
	quantity: 100,
	filledQuantity: 50,
	price: 185.0,
	avgFillPrice: 184.95,
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
	source: "broker-adapter",
	timestamp: "2026-01-04T12:00:00.000Z",
};

const sampleHealthEvent: HealthCheckEvent = {
	status: "healthy",
	version: "0.1.0",
	uptime: 3600,
	connections: 42,
	sources: { redis: "connected", grpc: "connected" },
	timestamp: "2026-01-04T12:00:00.000Z",
};

describe("mapCycleEvent", () => {
	it("maps to cycle_progress on cycles channel", () => {
		const result = mapCycleEvent(sampleCycleEvent);
		expect(result.target.channel).toBe("cycles");
		const message = expectMessageType(result.message, "cycle_progress");
		expect(message.data.cycleId).toBe("cycle-123");
		expect(message.data.phase).toBe("observe");
		expect(message.data.progress).toBe(25);
		expect(message.data.step).toBe("started");
		expect(message.data.message).toBe("Gathering market data");
	});

	it("defaults progress to 0 when missing", () => {
		const result = mapCycleEvent({ ...sampleCycleEvent, progress: undefined });
		const message = expectMessageType(result.message, "cycle_progress");
		expect(message.data.progress).toBe(0);
	});
});

describe("mapAgentEvent", () => {
	it("maps to agent_output on cycles channel", () => {
		const result = mapAgentEvent(sampleAgentEvent);
		expect(result.target.channel).toBe("cycles");
		const message = expectMessageType(result.message, "agent_output");
		expect(message.data.cycleId).toBe("cycle-123");
		expect(message.data.agentType).toBe("news");
		expect(message.data.status).toBe("complete");
		expect(message.data.output).toBe('{"recommendation":"BUY"}');
	});
});

describe("mapQuoteEvent", () => {
	it("maps quote fields and symbol targeting", () => {
		const result = mapQuoteEvent(sampleQuoteEvent);
		expect(result.target.channel).toBe("quotes");
		expect(result.target.symbol).toBe("AAPL");
		const message = expectMessageType(result.message, "quote");
		expect(message.data.symbol).toBe("AAPL");
		expect(message.data.bid).toBe(185.0);
		expect(message.data.ask).toBe(185.05);
		expect(message.data.bidSize).toBe(100);
		expect(message.data.askSize).toBe(200);
		expect(message.data.last).toBe(185.02);
		expect(message.data.volume).toBe(1000000);
		expect(message.data.timestamp).toBe("2026-01-04T12:00:00.000Z");
	});
});

describe("mapOrderEvent", () => {
	it("maps order event fields", () => {
		const result = mapOrderEvent(sampleOrderEvent);
		expect(result.target.channel).toBe("orders");
		const message = expectMessageType(result.message, "order");
		expect(message.data.id).toBe("order-123");
		expect(message.data.symbol).toBe("AAPL");
		expect(message.data.side).toBe("buy");
		expect(message.data.orderType).toBe("limit");
		expect(message.data.quantity).toBe(100);
		expect(message.data.filledQty).toBe(50);
		expect(message.data.limitPrice).toBe(185.0);
		expect(message.data.avgPrice).toBe(184.95);
		expect(message.data.status).toBe("partial_fill");
	});
});

describe("mapDecisionEvent", () => {
	it("maps decision event fields", () => {
		const result = mapDecisionEvent(sampleDecisionEvent);
		expect(result.target.channel).toBe("decisions");
		const message = expectMessageType(result.message, "decision");
		expect(message.cycleId).toBe("cycle-123");
		expect(message.data.action).toBe("BUY");
		expect(message.data.confidence).toBe(0.85);
		expect(message.data.instrument.instrumentId).toBe("AAPL");
	});
});

describe("mapAlertEvent", () => {
	it("maps alert event fields", () => {
		const result = mapAlertEvent(sampleAlertEvent);
		expect(result.target.channel).toBe("alerts");
		const message = expectMessageType(result.message, "alert");
		expect(message.data.id).toBe("alert-123");
		expect(message.data.severity).toBe("warning");
		expect(message.data.title).toBe("High Latency");
		expect(message.data.message).toBe("Broker response time exceeded threshold");
		expect(message.data.acknowledged).toBe(false);
	});
});

describe("mapHealthCheckEvent", () => {
	it("maps system status as broadcast", () => {
		const result = mapHealthCheckEvent(sampleHealthEvent);
		expect(result.target.channel).toBe(null);
		const message = expectMessageType(result.message, "system_status");
		expect(message.data.health).toBe("healthy");
		expect(message.data.uptimeSeconds).toBe(3600);
		expect(message.data.activeConnections).toBe(42);
	});
});

describe("mapEvent", () => {
	it("dispatches all event variants to expected message types", () => {
		const cases: Array<{ event: MappableEvent; expectedType: ServerMessage["type"] }> = [
			{ event: { type: "cycle", data: sampleCycleEvent }, expectedType: "cycle_progress" },
			{ event: { type: "agent", data: sampleAgentEvent }, expectedType: "agent_output" },
			{ event: { type: "quote", data: sampleQuoteEvent }, expectedType: "quote" },
			{ event: { type: "order", data: sampleOrderEvent }, expectedType: "order" },
			{ event: { type: "decision", data: sampleDecisionEvent }, expectedType: "decision" },
			{ event: { type: "alert", data: sampleAlertEvent }, expectedType: "alert" },
			{ event: { type: "health", data: sampleHealthEvent }, expectedType: "system_status" },
		];
		for (const { event, expectedType } of cases) {
			expect(mapEvent(event).message.type).toBe(expectedType);
		}
	});
});

describe("batchQuoteEvents", () => {
	it("returns empty array for empty input", () => {
		expect(batchQuoteEvents([])).toEqual([]);
	});

	it("maps single event", () => {
		const result = batchQuoteEvents([sampleQuoteEvent]);
		expect(result.length).toBe(1);
		expect(result[0]?.message.type).toBe("quote");
	});

	it("deduplicates by symbol and keeps latest quote", () => {
		const events: QuoteStreamEvent[] = [
			{ ...sampleQuoteEvent, bid: 185.0 },
			{ ...sampleQuoteEvent, bid: 185.1 },
			{ ...sampleQuoteEvent, bid: 185.2 },
		];
		const result = batchQuoteEvents(events);
		expect(result.length).toBe(1);
		const first = result[0];
		if (!first || first.message.type !== "quote") {
			throw new Error("Expected quote message");
		}
		expect(first.message.data.bid).toBe(185.2);
	});

	it("keeps one event per symbol and preserves quote channel target", () => {
		const events: QuoteStreamEvent[] = [
			{ ...sampleQuoteEvent, symbol: "AAPL", bid: 185.0 },
			{ ...sampleQuoteEvent, symbol: "GOOGL", bid: 180.0 },
			{ ...sampleQuoteEvent, symbol: "AAPL", bid: 185.5 },
			{ ...sampleQuoteEvent, symbol: "MSFT", bid: 420.0 },
		];
		const result = batchQuoteEvents(events);
		expect(result.length).toBe(3);
		const symbols = result.map((event) => {
			if (event.message.type !== "quote") {
				throw new Error("Expected quote message");
			}
			expect(event.target.channel).toBe("quotes");
			return event.message.data.symbol;
		});
		expect(symbols).toContain("AAPL");
		expect(symbols).toContain("GOOGL");
		expect(symbols).toContain("MSFT");
	});
});

describe("aggregateQuotes", () => {
	it("returns empty map for empty input", () => {
		expect(aggregateQuotes([]).size).toBe(0);
	});

	it("aggregates by symbol and keeps latest quote", () => {
		const events: QuoteStreamEvent[] = [
			{ ...sampleQuoteEvent, symbol: "AAPL", bid: 185.0 },
			{ ...sampleQuoteEvent, symbol: "GOOGL", bid: 180.0 },
			{ ...sampleQuoteEvent, symbol: "AAPL", bid: 185.5 },
		];
		const result = aggregateQuotes(events);
		expect(result.size).toBe(2);
		expect(result.has("AAPL")).toBe(true);
		expect(result.has("GOOGL")).toBe(true);
		expect(result.get("AAPL")?.bid).toBe(185.5);
	});
});

describe("Module Exports", () => {
	it("exports all mapper functions", async () => {
		const module = await import("./mappers");
		const names = [
			"mapCycleEvent",
			"mapAgentEvent",
			"mapQuoteEvent",
			"mapOrderEvent",
			"mapDecisionEvent",
			"mapAlertEvent",
			"mapHealthCheckEvent",
			"mapEvent",
			"batchQuoteEvents",
			"aggregateQuotes",
		] as const;
		for (const name of names) {
			expect(typeof module[name]).toBe("function");
		}
	});
});
