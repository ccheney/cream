/**
 * Execution Error Tests
 */

import { describe, expect, it, mock } from "bun:test";
import {
	type ConstraintViolationDetails,
	ConstraintViolationError,
	calculateRetryDelay,
	DEFAULT_RETRY_OPTIONS,
	DeadlineExceededError,
	ExecutionError,
	GRPC_STATUS_NAMES,
	type GrpcError,
	GrpcStatusCode,
	InsufficientFundsError,
	InternalError,
	InvalidArgumentError,
	isConstraintViolation,
	isExecutionError,
	isInsufficientFunds,
	isRetryableError,
	mapGrpcError,
	NotFoundError,
	PermissionDeniedError,
	ResourceExhaustedError,
	ServiceUnavailableError,
	withRetry,
} from "./errors";

// ============================================
// GrpcStatusCode Tests
// ============================================

describe("GrpcStatusCode", () => {
	it("has all standard codes", () => {
		expect(GrpcStatusCode.OK).toBe(0);
		expect(GrpcStatusCode.INVALID_ARGUMENT).toBe(3);
		expect(GrpcStatusCode.DEADLINE_EXCEEDED).toBe(4);
		expect(GrpcStatusCode.NOT_FOUND).toBe(5);
		expect(GrpcStatusCode.FAILED_PRECONDITION).toBe(9);
		expect(GrpcStatusCode.UNAVAILABLE).toBe(14);
		expect(GrpcStatusCode.INTERNAL).toBe(13);
	});

	it("has names for all codes", () => {
		for (const code of Object.values(GrpcStatusCode)) {
			if (typeof code === "number") {
				expect(GRPC_STATUS_NAMES[code]).toBeDefined();
			}
		}
	});
});

// ============================================
// ExecutionError Tests
// ============================================

describe("ExecutionError", () => {
	it("creates error with message and code", () => {
		const error = new ExecutionError("Test error", GrpcStatusCode.INTERNAL);

		expect(error.message).toBe("Test error");
		expect(error.grpcCode).toBe(GrpcStatusCode.INTERNAL);
		expect(error.grpcStatus).toBe("INTERNAL");
		expect(error.name).toBe("ExecutionError");
	});

	it("defaults retryable to false", () => {
		const error = new ExecutionError("Test", GrpcStatusCode.INTERNAL);
		expect(error.retryable).toBe(false);
	});

	it("accepts retryable option", () => {
		const error = new ExecutionError("Test", GrpcStatusCode.UNAVAILABLE, { retryable: true });
		expect(error.retryable).toBe(true);
	});

	it("preserves trace ID", () => {
		const error = new ExecutionError("Test", GrpcStatusCode.INTERNAL, { traceId: "trace-123" });
		expect(error.traceId).toBe("trace-123");
	});

	it("preserves details", () => {
		const details = {
			code: "TEST_ERROR",
			message: "Test",
			timestamp: new Date().toISOString(),
			source: "test",
		};
		const error = new ExecutionError("Test", GrpcStatusCode.INTERNAL, { details });
		expect(error.details?.code).toBe("TEST_ERROR");
	});

	it("toFormattedString includes context", () => {
		const error = new ExecutionError("Test error", GrpcStatusCode.UNAVAILABLE, {
			traceId: "trace-123",
			retryable: true,
		});

		const formatted = error.toFormattedString();

		expect(formatted).toContain("UNAVAILABLE");
		expect(formatted).toContain("Test error");
		expect(formatted).toContain("trace-123");
		expect(formatted).toContain("retryable");
	});

	it("toJSON includes all fields", () => {
		const error = new ExecutionError("Test", GrpcStatusCode.INTERNAL, { traceId: "trace-123" });
		const json = error.toJSON();

		expect(json.name).toBe("ExecutionError");
		expect(json.message).toBe("Test");
		expect(json.grpcCode).toBe(GrpcStatusCode.INTERNAL);
		expect(json.grpcStatus).toBe("INTERNAL");
		expect(json.traceId).toBe("trace-123");
	});
});

// ============================================
// InvalidArgumentError Tests
// ============================================

describe("InvalidArgumentError", () => {
	it("creates error with message", () => {
		const error = new InvalidArgumentError("Invalid quantity");

		expect(error.message).toBe("Invalid quantity");
		expect(error.grpcCode).toBe(GrpcStatusCode.INVALID_ARGUMENT);
		expect(error.retryable).toBe(false);
	});

	it("preserves field and value", () => {
		const error = new InvalidArgumentError("Invalid quantity", {
			field: "quantity",
			invalidValue: -5,
		});

		expect(error.field).toBe("quantity");
		expect(error.invalidValue).toBe(-5);
	});
});

// ============================================
// ConstraintViolationError Tests
// ============================================

describe("ConstraintViolationError", () => {
	it("creates error with violation details", () => {
		const violation: ConstraintViolationDetails = {
			constraintName: "MAX_POSITION_SIZE",
			currentValue: 150,
			requiredValue: 100,
			message: "Position size exceeds limit",
			suggestion: "Reduce position size to 100 or less",
		};

		const error = new ConstraintViolationError("Position limit exceeded", violation);

		expect(error.message).toBe("Position limit exceeded");
		expect(error.grpcCode).toBe(GrpcStatusCode.FAILED_PRECONDITION);
		expect(error.retryable).toBe(false);
		expect(error.violation).toEqual(violation);
	});

	it("includes constraint details in error details", () => {
		const violation: ConstraintViolationDetails = {
			constraintName: "MAX_LOSS",
			message: "Daily loss limit reached",
		};

		const error = new ConstraintViolationError("Loss limit", violation);

		expect(error.details?.constraintViolation).toEqual(violation);
		expect(error.details?.code).toContain("MAX_LOSS");
	});
});

// ============================================
// InsufficientFundsError Tests
// ============================================

describe("InsufficientFundsError", () => {
	it("creates error with amounts", () => {
		const error = new InsufficientFundsError(5000, 2500);

		expect(error.message).toBe("Insufficient funds for order");
		expect(error.requiredAmount).toBe(5000);
		expect(error.availableAmount).toBe(2500);
		expect(error.grpcCode).toBe(GrpcStatusCode.FAILED_PRECONDITION);
	});

	it("includes suggestion in violation", () => {
		const error = new InsufficientFundsError(5000, 2500);

		expect(error.violation.suggestion).toBeDefined();
		expect(error.violation.constraintName).toBe("BUYING_POWER");
	});
});

// ============================================
// NotFoundError Tests
// ============================================

describe("NotFoundError", () => {
	it("creates error with resource info", () => {
		const error = new NotFoundError("Instrument", "AAPL");

		expect(error.message).toBe("Instrument not found: AAPL");
		expect(error.resourceType).toBe("Instrument");
		expect(error.resourceId).toBe("AAPL");
		expect(error.grpcCode).toBe(GrpcStatusCode.NOT_FOUND);
		expect(error.retryable).toBe(false);
	});
});

// ============================================
// ServiceUnavailableError Tests
// ============================================

describe("ServiceUnavailableError", () => {
	it("creates retryable error", () => {
		const error = new ServiceUnavailableError("broker-api");

		expect(error.message).toContain("broker-api");
		expect(error.serviceName).toBe("broker-api");
		expect(error.grpcCode).toBe(GrpcStatusCode.UNAVAILABLE);
		expect(error.retryable).toBe(true);
	});

	it("accepts custom message", () => {
		const error = new ServiceUnavailableError("broker-api", "Broker is down for maintenance");

		expect(error.message).toBe("Broker is down for maintenance");
	});

	it("accepts retryAfterMs", () => {
		const error = new ServiceUnavailableError("broker-api", undefined, { retryAfterMs: 5000 });

		expect(error.retryAfterMs).toBe(5000);
	});
});

// ============================================
// DeadlineExceededError Tests
// ============================================

describe("DeadlineExceededError", () => {
	it("creates retryable error", () => {
		const error = new DeadlineExceededError(30000);

		expect(error.message).toContain("30000ms");
		expect(error.timeoutMs).toBe(30000);
		expect(error.grpcCode).toBe(GrpcStatusCode.DEADLINE_EXCEEDED);
		expect(error.retryable).toBe(true);
	});

	it("includes operation name", () => {
		const error = new DeadlineExceededError(5000, "SubmitOrder");

		expect(error.message).toContain("SubmitOrder");
	});
});

// ============================================
// PermissionDeniedError Tests
// ============================================

describe("PermissionDeniedError", () => {
	it("creates non-retryable error", () => {
		const error = new PermissionDeniedError("options_trading");

		expect(error.message).toContain("options_trading");
		expect(error.permission).toBe("options_trading");
		expect(error.grpcCode).toBe(GrpcStatusCode.PERMISSION_DENIED);
		expect(error.retryable).toBe(false);
	});
});

// ============================================
// ResourceExhaustedError Tests
// ============================================

describe("ResourceExhaustedError", () => {
	it("creates retryable error", () => {
		const error = new ResourceExhaustedError("api_rate_limit");

		expect(error.message).toContain("api_rate_limit");
		expect(error.resource).toBe("api_rate_limit");
		expect(error.grpcCode).toBe(GrpcStatusCode.RESOURCE_EXHAUSTED);
		expect(error.retryable).toBe(true);
	});
});

// ============================================
// InternalError Tests
// ============================================

describe("InternalError", () => {
	it("creates non-retryable error", () => {
		const error = new InternalError("Unexpected server error");

		expect(error.message).toBe("Unexpected server error");
		expect(error.grpcCode).toBe(GrpcStatusCode.INTERNAL);
		expect(error.retryable).toBe(false);
	});
});

// ============================================
// mapGrpcError Tests
// ============================================

describe("mapGrpcError", () => {
	it("maps INVALID_ARGUMENT to InvalidArgumentError", () => {
		const grpcError: GrpcError = {
			code: GrpcStatusCode.INVALID_ARGUMENT,
			message: "Invalid quantity",
		};

		const error = mapGrpcError(grpcError);

		expect(error).toBeInstanceOf(InvalidArgumentError);
		expect(error.message).toBe("Invalid quantity");
	});

	it("maps FAILED_PRECONDITION to ConstraintViolationError", () => {
		const grpcError: GrpcError = {
			code: GrpcStatusCode.FAILED_PRECONDITION,
			message: "Constraint failed",
		};

		const error = mapGrpcError(grpcError);

		expect(error).toBeInstanceOf(ConstraintViolationError);
	});

	it("parses error details from metadata", () => {
		const details = {
			code: "TEST_CODE",
			message: "Test",
			timestamp: new Date().toISOString(),
			source: "test",
			constraintViolation: {
				constraintName: "MAX_SIZE",
				message: "Too big",
			},
		};

		const grpcError: GrpcError = {
			code: GrpcStatusCode.FAILED_PRECONDITION,
			message: "Constraint failed",
			metadata: {
				"error-details": JSON.stringify(details),
				"x-trace-id": "trace-123",
			},
		};

		const error = mapGrpcError(grpcError) as ConstraintViolationError;

		expect(error.traceId).toBe("trace-123");
		expect(error.violation.constraintName).toBe("MAX_SIZE");
	});

	it("maps NOT_FOUND to NotFoundError", () => {
		const error = mapGrpcError({ code: GrpcStatusCode.NOT_FOUND, message: "Not found" });
		expect(error).toBeInstanceOf(NotFoundError);
	});

	it("maps UNAVAILABLE to ServiceUnavailableError", () => {
		const error = mapGrpcError({ code: GrpcStatusCode.UNAVAILABLE, message: "Unavailable" });
		expect(error).toBeInstanceOf(ServiceUnavailableError);
		expect(error.retryable).toBe(true);
	});

	it("maps DEADLINE_EXCEEDED to DeadlineExceededError", () => {
		const error = mapGrpcError({ code: GrpcStatusCode.DEADLINE_EXCEEDED, message: "Timeout" });
		expect(error).toBeInstanceOf(DeadlineExceededError);
		expect(error.retryable).toBe(true);
	});

	it("maps unknown codes to InternalError", () => {
		const error = mapGrpcError({ code: 99, message: "Unknown" });
		expect(error).toBeInstanceOf(InternalError);
	});
});

// ============================================
// Retry Logic Tests
// ============================================

describe("isRetryableError", () => {
	it("returns true for retryable ExecutionError", () => {
		const error = new ServiceUnavailableError("test");
		expect(isRetryableError(error)).toBe(true);
	});

	it("returns false for non-retryable ExecutionError", () => {
		const error = new InvalidArgumentError("test");
		expect(isRetryableError(error)).toBe(false);
	});

	it("returns true for network errors", () => {
		expect(isRetryableError(new Error("ECONNREFUSED"))).toBe(true);
		expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
		expect(isRetryableError(new Error("ETIMEDOUT"))).toBe(true);
		expect(isRetryableError(new Error("fetch failed"))).toBe(true);
	});

	it("returns false for unknown errors", () => {
		expect(isRetryableError(new Error("Random error"))).toBe(false);
		expect(isRetryableError("string error")).toBe(false);
		expect(isRetryableError(null)).toBe(false);
	});
});

describe("calculateRetryDelay", () => {
	it("calculates exponential backoff", () => {
		const delay0 = calculateRetryDelay(0, { ...DEFAULT_RETRY_OPTIONS, jitterFactor: 0 });
		const delay1 = calculateRetryDelay(1, { ...DEFAULT_RETRY_OPTIONS, jitterFactor: 0 });
		const delay2 = calculateRetryDelay(2, { ...DEFAULT_RETRY_OPTIONS, jitterFactor: 0 });

		expect(delay0).toBe(100); // initialDelayMs
		expect(delay1).toBe(200); // 100 * 2
		expect(delay2).toBe(400); // 100 * 2^2
	});

	it("caps at maxDelayMs", () => {
		const delay = calculateRetryDelay(100, { ...DEFAULT_RETRY_OPTIONS, jitterFactor: 0 });
		expect(delay).toBe(DEFAULT_RETRY_OPTIONS.maxDelayMs);
	});

	it("adds jitter", () => {
		const delays = new Set<number>();
		for (let i = 0; i < 10; i++) {
			delays.add(calculateRetryDelay(0, { ...DEFAULT_RETRY_OPTIONS, jitterFactor: 0.5 }));
		}
		// With jitter, we should get some variation
		expect(delays.size).toBeGreaterThan(1);
	});
});

describe("withRetry", () => {
	it("returns result on success", async () => {
		const fn = mock(() => Promise.resolve("success"));

		const result = await withRetry(fn);

		expect(result).toBe("success");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("retries on retryable error", async () => {
		let attempts = 0;
		const fn = mock(() => {
			attempts++;
			if (attempts < 3) {
				throw new ServiceUnavailableError("test");
			}
			return Promise.resolve("success");
		});

		const result = await withRetry(fn, { maxRetries: 5, initialDelayMs: 1 });

		expect(result).toBe("success");
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it("throws immediately on non-retryable error", async () => {
		const fn = mock(() => {
			throw new InvalidArgumentError("test");
		});

		await expect(withRetry(fn)).rejects.toThrow(InvalidArgumentError);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("throws after max retries", async () => {
		const fn = mock(() => {
			throw new ServiceUnavailableError("test");
		});

		await expect(withRetry(fn, { maxRetries: 2, initialDelayMs: 1 })).rejects.toThrow(
			ServiceUnavailableError,
		);
		expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
	});
});

// ============================================
// Type Guard Tests
// ============================================

describe("Type Guards", () => {
	describe("isExecutionError", () => {
		it("returns true for ExecutionError", () => {
			expect(isExecutionError(new ExecutionError("test", GrpcStatusCode.INTERNAL))).toBe(true);
		});

		it("returns true for subclasses", () => {
			expect(isExecutionError(new InvalidArgumentError("test"))).toBe(true);
			expect(isExecutionError(new InsufficientFundsError(100, 50))).toBe(true);
		});

		it("returns false for plain Error", () => {
			expect(isExecutionError(new Error("test"))).toBe(false);
		});
	});

	describe("isConstraintViolation", () => {
		it("returns true for ConstraintViolationError", () => {
			const error = new ConstraintViolationError("test", {
				constraintName: "TEST",
				message: "test",
			});
			expect(isConstraintViolation(error)).toBe(true);
		});

		it("returns true for InsufficientFundsError (subclass)", () => {
			expect(isConstraintViolation(new InsufficientFundsError(100, 50))).toBe(true);
		});
	});

	describe("isInsufficientFunds", () => {
		it("returns true for InsufficientFundsError", () => {
			expect(isInsufficientFunds(new InsufficientFundsError(100, 50))).toBe(true);
		});

		it("returns false for other ConstraintViolationError", () => {
			const error = new ConstraintViolationError("test", {
				constraintName: "TEST",
				message: "test",
			});
			expect(isInsufficientFunds(error)).toBe(false);
		});
	});
});
