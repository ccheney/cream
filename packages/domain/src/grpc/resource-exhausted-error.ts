import { ExecutionError } from "./execution-error.js";
import { type ErrorDetails, GrpcStatusCode } from "./execution-error-types.js";

interface ResourceExhaustedErrorOptions {
	retryAfterMs?: number;
	details?: ErrorDetails;
	traceId?: string;
	cause?: Error;
}

/**
 * Resource exhausted error (RESOURCE_EXHAUSTED).
 */
export class ResourceExhaustedError extends ExecutionError {
	/** Resource that was exhausted */
	readonly resource: string;

	/** Suggested retry after (ms) */
	readonly retryAfterMs?: number;

	constructor(resource: string, options: ResourceExhaustedErrorOptions = {}) {
		super(`Resource exhausted: ${resource}`, GrpcStatusCode.RESOURCE_EXHAUSTED, {
			retryable: true,
			...options,
		});
		this.resource = resource;
		this.retryAfterMs = options.retryAfterMs;
	}
}
