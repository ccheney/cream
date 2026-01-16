/**
 * Database Context
 *
 * Provides database client and repositories for API trading workflows.
 * Also includes HelixDB client management for CBR memory storage.
 */

import { setPredictionMarketsRepoProvider } from "@cream/agents";
import {
	createRuntimeConfigService,
	type RuntimeConfigService,
	type RuntimeEnvironment,
} from "@cream/config";
import { createContext, type ExecutionContext, isBacktest, requireEnv } from "@cream/domain";
import { createHelixClientFromEnv, type HealthCheckResult, type HelixClient } from "@cream/helix";
import {
	AgentConfigsRepository,
	createInMemoryClient,
	createTursoClient,
	DecisionsRepository,
	ExternalEventsRepository,
	FactorZooRepository,
	IndicatorsRepository,
	MacroWatchRepository,
	OrdersRepository,
	PositionsRepository,
	PredictionMarketsRepository,
	RegimeLabelsRepository,
	runMigrations,
	ThesisStateRepository,
	TradingConfigRepository,
	type TursoClient,
	UniverseConfigsRepository,
} from "@cream/storage";

import { log } from "./logger.js";

/**
 * Create ExecutionContext for database initialization.
 * DB client is created at API startup.
 */
function createDbContext(): ExecutionContext {
	return createContext(requireEnv(), "scheduled");
}

// ============================================
// Database Client Singleton
// ============================================

let dbClient: TursoClient | null = null;
let initPromise: Promise<TursoClient> | null = null;

/**
 * Get or create the database client.
 * Uses a lock to prevent race conditions during initialization.
 */
export async function getDbClient(): Promise<TursoClient> {
	// Fast path: already initialized
	if (dbClient) {
		return dbClient;
	}

	// Initialization in progress: wait for it
	if (initPromise) {
		return initPromise;
	}

	// First caller: start initialization
	initPromise = initializeDb();

	try {
		dbClient = await initPromise;
		return dbClient;
	} catch (error) {
		// Reset on failure so next call can retry
		initPromise = null;
		throw error;
	}
}

/**
 * Initialize database client and run migrations.
 */
async function initializeDb(): Promise<TursoClient> {
	const ctx = createDbContext();
	let client: TursoClient;

	if (Bun.env.NODE_ENV === "test") {
		// In-memory for testing
		client = await createInMemoryClient();
	} else {
		// createTursoClient reads TURSO_DATABASE_URL and handles HTTP/local automatically
		client = await createTursoClient(ctx);
	}

	// Run migrations on first connection
	const result = await runMigrations(client, {
		logger: (msg) => log.debug({ migration: msg }, "DB migration"),
	});
	if (result.applied.length > 0) {
		log.info({ count: result.applied.length }, "Applied DB migrations");
	}

	return client;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
	if (dbClient) {
		dbClient.close();
		dbClient = null;
	}
	initPromise = null;
}

// ============================================
// Tool Provider Registration
// ============================================

let toolProvidersRegistered = false;

/**
 * Register tool providers for Mastra tools that need database access.
 * This should be called early in application startup.
 */
export function registerToolProviders(): void {
	if (toolProvidersRegistered) {
		return;
	}

	// Register prediction markets repo provider for agent tools
	setPredictionMarketsRepoProvider(getPredictionMarketsRepo);

	toolProvidersRegistered = true;
}

// Auto-register on module load
registerToolProviders();

// ============================================
// Repository Factories
// ============================================

/**
 * Get positions repository
 */
export async function getPositionsRepo(): Promise<PositionsRepository> {
	const client = await getDbClient();
	return new PositionsRepository(client);
}

/**
 * Get orders repository
 */
export async function getOrdersRepo(): Promise<OrdersRepository> {
	const client = await getDbClient();
	return new OrdersRepository(client);
}

/**
 * Get thesis state repository
 */
export async function getThesisStateRepo(): Promise<ThesisStateRepository> {
	const client = await getDbClient();
	return new ThesisStateRepository(client);
}

/**
 * Get external events repository
 */
export async function getExternalEventsRepo(): Promise<ExternalEventsRepository> {
	const client = await getDbClient();
	return new ExternalEventsRepository(client);
}

/**
 * Get prediction markets repository
 */
export async function getPredictionMarketsRepo(): Promise<PredictionMarketsRepository> {
	const client = await getDbClient();
	return new PredictionMarketsRepository(client);
}

/**
 * Get regime labels repository
 */
export async function getRegimeLabelsRepo(): Promise<RegimeLabelsRepository> {
	const client = await getDbClient();
	return new RegimeLabelsRepository(client);
}

/**
 * Get decisions repository
 */
export async function getDecisionsRepo(): Promise<DecisionsRepository> {
	const client = await getDbClient();
	return new DecisionsRepository(client);
}

/**
 * Get factor zoo repository
 */
export async function getFactorZooRepo(): Promise<FactorZooRepository> {
	const client = await getDbClient();
	return new FactorZooRepository(client);
}

/**
 * Get indicators repository
 */
export async function getIndicatorsRepo(): Promise<IndicatorsRepository> {
	const client = await getDbClient();
	return new IndicatorsRepository(client);
}

/**
 * Get macro watch repository
 */
export async function getMacroWatchRepo(): Promise<MacroWatchRepository> {
	const client = await getDbClient();
	return new MacroWatchRepository(client);
}

// ============================================
// Runtime Config Repository Factories
// ============================================

/**
 * Get trading config repository
 */
export async function getTradingConfigRepo(): Promise<TradingConfigRepository> {
	const client = await getDbClient();
	return new TradingConfigRepository(client);
}

/**
 * Get agent configs repository
 */
export async function getAgentConfigsRepo(): Promise<AgentConfigsRepository> {
	const client = await getDbClient();
	return new AgentConfigsRepository(client);
}

/**
 * Get universe configs repository
 */
export async function getUniverseConfigsRepo(): Promise<UniverseConfigsRepository> {
	const client = await getDbClient();
	return new UniverseConfigsRepository(client);
}

/**
 * Get runtime config service
 *
 * Creates a RuntimeConfigService with all required repositories.
 */
export async function getRuntimeConfigService(): Promise<RuntimeConfigService> {
	const [tradingRepo, agentRepo, universeRepo] = await Promise.all([
		getTradingConfigRepo(),
		getAgentConfigsRepo(),
		getUniverseConfigsRepo(),
	]);
	return createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);
}

/**
 * Re-export RuntimeEnvironment type for workflow use
 */
export type { RuntimeEnvironment };

// ============================================
// HelixDB Client Singleton
// ============================================

let helixClient: HelixClient | null = null;

/**
 * Get or create the HelixDB client singleton.
 * Returns null if client creation fails (e.g., missing helix-ts module).
 */
export function getHelixClient(): HelixClient | null {
	if (helixClient) {
		return helixClient;
	}

	try {
		helixClient = createHelixClientFromEnv();
		return helixClient;
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			"HelixDB failed to create client"
		);
		return null;
	}
}

/**
 * Close the HelixDB client connection.
 */
export function closeHelixClient(): void {
	if (helixClient) {
		helixClient.close();
		helixClient = null;
	}
}

/**
 * Perform a health check on HelixDB.
 *
 * @returns Health check result with latency and any error
 */
export async function checkHelixHealth(): Promise<HealthCheckResult> {
	const client = getHelixClient();
	if (!client) {
		return {
			healthy: false,
			latencyMs: 0,
			error: "HelixDB client could not be created",
		};
	}
	return client.healthCheck();
}

/**
 * HelixDB validation error - thrown when startup validation fails.
 */
export class HelixDBValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HelixDBValidationError";
	}
}

/**
 * Validate HelixDB connectivity at startup.
 *
 * This function should be called during service initialization for PAPER and LIVE environments.
 * In BACKTEST mode, validation is optional but recommended.
 *
 * @param ctx - ExecutionContext with environment information
 * @param options - Validation options
 * @throws HelixDBValidationError if validation fails in PAPER/LIVE mode
 */
export async function validateHelixDBAtStartup(
	ctx: ExecutionContext,
	options: {
		/** Whether to fail fast (throw) on health check failure. Default: true for PAPER/LIVE */
		failFast?: boolean;
		/** Maximum allowed latency in ms. Default: 5000 */
		maxLatencyMs?: number;
	} = {}
): Promise<HealthCheckResult> {
	const isBacktestEnv = isBacktest(ctx);
	const { failFast = !isBacktestEnv, maxLatencyMs = 5000 } = options;

	log.info({ environment: ctx.environment }, "HelixDB validating connection");

	const health = await checkHelixHealth();

	if (!health.healthy) {
		const errorMsg =
			`HelixDB health check failed: ${health.error}. ` +
			`Ensure HelixDB is running at ${Bun.env.HELIX_HOST ?? "localhost"}:${Bun.env.HELIX_PORT ?? "6969"}`;

		log.error(
			{
				error: health.error,
				host: Bun.env.HELIX_HOST ?? "localhost",
				port: Bun.env.HELIX_PORT ?? "6969",
			},
			"HelixDB health check failed"
		);

		if (failFast) {
			throw new HelixDBValidationError(errorMsg);
		}

		log.warn({}, "HelixDB continuing despite health check failure (failFast=false)");
	} else if (health.latencyMs > maxLatencyMs) {
		log.warn({ latencyMs: health.latencyMs, maxLatencyMs }, "HelixDB latency exceeds threshold");
	} else {
		log.info({ latencyMs: health.latencyMs }, "HelixDB health check passed");
	}

	return health;
}

/**
 * Validate HelixDB and exit if validation fails.
 *
 * Use this at the entry point of services that require HelixDB.
 *
 * @param ctx - ExecutionContext with environment information
 */
export async function validateHelixDBOrExit(ctx: ExecutionContext): Promise<void> {
	try {
		await validateHelixDBAtStartup(ctx, { failFast: !isBacktest(ctx) });
	} catch (error) {
		if (error instanceof HelixDBValidationError) {
			log.error(
				{ error: error.message, environment: ctx.environment },
				"HelixDB validation failed for API service"
			);
			process.exit(1);
		}
		throw error;
	}
}
