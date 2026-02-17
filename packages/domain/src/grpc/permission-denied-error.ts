import { ExecutionError } from "./execution-error.js";
import { type ErrorDetails, GrpcStatusCode } from "./execution-error-types.js";

interface PermissionDeniedErrorOptions {
	details?: ErrorDetails;
	traceId?: string;
	cause?: Error;
}

/**
 * Permission denied error (PERMISSION_DENIED).
 */
export class PermissionDeniedError extends ExecutionError {
	/** Permission/action that was denied */
	readonly permission: string;

	constructor(permission: string, message?: string, options: PermissionDeniedErrorOptions = {}) {
		super(message ?? `Permission denied: ${permission}`, GrpcStatusCode.PERMISSION_DENIED, {
			retryable: false,
			...options,
		});
		this.permission = permission;
	}
}
