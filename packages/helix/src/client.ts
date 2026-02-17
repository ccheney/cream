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
		public override readonly cause?: Error,
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

type HelixQueryParams = Record<string, unknown> | undefined;

interface HelixQueryExecutor {
	query(name: string, params?: Record<string, unknown>): Promise<unknown>;
}

interface ClientRuntime {
	connected: boolean;
	helixInstance: HelixQueryExecutor | null;
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
	const mergedConfig = mergeClientConfig(config);
	const runtime = createRuntime();
	const getClient = createLazyClientGetter(runtime, mergedConfig);
	const executeWithRetry = createRetryingQueryExecutor(getClient, mergedConfig);
	return createClientFacade(runtime, mergedConfig, getClient, executeWithRetry);
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
	const port = Number.parseInt(Bun.env.HELIX_PORT ?? String(DEFAULT_CONFIG.port), 10);
	const timeout = Number.parseInt(Bun.env.HELIX_TIMEOUT ?? String(DEFAULT_CONFIG.timeout), 10);
	const maxRetries = Number.parseInt(
		Bun.env.HELIX_MAX_RETRIES ?? String(DEFAULT_CONFIG.maxRetries),
		10,
	);

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

const sleep = Bun.sleep;

function mergeClientConfig(config: HelixClientConfig): Required<HelixClientConfig> {
	return {
		...DEFAULT_CONFIG,
		...config,
	};
}

function createRuntime(): ClientRuntime {
	return {
		connected: false,
		helixInstance: null,
	};
}

function createLazyClientGetter(
	runtime: ClientRuntime,
	config: Required<HelixClientConfig>,
): () => Promise<HelixQueryExecutor> {
	return async (): Promise<HelixQueryExecutor> => {
		if (runtime.helixInstance) {
			return runtime.helixInstance;
		}

		runtime.helixInstance = await initializeHelixClient(config);
		runtime.connected = true;
		return runtime.helixInstance;
	};
}

async function initializeHelixClient(
	config: Required<HelixClientConfig>,
): Promise<HelixQueryExecutor> {
	try {
		const { HelixDB } = await import("helix-ts");
		const url = buildConnectionUrl(config);
		return new HelixDB(url) as HelixQueryExecutor;
	} catch (error) {
		throw createConnectionError(config, error);
	}
}

function buildConnectionUrl(config: Required<HelixClientConfig>): string {
	return `http://${config.host}:${config.port}`;
}

function createConnectionError(config: Required<HelixClientConfig>, error: unknown): HelixError {
	return new HelixError(
		`Failed to connect to HelixDB at ${config.host}:${config.port}`,
		"CONNECTION_FAILED",
		error instanceof Error ? error : undefined,
	);
}

function createRetryingQueryExecutor(
	getClient: () => Promise<HelixQueryExecutor>,
	config: Required<HelixClientConfig>,
): <T>(queryName: string, params: HelixQueryParams) => Promise<QueryResult<T>> {
	return async <T>(queryName: string, params: HelixQueryParams): Promise<QueryResult<T>> => {
		let attempt = 1;
		while (true) {
			try {
				return await executeQuery<T>(getClient, queryName, params, config.timeout);
			} catch (error) {
				if (attempt < config.maxRetries && isRetryable(error)) {
					const delay = config.retryDelay * 2 ** (attempt - 1);
					await sleep(delay);
					attempt += 1;
					continue;
				}
				throw normalizeQueryError(queryName, error);
			}
		}
	};
}

async function executeQuery<T>(
	getClient: () => Promise<HelixQueryExecutor>,
	queryName: string,
	params: HelixQueryParams,
	timeoutMs: number,
): Promise<QueryResult<T>> {
	const startTime = performance.now();
	const client = await getClient();
	const data = (await Promise.race([
		client.query(queryName, params),
		createTimeoutPromise(timeoutMs),
	])) as T;
	return { data, executionTimeMs: performance.now() - startTime };
}

function createTimeoutPromise(timeoutMs: number): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => {
			reject(new HelixError("Query timed out", "TIMEOUT"));
		}, timeoutMs);
	});
}

function normalizeQueryError(queryName: string, error: unknown): HelixError {
	if (error instanceof HelixError) {
		return error;
	}

	return new HelixError(
		`Query "${queryName}" failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		"QUERY_FAILED",
		error instanceof Error ? error : undefined,
	);
}

function createClientFacade(
	runtime: ClientRuntime,
	config: Required<HelixClientConfig>,
	getClient: () => Promise<HelixQueryExecutor>,
	executeWithRetry: <T>(queryName: string, params: HelixQueryParams) => Promise<QueryResult<T>>,
): HelixClient {
	return {
		query<T = unknown>(
			queryName: string,
			params?: Record<string, unknown>,
		): Promise<QueryResult<T>> {
			return executeWithRetry<T>(queryName, params);
		},
		isConnected(): boolean {
			return runtime.connected;
		},
		healthCheck(): Promise<HealthCheckResult> {
			return performHealthCheck(getClient);
		},
		close(): void {
			runtime.connected = false;
			runtime.helixInstance = null;
		},
		getConfig(): Required<HelixClientConfig> {
			return { ...config };
		},
	};
}

async function performHealthCheck(
	getClient: () => Promise<HelixQueryExecutor>,
): Promise<HealthCheckResult> {
	const startTime = performance.now();
	try {
		await getClient();
		return {
			healthy: true,
			latencyMs: performance.now() - startTime,
		};
	} catch (error) {
		return {
			healthy: false,
			latencyMs: performance.now() - startTime,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}
