/**
 * WebSocket Structured Logger
 *
 * JSON-formatted logging for WebSocket connection lifecycle.
 *
 * @see docs/plans/ui/06-websocket.md
 * @see docs/plans/ui/08-realtime.md lines 130-139
 */

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

export function createWebSocketLogger(config: Partial<LoggerConfig> = {}): WebSocketLogger {
  const fullConfig: LoggerConfig = { ...DEFAULT_LOGGER_CONFIG, ...config };

  const log = (entry: LogEntry): void => {
    if (!fullConfig.enabled) {
      return;
    }
    if (!shouldLog(entry.level, fullConfig.level)) {
      return;
    }

    switch (entry.level) {
      case "error":
        break;
      case "warn":
        break;
      case "debug":
        break;
      default:
    }
  };

  const createEntry = (
    level: LogLevel,
    event: WebSocketEventType,
    message: string,
    connectionId?: string,
    userId?: string,
    metadata?: Record<string, unknown>
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

  return {
    config: fullConfig,

    setLevel(level: LogLevel) {
      fullConfig.level = level;
    },

    connectionAttempt({ userId, ip, userAgent }) {
      log(
        createEntry(
          "info",
          "connection.attempt",
          `Connection attempt from ${ip}`,
          undefined,
          userId,
          { ip, userAgent }
        )
      );
    },

    connectionSuccess({ connectionId, userId, protocol }) {
      log(
        createEntry(
          "info",
          "connection.success",
          `Connection established: ${connectionId}`,
          connectionId,
          userId,
          { protocol }
        )
      );
    },

    connectionFailure({ userId, ip, reason }) {
      log(
        createEntry(
          "warn",
          "connection.failure",
          `Connection failed from ${ip}: ${reason}`,
          undefined,
          userId,
          { ip, reason }
        )
      );
    },

    connectionClose({ connectionId, userId, duration, reason }) {
      log(
        createEntry(
          "info",
          "connection.close",
          `Connection closed: ${connectionId} (duration: ${duration}ms)`,
          connectionId,
          userId,
          { duration, reason }
        )
      );
    },

    reconnectAttempt({ userId, connectionId, attemptCount }) {
      log(
        createEntry(
          "info",
          "connection.reconnect",
          `Reconnection attempt ${attemptCount}`,
          connectionId,
          userId,
          { attemptCount }
        )
      );
    },

    messageReceived({ connectionId, type, size }) {
      log(
        createEntry(
          "debug",
          "message.received",
          `Received ${type} (${size} bytes)`,
          connectionId,
          undefined,
          { type, size }
        )
      );
    },

    messageSent({ connectionId, type, size }) {
      log(
        createEntry(
          "debug",
          "message.sent",
          `Sent ${type} (${size} bytes)`,
          connectionId,
          undefined,
          { type, size }
        )
      );
    },

    messageInvalid({ connectionId, error, raw }) {
      const truncated =
        raw && fullConfig.includeRawMessages
          ? truncateMessage(raw, fullConfig.maxRawMessageLength)
          : undefined;
      log(
        createEntry(
          "warn",
          "message.invalid",
          `Invalid message: ${error}`,
          connectionId,
          undefined,
          { error, raw: truncated }
        )
      );
    },

    channelSubscribe({ connectionId, userId, channels }) {
      log(
        createEntry(
          "info",
          "subscribe.channel",
          `Subscribed to channels: ${channels.join(", ")}`,
          connectionId,
          userId,
          { channels }
        )
      );
    },

    channelUnsubscribe({ connectionId, channels }) {
      log(
        createEntry(
          "info",
          "unsubscribe.channel",
          `Unsubscribed from channels: ${channels.join(", ")}`,
          connectionId,
          undefined,
          { channels }
        )
      );
    },

    symbolSubscribe({ connectionId, symbols }) {
      log(
        createEntry(
          "info",
          "subscribe.symbol",
          `Subscribed to symbols: ${symbols.join(", ")}`,
          connectionId,
          undefined,
          { symbols }
        )
      );
    },

    symbolUnsubscribe({ connectionId, symbols }) {
      log(
        createEntry(
          "info",
          "unsubscribe.symbol",
          `Unsubscribed from symbols: ${symbols.join(", ")}`,
          connectionId,
          undefined,
          { symbols }
        )
      );
    },

    authFailure({ userId, channel, reason }) {
      log(
        createEntry(
          "warn",
          "auth.failure",
          `Authorization failed for channel ${channel}: ${reason}`,
          undefined,
          userId,
          { channel, reason }
        )
      );
    },

    rateLimitExceeded({ connectionId, userId, reason }) {
      log(
        createEntry(
          "warn",
          "rate_limit.exceeded",
          `Rate limit exceeded: ${reason}`,
          connectionId,
          userId,
          { reason }
        )
      );
    },

    broadcastError({ connectionId, error }) {
      log(
        createEntry(
          "error",
          "broadcast.error",
          `Broadcast error: ${error}`,
          connectionId,
          undefined,
          { error }
        )
      );
    },

    heartbeatPing({ connectionId }) {
      log(createEntry("debug", "heartbeat.ping", "Heartbeat ping sent", connectionId));
    },

    heartbeatPong({ connectionId, latency }) {
      log(
        createEntry(
          "debug",
          "heartbeat.pong",
          `Heartbeat pong received (latency: ${latency}ms)`,
          connectionId,
          undefined,
          { latency }
        )
      );
    },

    heartbeatTimeout({ connectionId }) {
      log(createEntry("warn", "heartbeat.timeout", "Heartbeat timeout", connectionId));
    },

    log,
  };
}

export default createWebSocketLogger;
