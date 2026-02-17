/**
 * Error types for Alpaca calendar client.
 */

export type CalendarErrorCode =
	| "INVALID_CREDENTIALS"
	| "RATE_LIMITED"
	| "NETWORK_ERROR"
	| "VALIDATION_ERROR"
	| "UNKNOWN";

export class CalendarClientError extends Error {
	constructor(
		message: string,
		public readonly code: CalendarErrorCode,
		public override readonly cause?: Error,
	) {
		super(message);
		this.name = "CalendarClientError";
	}
}
