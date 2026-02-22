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

interface PublisherRuntime {
	metrics: ReturnType<typeof createWebSocketMetrics>;
	emitter: EventEmitter;
	running: boolean;
	healthCheckInterval: ReturnType<typeof setInterval> | null;
	quoteBatchInterval: ReturnType<typeof setInterval> | null;
	pendingQuotes: QuoteStreamEvent[];
	sourceStates: Record<EventSource, SourceState>;
	eventsReceived: number;
	eventsBroadcast: number;
	eventsDropped: number;
}

function createSourceState(): SourceState {
	return {
		status: "disconnected",
		lastEvent: null,
		lastError: null,
		reconnectAttempts: 0,
	};
}

function createSourceStates(): Record<EventSource, SourceState> {
	return {
		redis: createSourceState(),
		grpc: createSourceState(),
		database: createSourceState(),
		internal: createSourceState(),
	};
}

function createPublisherRuntime(): PublisherRuntime {
	return {
		metrics: createWebSocketMetrics(),
		emitter: new EventEmitter(),
		running: false,
		healthCheckInterval: null,
		quoteBatchInterval: null,
		pendingQuotes: [],
		sourceStates: createSourceStates(),
		eventsReceived: 0,
		eventsBroadcast: 0,
		eventsDropped: 0,
	};
}

function updateSourceState(
	runtime: PublisherRuntime,
	source: EventSource,
	update: Partial<SourceState>,
): void {
	Object.assign(runtime.sourceStates[source], update);
}

function setSourceConnected(runtime: PublisherRuntime, source: EventSource): void {
	updateSourceState(runtime, source, {
		status: "connected",
		reconnectAttempts: 0,
		lastError: null,
	});
}

function setSourceDisconnected(runtime: PublisherRuntime, source: EventSource): void {
	updateSourceState(runtime, source, { status: "disconnected" });
}

function broadcastEvent(runtime: PublisherRuntime, event: BroadcastEvent): void {
	try {
		const { target, message } = event;
		if (target.channel === null) {
			broadcastAll(message);
		} else if (target.symbol) {
			broadcastQuote(target.symbol, message);
		} else {
			broadcast(target.channel, message);
		}

		runtime.eventsBroadcast++;
		runtime.metrics.observeBroadcastLatency(1);
	} catch {
		runtime.eventsDropped++;
	}
}

function flushPendingQuotes(runtime: PublisherRuntime): void {
	if (runtime.pendingQuotes.length === 0) {
		return;
	}

	const quotes = runtime.pendingQuotes.splice(0, runtime.pendingQuotes.length);
	const events = batchQuoteEvents(quotes);
	for (const event of events) {
		broadcastEvent(runtime, event);
	}
	runtime.metrics.observeQuoteBatchSize(quotes.length);
}

function startQuoteBatching(runtime: PublisherRuntime): void {
	runtime.quoteBatchInterval = setInterval(() => {
		flushPendingQuotes(runtime);
	}, QUOTE_BATCH_INTERVAL_MS);
}

function stopQuoteBatching(runtime: PublisherRuntime): void {
	if (!runtime.quoteBatchInterval) {
		return;
	}

	clearInterval(runtime.quoteBatchInterval);
	runtime.quoteBatchInterval = null;
}

type HealthSourceStatus = HealthCheckEvent["sources"][string];

function normalizeHealthSourceState(status: SourceState["status"]): HealthSourceStatus {
	return status === "connecting" ? "disconnected" : status;
}

function getOverallHealth(
	sourceStates: Record<EventSource, SourceState>,
): "healthy" | "degraded" | "unhealthy" {
	const states = Object.values(sourceStates);
	const connected = states.filter((state) => state.status === "connected").length;
	const errors = states.filter((state) => state.status === "error").length;
	if (errors >= 2) {
		return "unhealthy";
	}
	if (connected < 2) {
		return "degraded";
	}
	return "healthy";
}

function createHealthCheckEvent(runtime: PublisherRuntime): HealthCheckEvent {
	return {
		status: getOverallHealth(runtime.sourceStates),
		version: "0.1.0",
		uptime: process.uptime(),
		connections: runtime.metrics.getActiveConnections(),
		sources: {
			redis: normalizeHealthSourceState(runtime.sourceStates.redis.status),
			grpc: normalizeHealthSourceState(runtime.sourceStates.grpc.status),
			database: normalizeHealthSourceState(runtime.sourceStates.database.status),
			internal: normalizeHealthSourceState(runtime.sourceStates.internal.status),
		},
		timestamp: new Date().toISOString(),
	};
}

function startHealthChecks(runtime: PublisherRuntime): void {
	runtime.healthCheckInterval = setInterval(() => {
		const healthEvent = createHealthCheckEvent(runtime);
		broadcastEvent(runtime, mapHealthCheckEvent(healthEvent));
	}, HEALTH_CHECK_INTERVAL_MS);
}

function stopHealthChecks(runtime: PublisherRuntime): void {
	if (!runtime.healthCheckInterval) {
		return;
	}

	clearInterval(runtime.healthCheckInterval);
	runtime.healthCheckInterval = null;
}

function recordSourceEvent(runtime: PublisherRuntime, source: EventSource): void {
	runtime.eventsReceived++;
	updateSourceState(runtime, source, { lastEvent: new Date() });
}

function handleCycleEvent(runtime: PublisherRuntime, event: MastraCycleEvent): void {
	recordSourceEvent(runtime, "redis");
	broadcastEvent(runtime, mapCycleEvent(event));
}

function handleAgentEvent(runtime: PublisherRuntime, event: MastraAgentEvent): void {
	recordSourceEvent(runtime, "redis");
	broadcastEvent(runtime, mapAgentEvent(event));
}

function handleQuoteEvent(runtime: PublisherRuntime, event: QuoteStreamEvent): void {
	recordSourceEvent(runtime, "grpc");
	runtime.pendingQuotes.push(event);
}

function handleOrderEvent(runtime: PublisherRuntime, event: OrderUpdateEvent): void {
	recordSourceEvent(runtime, "grpc");
	broadcastEvent(runtime, mapOrderEvent(event));
}

function handleDecisionEvent(runtime: PublisherRuntime, event: DecisionInsertEvent): void {
	recordSourceEvent(runtime, "database");
	broadcastEvent(runtime, mapDecisionEvent(event));
}

function handleAlertEvent(runtime: PublisherRuntime, event: SystemAlertEvent): void {
	recordSourceEvent(runtime, "internal");
	broadcastEvent(runtime, mapAlertEvent(event));
}

function setupInternalEvents(runtime: PublisherRuntime): void {
	runtime.emitter.on("cycle", (event: MastraCycleEvent) => handleCycleEvent(runtime, event));
	runtime.emitter.on("agent", (event: MastraAgentEvent) => handleAgentEvent(runtime, event));
	runtime.emitter.on("quote", (event: QuoteStreamEvent) => handleQuoteEvent(runtime, event));
	runtime.emitter.on("order", (event: OrderUpdateEvent) => handleOrderEvent(runtime, event));
	runtime.emitter.on("decision", (event: DecisionInsertEvent) =>
		handleDecisionEvent(runtime, event),
	);
	runtime.emitter.on("alert", (event: SystemAlertEvent) => handleAlertEvent(runtime, event));
	setSourceConnected(runtime, "internal");
}

function teardownInternalEvents(runtime: PublisherRuntime): void {
	runtime.emitter.removeAllListeners();
	setSourceDisconnected(runtime, "internal");
}

function startPublisher(runtime: PublisherRuntime, config: EventPublisherConfig): void {
	if (runtime.running) {
		return;
	}

	runtime.running = true;
	if (config.enableInternalEvents !== false) {
		setupInternalEvents(runtime);
	}
	startQuoteBatching(runtime);
	startHealthChecks(runtime);
}

function stopPublisher(runtime: PublisherRuntime): void {
	if (!runtime.running) {
		return;
	}

	runtime.running = false;
	stopQuoteBatching(runtime);
	stopHealthChecks(runtime);
	teardownInternalEvents(runtime);
	flushPendingQuotes(runtime);
}

function getPublisherStats(runtime: PublisherRuntime): PublisherStats {
	return {
		eventsReceived: runtime.eventsReceived,
		eventsBroadcast: runtime.eventsBroadcast,
		eventsDropped: runtime.eventsDropped,
		sourceStates: { ...runtime.sourceStates },
	};
}

function createPublisherApi(
	runtime: PublisherRuntime,
	config: EventPublisherConfig,
): EventPublisher {
	return {
		async start(): Promise<void> {
			startPublisher(runtime, config);
		},

		async stop(): Promise<void> {
			stopPublisher(runtime);
		},

		getStats(): PublisherStats {
			return getPublisherStats(runtime);
		},

		getSourceState(source: EventSource): SourceState {
			return { ...runtime.sourceStates[source] };
		},

		emit(event: MappableEvent): void {
			if (!runtime.running) {
				return;
			}
			runtime.emitter.emit(event.type, event.data);
		},

		isRunning(): boolean {
			return runtime.running;
		},
	};
}

/**
 * Create event publisher.
 */
export function createEventPublisher(config: EventPublisherConfig = {}): EventPublisher {
	createWebSocketLogger({ level: "info" });
	const runtime = createPublisherRuntime();
	return createPublisherApi(runtime, config);
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
