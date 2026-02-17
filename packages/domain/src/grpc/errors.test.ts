/**
 * Tests for gRPC error handling.
 */

import { describe, expect, it } from "bun:test";
import { GrpcError, sleep } from "./errors.js";
import { GrpcErrorCode, isRetryableErrorCode } from "./types.js";

describe("GrpcError constructor", () => {
	it("creates error with code and message", () => {
		const error = new GrpcError("Test error", GrpcErrorCode.UNAVAILABLE);

		expect(error.message).toBe("Test error");
		expect(error.code).toBe(GrpcErrorCode.UNAVAILABLE);
		expect(error.retryable).toBe(true);
		expect(error.name).toBe("GrpcError");
	});

	it("sets retryable based on code", () => {
		const unavailable = new GrpcError("err", GrpcErrorCode.UNAVAILABLE);
		expect(unavailable.retryable).toBe(true);

		const invalidArg = new GrpcError("err", GrpcErrorCode.INVALID_ARGUMENT);
		expect(invalidArg.retryable).toBe(false);
	});

	it("includes details and requestId", () => {
		const error = new GrpcError("Test error", GrpcErrorCode.INTERNAL, {
			details: { foo: "bar" },
			requestId: "req-123",
		});

		expect(error.details).toEqual({ foo: "bar" });
		expect(error.requestId).toBe("req-123");
	});
});

describe("GrpcError.fromConnectError", () => {
	it("converts Connect error with code", () => {
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

	it("handles standard Error", () => {
		const stdError = new Error("Something went wrong");
		const error = GrpcError.fromConnectError(stdError);

		expect(error.code).toBe(GrpcErrorCode.UNKNOWN);
		expect(error.message).toBe("Something went wrong");
	});

	it("handles string error", () => {
		const error = GrpcError.fromConnectError("String error message");

		expect(error.code).toBe(GrpcErrorCode.UNKNOWN);
		expect(error.message).toBe("String error message");
	});

	it("maps various Connect codes", () => {
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

describe("GrpcError helper methods", () => {
	it("isUnavailable returns true for UNAVAILABLE", () => {
		const error = new GrpcError("err", GrpcErrorCode.UNAVAILABLE);
		expect(error.isUnavailable()).toBe(true);

		const other = new GrpcError("err", GrpcErrorCode.INTERNAL);
		expect(other.isUnavailable()).toBe(false);
	});

	it("isRateLimited returns true for RESOURCE_EXHAUSTED", () => {
		const error = new GrpcError("err", GrpcErrorCode.RESOURCE_EXHAUSTED);
		expect(error.isRateLimited()).toBe(true);

		const other = new GrpcError("err", GrpcErrorCode.UNAVAILABLE);
		expect(other.isRateLimited()).toBe(false);
	});

	it("isTimeout returns true for DEADLINE_EXCEEDED", () => {
		const error = new GrpcError("err", GrpcErrorCode.DEADLINE_EXCEEDED);
		expect(error.isTimeout()).toBe(true);

		const other = new GrpcError("err", GrpcErrorCode.UNAVAILABLE);
		expect(other.isTimeout()).toBe(false);
	});

	it("isInvalidInput returns true for INVALID_ARGUMENT", () => {
		const error = new GrpcError("err", GrpcErrorCode.INVALID_ARGUMENT);
		expect(error.isInvalidInput()).toBe(true);

		const other = new GrpcError("err", GrpcErrorCode.UNAVAILABLE);
		expect(other.isInvalidInput()).toBe(false);
	});
});

describe("GrpcError.toJSON", () => {
	it("serializes error to JSON", () => {
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

describe("isRetryableErrorCode", () => {
	it("returns true for retryable codes", () => {
		expect(isRetryableErrorCode(GrpcErrorCode.UNAVAILABLE)).toBe(true);
		expect(isRetryableErrorCode(GrpcErrorCode.RESOURCE_EXHAUSTED)).toBe(true);
		expect(isRetryableErrorCode(GrpcErrorCode.DEADLINE_EXCEEDED)).toBe(true);
		expect(isRetryableErrorCode(GrpcErrorCode.ABORTED)).toBe(true);
	});

	it("returns false for non-retryable codes", () => {
		expect(isRetryableErrorCode(GrpcErrorCode.INVALID_ARGUMENT)).toBe(false);
		expect(isRetryableErrorCode(GrpcErrorCode.NOT_FOUND)).toBe(false);
		expect(isRetryableErrorCode(GrpcErrorCode.PERMISSION_DENIED)).toBe(false);
		expect(isRetryableErrorCode(GrpcErrorCode.INTERNAL)).toBe(false);
		expect(isRetryableErrorCode(GrpcErrorCode.UNAUTHENTICATED)).toBe(false);
	});
});

describe("sleep", () => {
	it("waits for specified duration", async () => {
		const start = Date.now();
		await sleep(50);
		const elapsed = Date.now() - start;

		expect(elapsed).toBeGreaterThanOrEqual(45);
		expect(elapsed).toBeLessThan(100);
	});
});
