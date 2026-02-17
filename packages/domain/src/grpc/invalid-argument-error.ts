import { ExecutionError } from "./execution-error.js";
import { type ErrorDetails, GrpcStatusCode } from "./execution-error-types.js";

interface InvalidArgumentErrorOptions {
	field?: string;
	invalidValue?: unknown;
	details?: ErrorDetails;
	traceId?: string;
	cause?: Error;
}

/**
 * Invalid argument error (INVALID_ARGUMENT).
 */
export class InvalidArgumentError extends ExecutionError {
	/** Field that was invalid */
	readonly field?: string;

	/** Value that was invalid */
	readonly invalidValue?: unknown;

	constructor(message: string, options: InvalidArgumentErrorOptions = {}) {
		super(message, GrpcStatusCode.INVALID_ARGUMENT, {
			retryable: false,
			...options,
		});
		this.field = options.field;
		this.invalidValue = options.invalidValue;
	}
}
