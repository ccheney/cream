import { ExecutionError } from "./execution-error.js";
import { type ErrorDetails, GrpcStatusCode } from "./execution-error-types.js";

interface DeadlineExceededErrorOptions {
	details?: ErrorDetails;
	traceId?: string;
	cause?: Error;
}

/**
 * Deadline exceeded error (DEADLINE_EXCEEDED).
 */
export class DeadlineExceededError extends ExecutionError {
	/** Timeout that was exceeded (ms) */
	readonly timeoutMs: number;

	constructor(timeoutMs: number, operation?: string, options: DeadlineExceededErrorOptions = {}) {
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
