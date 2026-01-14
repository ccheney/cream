/**
 * Type definitions for API Key Rotation
 */

/**
 * Service that requires API keys.
 */
export type ApiService = "alphavantage" | "alpaca";

/**
 * API key with metadata.
 */
export interface ApiKey {
	/** The API key value */
	key: string;
	/** Optional name/label for the key */
	name?: string;
	/** Whether this key is currently active */
	active: boolean;
	/** Number of requests made with this key */
	requestCount: number;
	/** Number of errors with this key */
	errorCount: number;
	/** Last time this key was used */
	lastUsed?: Date;
	/** Last error message */
	lastError?: string;
	/** When the key was added */
	addedAt: Date;
	/** Rate limit remaining (if known) */
	rateLimitRemaining?: number;
	/** Rate limit reset time (if known) */
	rateLimitReset?: Date;
}

/**
 * Key rotation strategy.
 */
export type RotationStrategy =
	| "round-robin" // Rotate through keys sequentially
	| "least-used" // Use the key with fewest requests
	| "healthiest" // Use the key with lowest error rate
	| "rate-limit-aware"; // Use key with most remaining rate limit

/**
 * Key rotation configuration.
 */
export interface KeyRotationConfig {
	/** Rotation strategy */
	strategy: RotationStrategy;
	/** Maximum consecutive errors before marking key as unhealthy */
	maxConsecutiveErrors: number;
	/** Time to wait before retrying an unhealthy key (ms) */
	unhealthyRetryMs: number;
	/** Minimum rate limit remaining before rotation */
	minRateLimitThreshold: number;
	/** Enable automatic rotation on rate limit */
	autoRotateOnRateLimit: boolean;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: KeyRotationConfig = {
	strategy: "rate-limit-aware",
	maxConsecutiveErrors: 3,
	unhealthyRetryMs: 60000, // 1 minute
	minRateLimitThreshold: 10,
	autoRotateOnRateLimit: true,
};

/**
 * Statistics for all keys in a service.
 */
export interface KeyStats {
	service: ApiService;
	totalKeys: number;
	activeKeys: number;
	unhealthyKeys: number;
	totalRequests: number;
	totalErrors: number;
	errorRate: number;
	currentKeyIndex: number;
	keys: Array<{
		name: string;
		active: boolean;
		requestCount: number;
		errorCount: number;
		rateLimitRemaining?: number;
	}>;
}

/**
 * Logger interface for key rotation events.
 */
export interface KeyRotationLogger {
	info: (message: string, data?: Record<string, unknown>) => void;
	warn: (message: string, data?: Record<string, unknown>) => void;
	error: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * Default no-op logger.
 */
export const DEFAULT_LOGGER: KeyRotationLogger = {
	info: (_msg, _data) => {},
	warn: (_msg, _data) => {},
	error: (_msg, _data) => {},
};
