import { ExecutionError } from "./execution-error.js";
import { type ErrorDetails, GrpcStatusCode } from "./execution-error-types.js";

interface InternalErrorOptions {
	details?: ErrorDetails;
	traceId?: string;
	cause?: Error;
}

/**
 * Internal error (INTERNAL).
 */
export class InternalError extends ExecutionError {
	constructor(message: string, options: InternalErrorOptions = {}) {
		super(message, GrpcStatusCode.INTERNAL, {
			retryable: false,
			...options,
		});
	}
}
