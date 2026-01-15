/**
 * Event Publisher Types
 *
 * Type definitions for event sourcing infrastructure.
 *
 * @see docs/plans/ui/08-realtime.md lines 143-167, 190-200
 */

import type { Channel, ServerMessage } from "@cream/domain/websocket";
import { z } from "zod/v4";

// ============================================
// Event Sources
// ============================================

/**
 * Event sources in the system.
 */
export type EventSource = "redis" | "grpc" | "turso" | "internal";

/**
 * Event source status.
 */
export type SourceStatus = "connecting" | "connected" | "disconnected" | "error";

// ============================================
// Base Event
// ============================================

/**
 * Base event schema.
 */
export const BaseEventSchema = z.object({
	/** Unique event ID */
	id: z.string(),
	/** Event source */
	source: z.enum(["redis", "grpc", "turso", "internal"]),
	/** Event type */
	type: z.string(),
	/** Event timestamp */
	timestamp: z.string().datetime(),
	/** Event payload */
	payload: z.unknown(),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

// ============================================
// Redis Events (Mastra)
// ============================================

/**
 * Redis pub/sub channel patterns.
 */
export const REDIS_CHANNELS = {
	CYCLE: "mastra:cycle:*",
	AGENT: "mastra:agent:*",
	ALERT: "system:alert:*",
} as const;

/**
 * Mastra cycle event schema.
 */
export const MastraCycleEventSchema = z.object({
	cycleId: z.string(),
	phase: z.enum(["observe", "orient", "decide", "act", "complete"]),
	status: z.enum(["started", "progress", "completed", "failed"]),
	progress: z.number().min(0).max(100).optional(),
	message: z.string().optional(),
	timestamp: z.string().datetime(),
});

export type MastraCycleEvent = z.infer<typeof MastraCycleEventSchema>;

/**
 * Mastra agent event schema.
 */
export const MastraAgentEventSchema = z.object({
	cycleId: z.string(),
	agentType: z.enum([
		"sentiment",
		"fundamentals",
		"bullish",
		"bearish",
		"trader",
		"risk",
		"critic",
	]),
	status: z.enum(["started", "thinking", "complete", "error"]),
	output: z.unknown().optional(),
	reasoning: z.string().optional(),
	timestamp: z.string().datetime(),
});

export type MastraAgentEvent = z.infer<typeof MastraAgentEventSchema>;

// ============================================
// gRPC Events (Rust Core)
// ============================================

/**
 * Quote stream event (from Rust Core).
 */
export const QuoteStreamEventSchema = z.object({
	symbol: z.string(),
	bid: z.number(),
	ask: z.number(),
	bidSize: z.number().optional(),
	askSize: z.number().optional(),
	last: z.number().optional(),
	lastSize: z.number().optional(),
	volume: z.number().optional(),
	timestamp: z.string().datetime(),
});

export type QuoteStreamEvent = z.infer<typeof QuoteStreamEventSchema>;

/**
 * Order update event (from Rust Core).
 */
export const OrderUpdateEventSchema = z.object({
	orderId: z.string(),
	symbol: z.string(),
	side: z.enum(["BUY", "SELL"]),
	type: z.enum(["market", "limit", "stop", "stop_limit"]),
	quantity: z.number(),
	filledQuantity: z.number(),
	price: z.number().optional(),
	avgFillPrice: z.number().optional(),
	status: z.enum([
		"pending",
		"open",
		"partially_filled",
		"filled",
		"cancelled",
		"rejected",
		"expired",
	]),
	timestamp: z.string().datetime(),
});

export type OrderUpdateEvent = z.infer<typeof OrderUpdateEventSchema>;

// ============================================
// Turso Events (Database CDC)
// ============================================

/**
 * Decision insert event (from Turso CDC).
 */
export const DecisionInsertEventSchema = z.object({
	decisionId: z.string(),
	cycleId: z.string(),
	symbol: z.string(),
	action: z.enum(["BUY", "SELL", "HOLD", "CLOSE"]),
	direction: z.enum(["LONG", "SHORT", "FLAT"]),
	confidence: z.number().min(0).max(1),
	createdAt: z.string().datetime(),
});

export type DecisionInsertEvent = z.infer<typeof DecisionInsertEventSchema>;

// ============================================
// Internal Events
// ============================================

/**
 * System alert event.
 */
export const SystemAlertEventSchema = z.object({
	alertId: z.string(),
	severity: z.enum(["info", "warning", "error", "critical"]),
	title: z.string(),
	message: z.string(),
	source: z.string().optional(),
	timestamp: z.string().datetime(),
});

export type SystemAlertEvent = z.infer<typeof SystemAlertEventSchema>;

/**
 * Health check event.
 */
export const HealthCheckEventSchema = z.object({
	status: z.enum(["healthy", "degraded", "unhealthy"]),
	version: z.string(),
	uptime: z.number(),
	connections: z.number(),
	sources: z.record(z.string(), z.enum(["connected", "disconnected", "error"])),
	timestamp: z.string().datetime(),
});

export type HealthCheckEvent = z.infer<typeof HealthCheckEventSchema>;

// ============================================
// Event Handlers
// ============================================

/**
 * Event handler function.
 */
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

/**
 * Event subscription.
 */
export interface EventSubscription {
	/** Subscription ID */
	id: string;
	/** Event pattern or channel */
	pattern: string;
	/** Handler function */
	handler: EventHandler;
	/** Unsubscribe function */
	unsubscribe: () => void;
}

// ============================================
// Publisher Configuration
// ============================================

/**
 * Redis configuration.
 */
export interface RedisConfig {
	url: string;
	password?: string;
	db?: number;
	maxRetries?: number;
	retryDelayMs?: number;
}

/**
 * gRPC configuration.
 */
export interface GrpcConfig {
	host: string;
	port: number;
	useTls?: boolean;
	maxRetries?: number;
	retryDelayMs?: number;
}

/**
 * Turso CDC configuration.
 */
export interface TursoCdcConfig {
	/** Polling interval in milliseconds */
	pollIntervalMs: number;
	/** Tables to watch */
	tables: string[];
	/** Max poll retries */
	maxRetries?: number;
}

/**
 * Event publisher configuration.
 */
export interface EventPublisherConfig {
	/** Redis configuration (optional) */
	redis?: RedisConfig;
	/** gRPC configuration (optional) */
	grpc?: GrpcConfig;
	/** Turso CDC configuration (optional) */
	turso?: TursoCdcConfig;
	/** Enable internal events */
	enableInternalEvents?: boolean;
}

// ============================================
// Publisher State
// ============================================

/**
 * Source connection state.
 */
export interface SourceState {
	status: SourceStatus;
	lastEvent: Date | null;
	lastError: Error | null;
	reconnectAttempts: number;
}

/**
 * Publisher statistics.
 */
export interface PublisherStats {
	eventsReceived: number;
	eventsBroadcast: number;
	eventsDropped: number;
	sourceStates: Record<EventSource, SourceState>;
}

// ============================================
// Broadcast Context
// ============================================

/**
 * Broadcast target specification.
 */
export interface BroadcastTarget {
	/** Target channel (null for all) */
	channel: Channel | null;
	/** Target symbol (for quotes) */
	symbol?: string;
}

/**
 * Mapped broadcast event.
 */
export interface BroadcastEvent {
	/** Target specification */
	target: BroadcastTarget;
	/** WebSocket message to send */
	message: ServerMessage;
}
