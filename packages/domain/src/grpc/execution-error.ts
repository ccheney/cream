import {
	type ErrorDetails,
	GRPC_STATUS_NAMES,
	type GrpcStatusCode,
} from "./execution-error-types.js";

export interface ExecutionErrorOptions {
	retryable?: boolean;
	details?: ErrorDetails;
	traceId?: string;
	cause?: Error;
}

/**
 * Base class for all execution errors.
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

	constructor(message: string, grpcCode: GrpcStatusCode, options: ExecutionErrorOptions = {}) {
		super(message, { cause: options.cause });
		this.name = this.constructor.name;
		this.grpcCode = grpcCode;
		this.grpcStatus = GRPC_STATUS_NAMES[grpcCode];
		this.retryable = options.retryable ?? false;
		this.details = options.details;
		this.traceId = options.traceId ?? options.details?.traceId;

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Get formatted error message with context.
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
	 * Convert to JSON for logging.
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
