/**
 * Execution Error Classes for gRPC Error Mapping
 *
 * Provides typed error classes that map to gRPC status codes from the
 * Rust execution engine. These errors preserve context for debugging
 * and enable appropriate retry/handling logic.
 *
 * ## gRPC Status Code Mapping
 *
 * | gRPC Status       | Error Class                | Retryable |
 * |-------------------|----------------------------|-----------|
 * | INVALID_ARGUMENT  | InvalidArgumentError       | No        |
 * | FAILED_PRECONDITION| ConstraintViolationError  | No        |
 * | NOT_FOUND         | NotFoundError              | No        |
 * | UNAVAILABLE       | ServiceUnavailableError    | Yes       |
 * | DEADLINE_EXCEEDED | DeadlineExceededError      | Yes       |
 * | INTERNAL          | InternalError              | No        |
 * | PERMISSION_DENIED | PermissionDeniedError      | No        |
 * | RESOURCE_EXHAUSTED| ResourceExhaustedError     | Yes (backoff) |
 *
 * @see docs/plans/00-overview.md Lines 172-178 for context
 */

// ============================================
// gRPC Status Codes
// ============================================

/**
 * Standard gRPC status codes
 *
 * @see https://grpc.io/docs/guides/status-codes/
 */
export enum GrpcStatusCode {
	OK = 0,
	CANCELLED = 1,
	UNKNOWN = 2,
	INVALID_ARGUMENT = 3,
	DEADLINE_EXCEEDED = 4,
	NOT_FOUND = 5,
	ALREADY_EXISTS = 6,
	PERMISSION_DENIED = 7,
	RESOURCE_EXHAUSTED = 8,
	FAILED_PRECONDITION = 9,
	ABORTED = 10,
	OUT_OF_RANGE = 11,
	UNIMPLEMENTED = 12,
	INTERNAL = 13,
	UNAVAILABLE = 14,
	DATA_LOSS = 15,
	UNAUTHENTICATED = 16,
}

/**
 * Error code to name mapping
 */
export const GRPC_STATUS_NAMES: Record<GrpcStatusCode, string> = {
	[GrpcStatusCode.OK]: "OK",
	[GrpcStatusCode.CANCELLED]: "CANCELLED",
	[GrpcStatusCode.UNKNOWN]: "UNKNOWN",
	[GrpcStatusCode.INVALID_ARGUMENT]: "INVALID_ARGUMENT",
	[GrpcStatusCode.DEADLINE_EXCEEDED]: "DEADLINE_EXCEEDED",
	[GrpcStatusCode.NOT_FOUND]: "NOT_FOUND",
	[GrpcStatusCode.ALREADY_EXISTS]: "ALREADY_EXISTS",
	[GrpcStatusCode.PERMISSION_DENIED]: "PERMISSION_DENIED",
	[GrpcStatusCode.RESOURCE_EXHAUSTED]: "RESOURCE_EXHAUSTED",
	[GrpcStatusCode.FAILED_PRECONDITION]: "FAILED_PRECONDITION",
	[GrpcStatusCode.ABORTED]: "ABORTED",
	[GrpcStatusCode.OUT_OF_RANGE]: "OUT_OF_RANGE",
	[GrpcStatusCode.UNIMPLEMENTED]: "UNIMPLEMENTED",
	[GrpcStatusCode.INTERNAL]: "INTERNAL",
	[GrpcStatusCode.UNAVAILABLE]: "UNAVAILABLE",
	[GrpcStatusCode.DATA_LOSS]: "DATA_LOSS",
	[GrpcStatusCode.UNAUTHENTICATED]: "UNAUTHENTICATED",
};

// ============================================
// Error Details
// ============================================

/**
 * Constraint violation details
 */
export interface ConstraintViolationDetails {
	/** Which constraint failed */
	constraintName: string;
	/** Current value that failed */
	currentValue?: string | number;
	/** Required/threshold value */
	requiredValue?: string | number;
	/** Human-readable explanation */
	message: string;
	/** Suggested resolution */
	suggestion?: string;
}

/**
 * Error details structure (serialized in gRPC metadata)
 */
export interface ErrorDetails {
	/** Error code (domain-specific) */
	code: string;
	/** Human-readable message */
	message: string;
	/** Trace ID for correlation */
	traceId?: string;
	/** Span ID for correlation */
	spanId?: string;
	/** Timestamp of error */
	timestamp: string;
	/** Source service */
	source: string;
	/** Constraint violation details (for FAILED_PRECONDITION) */
	constraintViolation?: ConstraintViolationDetails;
	/** Additional metadata */
	metadata?: Record<string, string | number | boolean>;
}

// ============================================
// Base Error Class
// ============================================

/**
 * Base class for all execution errors
 *
 * Extends Error with gRPC-specific context and retry information.
 */
export class ExecutionError extends Error {
	/** gRPC status code */
	readonly grpcCode: GrpcStatusCode;

	/** gRPC status name */
	readonly grpcStatus: string;

	/** Whether this error is retryable */
	readonly retryable: boolean;

	/** Original error details from server */
	readonly details?: ErrorDetails;

	/** Trace ID for correlation */
	readonly traceId?: string;

	constructor(
		message: string,
		grpcCode: GrpcStatusCode,
		options: {
			retryable?: boolean;
			details?: ErrorDetails;
			traceId?: string;
			cause?: Error;
		} = {},
	) {
		super(message, { cause: options.cause });
		this.name = this.constructor.name;
		this.grpcCode = grpcCode;
		this.grpcStatus = GRPC_STATUS_NAMES[grpcCode];
		this.retryable = options.retryable ?? false;
		this.details = options.details;
		this.traceId = options.traceId ?? options.details?.traceId;

		// Maintain proper stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Get formatted error message with context
	 */
	toFormattedString(): string {
		const parts = [
			`[${this.grpcStatus}] ${this.message}`,
			this.traceId ? `TraceID: ${this.traceId}` : null,
			this.details?.code ? `Code: ${this.details.code}` : null,
			this.retryable ? "(retryable)" : null,
		].filter(Boolean);

		return parts.join(" | ");
	}

	/**
	 * Convert to JSON for logging
	 */
	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			message: this.message,
			grpcCode: this.grpcCode,
			grpcStatus: this.grpcStatus,
			retryable: this.retryable,
			traceId: this.traceId,
			details: this.details,
			stack: this.stack,
		};
	}
}

// ============================================
// Specific Error Classes
// ============================================

/**
 * Invalid argument error (INVALID_ARGUMENT)
 *
 * Client provided invalid input. Do not retry.
 *
 * Examples:
 * - Malformed order (missing fields)
 * - Invalid quantity (negative, non-integer)
 * - Invalid price (negative, too many decimals)
 * - Unknown instrument ID
 */
export class InvalidArgumentError extends ExecutionError {
	/** Field that was invalid */
	readonly field?: string;

	/** Value that was invalid */
	readonly invalidValue?: unknown;

	constructor(
		message: string,
		options: {
			field?: string;
			invalidValue?: unknown;
			details?: ErrorDetails;
			traceId?: string;
			cause?: Error;
		} = {},
	) {
		super(message, GrpcStatusCode.INVALID_ARGUMENT, {
			retryable: false,
			...options,
		});
		this.field = options.field;
		this.invalidValue = options.invalidValue;
	}
}

/**
 * Constraint violation error (FAILED_PRECONDITION)
 *
 * A constraint was violated. Do not retry without addressing cause.
 *
 * Examples:
 * - Position size exceeds limit
 * - Insufficient buying power
 * - Daily loss limit reached
 * - Greeks exposure limit exceeded
 */
export class ConstraintViolationError extends ExecutionError {
	/** Detailed constraint violation info */
	readonly violation: ConstraintViolationDetails;

	constructor(
		message: string,
		violation: ConstraintViolationDetails,
		options: {
			details?: ErrorDetails;
			traceId?: string;
			cause?: Error;
		} = {},
	) {
		super(message, GrpcStatusCode.FAILED_PRECONDITION, {
			retryable: false,
			details: {
				...options.details,
				code: options.details?.code ?? `CONSTRAINT_${violation.constraintName.toUpperCase()}`,
				message: options.details?.message ?? message,
				timestamp: options.details?.timestamp ?? new Date().toISOString(),
				source: options.details?.source ?? "execution-engine",
				constraintViolation: violation,
			},
			...options,
		});
		this.violation = violation;
	}
}

/**
 * Insufficient funds error (FAILED_PRECONDITION subtype)
 *
 * Account doesn't have enough buying power.
 */
export class InsufficientFundsError extends ConstraintViolationError {
	/** Required amount */
	readonly requiredAmount: number;

	/** Available amount */
	readonly availableAmount: number;

	constructor(
		requiredAmount: number,
		availableAmount: number,
		options: {
			details?: ErrorDetails;
			traceId?: string;
			cause?: Error;
		} = {},
	) {
		const violation: ConstraintViolationDetails = {
			constraintName: "BUYING_POWER",
			currentValue: availableAmount,
			requiredValue: requiredAmount,
			message: `Insufficient funds: need $${requiredAmount.toFixed(2)}, have $${availableAmount.toFixed(2)}`,
			suggestion: "Reduce order size or add funds to account",
		};

		super(`Insufficient funds for order`, violation, options);
		this.requiredAmount = requiredAmount;
		this.availableAmount = availableAmount;
	}
}

/**
 * Not found error (NOT_FOUND)
 *
 * Resource not found. Do not retry.
 *
 * Examples:
 * - Instrument not found
 * - Order not found
 * - Position not found
 */
export class NotFoundError extends ExecutionError {
	/** Type of resource not found */
	readonly resourceType: string;

	/** ID of resource not found */
	readonly resourceId: string;

	constructor(
		resourceType: string,
		resourceId: string,
		options: {
			details?: ErrorDetails;
			traceId?: string;
			cause?: Error;
		} = {},
	) {
		super(`${resourceType} not found: ${resourceId}`, GrpcStatusCode.NOT_FOUND, {
			retryable: false,
			...options,
		});
		this.resourceType = resourceType;
		this.resourceId = resourceId;
	}
}

/**
 * Service unavailable error (UNAVAILABLE)
 *
 * Service is temporarily unavailable. Retry with exponential backoff.
 *
 * Examples:
 * - Broker API down
 * - Network error
 * - Service overloaded
 */
export class ServiceUnavailableError extends ExecutionError {
	/** Service that is unavailable */
	readonly serviceName: string;

	/** Suggested retry after (ms) */
	readonly retryAfterMs?: number;

	constructor(
		serviceName: string,
		message?: string,
		options: {
			retryAfterMs?: number;
			details?: ErrorDetails;
			traceId?: string;
			cause?: Error;
		} = {},
	) {
		super(message ?? `Service unavailable: ${serviceName}`, GrpcStatusCode.UNAVAILABLE, {
			retryable: true,
			...options,
		});
		this.serviceName = serviceName;
		this.retryAfterMs = options.retryAfterMs;
	}
}

/**
 * Deadline exceeded error (DEADLINE_EXCEEDED)
 *
 * Request timeout. Retry with longer timeout.
 *
 * Examples:
 * - Broker API slow
 * - Network latency
 */
export class DeadlineExceededError extends ExecutionError {
	/** Timeout that was exceeded (ms) */
	readonly timeoutMs: number;

	constructor(
		timeoutMs: number,
		operation?: string,
		options: {
			details?: ErrorDetails;
			traceId?: string;
			cause?: Error;
		} = {},
	) {
		const message = operation
			? `Operation '${operation}' exceeded ${timeoutMs}ms timeout`
			: `Request exceeded ${timeoutMs}ms timeout`;

		super(message, GrpcStatusCode.DEADLINE_EXCEEDED, {
			retryable: true,
			...options,
		});
		this.timeoutMs = timeoutMs;
	}
}

/**
 * Permission denied error (PERMISSION_DENIED)
 *
 * Not authorized to perform action. Do not retry.
 *
 * Examples:
 * - Invalid API key
 * - Account not approved for options
 */
export class PermissionDeniedError extends ExecutionError {
	/** Permission/action that was denied */
	readonly permission: string;

	constructor(
		permission: string,
		message?: string,
		options: {
			details?: ErrorDetails;
			traceId?: string;
			cause?: Error;
		} = {},
	) {
		super(message ?? `Permission denied: ${permission}`, GrpcStatusCode.PERMISSION_DENIED, {
			retryable: false,
			...options,
		});
		this.permission = permission;
	}
}

/**
 * Resource exhausted error (RESOURCE_EXHAUSTED)
 *
 * Rate limit or quota exceeded. Retry with backoff.
 *
 * Examples:
 * - API rate limit exceeded
 * - Too many requests
 */
export class ResourceExhaustedError extends ExecutionError {
	/** Resource that was exhausted */
	readonly resource: string;

	/** Suggested retry after (ms) */
	readonly retryAfterMs?: number;

	constructor(
		resource: string,
		options: {
			retryAfterMs?: number;
			details?: ErrorDetails;
			traceId?: string;
			cause?: Error;
		} = {},
	) {
		super(`Resource exhausted: ${resource}`, GrpcStatusCode.RESOURCE_EXHAUSTED, {
			retryable: true,
			...options,
		});
		this.resource = resource;
		this.retryAfterMs = options.retryAfterMs;
	}
}

/**
 * Internal error (INTERNAL)
 *
 * Unexpected server error. Generally do not retry.
 *
 * Examples:
 * - Server bug
 * - Unexpected exception
 */
export class InternalError extends ExecutionError {
	constructor(
		message: string,
		options: {
			details?: ErrorDetails;
			traceId?: string;
			cause?: Error;
		} = {},
	) {
		super(message, GrpcStatusCode.INTERNAL, {
			retryable: false,
			...options,
		});
	}
}

// ============================================
// Error Mapping
// ============================================

/**
 * gRPC error info from Connect-ES or similar
 */
export interface GrpcError {
	code: number;
	message: string;
	details?: unknown;
	metadata?: Record<string, string>;
}

/**
 * Map gRPC error to typed ExecutionError
 *
 * @param error - gRPC error from Connect-ES or similar
 * @returns Typed ExecutionError subclass
 */
export function mapGrpcError(error: GrpcError): ExecutionError {
	const code = error.code as GrpcStatusCode;
	const traceId = error.metadata?.["x-trace-id"];
	let details: ErrorDetails | undefined;

	// Try to parse error details from metadata
	if (error.metadata?.["error-details"]) {
		try {
			details = JSON.parse(error.metadata["error-details"]) as ErrorDetails;
		} catch {
			// Ignore parse errors
		}
	}

	switch (code) {
		case GrpcStatusCode.INVALID_ARGUMENT:
			return new InvalidArgumentError(error.message, { details, traceId });

		case GrpcStatusCode.FAILED_PRECONDITION:
			// Check if it's a constraint violation with details
			if (details?.constraintViolation) {
				return new ConstraintViolationError(error.message, details.constraintViolation, {
					details,
					traceId,
				});
			}
			// Generic constraint violation
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

// ============================================
// Retry Logic Helpers
// ============================================

/**
 * Default retry configuration
 */
export interface RetryOptions {
	/** Maximum number of retries */
	maxRetries: number;
	/** Initial delay in ms */
	initialDelayMs: number;
	/** Maximum delay in ms */
	maxDelayMs: number;
	/** Backoff multiplier */
	backoffMultiplier: number;
	/** Jitter factor (0-1) */
	jitterFactor: number;
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
	maxRetries: 3,
	initialDelayMs: 100,
	maxDelayMs: 10000,
	backoffMultiplier: 2,
	jitterFactor: 0.1,
};

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
	if (error instanceof ExecutionError) {
		return error.retryable;
	}

	// Network errors are retryable
	if (error instanceof Error) {
		const networkErrors = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "fetch failed"];
		return networkErrors.some((ne) => error.message.includes(ne));
	}

	return false;
}

/**
 * Calculate retry delay with exponential backoff and jitter
 *
 * @param attempt - Current attempt number (0-based)
 * @param options - Retry options
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay(
	attempt: number,
	options: RetryOptions = DEFAULT_RETRY_OPTIONS,
): number {
	// Exponential backoff
	const exponentialDelay = options.initialDelayMs * options.backoffMultiplier ** attempt;

	// Cap at max delay
	const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);

	// Add jitter
	const jitter = cappedDelay * options.jitterFactor * (Math.random() * 2 - 1);

	return Math.max(0, cappedDelay + jitter);
}

/**
 * Execute function with retry logic
 *
 * @param fn - Async function to execute
 * @param options - Retry options
 * @returns Result of function
 * @throws Last error if all retries exhausted
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	options: Partial<RetryOptions> = {},
): Promise<T> {
	const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Check if retryable
			if (!isRetryableError(error) || attempt === opts.maxRetries) {
				throw error;
			}

			// Wait before retry
			const delay = calculateRetryDelay(attempt, opts);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError;
}

// ============================================
// Type Guards
// ============================================

/**
 * Check if error is an ExecutionError
 */
export function isExecutionError(error: unknown): error is ExecutionError {
	return error instanceof ExecutionError;
}

/**
 * Check if error is a constraint violation
 */
export function isConstraintViolation(error: unknown): error is ConstraintViolationError {
	return error instanceof ConstraintViolationError;
}

/**
 * Check if error is an insufficient funds error
 */
export function isInsufficientFunds(error: unknown): error is InsufficientFundsError {
	return error instanceof InsufficientFundsError;
}
