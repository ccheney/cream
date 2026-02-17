import { ExecutionError } from "./execution-error.js";
import { type ErrorDetails, GrpcStatusCode } from "./execution-error-types.js";

interface NotFoundErrorOptions {
	details?: ErrorDetails;
	traceId?: string;
	cause?: Error;
}

/**
 * Not found error (NOT_FOUND).
 */
export class NotFoundError extends ExecutionError {
	/** Type of resource not found */
	readonly resourceType: string;

	/** ID of resource not found */
	readonly resourceId: string;

	constructor(resourceType: string, resourceId: string, options: NotFoundErrorOptions = {}) {
		super(`${resourceType} not found: ${resourceId}`, GrpcStatusCode.NOT_FOUND, {
			retryable: false,
			...options,
		});
		this.resourceType = resourceType;
		this.resourceId = resourceId;
	}
}
