/**
 * WebSocket Error Protocol
 *
 * Defines comprehensive error codes, error message schema,
 * and error handling utilities for WebSocket communication.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import { z } from "zod/v4";

// ============================================
// Error Codes
// ============================================

/**
 * Error code enum for WebSocket errors.
 *
 * Error codes are grouped by category:
 * - AUTH_*: Authentication/authorization errors
 * - CHANNEL_*: Channel subscription errors
 * - MESSAGE_*: Message format/validation errors
 * - RATE_*: Rate limiting errors
 * - LIMIT_*: Resource limit errors
 * - INTERNAL_*: Server-side errors
 */
export const ErrorCode = z.enum([
  // Authentication errors
  "AUTH_FAILED",
  "AUTH_EXPIRED",
  "AUTH_INVALID_TOKEN",

  // Channel errors
  "CHANNEL_NOT_FOUND",
  "CHANNEL_UNAUTHORIZED",
  "CHANNEL_INVALID",

  // Message errors
  "MESSAGE_INVALID_FORMAT",
  "MESSAGE_INVALID_TYPE",
  "MESSAGE_TOO_LARGE",
  "MESSAGE_PARSE_ERROR",

  // Rate limiting errors
  "RATE_LIMIT_EXCEEDED",
  "RATE_LIMIT_MESSAGES",
  "RATE_LIMIT_SUBSCRIPTIONS",

  // Resource limit errors
  "LIMIT_MAX_CONNECTIONS",
  "LIMIT_MAX_SYMBOLS",
  "LIMIT_MAX_CHANNELS",

  // Server errors
  "INTERNAL_ERROR",
  "INTERNAL_TIMEOUT",
  "INTERNAL_UNAVAILABLE",

  // Connection errors
  "CONNECTION_CLOSING",
  "CONNECTION_TIMEOUT",
]);

export type ErrorCode = z.infer<typeof ErrorCode>;

/**
 * Error code descriptions for documentation.
 */
export const ERROR_CODE_DESCRIPTIONS: Record<ErrorCode, string> = {
  // Authentication
  AUTH_FAILED: "Authentication failed. Invalid or missing token.",
  AUTH_EXPIRED: "Authentication token has expired. Please refresh.",
  AUTH_INVALID_TOKEN: "Token format is invalid.",

  // Channel
  CHANNEL_NOT_FOUND: "Requested channel does not exist.",
  CHANNEL_UNAUTHORIZED: "User lacks permission for this channel.",
  CHANNEL_INVALID: "Channel name is invalid.",

  // Message
  MESSAGE_INVALID_FORMAT: "Message does not match expected schema.",
  MESSAGE_INVALID_TYPE: "Unknown message type.",
  MESSAGE_TOO_LARGE: "Message exceeds maximum allowed size.",
  MESSAGE_PARSE_ERROR: "Failed to parse message as JSON.",

  // Rate limiting
  RATE_LIMIT_EXCEEDED: "General rate limit exceeded.",
  RATE_LIMIT_MESSAGES: "Message rate limit exceeded.",
  RATE_LIMIT_SUBSCRIPTIONS: "Subscription rate limit exceeded.",

  // Resource limits
  LIMIT_MAX_CONNECTIONS: "Maximum connections per user exceeded.",
  LIMIT_MAX_SYMBOLS: "Maximum subscribed symbols exceeded.",
  LIMIT_MAX_CHANNELS: "Maximum subscribed channels exceeded.",

  // Server
  INTERNAL_ERROR: "An internal server error occurred.",
  INTERNAL_TIMEOUT: "Operation timed out.",
  INTERNAL_UNAVAILABLE: "Service temporarily unavailable.",

  // Connection
  CONNECTION_CLOSING: "Connection is closing.",
  CONNECTION_TIMEOUT: "Connection timed out due to inactivity.",
};

// ============================================
// Error Severity
// ============================================

/**
 * Error severity levels.
 */
export const ErrorSeverity = z.enum([
  "critical", // Requires immediate action (auth failure)
  "warning", // Degraded functionality (rate limit)
  "info", // Informational (invalid channel)
]);

export type ErrorSeverity = z.infer<typeof ErrorSeverity>;

/**
 * Map error codes to severity levels.
 */
export const ERROR_SEVERITY: Record<ErrorCode, ErrorSeverity> = {
  AUTH_FAILED: "critical",
  AUTH_EXPIRED: "critical",
  AUTH_INVALID_TOKEN: "critical",

  CHANNEL_NOT_FOUND: "info",
  CHANNEL_UNAUTHORIZED: "warning",
  CHANNEL_INVALID: "info",

  MESSAGE_INVALID_FORMAT: "info",
  MESSAGE_INVALID_TYPE: "info",
  MESSAGE_TOO_LARGE: "warning",
  MESSAGE_PARSE_ERROR: "info",

  RATE_LIMIT_EXCEEDED: "warning",
  RATE_LIMIT_MESSAGES: "warning",
  RATE_LIMIT_SUBSCRIPTIONS: "warning",

  LIMIT_MAX_CONNECTIONS: "critical",
  LIMIT_MAX_SYMBOLS: "warning",
  LIMIT_MAX_CHANNELS: "warning",

  INTERNAL_ERROR: "critical",
  INTERNAL_TIMEOUT: "warning",
  INTERNAL_UNAVAILABLE: "warning",

  CONNECTION_CLOSING: "info",
  CONNECTION_TIMEOUT: "info",
};

// ============================================
// Error Recovery Actions
// ============================================

/**
 * Recommended recovery action for each error code.
 */
export const RecoveryAction = z.enum([
  "refresh_token", // Re-authenticate
  "retry", // Retry the operation
  "retry_backoff", // Retry with exponential backoff
  "reduce_rate", // Slow down message rate
  "remove_subscription", // Remove invalid subscription
  "reconnect", // Reconnect to server
  "none", // No automatic recovery
]);

export type RecoveryAction = z.infer<typeof RecoveryAction>;

/**
 * Map error codes to recovery actions.
 */
export const ERROR_RECOVERY: Record<ErrorCode, RecoveryAction> = {
  AUTH_FAILED: "refresh_token",
  AUTH_EXPIRED: "refresh_token",
  AUTH_INVALID_TOKEN: "refresh_token",

  CHANNEL_NOT_FOUND: "remove_subscription",
  CHANNEL_UNAUTHORIZED: "remove_subscription",
  CHANNEL_INVALID: "remove_subscription",

  MESSAGE_INVALID_FORMAT: "none",
  MESSAGE_INVALID_TYPE: "none",
  MESSAGE_TOO_LARGE: "none",
  MESSAGE_PARSE_ERROR: "none",

  RATE_LIMIT_EXCEEDED: "reduce_rate",
  RATE_LIMIT_MESSAGES: "reduce_rate",
  RATE_LIMIT_SUBSCRIPTIONS: "reduce_rate",

  LIMIT_MAX_CONNECTIONS: "none",
  LIMIT_MAX_SYMBOLS: "remove_subscription",
  LIMIT_MAX_CHANNELS: "remove_subscription",

  INTERNAL_ERROR: "retry_backoff",
  INTERNAL_TIMEOUT: "retry",
  INTERNAL_UNAVAILABLE: "retry_backoff",

  CONNECTION_CLOSING: "reconnect",
  CONNECTION_TIMEOUT: "reconnect",
};

// ============================================
// Error Details Schema
// ============================================

/**
 * Detailed error information.
 */
export const ErrorDetailsSchema = z.object({
  /** Error code */
  code: ErrorCode,

  /** Human-readable error message */
  message: z.string(),

  /** Error severity */
  severity: ErrorSeverity,

  /** Recommended recovery action */
  recovery: RecoveryAction,

  /** When error occurred */
  timestamp: z.string().datetime(),

  /** Additional context */
  context: z
    .object({
      /** Channel that caused error (if applicable) */
      channel: z.string().optional(),

      /** Symbol that caused error (if applicable) */
      symbol: z.string().optional(),

      /** Maximum allowed value (for limit errors) */
      limit: z.number().optional(),

      /** Current value (for limit errors) */
      current: z.number().optional(),

      /** Retry delay in milliseconds (for rate limit errors) */
      retryAfterMs: z.number().optional(),

      /** Original message that caused error */
      originalMessage: z.unknown().optional(),

      /** Stack trace (only in development) */
      stack: z.string().optional(),
    })
    .optional(),
});

export type ErrorDetails = z.infer<typeof ErrorDetailsSchema>;

// ============================================
// Enhanced Error Message
// ============================================

/**
 * Enhanced error message with full details.
 *
 * @example
 * {
 *   type: "error",
 *   error: {
 *     code: "RATE_LIMIT_EXCEEDED",
 *     message: "Rate limit exceeded. Please slow down.",
 *     severity: "warning",
 *     recovery: "reduce_rate",
 *     timestamp: "2026-01-04T14:00:00Z",
 *     context: { retryAfterMs: 5000 }
 *   }
 * }
 */
export const EnhancedErrorMessageSchema = z.object({
  type: z.literal("error"),
  error: ErrorDetailsSchema,
});

export type EnhancedErrorMessage = z.infer<typeof EnhancedErrorMessageSchema>;

// ============================================
// Error Factory Functions
// ============================================

/**
 * Create an error details object.
 */
export function createErrorDetails(
  code: ErrorCode,
  message?: string,
  context?: ErrorDetails["context"]
): ErrorDetails {
  return {
    code,
    message: message ?? ERROR_CODE_DESCRIPTIONS[code],
    severity: ERROR_SEVERITY[code],
    recovery: ERROR_RECOVERY[code],
    timestamp: new Date().toISOString(),
    context,
  };
}

/**
 * Create an enhanced error message.
 */
export function createErrorMessage(
  code: ErrorCode,
  message?: string,
  context?: ErrorDetails["context"]
): EnhancedErrorMessage {
  return {
    type: "error",
    error: createErrorDetails(code, message, context),
  };
}

// ============================================
// Common Error Creators
// ============================================

/**
 * Create authentication error.
 */
export function authError(reason: "failed" | "expired" | "invalid_token"): EnhancedErrorMessage {
  const codeMap = {
    failed: "AUTH_FAILED",
    expired: "AUTH_EXPIRED",
    invalid_token: "AUTH_INVALID_TOKEN",
  } as const;

  return createErrorMessage(codeMap[reason]);
}

/**
 * Create channel error.
 */
export function channelError(
  reason: "not_found" | "unauthorized" | "invalid",
  channel: string
): EnhancedErrorMessage {
  const codeMap = {
    not_found: "CHANNEL_NOT_FOUND",
    unauthorized: "CHANNEL_UNAUTHORIZED",
    invalid: "CHANNEL_INVALID",
  } as const;

  return createErrorMessage(codeMap[reason], `Channel '${channel}' ${reason.replace("_", " ")}`, {
    channel,
  });
}

/**
 * Create message error.
 */
export function messageError(
  reason: "invalid_format" | "invalid_type" | "too_large" | "parse_error",
  originalMessage?: unknown
): EnhancedErrorMessage {
  const codeMap = {
    invalid_format: "MESSAGE_INVALID_FORMAT",
    invalid_type: "MESSAGE_INVALID_TYPE",
    too_large: "MESSAGE_TOO_LARGE",
    parse_error: "MESSAGE_PARSE_ERROR",
  } as const;

  return createErrorMessage(codeMap[reason], undefined, { originalMessage });
}

/**
 * Create rate limit error.
 */
export function rateLimitError(
  type: "general" | "messages" | "subscriptions",
  retryAfterMs?: number
): EnhancedErrorMessage {
  const codeMap = {
    general: "RATE_LIMIT_EXCEEDED",
    messages: "RATE_LIMIT_MESSAGES",
    subscriptions: "RATE_LIMIT_SUBSCRIPTIONS",
  } as const;

  return createErrorMessage(codeMap[type], undefined, { retryAfterMs });
}

/**
 * Create limit error.
 */
export function limitError(
  type: "connections" | "symbols" | "channels",
  limit: number,
  current: number
): EnhancedErrorMessage {
  const codeMap = {
    connections: "LIMIT_MAX_CONNECTIONS",
    symbols: "LIMIT_MAX_SYMBOLS",
    channels: "LIMIT_MAX_CHANNELS",
  } as const;

  return createErrorMessage(codeMap[type], `Maximum ${type} exceeded (${current}/${limit})`, {
    limit,
    current,
  });
}

/**
 * Create internal error.
 */
export function internalError(
  type: "error" | "timeout" | "unavailable",
  stack?: string
): EnhancedErrorMessage {
  const codeMap = {
    error: "INTERNAL_ERROR",
    timeout: "INTERNAL_TIMEOUT",
    unavailable: "INTERNAL_UNAVAILABLE",
  } as const;

  const isDevelopment = process.env.NODE_ENV === "development";

  return createErrorMessage(codeMap[type], undefined, {
    stack: isDevelopment ? stack : undefined,
  });
}

/**
 * Create connection error.
 */
export function connectionError(reason: "closing" | "timeout"): EnhancedErrorMessage {
  const codeMap = {
    closing: "CONNECTION_CLOSING",
    timeout: "CONNECTION_TIMEOUT",
  } as const;

  return createErrorMessage(codeMap[reason]);
}

// ============================================
// Error Classification
// ============================================

/**
 * Check if error is retryable.
 */
export function isRetryable(code: ErrorCode): boolean {
  const recovery = ERROR_RECOVERY[code];
  return recovery === "retry" || recovery === "retry_backoff";
}

/**
 * Check if error requires authentication refresh.
 */
export function requiresAuthRefresh(code: ErrorCode): boolean {
  return ERROR_RECOVERY[code] === "refresh_token";
}

/**
 * Check if error is critical.
 */
export function isCritical(code: ErrorCode): boolean {
  return ERROR_SEVERITY[code] === "critical";
}

/**
 * Get retry delay for an error (with exponential backoff).
 */
export function getRetryDelay(code: ErrorCode, attempt: number): number {
  const recovery = ERROR_RECOVERY[code];

  if (recovery === "retry") {
    return 1000; // Fixed 1 second
  }

  if (recovery === "retry_backoff") {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(1000 * 2 ** attempt, 30000);
    // Add jitter (0-20%)
    const jitter = delay * Math.random() * 0.2;
    return Math.floor(delay + jitter);
  }

  if (recovery === "reduce_rate") {
    // Linear backoff: 1s, 2s, 3s, 4s, 5s
    return Math.min(1000 * (attempt + 1), 5000);
  }

  return 0; // No retry
}

// ============================================
// Exports
// ============================================

export default {
  // Error codes
  ErrorCode,
  ERROR_CODE_DESCRIPTIONS,

  // Severity
  ErrorSeverity,
  ERROR_SEVERITY,

  // Recovery
  RecoveryAction,
  ERROR_RECOVERY,

  // Schemas
  ErrorDetailsSchema,
  EnhancedErrorMessageSchema,

  // Factory functions
  createErrorDetails,
  createErrorMessage,

  // Convenience creators
  authError,
  channelError,
  messageError,
  rateLimitError,
  limitError,
  internalError,
  connectionError,

  // Classification
  isRetryable,
  requiresAuthRefresh,
  isCritical,
  getRetryDelay,
};
