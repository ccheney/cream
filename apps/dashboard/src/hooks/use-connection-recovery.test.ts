/**
 * Connection Recovery Hook Tests
 *
 * Tests for exponential backoff, error classification, and recovery utilities.
 */

import { describe, expect, it } from "bun:test";
import type {
	BackoffConfig,
	ConnectionError,
	ConnectionErrorType,
	ConnectionState,
} from "./use-connection-recovery";
import {
	calculateBackoffDelay,
	classifyHttpError,
	createConnectionError,
	getErrorMessage,
} from "./use-connection-recovery";

// ============================================
// Type Tests
// ============================================

describe("ConnectionState type", () => {
	it("has all expected states", () => {
		const states: ConnectionState[] = [
			"connected",
			"connecting",
			"reconnecting",
			"disconnected",
			"error",
			"offline",
		];
		expect(states).toHaveLength(6);
	});
});

describe("ConnectionErrorType type", () => {
	it("has all expected error types", () => {
		const types: ConnectionErrorType[] = [
			"network",
			"timeout",
			"unauthorized",
			"forbidden",
			"server_error",
			"service_unavailable",
			"unknown",
		];
		expect(types).toHaveLength(7);
	});
});

describe("ConnectionError type", () => {
	it("has required properties", () => {
		const error: ConnectionError = {
			type: "network",
			message: "Connection lost",
			retryable: true,
		};
		expect(error.type).toBe("network");
		expect(error.message).toBe("Connection lost");
		expect(error.retryable).toBe(true);
	});

	it("has optional properties", () => {
		const error: ConnectionError = {
			type: "server_error",
			statusCode: 500,
			message: "Internal server error",
			retryable: true,
			originalError: new Error("Original"),
		};
		expect(error.statusCode).toBe(500);
		expect(error.originalError?.message).toBe("Original");
	});
});

// ============================================
// calculateBackoffDelay Tests
// ============================================

describe("calculateBackoffDelay", () => {
	const defaultConfig: Required<BackoffConfig> = {
		initialDelayMs: 1000,
		maxDelayMs: 30000,
		multiplier: 2,
		jitterFactor: 0,
		maxRetries: 10,
	};

	it("returns initial delay for attempt 0", () => {
		const delay = calculateBackoffDelay(0, defaultConfig);
		expect(delay).toBe(1000);
	});

	it("doubles delay for each attempt", () => {
		const delay1 = calculateBackoffDelay(1, defaultConfig);
		const delay2 = calculateBackoffDelay(2, defaultConfig);
		const delay3 = calculateBackoffDelay(3, defaultConfig);

		expect(delay1).toBe(2000);
		expect(delay2).toBe(4000);
		expect(delay3).toBe(8000);
	});

	it("caps at maxDelayMs", () => {
		const delay10 = calculateBackoffDelay(10, defaultConfig);
		expect(delay10).toBe(30000);

		const delay20 = calculateBackoffDelay(20, defaultConfig);
		expect(delay20).toBe(30000);
	});

	it("applies jitter within range", () => {
		const configWithJitter = { ...defaultConfig, jitterFactor: 0.2 };

		// Run multiple times to verify jitter variance
		const delays = Array.from({ length: 100 }, () => calculateBackoffDelay(0, configWithJitter));

		const min = Math.min(...delays);
		const max = Math.max(...delays);

		// With 20% jitter on 1000ms, range should be 800-1200
		expect(min).toBeGreaterThanOrEqual(800);
		expect(max).toBeLessThanOrEqual(1200);
	});

	it("handles custom multiplier", () => {
		const config = { ...defaultConfig, multiplier: 3 };

		expect(calculateBackoffDelay(0, config)).toBe(1000);
		expect(calculateBackoffDelay(1, config)).toBe(3000);
		expect(calculateBackoffDelay(2, config)).toBe(9000);
	});

	it("handles custom initial delay", () => {
		const config = { ...defaultConfig, initialDelayMs: 500 };

		expect(calculateBackoffDelay(0, config)).toBe(500);
		expect(calculateBackoffDelay(1, config)).toBe(1000);
		expect(calculateBackoffDelay(2, config)).toBe(2000);
	});
});

// ============================================
// classifyHttpError Tests
// ============================================

describe("classifyHttpError", () => {
	it("classifies 401 as unauthorized", () => {
		expect(classifyHttpError(401)).toBe("unauthorized");
	});

	it("classifies 403 as forbidden", () => {
		expect(classifyHttpError(403)).toBe("forbidden");
	});

	it("classifies 500 as server_error", () => {
		expect(classifyHttpError(500)).toBe("server_error");
	});

	it("classifies 502 as server_error", () => {
		expect(classifyHttpError(502)).toBe("server_error");
	});

	it("classifies 503 as service_unavailable", () => {
		expect(classifyHttpError(503)).toBe("service_unavailable");
	});

	it("classifies 504 as server_error", () => {
		expect(classifyHttpError(504)).toBe("server_error");
	});

	it("classifies 404 as unknown", () => {
		expect(classifyHttpError(404)).toBe("unknown");
	});

	it("classifies 400 as unknown", () => {
		expect(classifyHttpError(400)).toBe("unknown");
	});

	it("classifies 200 as unknown", () => {
		expect(classifyHttpError(200)).toBe("unknown");
	});
});

// ============================================
// createConnectionError Tests
// ============================================

describe("createConnectionError", () => {
	it("creates network error for fetch TypeError", () => {
		const error = new TypeError("Failed to fetch");
		const result = createConnectionError(error);

		expect(result.type).toBe("network");
		expect(result.retryable).toBe(true);
		expect(result.message).toContain("Network");
	});

	it("creates timeout error for TimeoutError", () => {
		const error = new Error("Connection timeout");
		error.name = "TimeoutError";
		const result = createConnectionError(error);

		expect(result.type).toBe("timeout");
		expect(result.retryable).toBe(true);
	});

	it("creates timeout error for timeout message", () => {
		const error = new Error("Request timeout after 30s");
		const result = createConnectionError(error);

		expect(result.type).toBe("timeout");
		expect(result.retryable).toBe(true);
	});

	it("creates unauthorized error for 401", () => {
		const result = createConnectionError(new Error("Unauthorized"), 401);

		expect(result.type).toBe("unauthorized");
		expect(result.statusCode).toBe(401);
		expect(result.retryable).toBe(false);
	});

	it("creates forbidden error for 403", () => {
		const result = createConnectionError(new Error("Forbidden"), 403);

		expect(result.type).toBe("forbidden");
		expect(result.statusCode).toBe(403);
		expect(result.retryable).toBe(false);
	});

	it("creates server_error for 500 (retryable)", () => {
		const result = createConnectionError(new Error("Server Error"), 500);

		expect(result.type).toBe("server_error");
		expect(result.statusCode).toBe(500);
		expect(result.retryable).toBe(true);
	});

	it("creates service_unavailable for 503 (retryable)", () => {
		const result = createConnectionError(new Error("Service Unavailable"), 503);

		expect(result.type).toBe("service_unavailable");
		expect(result.statusCode).toBe(503);
		expect(result.retryable).toBe(true);
	});

	it("creates unknown error for generic errors", () => {
		const result = createConnectionError(new Error("Something went wrong"));

		expect(result.type).toBe("unknown");
		expect(result.retryable).toBe(true);
	});

	it("preserves original error", () => {
		const original = new Error("Original error");
		const result = createConnectionError(original);

		expect(result.originalError).toBe(original);
	});

	it("handles non-Error objects", () => {
		const result = createConnectionError("string error");

		expect(result.type).toBe("unknown");
		// Non-Error objects get the default message
		expect(result.message).toBe("An unexpected error occurred.");
		expect(result.originalError).toBeUndefined();
	});
});

// ============================================
// getErrorMessage Tests
// ============================================

describe("getErrorMessage", () => {
	it("returns user-friendly message for network error", () => {
		const error: ConnectionError = {
			type: "network",
			message: "Original",
			retryable: true,
		};
		const message = getErrorMessage(error);
		expect(message).toContain("Connection lost");
		expect(message).toContain("internet");
	});

	it("returns user-friendly message for timeout error", () => {
		const error: ConnectionError = {
			type: "timeout",
			message: "Original",
			retryable: true,
		};
		const message = getErrorMessage(error);
		expect(message).toContain("not responding");
	});

	it("returns user-friendly message for unauthorized error", () => {
		const error: ConnectionError = {
			type: "unauthorized",
			message: "Original",
			retryable: false,
		};
		const message = getErrorMessage(error);
		expect(message).toContain("session");
		expect(message).toContain("log in");
	});

	it("returns user-friendly message for forbidden error", () => {
		const error: ConnectionError = {
			type: "forbidden",
			message: "Original",
			retryable: false,
		};
		const message = getErrorMessage(error);
		expect(message).toContain("access");
	});

	it("returns user-friendly message for server_error", () => {
		const error: ConnectionError = {
			type: "server_error",
			message: "Original",
			retryable: true,
		};
		const message = getErrorMessage(error);
		expect(message).toContain("Server error");
	});

	it("returns user-friendly message for service_unavailable", () => {
		const error: ConnectionError = {
			type: "service_unavailable",
			message: "Original",
			retryable: true,
		};
		const message = getErrorMessage(error);
		expect(message).toContain("unavailable");
	});

	it("returns original message for unknown error", () => {
		const error: ConnectionError = {
			type: "unknown",
			message: "Custom error message",
			retryable: true,
		};
		const message = getErrorMessage(error);
		expect(message).toBe("Custom error message");
	});

	it("returns fallback for unknown error without message", () => {
		const error: ConnectionError = {
			type: "unknown",
			message: "",
			retryable: true,
		};
		const message = getErrorMessage(error);
		expect(message).toContain("Something went wrong");
	});
});

// ============================================
// Backoff Sequence Tests
// ============================================

describe("backoff sequence", () => {
	it("produces expected sequence without jitter", () => {
		const config: Required<BackoffConfig> = {
			initialDelayMs: 1000,
			maxDelayMs: 30000,
			multiplier: 2,
			jitterFactor: 0,
			maxRetries: 10,
		};

		const sequence = [0, 1, 2, 3, 4, 5].map((attempt) => calculateBackoffDelay(attempt, config));

		expect(sequence).toEqual([1000, 2000, 4000, 8000, 16000, 30000]);
	});

	it("caps after maxDelayMs is reached", () => {
		const config: Required<BackoffConfig> = {
			initialDelayMs: 1000,
			maxDelayMs: 10000,
			multiplier: 2,
			jitterFactor: 0,
			maxRetries: 10,
		};

		const sequence = [0, 1, 2, 3, 4, 5, 6].map((attempt) => calculateBackoffDelay(attempt, config));

		expect(sequence).toEqual([1000, 2000, 4000, 8000, 10000, 10000, 10000]);
	});
});

// ============================================
// Retryable Error Tests
// ============================================

describe("retryable errors", () => {
	const _retryableTypes: ConnectionErrorType[] = [
		"network",
		"timeout",
		"server_error",
		"service_unavailable",
		"unknown",
	];

	const _nonRetryableTypes: ConnectionErrorType[] = ["unauthorized", "forbidden"];

	it("network errors are retryable", () => {
		const error = createConnectionError(new TypeError("Failed to fetch"));
		expect(error.retryable).toBe(true);
	});

	it("timeout errors are retryable", () => {
		const error = createConnectionError(new Error("timeout"));
		expect(error.retryable).toBe(true);
	});

	it("server errors are retryable", () => {
		const error = createConnectionError(new Error("error"), 500);
		expect(error.retryable).toBe(true);
	});

	it("service unavailable is retryable", () => {
		const error = createConnectionError(new Error("error"), 503);
		expect(error.retryable).toBe(true);
	});

	it("unauthorized is not retryable", () => {
		const error = createConnectionError(new Error("error"), 401);
		expect(error.retryable).toBe(false);
	});

	it("forbidden is not retryable", () => {
		const error = createConnectionError(new Error("error"), 403);
		expect(error.retryable).toBe(false);
	});
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
	it("handles negative attempt number", () => {
		const config: Required<BackoffConfig> = {
			initialDelayMs: 1000,
			maxDelayMs: 30000,
			multiplier: 2,
			jitterFactor: 0,
			maxRetries: 10,
		};

		// Should use initial delay (multiplier^0 = 1)
		const delay = calculateBackoffDelay(-1, config);
		expect(delay).toBeLessThanOrEqual(1000);
	});

	it("handles zero maxDelayMs", () => {
		const config: Required<BackoffConfig> = {
			initialDelayMs: 1000,
			maxDelayMs: 0,
			multiplier: 2,
			jitterFactor: 0,
			maxRetries: 10,
		};

		const delay = calculateBackoffDelay(5, config);
		expect(delay).toBe(0);
	});

	it("handles empty error message", () => {
		const result = createConnectionError(new Error(""));
		expect(result.message).toBe("");
	});

	it("handles null/undefined gracefully", () => {
		const result = createConnectionError(null);
		expect(result.type).toBe("unknown");
		expect(result.retryable).toBe(true);
	});
});

// ============================================
// Export Tests
// ============================================

describe("module exports", () => {
	it("exports useConnectionRecovery hook", async () => {
		const module = await import("./use-connection-recovery");
		expect(typeof module.useConnectionRecovery).toBe("function");
		expect(typeof module.default).toBe("function");
	});

	it("exports useConnectionStatusInfo hook", async () => {
		const module = await import("./use-connection-recovery");
		expect(typeof module.useConnectionStatusInfo).toBe("function");
	});

	it("exports utility functions", async () => {
		const module = await import("./use-connection-recovery");
		expect(typeof module.calculateBackoffDelay).toBe("function");
		expect(typeof module.classifyHttpError).toBe("function");
		expect(typeof module.createConnectionError).toBe("function");
		expect(typeof module.getErrorMessage).toBe("function");
	});
});
