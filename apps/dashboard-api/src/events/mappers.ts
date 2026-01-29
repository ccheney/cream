/**
 * Event → WebSocket Message Mappers
 *
 * Transforms events from various sources into WebSocket messages.
 *
 * @see docs/plans/ui/08-realtime.md
 */

import type { Action } from "@cream/domain";
import type { AgentType, OrderStatus, ServerMessage } from "@cream/domain/websocket";
import type {
	BroadcastEvent,
	DecisionInsertEvent,
	HealthCheckEvent,
	MastraAgentEvent,
	MastraCycleEvent,
	OrderUpdateEvent,
	QuoteStreamEvent,
	SystemAlertEvent,
} from "./types.js";

// ============================================
// Mastra Event Mappers
// ============================================

/**
 * Map Mastra cycle event to CycleProgressMessage.
 */
export function mapCycleEvent(event: MastraCycleEvent): BroadcastEvent {
	const message: ServerMessage = {
		type: "cycle_progress",
		data: {
			cycleId: event.cycleId,
			phase: event.phase,
			step: event.status, // Map status to step
			progress: event.progress ?? 0,
			message: event.message ?? "",
			startedAt: event.timestamp,
			estimatedCompletion: undefined,
			timestamp: event.timestamp,
		},
	};

	return {
		target: { channel: "cycles" },
		message,
	};
}

/**
 * Map Mastra agent event to AgentOutputMessage.
 */
export function mapAgentEvent(event: MastraAgentEvent): BroadcastEvent {
	// Map event agent types to domain AgentType values
	const agentTypeMap: Record<MastraAgentEvent["agentType"], AgentType> = {
		sentiment: "news",
		fundamentals: "fundamentals",
		bullish: "bullish",
		bearish: "bearish",
		trader: "trader",
		risk: "risk",
		critic: "critic",
	};

	// Map event status to domain status
	const statusMap: Record<MastraAgentEvent["status"], "running" | "complete" | "error"> = {
		started: "running",
		thinking: "running",
		complete: "complete",
		error: "error",
	};

	const message: ServerMessage = {
		type: "agent_output",
		data: {
			cycleId: event.cycleId,
			agentType: agentTypeMap[event.agentType],
			status: statusMap[event.status],
			output: typeof event.output === "string" ? event.output : JSON.stringify(event.output ?? ""),
			timestamp: event.timestamp,
		},
	};

	return {
		target: { channel: "cycles" },
		message,
	};
}

// ============================================
// gRPC Event Mappers
// ============================================

/**
 * Map quote stream event to QuoteMessage.
 */
export function mapQuoteEvent(event: QuoteStreamEvent): BroadcastEvent {
	const message: ServerMessage = {
		type: "quote",
		data: {
			symbol: event.symbol,
			bid: event.bid,
			ask: event.ask,
			last: event.last ?? event.bid, // Use bid as fallback for last
			bidSize: event.bidSize,
			askSize: event.askSize,
			volume: event.volume ?? 0,
			changePercent: undefined,
			timestamp: event.timestamp,
		},
	};

	return {
		target: { channel: "quotes", symbol: event.symbol },
		message,
	};
}

/**
 * Map order update event to OrderMessage.
 */
export function mapOrderEvent(event: OrderUpdateEvent): BroadcastEvent {
	// Map event side to domain side (lowercase)
	const sideMap: Record<OrderUpdateEvent["side"], "buy" | "sell"> = {
		BUY: "buy",
		SELL: "sell",
	};

	// Map event status to domain OrderStatus
	const statusMap: Record<OrderUpdateEvent["status"], OrderStatus> = {
		pending: "pending",
		open: "submitted",
		partially_filled: "partial_fill",
		filled: "filled",
		cancelled: "cancelled",
		rejected: "rejected",
		expired: "expired",
	};

	const message: ServerMessage = {
		type: "order",
		data: {
			id: event.orderId,
			symbol: event.symbol,
			side: sideMap[event.side],
			orderType: event.type,
			status: statusMap[event.status],
			quantity: event.quantity,
			filledQty: event.filledQuantity,
			limitPrice: event.price,
			avgPrice: event.avgFillPrice,
			timestamp: event.timestamp,
		},
	};

	return {
		target: { channel: "orders" },
		message,
	};
}

// ============================================
// Database Event Mappers
// ============================================

/**
 * Map decision insert event to DecisionMessage.
 */
export function mapDecisionEvent(event: DecisionInsertEvent): BroadcastEvent {
	const actionMap: Record<DecisionInsertEvent["action"], Action> = {
		BUY: "BUY",
		SELL: "SELL",
		HOLD: "HOLD",
		CLOSE: "CLOSE",
		INCREASE: "INCREASE",
		REDUCE: "REDUCE",
		NO_TRADE: "NO_TRADE",
	};

	const message: ServerMessage = {
		type: "decision",
		data: {
			instrument: {
				instrumentId: event.symbol,
				instrumentType: event.symbol.length >= 15 ? "OPTION" : "EQUITY",
			},
			action: actionMap[event.action],
			size: {
				quantity: 0,
				unit: event.symbol.length >= 15 ? "CONTRACTS" : "SHARES",
				targetPositionQuantity: 0,
			},
			orderPlan: {
				entryOrderType: "MARKET",
				exitOrderType: "MARKET",
				timeInForce: "DAY",
			},
			riskLevels: {
				stopLossLevel: 0,
				takeProfitLevel: 0,
				denomination: "UNDERLYING_PRICE",
			},
			strategyFamily: "TREND",
			rationale: "Decision loaded from database",
			confidence: event.confidence,
		},
		cycleId: event.cycleId,
	};

	return {
		target: { channel: "decisions" },
		message,
	};
}

// ============================================
// Internal Event Mappers
// ============================================

/**
 * Map system alert to AlertMessage.
 */
export function mapAlertEvent(event: SystemAlertEvent): BroadcastEvent {
	const message: ServerMessage = {
		type: "alert",
		data: {
			id: event.alertId,
			severity: event.severity,
			title: event.title,
			message: event.message,
			acknowledged: false,
			timestamp: event.timestamp,
		},
	};

	return {
		target: { channel: "alerts" },
		message,
	};
}

/**
 * Map health check to SystemStatusMessage.
 */
export function mapHealthCheckEvent(event: HealthCheckEvent): BroadcastEvent {
	const message: ServerMessage = {
		type: "system_status",
		data: {
			health: event.status,
			uptimeSeconds: event.uptime,
			activeConnections: event.connections,
			services: Object.fromEntries(
				Object.entries(event.sources).map(([name, status]) => [
					name,
					{
						status: status === "connected" ? ("healthy" as const) : ("unhealthy" as const),
						lastCheck: event.timestamp,
					},
				]),
			),
			environment: "PAPER" as const,
			timestamp: event.timestamp,
		},
	};

	return {
		target: { channel: null }, // Broadcast to all
		message,
	};
}

// ============================================
// Generic Mapper
// ============================================

/**
 * Event type discriminators.
 */
export type MappableEvent =
	| { type: "cycle"; data: MastraCycleEvent }
	| { type: "agent"; data: MastraAgentEvent }
	| { type: "quote"; data: QuoteStreamEvent }
	| { type: "order"; data: OrderUpdateEvent }
	| { type: "decision"; data: DecisionInsertEvent }
	| { type: "alert"; data: SystemAlertEvent }
	| { type: "health"; data: HealthCheckEvent };

/**
 * Map any event to broadcast event.
 */
export function mapEvent(event: MappableEvent): BroadcastEvent {
	switch (event.type) {
		case "cycle":
			return mapCycleEvent(event.data);
		case "agent":
			return mapAgentEvent(event.data);
		case "quote":
			return mapQuoteEvent(event.data);
		case "order":
			return mapOrderEvent(event.data);
		case "decision":
			return mapDecisionEvent(event.data);
		case "alert":
			return mapAlertEvent(event.data);
		case "health":
			return mapHealthCheckEvent(event.data);
	}
}

// ============================================
// Batching Utilities
// ============================================

/**
 * Batch multiple quote events into array.
 * Used for throttled quote delivery.
 */
export function batchQuoteEvents(events: QuoteStreamEvent[]): BroadcastEvent[] {
	// Group by symbol
	const bySymbol = new Map<string, QuoteStreamEvent>();
	for (const event of events) {
		// Keep latest quote per symbol
		bySymbol.set(event.symbol, event);
	}

	// Map each to broadcast event
	return Array.from(bySymbol.values()).map(mapQuoteEvent);
}

/**
 * Aggregate quote events by symbol (for batch messages).
 */
export function aggregateQuotes(events: QuoteStreamEvent[]): Map<string, QuoteStreamEvent> {
	const latest = new Map<string, QuoteStreamEvent>();
	for (const event of events) {
		latest.set(event.symbol, event);
	}
	return latest;
}
