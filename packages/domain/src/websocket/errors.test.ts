/**
 * Tests for WebSocket Error Protocol
 *
 * @see errors.ts
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  ErrorCode,
  ERROR_CODE_DESCRIPTIONS,
  ErrorSeverity,
  ERROR_SEVERITY,
  RecoveryAction,
  ERROR_RECOVERY,
  ErrorDetailsSchema,
  EnhancedErrorMessageSchema,
  createErrorDetails,
  createErrorMessage,
  authError,
  channelError,
  messageError,
  rateLimitError,
  limitError,
  internalError,
  connectionError,
  isRetryable,
  requiresAuthRefresh,
  isCritical,
  getRetryDelay,
  type ErrorDetails,
  type EnhancedErrorMessage,
} from "./errors.js";

// ============================================
// Tests: Error Codes
// ============================================

describe("ErrorCode", () => {
  it("defines authentication error codes", () => {
    const authCodes = ErrorCode.options.filter((c) => c.startsWith("AUTH_"));
    expect(authCodes).toContain("AUTH_FAILED");
    expect(authCodes).toContain("AUTH_EXPIRED");
    expect(authCodes).toContain("AUTH_INVALID_TOKEN");
    expect(authCodes.length).toBe(3);
  });

  it("defines channel error codes", () => {
    const channelCodes = ErrorCode.options.filter((c) => c.startsWith("CHANNEL_"));
    expect(channelCodes).toContain("CHANNEL_NOT_FOUND");
    expect(channelCodes).toContain("CHANNEL_UNAUTHORIZED");
    expect(channelCodes).toContain("CHANNEL_INVALID");
    expect(channelCodes.length).toBe(3);
  });

  it("defines message error codes", () => {
    const messageCodes = ErrorCode.options.filter((c) => c.startsWith("MESSAGE_"));
    expect(messageCodes).toContain("MESSAGE_INVALID_FORMAT");
    expect(messageCodes).toContain("MESSAGE_INVALID_TYPE");
    expect(messageCodes).toContain("MESSAGE_TOO_LARGE");
    expect(messageCodes).toContain("MESSAGE_PARSE_ERROR");
    expect(messageCodes.length).toBe(4);
  });

  it("defines rate limit error codes", () => {
    const rateCodes = ErrorCode.options.filter((c) => c.startsWith("RATE_"));
    expect(rateCodes).toContain("RATE_LIMIT_EXCEEDED");
    expect(rateCodes).toContain("RATE_LIMIT_MESSAGES");
    expect(rateCodes).toContain("RATE_LIMIT_SUBSCRIPTIONS");
    expect(rateCodes.length).toBe(3);
  });

  it("defines limit error codes", () => {
    const limitCodes = ErrorCode.options.filter((c) => c.startsWith("LIMIT_"));
    expect(limitCodes).toContain("LIMIT_MAX_CONNECTIONS");
    expect(limitCodes).toContain("LIMIT_MAX_SYMBOLS");
    expect(limitCodes).toContain("LIMIT_MAX_CHANNELS");
    expect(limitCodes.length).toBe(3);
  });

  it("defines internal error codes", () => {
    const internalCodes = ErrorCode.options.filter((c) => c.startsWith("INTERNAL_"));
    expect(internalCodes).toContain("INTERNAL_ERROR");
    expect(internalCodes).toContain("INTERNAL_TIMEOUT");
    expect(internalCodes).toContain("INTERNAL_UNAVAILABLE");
    expect(internalCodes.length).toBe(3);
  });

  it("defines connection error codes", () => {
    const connectionCodes = ErrorCode.options.filter((c) => c.startsWith("CONNECTION_"));
    expect(connectionCodes).toContain("CONNECTION_CLOSING");
    expect(connectionCodes).toContain("CONNECTION_TIMEOUT");
    expect(connectionCodes.length).toBe(2);
  });
});

describe("ERROR_CODE_DESCRIPTIONS", () => {
  it("has description for every error code", () => {
    for (const code of ErrorCode.options) {
      expect(ERROR_CODE_DESCRIPTIONS[code]).toBeDefined();
      expect(typeof ERROR_CODE_DESCRIPTIONS[code]).toBe("string");
      expect(ERROR_CODE_DESCRIPTIONS[code].length).toBeGreaterThan(10);
    }
  });
});

// ============================================
// Tests: Error Severity
// ============================================

describe("ErrorSeverity", () => {
  it("defines all severity levels", () => {
    expect(ErrorSeverity.options).toContain("critical");
    expect(ErrorSeverity.options).toContain("warning");
    expect(ErrorSeverity.options).toContain("info");
    expect(ErrorSeverity.options.length).toBe(3);
  });
});

describe("ERROR_SEVERITY", () => {
  it("maps every error code to a severity", () => {
    for (const code of ErrorCode.options) {
      expect(ERROR_SEVERITY[code]).toBeDefined();
      expect(ErrorSeverity.options).toContain(ERROR_SEVERITY[code]);
    }
  });

  it("marks auth errors as critical", () => {
    expect(ERROR_SEVERITY.AUTH_FAILED).toBe("critical");
    expect(ERROR_SEVERITY.AUTH_EXPIRED).toBe("critical");
    expect(ERROR_SEVERITY.AUTH_INVALID_TOKEN).toBe("critical");
  });

  it("marks internal errors as critical", () => {
    expect(ERROR_SEVERITY.INTERNAL_ERROR).toBe("critical");
  });

  it("marks rate limit errors as warning", () => {
    expect(ERROR_SEVERITY.RATE_LIMIT_EXCEEDED).toBe("warning");
    expect(ERROR_SEVERITY.RATE_LIMIT_MESSAGES).toBe("warning");
  });

  it("marks channel not found as info", () => {
    expect(ERROR_SEVERITY.CHANNEL_NOT_FOUND).toBe("info");
    expect(ERROR_SEVERITY.CHANNEL_INVALID).toBe("info");
  });
});

// ============================================
// Tests: Recovery Actions
// ============================================

describe("RecoveryAction", () => {
  it("defines all recovery actions", () => {
    expect(RecoveryAction.options).toContain("refresh_token");
    expect(RecoveryAction.options).toContain("retry");
    expect(RecoveryAction.options).toContain("retry_backoff");
    expect(RecoveryAction.options).toContain("reduce_rate");
    expect(RecoveryAction.options).toContain("remove_subscription");
    expect(RecoveryAction.options).toContain("reconnect");
    expect(RecoveryAction.options).toContain("none");
    expect(RecoveryAction.options.length).toBe(7);
  });
});

describe("ERROR_RECOVERY", () => {
  it("maps every error code to a recovery action", () => {
    for (const code of ErrorCode.options) {
      expect(ERROR_RECOVERY[code]).toBeDefined();
      expect(RecoveryAction.options).toContain(ERROR_RECOVERY[code]);
    }
  });

  it("maps auth errors to refresh_token", () => {
    expect(ERROR_RECOVERY.AUTH_FAILED).toBe("refresh_token");
    expect(ERROR_RECOVERY.AUTH_EXPIRED).toBe("refresh_token");
    expect(ERROR_RECOVERY.AUTH_INVALID_TOKEN).toBe("refresh_token");
  });

  it("maps channel errors to remove_subscription", () => {
    expect(ERROR_RECOVERY.CHANNEL_NOT_FOUND).toBe("remove_subscription");
    expect(ERROR_RECOVERY.CHANNEL_UNAUTHORIZED).toBe("remove_subscription");
    expect(ERROR_RECOVERY.CHANNEL_INVALID).toBe("remove_subscription");
  });

  it("maps rate limit errors to reduce_rate", () => {
    expect(ERROR_RECOVERY.RATE_LIMIT_EXCEEDED).toBe("reduce_rate");
    expect(ERROR_RECOVERY.RATE_LIMIT_MESSAGES).toBe("reduce_rate");
  });

  it("maps internal errors to retry_backoff", () => {
    expect(ERROR_RECOVERY.INTERNAL_ERROR).toBe("retry_backoff");
    expect(ERROR_RECOVERY.INTERNAL_UNAVAILABLE).toBe("retry_backoff");
  });

  it("maps connection errors to reconnect", () => {
    expect(ERROR_RECOVERY.CONNECTION_CLOSING).toBe("reconnect");
    expect(ERROR_RECOVERY.CONNECTION_TIMEOUT).toBe("reconnect");
  });
});

// ============================================
// Tests: Schema Validation
// ============================================

describe("ErrorDetailsSchema", () => {
  it("validates valid error details", () => {
    const details: ErrorDetails = {
      code: "AUTH_FAILED",
      message: "Authentication failed",
      severity: "critical",
      recovery: "refresh_token",
      timestamp: new Date().toISOString(),
    };

    const result = ErrorDetailsSchema.safeParse(details);
    expect(result.success).toBe(true);
  });

  it("validates error details with context", () => {
    const details: ErrorDetails = {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Rate limit exceeded",
      severity: "warning",
      recovery: "reduce_rate",
      timestamp: new Date().toISOString(),
      context: {
        retryAfterMs: 5000,
      },
    };

    const result = ErrorDetailsSchema.safeParse(details);
    expect(result.success).toBe(true);
  });

  it("validates error details with channel context", () => {
    const details: ErrorDetails = {
      code: "CHANNEL_NOT_FOUND",
      message: "Channel not found",
      severity: "info",
      recovery: "remove_subscription",
      timestamp: new Date().toISOString(),
      context: {
        channel: "invalid-channel",
      },
    };

    const result = ErrorDetailsSchema.safeParse(details);
    expect(result.success).toBe(true);
  });

  it("validates error details with limit context", () => {
    const details: ErrorDetails = {
      code: "LIMIT_MAX_SYMBOLS",
      message: "Maximum symbols exceeded",
      severity: "warning",
      recovery: "remove_subscription",
      timestamp: new Date().toISOString(),
      context: {
        limit: 100,
        current: 105,
      },
    };

    const result = ErrorDetailsSchema.safeParse(details);
    expect(result.success).toBe(true);
  });

  it("rejects invalid error code", () => {
    const details = {
      code: "INVALID_CODE",
      message: "Test",
      severity: "info",
      recovery: "none",
      timestamp: new Date().toISOString(),
    };

    const result = ErrorDetailsSchema.safeParse(details);
    expect(result.success).toBe(false);
  });

  it("rejects invalid severity", () => {
    const details = {
      code: "AUTH_FAILED",
      message: "Test",
      severity: "extreme",
      recovery: "none",
      timestamp: new Date().toISOString(),
    };

    const result = ErrorDetailsSchema.safeParse(details);
    expect(result.success).toBe(false);
  });
});

describe("EnhancedErrorMessageSchema", () => {
  it("validates valid enhanced error message", () => {
    const message: EnhancedErrorMessage = {
      type: "error",
      error: {
        code: "AUTH_FAILED",
        message: "Authentication failed",
        severity: "critical",
        recovery: "refresh_token",
        timestamp: new Date().toISOString(),
      },
    };

    const result = EnhancedErrorMessageSchema.safeParse(message);
    expect(result.success).toBe(true);
  });

  it("rejects missing type", () => {
    const message = {
      error: {
        code: "AUTH_FAILED",
        message: "Authentication failed",
        severity: "critical",
        recovery: "refresh_token",
        timestamp: new Date().toISOString(),
      },
    };

    const result = EnhancedErrorMessageSchema.safeParse(message);
    expect(result.success).toBe(false);
  });

  it("rejects wrong type", () => {
    const message = {
      type: "warning",
      error: {
        code: "AUTH_FAILED",
        message: "Authentication failed",
        severity: "critical",
        recovery: "refresh_token",
        timestamp: new Date().toISOString(),
      },
    };

    const result = EnhancedErrorMessageSchema.safeParse(message);
    expect(result.success).toBe(false);
  });
});

// ============================================
// Tests: Factory Functions
// ============================================

describe("createErrorDetails", () => {
  it("creates error details with default message", () => {
    const details = createErrorDetails("AUTH_FAILED");

    expect(details.code).toBe("AUTH_FAILED");
    expect(details.message).toBe(ERROR_CODE_DESCRIPTIONS.AUTH_FAILED);
    expect(details.severity).toBe("critical");
    expect(details.recovery).toBe("refresh_token");
    expect(details.timestamp).toBeDefined();
  });

  it("creates error details with custom message", () => {
    const details = createErrorDetails("AUTH_FAILED", "Custom auth error message");

    expect(details.message).toBe("Custom auth error message");
  });

  it("creates error details with context", () => {
    const details = createErrorDetails("RATE_LIMIT_EXCEEDED", undefined, { retryAfterMs: 5000 });

    expect(details.context?.retryAfterMs).toBe(5000);
  });

  it("generates valid timestamp", () => {
    const details = createErrorDetails("AUTH_FAILED");

    expect(details.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(details.timestamp).getTime()).not.toBeNaN();
  });
});

describe("createErrorMessage", () => {
  it("creates enhanced error message", () => {
    const message = createErrorMessage("AUTH_FAILED");

    expect(message.type).toBe("error");
    expect(message.error.code).toBe("AUTH_FAILED");
    expect(message.error.severity).toBe("critical");
  });

  it("creates message that passes schema validation", () => {
    const message = createErrorMessage("RATE_LIMIT_EXCEEDED", undefined, { retryAfterMs: 5000 });

    const result = EnhancedErrorMessageSchema.safeParse(message);
    expect(result.success).toBe(true);
  });
});

// ============================================
// Tests: Convenience Creators
// ============================================

describe("authError", () => {
  it("creates failed auth error", () => {
    const error = authError("failed");

    expect(error.error.code).toBe("AUTH_FAILED");
    expect(error.error.severity).toBe("critical");
    expect(error.error.recovery).toBe("refresh_token");
  });

  it("creates expired auth error", () => {
    const error = authError("expired");

    expect(error.error.code).toBe("AUTH_EXPIRED");
  });

  it("creates invalid token error", () => {
    const error = authError("invalid_token");

    expect(error.error.code).toBe("AUTH_INVALID_TOKEN");
  });
});

describe("channelError", () => {
  it("creates not found error with channel name", () => {
    const error = channelError("not_found", "invalid-channel");

    expect(error.error.code).toBe("CHANNEL_NOT_FOUND");
    expect(error.error.message).toContain("invalid-channel");
    expect(error.error.context?.channel).toBe("invalid-channel");
  });

  it("creates unauthorized error with channel name", () => {
    const error = channelError("unauthorized", "admin-channel");

    expect(error.error.code).toBe("CHANNEL_UNAUTHORIZED");
    expect(error.error.context?.channel).toBe("admin-channel");
  });

  it("creates invalid error with channel name", () => {
    const error = channelError("invalid", "!!bad");

    expect(error.error.code).toBe("CHANNEL_INVALID");
    expect(error.error.context?.channel).toBe("!!bad");
  });
});

describe("messageError", () => {
  it("creates invalid format error", () => {
    const error = messageError("invalid_format", { bad: "message" });

    expect(error.error.code).toBe("MESSAGE_INVALID_FORMAT");
    expect(error.error.context?.originalMessage).toEqual({ bad: "message" });
  });

  it("creates invalid type error", () => {
    const error = messageError("invalid_type");

    expect(error.error.code).toBe("MESSAGE_INVALID_TYPE");
  });

  it("creates too large error", () => {
    const error = messageError("too_large");

    expect(error.error.code).toBe("MESSAGE_TOO_LARGE");
  });

  it("creates parse error", () => {
    const error = messageError("parse_error");

    expect(error.error.code).toBe("MESSAGE_PARSE_ERROR");
  });
});

describe("rateLimitError", () => {
  it("creates general rate limit error", () => {
    const error = rateLimitError("general");

    expect(error.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(error.error.severity).toBe("warning");
    expect(error.error.recovery).toBe("reduce_rate");
  });

  it("creates rate limit error with retry delay", () => {
    const error = rateLimitError("messages", 5000);

    expect(error.error.code).toBe("RATE_LIMIT_MESSAGES");
    expect(error.error.context?.retryAfterMs).toBe(5000);
  });

  it("creates subscriptions rate limit error", () => {
    const error = rateLimitError("subscriptions");

    expect(error.error.code).toBe("RATE_LIMIT_SUBSCRIPTIONS");
  });
});

describe("limitError", () => {
  it("creates connections limit error", () => {
    const error = limitError("connections", 5, 6);

    expect(error.error.code).toBe("LIMIT_MAX_CONNECTIONS");
    expect(error.error.message).toContain("6/5");
    expect(error.error.context?.limit).toBe(5);
    expect(error.error.context?.current).toBe(6);
  });

  it("creates symbols limit error", () => {
    const error = limitError("symbols", 100, 105);

    expect(error.error.code).toBe("LIMIT_MAX_SYMBOLS");
    expect(error.error.context?.limit).toBe(100);
    expect(error.error.context?.current).toBe(105);
  });

  it("creates channels limit error", () => {
    const error = limitError("channels", 10, 11);

    expect(error.error.code).toBe("LIMIT_MAX_CHANNELS");
  });
});

describe("internalError", () => {
  it("creates internal error", () => {
    const error = internalError("error");

    expect(error.error.code).toBe("INTERNAL_ERROR");
    expect(error.error.severity).toBe("critical");
    expect(error.error.recovery).toBe("retry_backoff");
  });

  it("creates timeout error", () => {
    const error = internalError("timeout");

    expect(error.error.code).toBe("INTERNAL_TIMEOUT");
  });

  it("creates unavailable error", () => {
    const error = internalError("unavailable");

    expect(error.error.code).toBe("INTERNAL_UNAVAILABLE");
  });
});

describe("connectionError", () => {
  it("creates closing error", () => {
    const error = connectionError("closing");

    expect(error.error.code).toBe("CONNECTION_CLOSING");
    expect(error.error.recovery).toBe("reconnect");
  });

  it("creates timeout error", () => {
    const error = connectionError("timeout");

    expect(error.error.code).toBe("CONNECTION_TIMEOUT");
  });
});

// ============================================
// Tests: Classification Functions
// ============================================

describe("isRetryable", () => {
  it("returns true for retry errors", () => {
    expect(isRetryable("INTERNAL_TIMEOUT")).toBe(true);
  });

  it("returns true for retry_backoff errors", () => {
    expect(isRetryable("INTERNAL_ERROR")).toBe(true);
    expect(isRetryable("INTERNAL_UNAVAILABLE")).toBe(true);
  });

  it("returns false for non-retryable errors", () => {
    expect(isRetryable("AUTH_FAILED")).toBe(false);
    expect(isRetryable("MESSAGE_INVALID_FORMAT")).toBe(false);
    expect(isRetryable("CHANNEL_NOT_FOUND")).toBe(false);
  });
});

describe("requiresAuthRefresh", () => {
  it("returns true for auth errors", () => {
    expect(requiresAuthRefresh("AUTH_FAILED")).toBe(true);
    expect(requiresAuthRefresh("AUTH_EXPIRED")).toBe(true);
    expect(requiresAuthRefresh("AUTH_INVALID_TOKEN")).toBe(true);
  });

  it("returns false for non-auth errors", () => {
    expect(requiresAuthRefresh("RATE_LIMIT_EXCEEDED")).toBe(false);
    expect(requiresAuthRefresh("INTERNAL_ERROR")).toBe(false);
  });
});

describe("isCritical", () => {
  it("returns true for critical errors", () => {
    expect(isCritical("AUTH_FAILED")).toBe(true);
    expect(isCritical("AUTH_EXPIRED")).toBe(true);
    expect(isCritical("INTERNAL_ERROR")).toBe(true);
    expect(isCritical("LIMIT_MAX_CONNECTIONS")).toBe(true);
  });

  it("returns false for non-critical errors", () => {
    expect(isCritical("RATE_LIMIT_EXCEEDED")).toBe(false);
    expect(isCritical("CHANNEL_NOT_FOUND")).toBe(false);
    expect(isCritical("MESSAGE_INVALID_FORMAT")).toBe(false);
  });
});

describe("getRetryDelay", () => {
  it("returns fixed delay for retry errors", () => {
    expect(getRetryDelay("INTERNAL_TIMEOUT", 0)).toBe(1000);
    expect(getRetryDelay("INTERNAL_TIMEOUT", 5)).toBe(1000);
  });

  it("returns exponential backoff for retry_backoff errors", () => {
    // Backoff: 1s, 2s, 4s, 8s, 16s (with up to 20% jitter)
    const delay0 = getRetryDelay("INTERNAL_ERROR", 0);
    expect(delay0).toBeGreaterThanOrEqual(1000);
    expect(delay0).toBeLessThanOrEqual(1200);

    const delay1 = getRetryDelay("INTERNAL_ERROR", 1);
    expect(delay1).toBeGreaterThanOrEqual(2000);
    expect(delay1).toBeLessThanOrEqual(2400);

    const delay2 = getRetryDelay("INTERNAL_ERROR", 2);
    expect(delay2).toBeGreaterThanOrEqual(4000);
    expect(delay2).toBeLessThanOrEqual(4800);
  });

  it("caps exponential backoff at 30 seconds", () => {
    const delay = getRetryDelay("INTERNAL_ERROR", 10);
    expect(delay).toBeLessThanOrEqual(36000); // 30s + 20% jitter
  });

  it("returns linear delay for reduce_rate errors", () => {
    expect(getRetryDelay("RATE_LIMIT_EXCEEDED", 0)).toBe(1000);
    expect(getRetryDelay("RATE_LIMIT_EXCEEDED", 1)).toBe(2000);
    expect(getRetryDelay("RATE_LIMIT_EXCEEDED", 2)).toBe(3000);
    expect(getRetryDelay("RATE_LIMIT_EXCEEDED", 3)).toBe(4000);
    expect(getRetryDelay("RATE_LIMIT_EXCEEDED", 4)).toBe(5000);
    expect(getRetryDelay("RATE_LIMIT_EXCEEDED", 10)).toBe(5000); // Capped at 5s
  });

  it("returns 0 for non-retryable errors", () => {
    expect(getRetryDelay("AUTH_FAILED", 0)).toBe(0);
    expect(getRetryDelay("CHANNEL_NOT_FOUND", 0)).toBe(0);
    expect(getRetryDelay("MESSAGE_INVALID_FORMAT", 0)).toBe(0);
  });
});

// ============================================
// Tests: Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("all error codes have consistent mappings", () => {
    // Every error code should have:
    // 1. A description
    // 2. A severity
    // 3. A recovery action
    for (const code of ErrorCode.options) {
      expect(ERROR_CODE_DESCRIPTIONS[code]).toBeDefined();
      expect(ERROR_SEVERITY[code]).toBeDefined();
      expect(ERROR_RECOVERY[code]).toBeDefined();

      // Factory should work for every code
      const details = createErrorDetails(code);
      expect(details.code).toBe(code);

      // Schema should validate
      const result = ErrorDetailsSchema.safeParse(details);
      expect(result.success).toBe(true);
    }
  });

  it("handles all severity levels correctly", () => {
    for (const severity of ErrorSeverity.options) {
      // Find at least one error code with this severity
      const codes = ErrorCode.options.filter((c) => ERROR_SEVERITY[c] === severity);
      expect(codes.length).toBeGreaterThan(0);
    }
  });

  it("handles all recovery actions correctly", () => {
    for (const recovery of RecoveryAction.options) {
      // Find at least one error code with this recovery
      const codes = ErrorCode.options.filter((c) => ERROR_RECOVERY[c] === recovery);
      expect(codes.length).toBeGreaterThan(0);
    }
  });
});
