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
import { type ExecutionContext, isTest } from "@cream/domain";
import { createHelixClientFromEnv, type HealthCheckResult, type HelixClient } from "@cream/helix";
import {
	AgentConfigsRepository,
	closeDb as closeDbConnection,
	type Database,
	DecisionsRepository,
	ExternalEventsRepository,
	FactorZooRepository,
	getDb,
	IndicatorsRepository,
	MacroWatchRepository,
	OrdersRepository,
	PositionsRepository,
	PredictionMarketsRepository,
	RegimeLabelsRepository,
	type StoragePredictionMarketType,
	type StoragePredictionPlatform,
	ThesisStateRepository,
	TradingConfigRepository,
	UniverseConfigsRepository,
} from "@cream/storage";

import { log } from "./logger.js";

type AgentPredictionPlatform = "KALSHI" | "POLYMARKET";
type AgentPredictionMarketType =
	| "FED_RATE"
	| "ECONOMIC_DATA"
	| "RECESSION"
	| "GEOPOLITICAL"
	| "REGULATORY"
	| "ELECTION"
	| "OTHER";

function toAgentPlatform(platform: StoragePredictionPlatform): AgentPredictionPlatform {
	return platform.toUpperCase() as AgentPredictionPlatform;
}

function toStoragePlatform(
	platform: AgentPredictionPlatform | undefined
): StoragePredictionPlatform | undefined {
	return platform?.toLowerCase() as StoragePredictionPlatform | undefined;
}

function toAgentMarketType(marketType: StoragePredictionMarketType): AgentPredictionMarketType {
	switch (marketType) {
		case "rate":
			return "FED_RATE";
		case "election":
			return "ELECTION";
		case "economic":
			return "ECONOMIC_DATA";
		default:
			return "OTHER";
	}
}

function toStorageMarketType(
	marketType: AgentPredictionMarketType | undefined
): StoragePredictionMarketType | undefined {
	if (!marketType) {
		return undefined;
	}
	switch (marketType) {
		case "FED_RATE":
			return "rate";
		case "ELECTION":
			return "election";
		default:
			return "economic";
	}
}

function createPredictionMarketsRepoAdapter(repo: PredictionMarketsRepository) {
	return {
		async getLatestSignals() {
			const signals = await repo.getLatestSignals();
			return signals.map((s) => ({
				id: s.id,
				signalType: s.signalType,
				signalValue: s.signalValue,
				confidence: s.confidence,
				computedAt: s.computedAt,
			}));
		},
		async getLatestSnapshots(platform?: AgentPredictionPlatform) {
			const snapshots = await repo.getLatestSnapshots(toStoragePlatform(platform));
			return snapshots.map((s) => ({
				id: s.id,
				platform: toAgentPlatform(s.platform as StoragePredictionPlatform),
				marketTicker: s.marketTicker,
				marketType: toAgentMarketType(s.marketType as StoragePredictionMarketType),
				marketQuestion: s.marketQuestion,
				snapshotTime: s.snapshotTime,
				data: s.data,
			}));
		},
		async findSnapshots(
			filters: {
				platform?: AgentPredictionPlatform;
				marketType?: AgentPredictionMarketType;
				fromTime?: string;
				toTime?: string;
			},
			limit?: number
		) {
			const storageFilters = {
				platform: toStoragePlatform(filters.platform),
				marketType: toStorageMarketType(filters.marketType),
				fromTime: filters.fromTime,
				toTime: filters.toTime,
			};
			const snapshots = await repo.findSnapshots(storageFilters, limit);
			return snapshots.map((s) => ({
				id: s.id,
				platform: toAgentPlatform(s.platform as StoragePredictionPlatform),
				marketTicker: s.marketTicker,
				marketType: toAgentMarketType(s.marketType as StoragePredictionMarketType),
				marketQuestion: s.marketQuestion,
				snapshotTime: s.snapshotTime,
				data: s.data,
			}));
		},
	};
}

// ============================================
// Database Client (Drizzle + PostgreSQL)
// ============================================

/**
 * Get the Drizzle database client.
 */
export function getDbClient(): Database {
	return getDb();
}

/**
 * Close the database connection
 */
export { closeDbConnection as closeDb };

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
	// Use adapter to convert between storage types (lowercase) and agent types (uppercase)
	setPredictionMarketsRepoProvider(async () =>
		createPredictionMarketsRepoAdapter(getPredictionMarketsRepo())
	);

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
export function getPositionsRepo(): PositionsRepository {
	return new PositionsRepository();
}

/**
 * Get orders repository
 */
export function getOrdersRepo(): OrdersRepository {
	return new OrdersRepository();
}

/**
 * Get thesis state repository
 */
export function getThesisStateRepo(): ThesisStateRepository {
	return new ThesisStateRepository();
}

/**
 * Get external events repository
 */
export function getExternalEventsRepo(): ExternalEventsRepository {
	return new ExternalEventsRepository();
}

/**
 * Get prediction markets repository
 */
export function getPredictionMarketsRepo(): PredictionMarketsRepository {
	return new PredictionMarketsRepository();
}

/**
 * Get regime labels repository
 */
export function getRegimeLabelsRepo(): RegimeLabelsRepository {
	return new RegimeLabelsRepository();
}

/**
 * Get decisions repository
 */
export function getDecisionsRepo(): DecisionsRepository {
	return new DecisionsRepository();
}

/**
 * Get factor zoo repository
 */
export function getFactorZooRepo(): FactorZooRepository {
	return new FactorZooRepository();
}

/**
 * Get indicators repository
 */
export function getIndicatorsRepo(): IndicatorsRepository {
	return new IndicatorsRepository();
}

/**
 * Get macro watch repository
 */
export function getMacroWatchRepo(): MacroWatchRepository {
	return new MacroWatchRepository();
}

// ============================================
// Runtime Config Repository Factories
// ============================================

/**
 * Get trading config repository
 */
export function getTradingConfigRepo(): TradingConfigRepository {
	return new TradingConfigRepository();
}

/**
 * Get agent configs repository
 */
export function getAgentConfigsRepo(): AgentConfigsRepository {
	return new AgentConfigsRepository();
}

/**
 * Get universe configs repository
 */
export function getUniverseConfigsRepo(): UniverseConfigsRepository {
	return new UniverseConfigsRepository();
}

/**
 * Get runtime config service
 *
 * Creates a RuntimeConfigService with all required repositories.
 */
export function getRuntimeConfigService(): RuntimeConfigService {
	const tradingRepo = getTradingConfigRepo();
	const agentRepo = getAgentConfigsRepo();
	const universeRepo = getUniverseConfigsRepo();
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
 * In test mode (source: "test"), validation is optional but recommended.
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
	const isTestEnv = isTest(ctx);
	const { failFast = !isTestEnv, maxLatencyMs = 5000 } = options;

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
		await validateHelixDBAtStartup(ctx, { failFast: !isTest(ctx) });
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
