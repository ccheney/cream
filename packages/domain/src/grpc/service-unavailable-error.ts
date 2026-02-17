import { ExecutionError } from "./execution-error.js";
import { type ErrorDetails, GrpcStatusCode } from "./execution-error-types.js";

interface ServiceUnavailableErrorOptions {
	retryAfterMs?: number;
	details?: ErrorDetails;
	traceId?: string;
	cause?: Error;
}

/**
 * Service unavailable error (UNAVAILABLE).
 */
export class ServiceUnavailableError extends ExecutionError {
	/** Service that is unavailable */
	readonly serviceName: string;

	/** Suggested retry after (ms) */
	readonly retryAfterMs?: number;

	constructor(serviceName: string, message?: string, options: ServiceUnavailableErrorOptions = {}) {
		super(message ?? `Service unavailable: ${serviceName}`, GrpcStatusCode.UNAVAILABLE, {
			retryable: true,
			...options,
		});
		this.serviceName = serviceName;
		this.retryAfterMs = options.retryAfterMs;
	}
}
