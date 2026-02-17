/**
 * Execution Error Classes for gRPC Error Mapping
 *
 * Provides typed error classes that map to gRPC status codes from the
 * Rust execution engine. These errors preserve context for debugging
 * and enable appropriate retry/handling logic.
 */

export { ConstraintViolationError } from "./grpc/constraint-violation-error.js";
export { DeadlineExceededError } from "./grpc/deadline-exceeded-error.js";
export { ExecutionError } from "./grpc/execution-error.js";
export {
	type ConstraintViolationDetails,
	DEFAULT_RETRY_OPTIONS,
	type ErrorDetails,
	GRPC_STATUS_NAMES,
	type GrpcError,
	GrpcStatusCode,
	type RetryOptions,
} from "./grpc/execution-error-types.js";
export { InsufficientFundsError } from "./grpc/insufficient-funds-error.js";
export { InternalError } from "./grpc/internal-error.js";
export { InvalidArgumentError } from "./grpc/invalid-argument-error.js";
export { NotFoundError } from "./grpc/not-found-error.js";
export { PermissionDeniedError } from "./grpc/permission-denied-error.js";
export { ResourceExhaustedError } from "./grpc/resource-exhausted-error.js";
export { ServiceUnavailableError } from "./grpc/service-unavailable-error.js";

import { ConstraintViolationError } from "./grpc/constraint-violation-error.js";
import { DeadlineExceededError } from "./grpc/deadline-exceeded-error.js";
import { ExecutionError } from "./grpc/execution-error.js";
import {
	DEFAULT_RETRY_OPTIONS,
	type ErrorDetails,
	type GrpcError,
	GrpcStatusCode,
	type RetryOptions,
} from "./grpc/execution-error-types.js";
import { InsufficientFundsError } from "./grpc/insufficient-funds-error.js";
import { InternalError } from "./grpc/internal-error.js";
import { InvalidArgumentError } from "./grpc/invalid-argument-error.js";
import { NotFoundError } from "./grpc/not-found-error.js";
import { PermissionDeniedError } from "./grpc/permission-denied-error.js";
import { ResourceExhaustedError } from "./grpc/resource-exhausted-error.js";
import { ServiceUnavailableError } from "./grpc/service-unavailable-error.js";

/**
 * Map gRPC error to typed ExecutionError.
 */
export function mapGrpcError(error: GrpcError): ExecutionError {
	const code = error.code as GrpcStatusCode;
	const traceId = error.metadata?.["x-trace-id"];
	let details: ErrorDetails | undefined;

	if (error.metadata?.["error-details"]) {
		try {
			details = JSON.parse(error.metadata["error-details"]) as ErrorDetails;
		} catch {
			// Ignore parse errors.
		}
	}

	switch (code) {
		case GrpcStatusCode.INVALID_ARGUMENT:
			return new InvalidArgumentError(error.message, { details, traceId });

		case GrpcStatusCode.FAILED_PRECONDITION:
			if (details?.constraintViolation) {
				return new ConstraintViolationError(error.message, details.constraintViolation, {
					details,
					traceId,
				});
			}

			return new ConstraintViolationError(
				error.message,
				{
					constraintName: "UNKNOWN",
					message: error.message,
				},
				{ details, traceId },
			);

		case GrpcStatusCode.NOT_FOUND:
			return new NotFoundError("Resource", "unknown", {
				details,
				traceId,
			});

		case GrpcStatusCode.UNAVAILABLE:
			return new ServiceUnavailableError("execution-engine", error.message, {
				details,
				traceId,
			});

		case GrpcStatusCode.DEADLINE_EXCEEDED:
			return new DeadlineExceededError(30000, undefined, { details, traceId });

		case GrpcStatusCode.PERMISSION_DENIED:
			return new PermissionDeniedError("unknown", error.message, {
				details,
				traceId,
			});

		case GrpcStatusCode.RESOURCE_EXHAUSTED:
			return new ResourceExhaustedError("unknown", { details, traceId });

		default:
			return new InternalError(error.message, { details, traceId });
	}
}

/**
 * Check if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
	if (error instanceof ExecutionError) {
		return error.retryable;
	}

	if (error instanceof Error) {
		const networkErrors = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "fetch failed"];
		return networkErrors.some((networkError) => error.message.includes(networkError));
	}

	return false;
}

/**
 * Calculate retry delay with exponential backoff and jitter.
 */
export function calculateRetryDelay(
	attempt: number,
	options: RetryOptions = DEFAULT_RETRY_OPTIONS,
): number {
	const exponentialDelay = options.initialDelayMs * options.backoffMultiplier ** attempt;
	const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
	const jitter = cappedDelay * options.jitterFactor * (Math.random() * 2 - 1);

	return Math.max(0, cappedDelay + jitter);
}

/**
 * Execute function with retry logic.
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	options: Partial<RetryOptions> = {},
): Promise<T> {
	const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (!isRetryableError(error) || attempt === opts.maxRetries) {
				throw error;
			}

			const delay = calculateRetryDelay(attempt, opts);
			await Bun.sleep(delay);
		}
	}

	throw lastError;
}

/**
 * Check if error is an ExecutionError.
 */
export function isExecutionError(error: unknown): error is ExecutionError {
	return error instanceof ExecutionError;
}

/**
 * Check if error is a constraint violation.
 */
export function isConstraintViolation(error: unknown): error is ConstraintViolationError {
	return error instanceof ConstraintViolationError;
}

/**
 * Check if error is an insufficient funds error.
 */
export function isInsufficientFunds(error: unknown): error is InsufficientFundsError {
	return error instanceof InsufficientFundsError;
}
