/**
 * Tests for gRPC error handling
 */

import { describe, expect, it } from "bun:test";
import { GrpcError, RetryBackoff, sleep } from "./errors.js";
import { GrpcErrorCode, isRetryableErrorCode } from "./types.js";

describe("GrpcError", () => {
	describe("constructor", () => {
		it("should create error with code and message", () => {
			const error = new GrpcError("Test error", GrpcErrorCode.UNAVAILABLE);

			expect(error.message).toBe("Test error");
			expect(error.code).toBe(GrpcErrorCode.UNAVAILABLE);
			expect(error.retryable).toBe(true);
			expect(error.name).toBe("GrpcError");
		});

		it("should set retryable based on code", () => {
			const unavailable = new GrpcError("err", GrpcErrorCode.UNAVAILABLE);
			expect(unavailable.retryable).toBe(true);

			const invalidArg = new GrpcError("err", GrpcErrorCode.INVALID_ARGUMENT);
			expect(invalidArg.retryable).toBe(false);
		});

		it("should include details and requestId", () => {
			const error = new GrpcError("Test error", GrpcErrorCode.INTERNAL, {
				details: { foo: "bar" },
				requestId: "req-123",
			});

			expect(error.details).toEqual({ foo: "bar" });
			expect(error.requestId).toBe("req-123");
		});
	});

	describe("fromConnectError", () => {
		it("should convert Connect error with code", () => {
			const connectError = {
				code: "unavailable",
				message: "Service unavailable",
				rawMessage: "Connection refused",
			};

			const error = GrpcError.fromConnectError(connectError, "req-456");

			expect(error.code).toBe(GrpcErrorCode.UNAVAILABLE);
			expect(error.message).toBe("Connection refused");
			expect(error.requestId).toBe("req-456");
			expect(error.retryable).toBe(true);
		});

		it("should handle standard Error", () => {
			const stdError = new Error("Something went wrong");
			const error = GrpcError.fromConnectError(stdError);

			expect(error.code).toBe(GrpcErrorCode.UNKNOWN);
			expect(error.message).toBe("Something went wrong");
		});

		it("should handle string error", () => {
			const error = GrpcError.fromConnectError("String error message");

			expect(error.code).toBe(GrpcErrorCode.UNKNOWN);
			expect(error.message).toBe("String error message");
		});

		it("should map various Connect codes", () => {
			const testCases: Array<{ connectCode: string; expected: GrpcErrorCode }> = [
				{ connectCode: "invalid_argument", expected: "INVALID_ARGUMENT" },
				{ connectCode: "deadline_exceeded", expected: "DEADLINE_EXCEEDED" },
				{ connectCode: "not_found", expected: "NOT_FOUND" },
				{ connectCode: "permission_denied", expected: "PERMISSION_DENIED" },
				{ connectCode: "resource_exhausted", expected: "RESOURCE_EXHAUSTED" },
				{ connectCode: "internal", expected: "INTERNAL" },
				{ connectCode: "unauthenticated", expected: "UNAUTHENTICATED" },
			];

			for (const { connectCode, expected } of testCases) {
				const error = GrpcError.fromConnectError({
					code: connectCode,
					message: "test",
				});
				expect(error.code).toBe(expected);
			}
		});
	});

	describe("helper methods", () => {
		it("isUnavailable should return true for UNAVAILABLE", () => {
			const error = new GrpcError("err", GrpcErrorCode.UNAVAILABLE);
			expect(error.isUnavailable()).toBe(true);

			const other = new GrpcError("err", GrpcErrorCode.INTERNAL);
			expect(other.isUnavailable()).toBe(false);
		});

		it("isRateLimited should return true for RESOURCE_EXHAUSTED", () => {
			const error = new GrpcError("err", GrpcErrorCode.RESOURCE_EXHAUSTED);
			expect(error.isRateLimited()).toBe(true);

			const other = new GrpcError("err", GrpcErrorCode.UNAVAILABLE);
			expect(other.isRateLimited()).toBe(false);
		});

		it("isTimeout should return true for DEADLINE_EXCEEDED", () => {
			const error = new GrpcError("err", GrpcErrorCode.DEADLINE_EXCEEDED);
			expect(error.isTimeout()).toBe(true);

			const other = new GrpcError("err", GrpcErrorCode.UNAVAILABLE);
			expect(other.isTimeout()).toBe(false);
		});

		it("isInvalidInput should return true for INVALID_ARGUMENT", () => {
			const error = new GrpcError("err", GrpcErrorCode.INVALID_ARGUMENT);
			expect(error.isInvalidInput()).toBe(true);

			const other = new GrpcError("err", GrpcErrorCode.UNAVAILABLE);
			expect(other.isInvalidInput()).toBe(false);
		});
	});

	describe("toJSON", () => {
		it("should serialize error to JSON", () => {
			const error = new GrpcError("Test error", GrpcErrorCode.UNAVAILABLE, {
				requestId: "req-789",
				details: { info: "extra" },
			});

			const json = error.toJSON();

			expect(json.name).toBe("GrpcError");
			expect(json.message).toBe("Test error");
			expect(json.code).toBe("UNAVAILABLE");
			expect(json.retryable).toBe(true);
			expect(json.requestId).toBe("req-789");
			expect(json.details).toEqual({ info: "extra" });
		});
	});
});

describe("isRetryableErrorCode", () => {
	it("should return true for retryable codes", () => {
		expect(isRetryableErrorCode(GrpcErrorCode.UNAVAILABLE)).toBe(true);
		expect(isRetryableErrorCode(GrpcErrorCode.RESOURCE_EXHAUSTED)).toBe(true);
		expect(isRetryableErrorCode(GrpcErrorCode.DEADLINE_EXCEEDED)).toBe(true);
		expect(isRetryableErrorCode(GrpcErrorCode.ABORTED)).toBe(true);
	});

	it("should return false for non-retryable codes", () => {
		expect(isRetryableErrorCode(GrpcErrorCode.INVALID_ARGUMENT)).toBe(false);
		expect(isRetryableErrorCode(GrpcErrorCode.NOT_FOUND)).toBe(false);
		expect(isRetryableErrorCode(GrpcErrorCode.PERMISSION_DENIED)).toBe(false);
		expect(isRetryableErrorCode(GrpcErrorCode.INTERNAL)).toBe(false);
		expect(isRetryableErrorCode(GrpcErrorCode.UNAUTHENTICATED)).toBe(false);
	});
});

describe("RetryBackoff", () => {
	describe("nextDelay", () => {
		it("should return exponentially increasing delays", () => {
			const backoff = new RetryBackoff({
				baseDelayMs: 100,
				jitterFactor: 0, // Disable jitter for predictable testing
			});

			// First delay: 100ms
			const delay1 = backoff.nextDelay();
			expect(delay1).toBe(100);

			// Second delay: 200ms
			const delay2 = backoff.nextDelay();
			expect(delay2).toBe(200);

			// Third delay: 400ms
			const delay3 = backoff.nextDelay();
			expect(delay3).toBe(400);
		});

		it("should cap at maxDelayMs", () => {
			const backoff = new RetryBackoff({
				baseDelayMs: 100,
				maxDelayMs: 250,
				jitterFactor: 0,
			});

			backoff.nextDelay(); // 100ms
			backoff.nextDelay(); // 200ms
			const delay3 = backoff.nextDelay(); // Would be 400ms but capped

			expect(delay3).toBe(250);
		});

		it("should apply jitter within expected range", () => {
			const _backoff = new RetryBackoff({
				baseDelayMs: 100,
				jitterFactor: 0.2, // ±20%
			});

			// Run multiple times to verify jitter
			for (let i = 0; i < 50; i++) {
				const newBackoff = new RetryBackoff({
					baseDelayMs: 100,
					jitterFactor: 0.2,
				});
				const delay = newBackoff.nextDelay();

				// Should be 100ms ± 20% = 80-120ms
				expect(delay).toBeGreaterThanOrEqual(80);
				expect(delay).toBeLessThanOrEqual(120);
			}
		});
	});

	describe("reset", () => {
		it("should reset attempt counter", () => {
			const backoff = new RetryBackoff({
				baseDelayMs: 100,
				jitterFactor: 0,
			});

			backoff.nextDelay(); // 100ms
			backoff.nextDelay(); // 200ms
			expect(backoff.getAttempt()).toBe(2);

			backoff.reset();

			expect(backoff.getAttempt()).toBe(0);
			expect(backoff.nextDelay()).toBe(100); // Back to base
		});
	});

	describe("getAttempt", () => {
		it("should return current attempt number", () => {
			const backoff = new RetryBackoff();

			expect(backoff.getAttempt()).toBe(0);
			backoff.nextDelay();
			expect(backoff.getAttempt()).toBe(1);
			backoff.nextDelay();
			expect(backoff.getAttempt()).toBe(2);
		});
	});
});

describe("sleep", () => {
	it("should wait for specified duration", async () => {
		const start = Date.now();
		await sleep(50);
		const elapsed = Date.now() - start;

		// Allow some tolerance for timing
		expect(elapsed).toBeGreaterThanOrEqual(45);
		expect(elapsed).toBeLessThan(100);
	});
});
