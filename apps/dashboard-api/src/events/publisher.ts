/**
 * Event Publisher
 *
 * Central hub that subscribes to event sources and broadcasts to WebSocket clients.
 *
 * @see docs/plans/ui/08-realtime.md lines 143-167, 190-200
 */

import { EventEmitter } from "node:events";
import { broadcast, broadcastAll, broadcastQuote } from "../websocket/handler.js";
import { createWebSocketLogger } from "../websocket/logger.js";
import { createWebSocketMetrics } from "../websocket/metrics.js";
import {
	batchQuoteEvents,
	type MappableEvent,
	mapAgentEvent,
	mapAlertEvent,
	mapCycleEvent,
	mapDecisionEvent,
	mapHealthCheckEvent,
	mapOrderEvent,
} from "./mappers.js";
import type {
	BroadcastEvent,
	DecisionInsertEvent,
	EventPublisherConfig,
	EventSource,
	HealthCheckEvent,
	MastraAgentEvent,
	MastraCycleEvent,
	OrderUpdateEvent,
	PublisherStats,
	QuoteStreamEvent,
	SourceState,
	SystemAlertEvent,
} from "./types.js";

// ============================================
// Constants
// ============================================

/**
 * Quote batch interval (ms).
 */
const QUOTE_BATCH_INTERVAL_MS = 100;

/**
 * Health check interval (ms).
 */
const HEALTH_CHECK_INTERVAL_MS = 30000;

// ============================================
// Event Publisher
// ============================================

/**
 * Event publisher interface.
 */
export interface EventPublisher {
	/** Start the publisher */
	start(): Promise<void>;

	/** Stop the publisher */
	stop(): Promise<void>;

	/** Get publisher stats */
	getStats(): PublisherStats;

	/** Get source state */
	getSourceState(source: EventSource): SourceState;

	/** Emit internal event */
	emit(event: MappableEvent): void;

	/** Check if running */
	isRunning(): boolean;
}

/**
 * Create event publisher.
 */
export function createEventPublisher(config: EventPublisherConfig = {}): EventPublisher {
	createWebSocketLogger({ level: "info" });
	const metrics = createWebSocketMetrics();
	const emitter = new EventEmitter();

	// State
	let running = false;
	let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
	let quoteBatchInterval: ReturnType<typeof setInterval> | null = null;
	const pendingQuotes: QuoteStreamEvent[] = [];

	// Source states
	const sourceStates: Record<EventSource, SourceState> = {
		redis: createSourceState(),
		grpc: createSourceState(),
		database: createSourceState(),
		internal: createSourceState(),
	};

	// Stats
	let eventsReceived = 0;
	let eventsBroadcast = 0;
	let eventsDropped = 0;

	// ============================================
	// Source State Management
	// ============================================

	function createSourceState(): SourceState {
		return {
			status: "disconnected",
			lastEvent: null,
			lastError: null,
			reconnectAttempts: 0,
		};
	}

	function updateSourceState(source: EventSource, update: Partial<SourceState>): void {
		Object.assign(sourceStates[source], update);
	}

	function setSourceConnected(source: EventSource): void {
		updateSourceState(source, {
			status: "connected",
			reconnectAttempts: 0,
			lastError: null,
		});
	}

	function setSourceDisconnected(source: EventSource): void {
		updateSourceState(source, {
			status: "disconnected",
		});
	}

	// ============================================
	// Broadcasting
	// ============================================

	function broadcastEvent(event: BroadcastEvent): void {
		try {
			const { target, message } = event;

			if (target.channel === null) {
				// Broadcast to all
				broadcastAll(message);
			} else if (target.symbol) {
				// Broadcast to symbol subscribers
				broadcastQuote(target.symbol, message);
			} else {
				// Broadcast to channel subscribers
				broadcast(target.channel, message);
			}

			eventsBroadcast++;
			metrics.observeBroadcastLatency(1); // Simplified latency tracking
		} catch (_error) {
			eventsDropped++;
		}
	}

	// ============================================
	// Quote Batching
	// ============================================

	function startQuoteBatching(): void {
		quoteBatchInterval = setInterval(() => {
			if (pendingQuotes.length === 0) {
				return;
			}

			// Get and clear pending quotes
			const quotes = pendingQuotes.splice(0, pendingQuotes.length);

			// Batch and broadcast
			const broadcastEvents = batchQuoteEvents(quotes);
			for (const event of broadcastEvents) {
				broadcastEvent(event);
			}

			metrics.observeQuoteBatchSize(quotes.length);
		}, QUOTE_BATCH_INTERVAL_MS);
	}

	function stopQuoteBatching(): void {
		if (quoteBatchInterval) {
			clearInterval(quoteBatchInterval);
			quoteBatchInterval = null;
		}
	}

	// ============================================
	// Health Checks
	// ============================================

	function startHealthChecks(): void {
		healthCheckInterval = setInterval(() => {
			const healthEvent: HealthCheckEvent = {
				status: getOverallHealth(),
				version: "0.1.0",
				uptime: process.uptime(),
				connections: metrics.getActiveConnections(),
				sources: {
					redis:
						sourceStates.redis.status === "connecting" ? "disconnected" : sourceStates.redis.status,
					grpc:
						sourceStates.grpc.status === "connecting" ? "disconnected" : sourceStates.grpc.status,
					database:
						sourceStates.database.status === "connecting" ? "disconnected" : sourceStates.database.status,
					internal:
						sourceStates.internal.status === "connecting"
							? "disconnected"
							: sourceStates.internal.status,
				},
				timestamp: new Date().toISOString(),
			};

			const event = mapHealthCheckEvent(healthEvent);
			broadcastEvent(event);
		}, HEALTH_CHECK_INTERVAL_MS);
	}

	function stopHealthChecks(): void {
		if (healthCheckInterval) {
			clearInterval(healthCheckInterval);
			healthCheckInterval = null;
		}
	}

	function getOverallHealth(): "healthy" | "degraded" | "unhealthy" {
		const states = Object.values(sourceStates);
		const connected = states.filter((s) => s.status === "connected").length;
		const errors = states.filter((s) => s.status === "error").length;

		if (errors >= 2) {
			return "unhealthy";
		}
		if (connected < 2) {
			return "degraded";
		}
		return "healthy";
	}

	// ============================================
	// Event Handlers
	// ============================================

	function handleCycleEvent(event: MastraCycleEvent): void {
		eventsReceived++;
		updateSourceState("redis", { lastEvent: new Date() });
		const broadcastEvent_ = mapCycleEvent(event);
		broadcastEvent(broadcastEvent_);
	}

	function handleAgentEvent(event: MastraAgentEvent): void {
		eventsReceived++;
		updateSourceState("redis", { lastEvent: new Date() });
		const broadcastEvent_ = mapAgentEvent(event);
		broadcastEvent(broadcastEvent_);
	}

	function handleQuoteEvent(event: QuoteStreamEvent): void {
		eventsReceived++;
		updateSourceState("grpc", { lastEvent: new Date() });
		// Queue for batching instead of immediate broadcast
		pendingQuotes.push(event);
	}

	function handleOrderEvent(event: OrderUpdateEvent): void {
		eventsReceived++;
		updateSourceState("grpc", { lastEvent: new Date() });
		const broadcastEvent_ = mapOrderEvent(event);
		broadcastEvent(broadcastEvent_);
	}

	function handleDecisionEvent(event: DecisionInsertEvent): void {
		eventsReceived++;
		updateSourceState("database", { lastEvent: new Date() });
		const broadcastEvent_ = mapDecisionEvent(event);
		broadcastEvent(broadcastEvent_);
	}

	function handleAlertEvent(event: SystemAlertEvent): void {
		eventsReceived++;
		updateSourceState("internal", { lastEvent: new Date() });
		const broadcastEvent_ = mapAlertEvent(event);
		broadcastEvent(broadcastEvent_);
	}

	// ============================================
	// Internal Event Emitter
	// ============================================

	function setupInternalEvents(): void {
		emitter.on("cycle", handleCycleEvent);
		emitter.on("agent", handleAgentEvent);
		emitter.on("quote", handleQuoteEvent);
		emitter.on("order", handleOrderEvent);
		emitter.on("decision", handleDecisionEvent);
		emitter.on("alert", handleAlertEvent);

		setSourceConnected("internal");
	}

	function teardownInternalEvents(): void {
		emitter.removeAllListeners();
		setSourceDisconnected("internal");
	}

	// ============================================
	// Public API
	// ============================================

	return {
		async start(): Promise<void> {
			if (running) {
				return;
			}
			running = true;

			// Setup internal event handling
			if (config.enableInternalEvents !== false) {
				setupInternalEvents();
			}

			// Start quote batching
			startQuoteBatching();

			// Start health checks
			startHealthChecks();
		},

		async stop(): Promise<void> {
			if (!running) {
				return;
			}
			running = false;

			// Stop intervals
			stopQuoteBatching();
			stopHealthChecks();

			// Teardown internal events
			teardownInternalEvents();

			// Flush pending quotes
			if (pendingQuotes.length > 0) {
				const broadcastEvents = batchQuoteEvents(pendingQuotes);
				for (const event of broadcastEvents) {
					broadcastEvent(event);
				}
				pendingQuotes.length = 0;
			}
		},

		getStats(): PublisherStats {
			return {
				eventsReceived,
				eventsBroadcast,
				eventsDropped,
				sourceStates: { ...sourceStates },
			};
		},

		getSourceState(source: EventSource): SourceState {
			return { ...sourceStates[source] };
		},

		emit(event: MappableEvent): void {
			if (!running) {
				return;
			}
			emitter.emit(event.type, event.data);
		},

		isRunning(): boolean {
			return running;
		},
	};
}

// ============================================
// Singleton Instance
// ============================================

let globalPublisher: EventPublisher | null = null;

/**
 * Get or create the global event publisher.
 */
export function getEventPublisher(config?: EventPublisherConfig): EventPublisher {
	if (!globalPublisher) {
		globalPublisher = createEventPublisher(config);
	}
	return globalPublisher;
}

/**
 * Reset global publisher (for testing).
 */
export function resetEventPublisher(): void {
	if (globalPublisher?.isRunning()) {
		globalPublisher.stop();
	}
	globalPublisher = null;
}

// ============================================
// Exports
// ============================================

export default createEventPublisher;
