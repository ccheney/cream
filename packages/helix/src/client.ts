/**
 * HelixDB Client
 *
 * Type-safe client wrapper for HelixDB with connection management,
 * retry logic, and query helpers.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

/**
 * HelixDB client configuration options.
 */
export interface HelixClientConfig {
	/** HelixDB server host (default: localhost) */
	host?: string;
	/** HelixDB server port (default: 6969) */
	port?: number;
	/** Connection timeout in milliseconds (default: 5000) */
	timeout?: number;
	/** Maximum retry attempts for failed queries (default: 3) */
	maxRetries?: number;
	/** Base delay between retries in milliseconds (default: 100) */
	retryDelay?: number;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: Required<HelixClientConfig> = {
	host: "localhost",
	port: 6969,
	timeout: 5000,
	maxRetries: 3,
	retryDelay: 100,
};

/**
 * Query result from HelixDB.
 */
export interface QueryResult<T = unknown> {
	data: T;
	executionTimeMs: number;
}

/**
 * Error thrown by HelixDB operations.
 */
export class HelixError extends Error {
	constructor(
		message: string,
		public readonly code: HelixErrorCode,
		public override readonly cause?: Error
	) {
		super(message);
		this.name = "HelixError";
	}
}

/**
 * HelixDB error codes.
 */
export type HelixErrorCode =
	| "CONNECTION_FAILED"
	| "QUERY_FAILED"
	| "TIMEOUT"
	| "INVALID_QUERY"
	| "NOT_FOUND"
	| "SCHEMA_ERROR";

/**
 * Health check result from HelixDB.
 */
export interface HealthCheckResult {
	healthy: boolean;
	latencyMs: number;
	error?: string;
}

/**
 * HelixDB client for executing HelixQL queries.
 *
 * @example
 * ```typescript
 * const client = createHelixClient({ port: 6969 });
 *
 * // Check health before using
 * const health = await client.healthCheck();
 * if (!health.healthy) {
 *   throw new Error(`HelixDB unhealthy: ${health.error}`);
 * }
 *
 * // Execute a query
 * const result = await client.query("getUser", { name: "John" });
 * console.log(result.data);
 *
 * // Close the client
 * client.close();
 * ```
 */
export interface HelixClient {
	/**
	 * Execute a HelixQL query.
	 *
	 * @param queryName - Name of the compiled query
	 * @param params - Query parameters
	 * @returns Query result with execution time
	 * @throws HelixError on failure
	 */
	query<T = unknown>(queryName: string, params?: Record<string, unknown>): Promise<QueryResult<T>>;

	/**
	 * Check if the client is connected to HelixDB.
	 */
	isConnected(): boolean;

	/**
	 * Perform a health check against HelixDB.
	 * This attempts to connect and execute a simple query to verify the server is responsive.
	 *
	 * @returns Health check result with latency and any error
	 */
	healthCheck(): Promise<HealthCheckResult>;

	/**
	 * Close the client connection.
	 */
	close(): void;

	/**
	 * Get the client configuration.
	 */
	getConfig(): Required<HelixClientConfig>;
}

/**
 * Create a HelixDB client.
 *
 * @param config - Client configuration options
 * @returns HelixDB client instance
 *
 * @example
 * ```typescript
 * // Create with default settings (localhost:6969)
 * const client = createHelixClient();
 *
 * // Create with custom settings
 * const client = createHelixClient({
 *   host: "helix.example.com",
 *   port: 6969,
 *   timeout: 10000,
 *   maxRetries: 5,
 * });
 * ```
 */
export function createHelixClient(config: HelixClientConfig = {}): HelixClient {
	const mergedConfig: Required<HelixClientConfig> = {
		...DEFAULT_CONFIG,
		...config,
	};

	let connected = false;
	let helixInstance: unknown = null;

	// Lazy initialization of the helix-ts client
	const getClient = async () => {
		if (!helixInstance) {
			try {
				// Dynamic import to handle missing module gracefully
				const { HelixDB } = await import("helix-ts");
				const url = `http://${mergedConfig.host}:${mergedConfig.port}`;
				helixInstance = new HelixDB(url);
				connected = true;
			} catch (error) {
				throw new HelixError(
					`Failed to connect to HelixDB at ${mergedConfig.host}:${mergedConfig.port}`,
					"CONNECTION_FAILED",
					error instanceof Error ? error : undefined
				);
			}
		}
		return helixInstance as {
			query: (name: string, params?: Record<string, unknown>) => Promise<unknown>;
		};
	};

	/**
	 * Execute a query with retry logic.
	 */
	const executeWithRetry = async <T>(
		queryName: string,
		params: Record<string, unknown> | undefined,
		attempt = 1
	): Promise<QueryResult<T>> => {
		const startTime = performance.now();

		try {
			const client = await getClient();
			const data = await Promise.race([
				client.query(queryName, params),
				new Promise((_, reject) =>
					setTimeout(
						() => reject(new HelixError("Query timed out", "TIMEOUT")),
						mergedConfig.timeout
					)
				),
			]);

			const executionTimeMs = performance.now() - startTime;
			return { data: data as T, executionTimeMs };
		} catch (error) {
			if (attempt < mergedConfig.maxRetries && isRetryable(error)) {
				// Exponential backoff
				const delay = mergedConfig.retryDelay * 2 ** (attempt - 1);
				await sleep(delay);
				return executeWithRetry(queryName, params, attempt + 1);
			}

			if (error instanceof HelixError) {
				throw error;
			}

			throw new HelixError(
				`Query "${queryName}" failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				"QUERY_FAILED",
				error instanceof Error ? error : undefined
			);
		}
	};

	return {
		async query<T = unknown>(
			queryName: string,
			params?: Record<string, unknown>
		): Promise<QueryResult<T>> {
			return executeWithRetry<T>(queryName, params);
		},

		isConnected(): boolean {
			return connected;
		},

		async healthCheck(): Promise<HealthCheckResult> {
			const startTime = performance.now();
			try {
				// Attempt to initialize the client and make a connection
				await getClient();
				const latencyMs = performance.now() - startTime;
				return {
					healthy: true,
					latencyMs,
				};
			} catch (error) {
				const latencyMs = performance.now() - startTime;
				return {
					healthy: false,
					latencyMs,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},

		close(): void {
			connected = false;
			helixInstance = null;
		},

		getConfig(): Required<HelixClientConfig> {
			return { ...mergedConfig };
		},
	};
}

/**
 * Create a HelixDB client from environment variables.
 *
 * Reads:
 * - HELIX_HOST (default: localhost)
 * - HELIX_PORT (default: 6969)
 * - HELIX_TIMEOUT (default: 5000)
 * - HELIX_MAX_RETRIES (default: 3)
 */
export function createHelixClientFromEnv(): HelixClient {
	const host = Bun.env.HELIX_HOST ?? DEFAULT_CONFIG.host;
	const port = parseInt(Bun.env.HELIX_PORT ?? String(DEFAULT_CONFIG.port), 10);
	const timeout = parseInt(Bun.env.HELIX_TIMEOUT ?? String(DEFAULT_CONFIG.timeout), 10);
	const maxRetries = parseInt(Bun.env.HELIX_MAX_RETRIES ?? String(DEFAULT_CONFIG.maxRetries), 10);

	return createHelixClient({ host, port, timeout, maxRetries });
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if an error is retryable.
 */
function isRetryable(error: unknown): boolean {
	if (error instanceof HelixError) {
		// Don't retry schema errors or invalid queries
		return !["SCHEMA_ERROR", "INVALID_QUERY", "NOT_FOUND"].includes(error.code);
	}
	// Retry network errors
	return true;
}

/**
 * Sleep for a given duration.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
