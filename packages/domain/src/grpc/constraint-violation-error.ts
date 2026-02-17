import { ExecutionError } from "./execution-error.js";
import {
	type ConstraintViolationDetails,
	type ErrorDetails,
	GrpcStatusCode,
} from "./execution-error-types.js";

interface ConstraintViolationErrorOptions {
	details?: ErrorDetails;
	traceId?: string;
	cause?: Error;
}

/**
 * Constraint violation error (FAILED_PRECONDITION).
 */
export class ConstraintViolationError extends ExecutionError {
	/** Detailed constraint violation info */
	readonly violation: ConstraintViolationDetails;

	constructor(
		message: string,
		violation: ConstraintViolationDetails,
		options: ConstraintViolationErrorOptions = {},
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
