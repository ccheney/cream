export type ErrorType =
	| "NETWORK_ERROR"
	| "TIMEOUT"
	| "RATE_LIMIT"
	| "AUTH_ERROR"
	| "NOT_FOUND"
	| "SERVER_ERROR"
	| "INVALID_RESPONSE";

export interface ErrorSimulationConfig {
	/** Error type to simulate */
	errorType: ErrorType;
	/** Probability of error (0-1). Default: 1.0 (always) */
	probability?: number;
	/** Delay before error (ms). Default: 0 */
	delayMs?: number;
	/** Custom error message */
	message?: string;
	/** HTTP status code for HTTP errors */
	statusCode?: number;
}

/**
 * Mock API error for testing error handling.
 */
export class MockApiError extends Error {
	constructor(
		public readonly errorType: ErrorType,
		public readonly statusCode: number,
		message: string,
	) {
		super(message);
		this.name = "MockApiError";
	}
}

const ERROR_DEFAULTS: Record<ErrorType, { statusCode: number; message: string }> = {
	NETWORK_ERROR: { statusCode: 0, message: "Network request failed" },
	TIMEOUT: { statusCode: 0, message: "Request timed out" },
	RATE_LIMIT: { statusCode: 429, message: "Rate limit exceeded" },
	AUTH_ERROR: { statusCode: 401, message: "Authentication failed" },
	NOT_FOUND: { statusCode: 404, message: "Resource not found" },
	SERVER_ERROR: { statusCode: 500, message: "Internal server error" },
	INVALID_RESPONSE: { statusCode: 0, message: "Invalid response format" },
};

/**
 * Simulate an API error based on configuration.
 */
export async function simulateError(config: ErrorSimulationConfig): Promise<void> {
	const probability = config.probability ?? 1;

	if (Math.random() > probability) {
		return;
	}

	if (config.delayMs && config.delayMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, config.delayMs));
	}

	const defaults = ERROR_DEFAULTS[config.errorType];
	throw new MockApiError(
		config.errorType,
		config.statusCode ?? defaults.statusCode,
		config.message ?? defaults.message,
	);
}
