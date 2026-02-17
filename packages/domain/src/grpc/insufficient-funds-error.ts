import { ConstraintViolationError } from "./constraint-violation-error.js";
import type { ConstraintViolationDetails, ErrorDetails } from "./execution-error-types.js";

interface InsufficientFundsErrorOptions {
	details?: ErrorDetails;
	traceId?: string;
	cause?: Error;
}

/**
 * Insufficient funds error (FAILED_PRECONDITION subtype).
 */
export class InsufficientFundsError extends ConstraintViolationError {
	/** Required amount */
	readonly requiredAmount: number;

	/** Available amount */
	readonly availableAmount: number;

	constructor(
		requiredAmount: number,
		availableAmount: number,
		options: InsufficientFundsErrorOptions = {},
	) {
		const violation: ConstraintViolationDetails = {
			constraintName: "BUYING_POWER",
			currentValue: availableAmount,
			requiredValue: requiredAmount,
			message: `Insufficient funds: need $${requiredAmount.toFixed(2)}, have $${availableAmount.toFixed(2)}`,
			suggestion: "Reduce order size or add funds to account",
		};

		super("Insufficient funds for order", violation, options);
		this.requiredAmount = requiredAmount;
		this.availableAmount = availableAmount;
	}
}
