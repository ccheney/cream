/**
 * Event Mappers Tests
 *
 * Tests for event → WebSocket message mapping.
 *
 * @see docs/plans/ui/08-realtime.md
 */

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

// ============================================
// Cycle Event Mapper Tests
// ============================================

describe("mapCycleEvent", () => {
	it("maps to cycle_progress message type", () => {
		const result = mapCycleEvent(sampleCycleEvent);
		expectMessageType(result.message, "cycle_progress");
	});

	it("targets cycles channel", () => {
		const result = mapCycleEvent(sampleCycleEvent);
		expect(result.target.channel).toBe("cycles");
	});

	it("maps cycleId correctly", () => {
		const result = mapCycleEvent(sampleCycleEvent);
		const message = expectMessageType(result.message, "cycle_progress");
		expect(message.data.cycleId).toBe("cycle-123");
	});

	it("maps phase correctly", () => {
		const result = mapCycleEvent(sampleCycleEvent);
		const message = expectMessageType(result.message, "cycle_progress");
		expect(message.data.phase).toBe("observe");
	});

	it("maps progress correctly", () => {
		const result = mapCycleEvent(sampleCycleEvent);
		const message = expectMessageType(result.message, "cycle_progress");
		expect(message.data.progress).toBe(25);
	});

	it("maps status correctly", () => {
		const result = mapCycleEvent(sampleCycleEvent);
		// status is mapped to step in the domain type
		const message = expectMessageType(result.message, "cycle_progress");
		expect(message.data.step).toBe("started");
	});

	it("maps message correctly", () => {
		const result = mapCycleEvent(sampleCycleEvent);
		const message = expectMessageType(result.message, "cycle_progress");
		expect(message.data.message).toBe("Gathering market data");
	});

	it("handles missing progress", () => {
		const event = { ...sampleCycleEvent, progress: undefined };
		const result = mapCycleEvent(event);
		const message = expectMessageType(result.message, "cycle_progress");
		expect(message.data.progress).toBe(0);
	});
});

// ============================================
// Agent Event Mapper Tests
// ============================================

describe("mapAgentEvent", () => {
	it("maps to agent_output message type", () => {
		const result = mapAgentEvent(sampleAgentEvent);
		expectMessageType(result.message, "agent_output");
	});

	it("targets cycles channel", () => {
		const result = mapAgentEvent(sampleAgentEvent);
		expect(result.target.channel).toBe("cycles");
	});

	it("maps agentType correctly", () => {
		const result = mapAgentEvent(sampleAgentEvent);
		// agentType is mapped to abbreviated domain type names (see channel.ts)
		const message = expectMessageType(result.message, "agent_output");
		expect(message.data.agentType).toBe("news");
	});

	it("maps status correctly", () => {
		const result = mapAgentEvent(sampleAgentEvent);
		const message = expectMessageType(result.message, "agent_output");
		expect(message.data.status).toBe("complete");
	});

	it("maps output correctly", () => {
		const result = mapAgentEvent(sampleAgentEvent);
		// output is JSON stringified if it's an object
		const message = expectMessageType(result.message, "agent_output");
		expect(message.data.output).toBe('{"recommendation":"BUY"}');
	});

	it("preserves cycleId", () => {
		const result = mapAgentEvent(sampleAgentEvent);
		const message = expectMessageType(result.message, "agent_output");
		expect(message.data.cycleId).toBe("cycle-123");
	});
});

// ============================================
// Quote Event Mapper Tests
// ============================================

describe("mapQuoteEvent", () => {
	it("maps to quote message type", () => {
		const result = mapQuoteEvent(sampleQuoteEvent);
		expectMessageType(result.message, "quote");
	});

	it("targets quotes channel", () => {
		const result = mapQuoteEvent(sampleQuoteEvent);
		expect(result.target.channel).toBe("quotes");
	});

	it("includes symbol in target", () => {
		const result = mapQuoteEvent(sampleQuoteEvent);
		expect(result.target.symbol).toBe("AAPL");
	});

	it("maps symbol correctly", () => {
		const result = mapQuoteEvent(sampleQuoteEvent);
		const message = expectMessageType(result.message, "quote");
		expect(message.data.symbol).toBe("AAPL");
	});

	it("maps bid/ask correctly", () => {
		const result = mapQuoteEvent(sampleQuoteEvent);
		const message = expectMessageType(result.message, "quote");
		expect(message.data.bid).toBe(185.0);
		expect(message.data.ask).toBe(185.05);
	});

	it("maps sizes correctly", () => {
		const result = mapQuoteEvent(sampleQuoteEvent);
		const message = expectMessageType(result.message, "quote");
		expect(message.data.bidSize).toBe(100);
		expect(message.data.askSize).toBe(200);
	});

	it("maps last correctly", () => {
		const result = mapQuoteEvent(sampleQuoteEvent);
		const message = expectMessageType(result.message, "quote");
		expect(message.data.last).toBe(185.02);
		// lastSize is not mapped to domain type
	});

	it("maps volume correctly", () => {
		const result = mapQuoteEvent(sampleQuoteEvent);
		const message = expectMessageType(result.message, "quote");
		expect(message.data.volume).toBe(1000000);
	});

	it("preserves timestamp", () => {
		const result = mapQuoteEvent(sampleQuoteEvent);
		const message = expectMessageType(result.message, "quote");
		expect(message.data.timestamp).toBe("2026-01-04T12:00:00.000Z");
	});
});

// ============================================
// Order Event Mapper Tests
// ============================================

describe("mapOrderEvent", () => {
	it("maps to order message type", () => {
		const result = mapOrderEvent(sampleOrderEvent);
		expectMessageType(result.message, "order");
	});

	it("targets orders channel", () => {
		const result = mapOrderEvent(sampleOrderEvent);
		expect(result.target.channel).toBe("orders");
	});

	it("maps orderId to id", () => {
		const result = mapOrderEvent(sampleOrderEvent);
		const message = expectMessageType(result.message, "order");
		expect(message.data.id).toBe("order-123");
	});

	it("maps symbol correctly", () => {
		const result = mapOrderEvent(sampleOrderEvent);
		const message = expectMessageType(result.message, "order");
		expect(message.data.symbol).toBe("AAPL");
	});

	it("maps side correctly", () => {
		const result = mapOrderEvent(sampleOrderEvent);
		// side is mapped to lowercase in domain type
		const message = expectMessageType(result.message, "order");
		expect(message.data.side).toBe("buy");
	});

	it("maps type correctly", () => {
		const result = mapOrderEvent(sampleOrderEvent);
		// type is mapped to orderType in domain type
		const message = expectMessageType(result.message, "order");
		expect(message.data.orderType).toBe("limit");
	});

	it("maps quantities correctly", () => {
		const result = mapOrderEvent(sampleOrderEvent);
		const message = expectMessageType(result.message, "order");
		expect(message.data.quantity).toBe(100);
		// filledQuantity is mapped to filledQty in domain type
		expect(message.data.filledQty).toBe(50);
	});

	it("maps prices correctly", () => {
		const result = mapOrderEvent(sampleOrderEvent);
		const message = expectMessageType(result.message, "order");
		// price is mapped to limitPrice in domain type
		expect(message.data.limitPrice).toBe(185.0);
		// avgFillPrice is mapped to avgPrice in domain type
		expect(message.data.avgPrice).toBe(184.95);
	});

	it("maps status correctly", () => {
		const result = mapOrderEvent(sampleOrderEvent);
		// status is mapped to domain status values
		const message = expectMessageType(result.message, "order");
		expect(message.data.status).toBe("partial_fill");
	});
});

// ============================================
// Decision Event Mapper Tests
// ============================================

describe("mapDecisionEvent", () => {
	it("maps to decision message type", () => {
		const result = mapDecisionEvent(sampleDecisionEvent);
		expectMessageType(result.message, "decision");
	});

	it("targets decisions channel", () => {
		const result = mapDecisionEvent(sampleDecisionEvent);
		expect(result.target.channel).toBe("decisions");
	});

	it("includes cycleId at root", () => {
		const result = mapDecisionEvent(sampleDecisionEvent);
		const message = expectMessageType(result.message, "decision");
		expect(message.cycleId).toBe("cycle-123");
	});

	it("maps action correctly", () => {
		const result = mapDecisionEvent(sampleDecisionEvent);
		const message = expectMessageType(result.message, "decision");
		expect(message.data.action).toBe("BUY");
	});

	it("maps confidence correctly", () => {
		const result = mapDecisionEvent(sampleDecisionEvent);
		const message = expectMessageType(result.message, "decision");
		expect(message.data.confidence).toBe(0.85);
	});

	it("maps instrument instrumentId", () => {
		const result = mapDecisionEvent(sampleDecisionEvent);
		// ticker is mapped to instrumentId in domain type
		const message = expectMessageType(result.message, "decision");
		expect(message.data.instrument.instrumentId).toBe("AAPL");
	});
});

// ============================================
// Alert Event Mapper Tests
// ============================================

describe("mapAlertEvent", () => {
	it("maps to alert message type", () => {
		const result = mapAlertEvent(sampleAlertEvent);
		expectMessageType(result.message, "alert");
	});

	it("targets alerts channel", () => {
		const result = mapAlertEvent(sampleAlertEvent);
		expect(result.target.channel).toBe("alerts");
	});

	it("maps alertId to id", () => {
		const result = mapAlertEvent(sampleAlertEvent);
		const message = expectMessageType(result.message, "alert");
		expect(message.data.id).toBe("alert-123");
	});

	it("maps severity correctly", () => {
		const result = mapAlertEvent(sampleAlertEvent);
		const message = expectMessageType(result.message, "alert");
		expect(message.data.severity).toBe("warning");
	});

	it("maps title correctly", () => {
		const result = mapAlertEvent(sampleAlertEvent);
		const message = expectMessageType(result.message, "alert");
		expect(message.data.title).toBe("High Latency");
	});

	it("maps message correctly", () => {
		const result = mapAlertEvent(sampleAlertEvent);
		const message = expectMessageType(result.message, "alert");
		expect(message.data.message).toBe("Broker response time exceeded threshold");
	});

	it("sets acknowledged to false", () => {
		const result = mapAlertEvent(sampleAlertEvent);
		// source and dismissible are not in domain type, acknowledged is used instead
		const message = expectMessageType(result.message, "alert");
		expect(message.data.acknowledged).toBe(false);
	});
});

// ============================================
// Health Check Event Mapper Tests
// ============================================

describe("mapHealthCheckEvent", () => {
	it("maps to system_status message type", () => {
		const result = mapHealthCheckEvent(sampleHealthEvent);
		expectMessageType(result.message, "system_status");
	});

	it("targets null channel (broadcast all)", () => {
		const result = mapHealthCheckEvent(sampleHealthEvent);
		expect(result.target.channel).toBe(null);
	});

	it("maps status correctly", () => {
		const result = mapHealthCheckEvent(sampleHealthEvent);
		// status is mapped to health in domain type
		const message = expectMessageType(result.message, "system_status");
		expect(message.data.health).toBe("healthy");
	});

	it("maps uptime correctly", () => {
		const result = mapHealthCheckEvent(sampleHealthEvent);
		// uptime is mapped to uptimeSeconds in domain type
		const message = expectMessageType(result.message, "system_status");
		expect(message.data.uptimeSeconds).toBe(3600);
	});

	it("maps connections correctly", () => {
		const result = mapHealthCheckEvent(sampleHealthEvent);
		// connections is mapped to activeConnections in domain type
		const message = expectMessageType(result.message, "system_status");
		expect(message.data.activeConnections).toBe(42);
	});
});

// ============================================
// Generic Mapper Tests
// ============================================

describe("mapEvent", () => {
	it("maps cycle events", () => {
		const event: MappableEvent = { type: "cycle", data: sampleCycleEvent };
		const result = mapEvent(event);
		expect(result.message.type).toBe("cycle_progress");
	});

	it("maps agent events", () => {
		const event: MappableEvent = { type: "agent", data: sampleAgentEvent };
		const result = mapEvent(event);
		expect(result.message.type).toBe("agent_output");
	});

	it("maps quote events", () => {
		const event: MappableEvent = { type: "quote", data: sampleQuoteEvent };
		const result = mapEvent(event);
		expect(result.message.type).toBe("quote");
	});

	it("maps order events", () => {
		const event: MappableEvent = { type: "order", data: sampleOrderEvent };
		const result = mapEvent(event);
		expect(result.message.type).toBe("order");
	});

	it("maps decision events", () => {
		const event: MappableEvent = { type: "decision", data: sampleDecisionEvent };
		const result = mapEvent(event);
		expect(result.message.type).toBe("decision");
	});

	it("maps alert events", () => {
		const event: MappableEvent = { type: "alert", data: sampleAlertEvent };
		const result = mapEvent(event);
		expect(result.message.type).toBe("alert");
	});

	it("maps health events", () => {
		const event: MappableEvent = { type: "health", data: sampleHealthEvent };
		const result = mapEvent(event);
		expect(result.message.type).toBe("system_status");
	});
});

// ============================================
// Batching Utilities Tests
// ============================================

describe("batchQuoteEvents", () => {
	it("returns empty array for empty input", () => {
		const result = batchQuoteEvents([]);
		expect(result).toEqual([]);
	});

	it("maps single event", () => {
		const result = batchQuoteEvents([sampleQuoteEvent]);
		expect(result.length).toBe(1);
		expect(result[0]?.message.type).toBe("quote");
	});

	it("deduplicates by symbol (keeps latest)", () => {
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

	it("keeps one event per symbol", () => {
		const events: QuoteStreamEvent[] = [
			{ ...sampleQuoteEvent, symbol: "AAPL", bid: 185.0 },
			{ ...sampleQuoteEvent, symbol: "GOOGL", bid: 180.0 },
			{ ...sampleQuoteEvent, symbol: "AAPL", bid: 185.5 },
			{ ...sampleQuoteEvent, symbol: "MSFT", bid: 420.0 },
		];
		const result = batchQuoteEvents(events);
		expect(result.length).toBe(3);

		const symbols = result.map((r) => {
			if (r.message.type !== "quote") {
				throw new Error("Expected quote message");
			}
			return r.message.data.symbol;
		});
		expect(symbols).toContain("AAPL");
		expect(symbols).toContain("GOOGL");
		expect(symbols).toContain("MSFT");
	});

	it("maps all events to broadcast events", () => {
		const events: QuoteStreamEvent[] = [
			{ ...sampleQuoteEvent, symbol: "AAPL" },
			{ ...sampleQuoteEvent, symbol: "GOOGL" },
		];
		const result = batchQuoteEvents(events);
		for (const event of result) {
			expect(event.target).toBeDefined();
			expect(event.message).toBeDefined();
			expect(event.target.channel).toBe("quotes");
		}
	});
});

describe("aggregateQuotes", () => {
	it("returns empty map for empty input", () => {
		const result = aggregateQuotes([]);
		expect(result.size).toBe(0);
	});

	it("aggregates by symbol", () => {
		const events: QuoteStreamEvent[] = [
			{ ...sampleQuoteEvent, symbol: "AAPL" },
			{ ...sampleQuoteEvent, symbol: "GOOGL" },
		];
		const result = aggregateQuotes(events);
		expect(result.size).toBe(2);
		expect(result.has("AAPL")).toBe(true);
		expect(result.has("GOOGL")).toBe(true);
	});

	it("keeps latest quote per symbol", () => {
		const events: QuoteStreamEvent[] = [
			{ ...sampleQuoteEvent, symbol: "AAPL", bid: 185.0 },
			{ ...sampleQuoteEvent, symbol: "AAPL", bid: 185.5 },
		];
		const result = aggregateQuotes(events);
		expect(result.get("AAPL")?.bid).toBe(185.5);
	});
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
	it("exports mapCycleEvent", async () => {
		const module = await import("./mappers");
		expect(typeof module.mapCycleEvent).toBe("function");
	});

	it("exports mapAgentEvent", async () => {
		const module = await import("./mappers");
		expect(typeof module.mapAgentEvent).toBe("function");
	});

	it("exports mapQuoteEvent", async () => {
		const module = await import("./mappers");
		expect(typeof module.mapQuoteEvent).toBe("function");
	});

	it("exports mapOrderEvent", async () => {
		const module = await import("./mappers");
		expect(typeof module.mapOrderEvent).toBe("function");
	});

	it("exports mapDecisionEvent", async () => {
		const module = await import("./mappers");
		expect(typeof module.mapDecisionEvent).toBe("function");
	});

	it("exports mapAlertEvent", async () => {
		const module = await import("./mappers");
		expect(typeof module.mapAlertEvent).toBe("function");
	});

	it("exports mapHealthCheckEvent", async () => {
		const module = await import("./mappers");
		expect(typeof module.mapHealthCheckEvent).toBe("function");
	});

	it("exports mapEvent", async () => {
		const module = await import("./mappers");
		expect(typeof module.mapEvent).toBe("function");
	});

	it("exports batchQuoteEvents", async () => {
		const module = await import("./mappers");
		expect(typeof module.batchQuoteEvents).toBe("function");
	});

	it("exports aggregateQuotes", async () => {
		const module = await import("./mappers");
		expect(typeof module.aggregateQuotes).toBe("function");
	});
});
