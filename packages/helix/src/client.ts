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
	/** Consecutive failures before circuit opens (default: 3) */
	circuitBreakerThreshold?: number;
	/** How long the circuit stays open in milliseconds (default: 30000) */
	circuitBreakerResetMs?: number;
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
	circuitBreakerThreshold: 3,
	circuitBreakerResetMs: 30_000,
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
	| "CIRCUIT_OPEN"
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

type CircuitState = "closed" | "open" | "half-open";

/** @internal Exported for testing only. */
export interface CircuitBreakerRuntime {
	state: CircuitState;
	consecutiveFailures: number;
	lastFailureTime: number;
}

/** @internal Create a fresh circuit breaker state for testing. */
export function createCircuitBreakerRuntime(): CircuitBreakerRuntime {
	return { state: "closed", consecutiveFailures: 0, lastFailureTime: 0 };
}

interface ClientRuntime {
	connected: boolean;
	helixInstance: HelixQueryExecutor | null;
	circuit: CircuitBreakerRuntime;
}

interface HelixServerErrorPayload {
	error: string;
	code?: string;
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
	const executeWithRetry = createRetryingQueryExecutor(getClient, mergedConfig, runtime.circuit);
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
	const helixUrl = Bun.env.HELIX_URL;
	let host: string;
	let port: number;
	if (helixUrl) {
		const parsedUrl = new URL(helixUrl);
		host = parsedUrl.hostname;
		port = Number.parseInt(parsedUrl.port || String(DEFAULT_CONFIG.port), 10);
	} else {
		const envHost = Bun.env.HELIX_HOST;
		const envPort = Bun.env.HELIX_PORT;
		if (!envHost || !envPort) {
			throw new Error("HELIX_URL or HELIX_HOST and HELIX_PORT environment variables are required");
		}
		host = envHost;
		port = Number.parseInt(envPort, 10);
	}

	if (Number.isNaN(port) || port <= 0) {
		throw new Error(`Invalid Helix port '${String(port)}'.`);
	}

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
 * @internal Exported for testing only.
 */
export function isRetryable(error: unknown): boolean {
	if (error instanceof HelixError) {
		if (
			["SCHEMA_ERROR", "INVALID_QUERY", "NOT_FOUND", "CONNECTION_FAILED", "CIRCUIT_OPEN"].includes(
				error.code,
			)
		) {
			return false;
		}
		// ConnectionRefused means the service isn't running — retrying is pointless
		if (error.cause && isConnectionRefused(error.cause)) {
			return false;
		}
	}
	if (isConnectionRefused(error)) {
		return false;
	}
	return true;
}

/** @internal Exported for testing only. */
export function isConnectionRefused(error: unknown): boolean {
	if (error instanceof Error) {
		if ("code" in error && error.code === "ConnectionRefused") return true;
		if (error.message.includes("ConnectionRefused")) return true;
		if (error.message.includes("Unable to connect")) return true;
	}
	return false;
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
		circuit: { state: "closed", consecutiveFailures: 0, lastFailureTime: 0 },
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
	circuit: CircuitBreakerRuntime,
): <T>(queryName: string, params: HelixQueryParams) => Promise<QueryResult<T>> {
	return async <T>(queryName: string, params: HelixQueryParams): Promise<QueryResult<T>> => {
		checkCircuit(circuit, config);

		let attempt = 1;
		while (true) {
			try {
				const result = await executeQuery<T>(getClient, queryName, params, config.timeout);
				onCircuitSuccess(circuit);
				return result;
			} catch (error) {
				if (attempt < config.maxRetries && isRetryable(error)) {
					const delay = config.retryDelay * 2 ** (attempt - 1);
					await sleep(delay);
					attempt += 1;
					continue;
				}
				onCircuitFailure(circuit, config);
				throw normalizeQueryError(queryName, error);
			}
		}
	};
}

/** @internal Exported for testing only. */
export function checkCircuit(
	circuit: CircuitBreakerRuntime,
	config: Required<HelixClientConfig>,
): void {
	if (circuit.state === "closed") return;

	const elapsed = Date.now() - circuit.lastFailureTime;
	if (elapsed >= config.circuitBreakerResetMs) {
		circuit.state = "half-open";
		return;
	}

	throw new HelixError(
		`Circuit breaker open — HelixDB unavailable (${circuit.consecutiveFailures} consecutive failures, resets in ${config.circuitBreakerResetMs - elapsed}ms)`,
		"CIRCUIT_OPEN",
	);
}

/** @internal Exported for testing only. */
export function onCircuitSuccess(circuit: CircuitBreakerRuntime): void {
	circuit.state = "closed";
	circuit.consecutiveFailures = 0;
}

/** @internal Exported for testing only. */
export function onCircuitFailure(
	circuit: CircuitBreakerRuntime,
	config: Required<HelixClientConfig>,
): void {
	circuit.consecutiveFailures += 1;
	circuit.lastFailureTime = Date.now();
	if (circuit.consecutiveFailures >= config.circuitBreakerThreshold) {
		circuit.state = "open";
	}
}

async function executeQuery<T>(
	getClient: () => Promise<HelixQueryExecutor>,
	queryName: string,
	params: HelixQueryParams,
	timeoutMs: number,
): Promise<QueryResult<T>> {
	const startTime = performance.now();
	const client = await getClient();
	const rawData = (await Promise.race([
		client.query(queryName, params),
		createTimeoutPromise(timeoutMs),
	])) as unknown;

	if (isHelixServerErrorPayload(rawData)) {
		throw new HelixError(
			`Query "${queryName}" failed: ${rawData.error}`,
			mapServerErrorCode(rawData),
		);
	}

	const data = unwrapHelixResponse<T>(rawData);
	return { data, executionTimeMs: performance.now() - startTime };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isHelixServerErrorPayload(value: unknown): value is HelixServerErrorPayload {
	return (
		isObjectRecord(value) &&
		typeof value.error === "string" &&
		(value.code === undefined || typeof value.code === "string")
	);
}

function mapServerErrorCode(payload: HelixServerErrorPayload): HelixErrorCode {
	const code = payload.code?.toUpperCase();
	if (code === "NOT_FOUND") {
		return "NOT_FOUND";
	}
	if (code === "SCHEMA_ERROR") {
		return "SCHEMA_ERROR";
	}
	if (code === "INVALID_QUERY" || code === "GRAPH_ERROR" || code === "DECODE_ERROR") {
		return "INVALID_QUERY";
	}
	if (code === "TIMEOUT") {
		return "TIMEOUT";
	}

	const lowerMessage = payload.error.toLowerCase();
	if (lowerMessage.includes("not found") || lowerMessage.includes("notfound")) {
		return "NOT_FOUND";
	}
	if (lowerMessage.includes("schema")) {
		return "SCHEMA_ERROR";
	}
	if (lowerMessage.includes("invalid") || lowerMessage.includes("decode")) {
		return "INVALID_QUERY";
	}

	return "QUERY_FAILED";
}

function unwrapHelixResponse<T>(value: unknown): T {
	if (!isObjectRecord(value)) {
		return value as T;
	}

	const keys = Object.keys(value);
	if (keys.length !== 1) {
		return value as T;
	}

	const singleKey = keys[0];
	if (!singleKey) {
		return value as T;
	}

	return value[singleKey] as T;
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
