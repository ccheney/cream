/**
 * API Error Handler Tests
 *
 * Tests for API error handling utilities.
 *
 * @see docs/plans/ui/28-states.md lines 83-87
 */

import { describe, expect, it } from "bun:test";
import type { ApiError, ApiErrorType, ErrorHandlerOptions } from "./error-handler";

// ============================================
// ApiErrorType Type Tests
// ============================================

describe("ApiErrorType Type", () => {
  const allTypes: ApiErrorType[] = [
    "network",
    "timeout",
    "unauthorized",
    "forbidden",
    "not_found",
    "validation",
    "rate_limit",
    "server",
    "unknown",
  ];

  it("includes network type", () => {
    expect(allTypes).toContain("network");
  });

  it("includes timeout type", () => {
    expect(allTypes).toContain("timeout");
  });

  it("includes unauthorized type", () => {
    expect(allTypes).toContain("unauthorized");
  });

  it("includes forbidden type", () => {
    expect(allTypes).toContain("forbidden");
  });

  it("includes not_found type", () => {
    expect(allTypes).toContain("not_found");
  });

  it("includes validation type", () => {
    expect(allTypes).toContain("validation");
  });

  it("includes rate_limit type", () => {
    expect(allTypes).toContain("rate_limit");
  });

  it("includes server type", () => {
    expect(allTypes).toContain("server");
  });

  it("includes unknown type", () => {
    expect(allTypes).toContain("unknown");
  });
});

// ============================================
// ApiError Type Tests
// ============================================

describe("ApiError Type", () => {
  it("has required type property", () => {
    const error: ApiError = {
      type: "network",
      message: "Network error",
      timestamp: Date.now(),
      isTransient: true,
    };
    expect(error.type).toBe("network");
  });

  it("has required message property", () => {
    const error: ApiError = {
      type: "server",
      message: "Server error",
      timestamp: Date.now(),
      isTransient: true,
    };
    expect(error.message).toBe("Server error");
  });

  it("has required timestamp property", () => {
    const now = Date.now();
    const error: ApiError = {
      type: "unknown",
      message: "Error",
      timestamp: now,
      isTransient: false,
    };
    expect(error.timestamp).toBe(now);
  });

  it("has required isTransient property", () => {
    const error: ApiError = {
      type: "network",
      message: "Error",
      timestamp: Date.now(),
      isTransient: true,
    };
    expect(error.isTransient).toBe(true);
  });

  it("supports optional statusCode", () => {
    const error: ApiError = {
      type: "server",
      message: "Error",
      statusCode: 500,
      timestamp: Date.now(),
      isTransient: true,
    };
    expect(error.statusCode).toBe(500);
  });

  it("supports optional code", () => {
    const error: ApiError = {
      type: "validation",
      message: "Error",
      code: "CREAM-VAL-001",
      timestamp: Date.now(),
      isTransient: false,
    };
    expect(error.code).toBe("CREAM-VAL-001");
  });

  it("supports optional details", () => {
    const error: ApiError = {
      type: "validation",
      message: "Error",
      details: { field: "email", reason: "invalid" },
      timestamp: Date.now(),
      isTransient: false,
    };
    expect(error.details?.field).toBe("email");
  });
});

// ============================================
// ErrorHandlerOptions Type Tests
// ============================================

describe("ErrorHandlerOptions Type", () => {
  it("all properties are optional", () => {
    const options: ErrorHandlerOptions = {};
    expect(options.showToast).toBeUndefined();
    expect(options.codePrefix).toBeUndefined();
    expect(options.messages).toBeUndefined();
  });

  it("supports showToast option", () => {
    const options: ErrorHandlerOptions = { showToast: true };
    expect(options.showToast).toBe(true);
  });

  it("supports codePrefix option", () => {
    const options: ErrorHandlerOptions = { codePrefix: "CREAM" };
    expect(options.codePrefix).toBe("CREAM");
  });

  it("supports custom messages option", () => {
    const options: ErrorHandlerOptions = {
      messages: { network: "Custom network error" },
    };
    expect(options.messages?.network).toBe("Custom network error");
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
  it("exports DEFAULT_ERROR_MESSAGES", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.DEFAULT_ERROR_MESSAGES).toBe("object");
  });

  it("exports STATUS_TO_ERROR_TYPE", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.STATUS_TO_ERROR_TYPE).toBe("object");
  });

  it("exports TRANSIENT_ERROR_TYPES", async () => {
    const module = await import("./error-handler.js");
    expect(module.TRANSIENT_ERROR_TYPES instanceof Set).toBe(true);
  });

  it("exports getErrorType function", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.getErrorType).toBe("function");
  });

  it("exports isResponseError function", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.isResponseError).toBe("function");
  });

  it("exports isTransientError function", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.isTransientError).toBe("function");
  });

  it("exports isAuthError function", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.isAuthError).toBe("function");
  });

  it("exports parseError function", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.parseError).toBe("function");
  });

  it("exports formatError function", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.formatError).toBe("function");
  });

  it("exports formatErrorForToast function", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.formatErrorForToast).toBe("function");
  });

  it("exports ErrorHandler class", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.ErrorHandler).toBe("function");
  });

  it("exports createQueryErrorHandler function", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.createQueryErrorHandler).toBe("function");
  });

  it("exports createRetryCondition function", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.createRetryCondition).toBe("function");
  });

  it("exports errorHandler instance", async () => {
    const module = await import("./error-handler.js");
    expect(typeof module.errorHandler).toBe("object");
  });
});

// ============================================
// DEFAULT_ERROR_MESSAGES Tests
// ============================================

describe("DEFAULT_ERROR_MESSAGES", () => {
  it("has network error message", async () => {
    const module = await import("./error-handler.js");
    expect(module.DEFAULT_ERROR_MESSAGES.network).toContain("connect");
  });

  it("has timeout error message", async () => {
    const module = await import("./error-handler.js");
    expect(module.DEFAULT_ERROR_MESSAGES.timeout).toContain("timed out");
  });

  it("has unauthorized error message", async () => {
    const module = await import("./error-handler.js");
    expect(module.DEFAULT_ERROR_MESSAGES.unauthorized).toContain("session");
  });

  it("has forbidden error message", async () => {
    const module = await import("./error-handler.js");
    expect(module.DEFAULT_ERROR_MESSAGES.forbidden).toContain("permission");
  });

  it("has not_found error message", async () => {
    const module = await import("./error-handler.js");
    expect(module.DEFAULT_ERROR_MESSAGES.not_found).toContain("not found");
  });

  it("has validation error message", async () => {
    const module = await import("./error-handler.js");
    expect(module.DEFAULT_ERROR_MESSAGES.validation).toContain("input");
  });

  it("has rate_limit error message", async () => {
    const module = await import("./error-handler.js");
    expect(module.DEFAULT_ERROR_MESSAGES.rate_limit).toContain("requests");
  });

  it("has server error message", async () => {
    const module = await import("./error-handler.js");
    expect(module.DEFAULT_ERROR_MESSAGES.server).toContain("wrong");
  });

  it("has unknown error message", async () => {
    const module = await import("./error-handler.js");
    expect(module.DEFAULT_ERROR_MESSAGES.unknown).toContain("unexpected");
  });
});

// ============================================
// STATUS_TO_ERROR_TYPE Tests
// ============================================

describe("STATUS_TO_ERROR_TYPE", () => {
  it("maps 400 to validation", async () => {
    const module = await import("./error-handler.js");
    expect(module.STATUS_TO_ERROR_TYPE[400]).toBe("validation");
  });

  it("maps 401 to unauthorized", async () => {
    const module = await import("./error-handler.js");
    expect(module.STATUS_TO_ERROR_TYPE[401]).toBe("unauthorized");
  });

  it("maps 403 to forbidden", async () => {
    const module = await import("./error-handler.js");
    expect(module.STATUS_TO_ERROR_TYPE[403]).toBe("forbidden");
  });

  it("maps 404 to not_found", async () => {
    const module = await import("./error-handler.js");
    expect(module.STATUS_TO_ERROR_TYPE[404]).toBe("not_found");
  });

  it("maps 408 to timeout", async () => {
    const module = await import("./error-handler.js");
    expect(module.STATUS_TO_ERROR_TYPE[408]).toBe("timeout");
  });

  it("maps 429 to rate_limit", async () => {
    const module = await import("./error-handler.js");
    expect(module.STATUS_TO_ERROR_TYPE[429]).toBe("rate_limit");
  });

  it("maps 500 to server", async () => {
    const module = await import("./error-handler.js");
    expect(module.STATUS_TO_ERROR_TYPE[500]).toBe("server");
  });

  it("maps 502 to server", async () => {
    const module = await import("./error-handler.js");
    expect(module.STATUS_TO_ERROR_TYPE[502]).toBe("server");
  });

  it("maps 503 to server", async () => {
    const module = await import("./error-handler.js");
    expect(module.STATUS_TO_ERROR_TYPE[503]).toBe("server");
  });

  it("maps 504 to timeout", async () => {
    const module = await import("./error-handler.js");
    expect(module.STATUS_TO_ERROR_TYPE[504]).toBe("timeout");
  });
});

// ============================================
// TRANSIENT_ERROR_TYPES Tests
// ============================================

describe("TRANSIENT_ERROR_TYPES", () => {
  it("includes network", async () => {
    const module = await import("./error-handler.js");
    expect(module.TRANSIENT_ERROR_TYPES.has("network")).toBe(true);
  });

  it("includes timeout", async () => {
    const module = await import("./error-handler.js");
    expect(module.TRANSIENT_ERROR_TYPES.has("timeout")).toBe(true);
  });

  it("includes rate_limit", async () => {
    const module = await import("./error-handler.js");
    expect(module.TRANSIENT_ERROR_TYPES.has("rate_limit")).toBe(true);
  });

  it("includes server", async () => {
    const module = await import("./error-handler.js");
    expect(module.TRANSIENT_ERROR_TYPES.has("server")).toBe(true);
  });

  it("does not include unauthorized", async () => {
    const module = await import("./error-handler.js");
    expect(module.TRANSIENT_ERROR_TYPES.has("unauthorized")).toBe(false);
  });

  it("does not include forbidden", async () => {
    const module = await import("./error-handler.js");
    expect(module.TRANSIENT_ERROR_TYPES.has("forbidden")).toBe(false);
  });

  it("does not include validation", async () => {
    const module = await import("./error-handler.js");
    expect(module.TRANSIENT_ERROR_TYPES.has("validation")).toBe(false);
  });
});

// ============================================
// getErrorType Tests
// ============================================

describe("getErrorType", () => {
  it("returns unknown for null", async () => {
    const module = await import("./error-handler.js");
    expect(module.getErrorType(null)).toBe("unknown");
  });

  it("returns unknown for undefined", async () => {
    const module = await import("./error-handler.js");
    expect(module.getErrorType(undefined)).toBe("unknown");
  });

  it("returns unknown for plain Error", async () => {
    const module = await import("./error-handler.js");
    expect(module.getErrorType(new Error("test"))).toBe("unknown");
  });

  it("returns correct type for status 401", async () => {
    const module = await import("./error-handler.js");
    expect(module.getErrorType({ status: 401 })).toBe("unauthorized");
  });

  it("returns correct type for statusCode 500", async () => {
    const module = await import("./error-handler.js");
    expect(module.getErrorType({ statusCode: 500 })).toBe("server");
  });

  it("returns unknown for unrecognized status", async () => {
    const module = await import("./error-handler.js");
    expect(module.getErrorType({ status: 999 })).toBe("unknown");
  });
});

// ============================================
// isResponseError Tests
// ============================================

describe("isResponseError", () => {
  it("returns true for object with status", async () => {
    const module = await import("./error-handler.js");
    expect(module.isResponseError({ status: 404 })).toBe(true);
  });

  it("returns true for object with statusCode", async () => {
    const module = await import("./error-handler.js");
    expect(module.isResponseError({ statusCode: 500 })).toBe(true);
  });

  it("returns false for null", async () => {
    const module = await import("./error-handler.js");
    expect(module.isResponseError(null)).toBe(false);
  });

  it("returns false for plain Error", async () => {
    const module = await import("./error-handler.js");
    expect(module.isResponseError(new Error("test"))).toBe(false);
  });

  it("returns false for plain object", async () => {
    const module = await import("./error-handler.js");
    expect(module.isResponseError({ message: "error" })).toBe(false);
  });
});

// ============================================
// isTransientError Tests
// ============================================

describe("isTransientError", () => {
  it("returns true for network error type", async () => {
    const module = await import("./error-handler.js");
    expect(module.isTransientError("network")).toBe(true);
  });

  it("returns true for timeout error type", async () => {
    const module = await import("./error-handler.js");
    expect(module.isTransientError("timeout")).toBe(true);
  });

  it("returns true for server error type", async () => {
    const module = await import("./error-handler.js");
    expect(module.isTransientError("server")).toBe(true);
  });

  it("returns false for unauthorized error type", async () => {
    const module = await import("./error-handler.js");
    expect(module.isTransientError("unauthorized")).toBe(false);
  });

  it("returns false for validation error type", async () => {
    const module = await import("./error-handler.js");
    expect(module.isTransientError("validation")).toBe(false);
  });

  it("works with ApiError object", async () => {
    const module = await import("./error-handler.js");
    const error: ApiError = {
      type: "network",
      message: "Error",
      timestamp: Date.now(),
      isTransient: true,
    };
    expect(module.isTransientError(error)).toBe(true);
  });
});

// ============================================
// isAuthError Tests
// ============================================

describe("isAuthError", () => {
  it("returns true for unauthorized", async () => {
    const module = await import("./error-handler.js");
    expect(module.isAuthError("unauthorized")).toBe(true);
  });

  it("returns true for forbidden", async () => {
    const module = await import("./error-handler.js");
    expect(module.isAuthError("forbidden")).toBe(true);
  });

  it("returns false for other types", async () => {
    const module = await import("./error-handler.js");
    expect(module.isAuthError("network")).toBe(false);
    expect(module.isAuthError("server")).toBe(false);
    expect(module.isAuthError("validation")).toBe(false);
  });
});

// ============================================
// parseError Tests
// ============================================

describe("parseError", () => {
  it("returns ApiError structure", async () => {
    const module = await import("./error-handler.js");
    const result = module.parseError(new Error("test"));
    expect(result.type).toBe("unknown");
    expect(result.message).toBeDefined();
    expect(result.timestamp).toBeDefined();
    expect(typeof result.isTransient).toBe("boolean");
  });

  it("extracts status code from response error", async () => {
    const module = await import("./error-handler.js");
    const result = module.parseError({ status: 404, message: "Not found" });
    expect(result.statusCode).toBe(404);
    expect(result.type).toBe("not_found");
  });

  it("uses custom messages when provided", async () => {
    const module = await import("./error-handler.js");
    const result = module.parseError(
      { status: 500 },
      { messages: { server: "Custom server error" } }
    );
    expect(result.message).toBe("Custom server error");
  });

  it("adds code prefix when provided", async () => {
    const module = await import("./error-handler.js");
    const result = module.parseError({ status: 500 }, { codePrefix: "CREAM" });
    expect(result.code).toContain("CREAM");
  });
});

// ============================================
// formatError Tests
// ============================================

describe("formatError", () => {
  it("returns title and message", async () => {
    const module = await import("./error-handler.js");
    const error: ApiError = {
      type: "network",
      message: "Connection failed",
      timestamp: Date.now(),
      isTransient: true,
    };
    const result = module.formatError(error);
    expect(result.title).toBe("Connection Error");
    expect(result.message).toBe("Connection failed");
  });

  it("includes hint for some error types", async () => {
    const module = await import("./error-handler.js");
    const error: ApiError = {
      type: "unauthorized",
      message: "Session expired",
      timestamp: Date.now(),
      isTransient: false,
    };
    const result = module.formatError(error);
    expect(result.hint).toContain("sign in");
  });

  it("includes code when present", async () => {
    const module = await import("./error-handler.js");
    const error: ApiError = {
      type: "server",
      message: "Error",
      code: "CREAM-500",
      timestamp: Date.now(),
      isTransient: true,
    };
    const result = module.formatError(error);
    expect(result.code).toBe("CREAM-500");
  });
});

// ============================================
// formatErrorForToast Tests
// ============================================

describe("formatErrorForToast", () => {
  it("returns title and message only", async () => {
    const module = await import("./error-handler.js");
    const error: ApiError = {
      type: "network",
      message: "Error message",
      timestamp: Date.now(),
      isTransient: true,
    };
    const result = module.formatErrorForToast(error);
    expect(result.title).toBeDefined();
    expect(result.message).toBeDefined();
    expect((result as Record<string, unknown>).hint).toBeUndefined();
  });
});

// ============================================
// ErrorHandler Class Tests
// ============================================

describe("ErrorHandler Class", () => {
  it("can be instantiated with no options", async () => {
    const module = await import("./error-handler.js");
    const handler = new module.ErrorHandler();
    expect(handler).toBeDefined();
  });

  it("can be instantiated with options", async () => {
    const module = await import("./error-handler.js");
    const handler = new module.ErrorHandler({ showToast: false });
    expect(handler).toBeDefined();
  });

  it("handle method returns ApiError", async () => {
    const module = await import("./error-handler.js");
    const handler = new module.ErrorHandler();
    const result = handler.handle(new Error("test"));
    expect(result.type).toBeDefined();
    expect(result.message).toBeDefined();
  });

  it("handleSilent method returns ApiError", async () => {
    const module = await import("./error-handler.js");
    const handler = new module.ErrorHandler();
    const result = handler.handleSilent({ status: 500 });
    expect(result.type).toBe("server");
  });

  it("setToastFunction accepts function", async () => {
    const module = await import("./error-handler.js");
    const handler = new module.ErrorHandler();
    handler.setToastFunction(() => {});
    // Should not throw
    expect(true).toBe(true);
  });
});

// ============================================
// createQueryErrorHandler Tests
// ============================================

describe("createQueryErrorHandler", () => {
  it("returns a function", async () => {
    const module = await import("./error-handler.js");
    const handler = module.createQueryErrorHandler(() => {});
    expect(typeof handler).toBe("function");
  });

  it("handler can be called with error", async () => {
    const module = await import("./error-handler.js");
    let called = false;
    const handler = module.createQueryErrorHandler(() => {
      called = true;
    });
    handler({ status: 500 });
    expect(called).toBe(true);
  });
});

// ============================================
// createRetryCondition Tests
// ============================================

describe("createRetryCondition", () => {
  it("returns a function", async () => {
    const module = await import("./error-handler.js");
    const condition = module.createRetryCondition();
    expect(typeof condition).toBe("function");
  });

  it("returns false when failureCount >= maxRetries", async () => {
    const module = await import("./error-handler.js");
    const condition = module.createRetryCondition(3);
    expect(condition(3, { status: 500 })).toBe(false);
    expect(condition(4, { status: 500 })).toBe(false);
  });

  it("returns true for transient errors under max", async () => {
    const module = await import("./error-handler.js");
    const condition = module.createRetryCondition(3);
    expect(condition(1, { status: 500 })).toBe(true);
  });

  it("returns false for non-transient errors", async () => {
    const module = await import("./error-handler.js");
    const condition = module.createRetryCondition(3);
    expect(condition(1, { status: 401 })).toBe(false);
  });

  it("returns false for rate_limit errors", async () => {
    const module = await import("./error-handler.js");
    const condition = module.createRetryCondition(3);
    expect(condition(1, { status: 429 })).toBe(false);
  });
});

// ============================================
// errorHandler Instance Tests
// ============================================

describe("errorHandler Instance", () => {
  it("is an ErrorHandler instance", async () => {
    const module = await import("./error-handler.js");
    expect(module.errorHandler.handle).toBeDefined();
    expect(module.errorHandler.handleSilent).toBeDefined();
  });
});
