/**
 * WebSocket Structured Logger
 *
 * JSON-formatted logging for WebSocket connection lifecycle.
 *
 * @see docs/plans/ui/06-websocket.md
 * @see docs/plans/ui/08-realtime.md lines 130-139
 */

import logger from "../logger.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type WebSocketEventType =
	| "connection.attempt"
	| "connection.success"
	| "connection.failure"
	| "connection.close"
	| "connection.reconnect"
	| "message.received"
	| "message.sent"
	| "message.invalid"
	| "subscribe.channel"
	| "subscribe.symbol"
	| "unsubscribe.channel"
	| "unsubscribe.symbol"
	| "auth.failure"
	| "rate_limit.exceeded"
	| "broadcast.error"
	| "heartbeat.ping"
	| "heartbeat.pong"
	| "heartbeat.timeout";

export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	event: WebSocketEventType;
	correlationId: string;
	connectionId?: string;
	userId?: string;
	message: string;
	metadata?: Record<string, unknown>;
}

export interface ConnectionEventMeta {
	ip?: string;
	userAgent?: string;
	protocol?: string;
	duration?: number;
	reason?: string;
	attemptCount?: number;
}

export interface MessageEventMeta {
	type: string;
	size: number;
	raw?: string;
	error?: string;
}

export interface SubscriptionEventMeta {
	channels?: string[];
	symbols?: string[];
	action?: "subscribe" | "unsubscribe";
	authorized?: boolean;
	reason?: string;
}

export interface LoggerConfig {
	level: LogLevel;
	enabled: boolean;
	pretty: boolean;
	includeRawMessages: boolean;
	maxRawMessageLength: number;
}

export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
	level: "info",
	enabled: true,
	pretty: false,
	includeRawMessages: false,
	maxRawMessageLength: 500,
};

export function generateCorrelationId(): string {
	return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
	return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

export function getTimestamp(): string {
	return new Date().toISOString();
}

export function truncateMessage(raw: string, maxLength: number): string {
	if (raw.length <= maxLength) {
		return raw;
	}
	return `${raw.slice(0, maxLength)}...[truncated]`;
}

/**
 * @example
 * ```ts
 * const logger = createWebSocketLogger();
 *
 * logger.connectionAttempt({ userId: "user-123", ip: "192.168.1.1" });
 * logger.connectionSuccess({ connectionId: "conn-456", userId: "user-123" });
 * logger.messageReceived({ connectionId: "conn-456", type: "subscribe", size: 128 });
 * ```
 */
export interface WebSocketLogger {
	config: LoggerConfig;
	setLevel(level: LogLevel): void;

	connectionAttempt(meta: { userId?: string; ip: string; userAgent?: string }): void;
	connectionSuccess(meta: { connectionId: string; userId?: string; protocol?: string }): void;
	connectionFailure(meta: { userId?: string; ip: string; reason: string }): void;
	connectionClose(meta: {
		connectionId: string;
		userId?: string;
		duration: number;
		reason?: string;
	}): void;
	reconnectAttempt(meta: { userId: string; connectionId: string; attemptCount: number }): void;

	messageReceived(meta: { connectionId: string; type: string; size: number }): void;
	messageSent(meta: { connectionId: string; type: string; size: number }): void;
	messageInvalid(meta: { connectionId: string; error: string; raw?: string }): void;

	channelSubscribe(meta: { connectionId: string; userId?: string; channels: string[] }): void;
	channelUnsubscribe(meta: { connectionId: string; channels: string[] }): void;
	symbolSubscribe(meta: { connectionId: string; symbols: string[] }): void;
	symbolUnsubscribe(meta: { connectionId: string; symbols: string[] }): void;
	authFailure(meta: { userId?: string; channel: string; reason: string }): void;

	rateLimitExceeded(meta: { connectionId: string; userId?: string; reason: string }): void;

	broadcastError(meta: { connectionId: string; error: string }): void;

	heartbeatPing(meta: { connectionId: string }): void;
	heartbeatPong(meta: { connectionId: string; latency: number }): void;
	heartbeatTimeout(meta: { connectionId: string }): void;

	log(entry: LogEntry): void;
}

type EntryFactory = (
	level: LogLevel,
	event: WebSocketEventType,
	message: string,
	connectionId?: string,
	userId?: string,
	metadata?: Record<string, unknown>,
) => LogEntry;

type EmitEntry = (
	level: LogLevel,
	event: WebSocketEventType,
	message: string,
	connectionId?: string,
	userId?: string,
	metadata?: Record<string, unknown>,
) => void;

function createLogDispatcher(config: LoggerConfig): (entry: LogEntry) => void {
	return (entry: LogEntry): void => {
		if (!config.enabled || !shouldLog(entry.level, config.level)) {
			return;
		}

		switch (entry.level) {
			case "error":
				logger.error(entry, entry.message);
				return;
			case "warn":
				logger.warn(entry, entry.message);
				return;
			case "debug":
				logger.debug(entry, entry.message);
				return;
			default:
				logger.info(entry, entry.message);
		}
	};
}

function createEntryFactory(): EntryFactory {
	return (
		level: LogLevel,
		event: WebSocketEventType,
		message: string,
		connectionId?: string,
		userId?: string,
		metadata?: Record<string, unknown>,
	): LogEntry => ({
		timestamp: getTimestamp(),
		level,
		event,
		correlationId: generateCorrelationId(),
		connectionId,
		userId,
		message,
		metadata,
	});
}

function createEmitter(log: (entry: LogEntry) => void, createEntry: EntryFactory): EmitEntry {
	return (
		level: LogLevel,
		event: WebSocketEventType,
		message: string,
		connectionId?: string,
		userId?: string,
		metadata?: Record<string, unknown>,
	): void => {
		log(createEntry(level, event, message, connectionId, userId, metadata));
	};
}

function createConnectionHandlers(
	emit: EmitEntry,
): Pick<
	WebSocketLogger,
	| "connectionAttempt"
	| "connectionSuccess"
	| "connectionFailure"
	| "connectionClose"
	| "reconnectAttempt"
> {
	return {
		connectionAttempt({ userId, ip, userAgent }) {
			emit("info", "connection.attempt", `Connection attempt from ${ip}`, undefined, userId, {
				ip,
				userAgent,
			});
		},
		connectionSuccess({ connectionId, userId, protocol }) {
			emit(
				"info",
				"connection.success",
				`Connection established: ${connectionId}`,
				connectionId,
				userId,
				{
					protocol,
				},
			);
		},
		connectionFailure({ userId, ip, reason }) {
			emit(
				"warn",
				"connection.failure",
				`Connection failed from ${ip}: ${reason}`,
				undefined,
				userId,
				{
					ip,
					reason,
				},
			);
		},
		connectionClose({ connectionId, userId, duration, reason }) {
			emit(
				"info",
				"connection.close",
				`Connection closed: ${connectionId} (duration: ${duration}ms)`,
				connectionId,
				userId,
				{ duration, reason },
			);
		},
		reconnectAttempt({ userId, connectionId, attemptCount }) {
			emit(
				"info",
				"connection.reconnect",
				`Reconnection attempt ${attemptCount}`,
				connectionId,
				userId,
				{
					attemptCount,
				},
			);
		},
	};
}

function createMessageHandlers(
	emit: EmitEntry,
	config: LoggerConfig,
): Pick<WebSocketLogger, "messageReceived" | "messageSent" | "messageInvalid"> {
	return {
		messageReceived({ connectionId, type, size }) {
			emit(
				"debug",
				"message.received",
				`Received ${type} (${size} bytes)`,
				connectionId,
				undefined,
				{
					type,
					size,
				},
			);
		},
		messageSent({ connectionId, type, size }) {
			emit("debug", "message.sent", `Sent ${type} (${size} bytes)`, connectionId, undefined, {
				type,
				size,
			});
		},
		messageInvalid({ connectionId, error, raw }) {
			const truncated =
				raw && config.includeRawMessages
					? truncateMessage(raw, config.maxRawMessageLength)
					: undefined;
			emit("warn", "message.invalid", `Invalid message: ${error}`, connectionId, undefined, {
				error,
				raw: truncated,
			});
		},
	};
}

function createSubscriptionHandlers(
	emit: EmitEntry,
): Pick<
	WebSocketLogger,
	| "channelSubscribe"
	| "channelUnsubscribe"
	| "symbolSubscribe"
	| "symbolUnsubscribe"
	| "authFailure"
> {
	return {
		channelSubscribe({ connectionId, userId, channels }) {
			emit(
				"info",
				"subscribe.channel",
				`Subscribed to channels: ${channels.join(", ")}`,
				connectionId,
				userId,
				{ channels },
			);
		},
		channelUnsubscribe({ connectionId, channels }) {
			emit(
				"info",
				"unsubscribe.channel",
				`Unsubscribed from channels: ${channels.join(", ")}`,
				connectionId,
				undefined,
				{ channels },
			);
		},
		symbolSubscribe({ connectionId, symbols }) {
			emit(
				"info",
				"subscribe.symbol",
				`Subscribed to symbols: ${symbols.join(", ")}`,
				connectionId,
				undefined,
				{ symbols },
			);
		},
		symbolUnsubscribe({ connectionId, symbols }) {
			emit(
				"info",
				"unsubscribe.symbol",
				`Unsubscribed from symbols: ${symbols.join(", ")}`,
				connectionId,
				undefined,
				{ symbols },
			);
		},
		authFailure({ userId, channel, reason }) {
			emit(
				"warn",
				"auth.failure",
				`Authorization failed for channel ${channel}: ${reason}`,
				undefined,
				userId,
				{ channel, reason },
			);
		},
	};
}

function createSystemHandlers(
	emit: EmitEntry,
): Pick<
	WebSocketLogger,
	"rateLimitExceeded" | "broadcastError" | "heartbeatPing" | "heartbeatPong" | "heartbeatTimeout"
> {
	return {
		rateLimitExceeded({ connectionId, userId, reason }) {
			emit("warn", "rate_limit.exceeded", `Rate limit exceeded: ${reason}`, connectionId, userId, {
				reason,
			});
		},
		broadcastError({ connectionId, error }) {
			emit("error", "broadcast.error", `Broadcast error: ${error}`, connectionId, undefined, {
				error,
			});
		},
		heartbeatPing({ connectionId }) {
			emit("debug", "heartbeat.ping", "Heartbeat ping sent", connectionId);
		},
		heartbeatPong({ connectionId, latency }) {
			emit(
				"debug",
				"heartbeat.pong",
				`Heartbeat pong received (latency: ${latency}ms)`,
				connectionId,
				undefined,
				{ latency },
			);
		},
		heartbeatTimeout({ connectionId }) {
			emit("warn", "heartbeat.timeout", "Heartbeat timeout", connectionId);
		},
	};
}

export function createWebSocketLogger(config: Partial<LoggerConfig> = {}): WebSocketLogger {
	const fullConfig: LoggerConfig = { ...DEFAULT_LOGGER_CONFIG, ...config };
	const log = createLogDispatcher(fullConfig);
	const createEntry = createEntryFactory();
	const emit = createEmitter(log, createEntry);

	return {
		config: fullConfig,
		setLevel(level: LogLevel) {
			fullConfig.level = level;
		},
		...createConnectionHandlers(emit),
		...createMessageHandlers(emit, fullConfig),
		...createSubscriptionHandlers(emit),
		...createSystemHandlers(emit),
		log,
	};
}

export default createWebSocketLogger;
