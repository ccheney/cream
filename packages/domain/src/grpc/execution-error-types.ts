/**
 * Shared types for execution error mapping.
 */

/**
 * Standard gRPC status codes.
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
 * Error code to name mapping.
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

/**
 * Constraint violation details.
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
 * Error details structure (serialized in gRPC metadata).
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

/**
 * gRPC error info from Connect-ES or similar.
 */
export interface GrpcError {
	code: number;
	message: string;
	details?: unknown;
	metadata?: Record<string, string>;
}

/**
 * Default retry configuration.
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
 * Default retry options.
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
	maxRetries: 3,
	initialDelayMs: 100,
	maxDelayMs: 10000,
	backoffMultiplier: 2,
	jitterFactor: 0.1,
};
