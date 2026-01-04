/**
 * Event → WebSocket Message Mappers
 *
 * Transforms events from various sources into WebSocket messages.
 *
 * @see docs/plans/ui/08-realtime.md
 */

import type { ServerMessage } from "../../../../packages/domain/src/websocket/index.js";
import type { Channel } from "../../../../packages/domain/src/websocket/channel.js";
import type {
  MastraCycleEvent,
  MastraAgentEvent,
  QuoteStreamEvent,
  OrderUpdateEvent,
  DecisionInsertEvent,
  SystemAlertEvent,
  HealthCheckEvent,
  BroadcastEvent,
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
      progress: event.progress ?? 0,
      status: event.status,
      message: event.message,
      startedAt: event.timestamp,
      estimatedCompletion: undefined,
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
  const message: ServerMessage = {
    type: "agent_output",
    data: {
      cycleId: event.cycleId,
      agentType: event.agentType,
      status: event.status,
      reasoning: event.reasoning,
      output: event.output,
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
      bidSize: event.bidSize,
      askSize: event.askSize,
      last: event.last,
      lastSize: event.lastSize,
      volume: event.volume,
      change: undefined,
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
  const message: ServerMessage = {
    type: "order",
    data: {
      id: event.orderId,
      symbol: event.symbol,
      side: event.side,
      type: event.type,
      quantity: event.quantity,
      filledQuantity: event.filledQuantity,
      price: event.price,
      avgFillPrice: event.avgFillPrice,
      status: event.status,
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
    },
  };

  return {
    target: { channel: "orders" },
    message,
  };
}

// ============================================
// Turso Event Mappers
// ============================================

/**
 * Map decision insert event to DecisionMessage.
 */
export function mapDecisionEvent(event: DecisionInsertEvent): BroadcastEvent {
  const message: ServerMessage = {
    type: "decision",
    data: {
      instrument: {
        ticker: event.symbol,
        assetType: "EQUITY",
      },
      action: event.action,
      direction: event.direction,
      entry: { amount: 0, unit: "SHARES" },
      sizing: { amount: 0, unit: "SHARES" },
      stopLoss: { price: 0 },
      takeProfit: {},
      rationale: {
        summary: "Decision loaded from database",
        bullishFactors: [],
        bearishFactors: [],
        keyRisks: [],
      },
      confidence: event.confidence,
      metadata: {
        cycleId: event.cycleId,
        decisionId: event.decisionId,
        timestamp: event.createdAt,
      },
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
      source: event.source,
      timestamp: event.timestamp,
      dismissible: true,
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
      status: event.status,
      version: event.version,
      uptime: event.uptime,
      connections: event.connections,
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
export function aggregateQuotes(
  events: QuoteStreamEvent[]
): Map<string, QuoteStreamEvent> {
  const latest = new Map<string, QuoteStreamEvent>();
  for (const event of events) {
    latest.set(event.symbol, event);
  }
  return latest;
}
