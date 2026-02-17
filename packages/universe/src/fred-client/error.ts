/**
 * Error codes for FRED API errors.
 */
export type FREDErrorCode =
	| "RATE_LIMITED"
	| "UNAUTHORIZED"
	| "NOT_FOUND"
	| "VALIDATION_ERROR"
	| "NETWORK_ERROR"
	| "TIMEOUT"
	| "API_ERROR";

/**
 * Error thrown by FREDClient operations.
 */
export class FREDClientError extends Error {
	constructor(
		message: string,
		public readonly code: FREDErrorCode,
		public override readonly cause?: unknown,
	) {
		super(message, { cause });
		this.name = "FREDClientError";
	}
}
