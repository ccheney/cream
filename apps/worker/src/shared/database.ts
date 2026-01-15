/**
 * Shared Database Infrastructure
 *
 * Database client management (Turso), RuntimeConfigService, and HelixDB client.
 * Used across all bounded contexts that need database access.
 */

import { createRuntimeConfigService, type RuntimeConfigService } from "@cream/config";
import { createContext, type ExecutionContext, isBacktest, requireEnv } from "@cream/domain";
import { createHelixClientFromEnv, type HealthCheckResult, type HelixClient } from "@cream/helix";
import {
	AgentConfigsRepository,
	createInMemoryClient,
	createTursoClient,
	runMigrations,
	TradingConfigRepository,
	type TursoClient,
	UniverseConfigsRepository,
} from "@cream/storage";
import { log } from "./logger.js";

// ============================================
// Execution Context
// ============================================

function createDbContext(): ExecutionContext {
	return createContext(requireEnv(), "scheduled");
}

// ============================================
// Turso Database Client
// ============================================

let dbClient: TursoClient | null = null;
let initPromise: Promise<TursoClient> | null = null;

export async function getDbClient(): Promise<TursoClient> {
	if (dbClient) {
		return dbClient;
	}

	if (initPromise) {
		return initPromise;
	}

	initPromise = initializeDb();

	try {
		dbClient = await initPromise;
		return dbClient;
	} catch (error) {
		initPromise = null;
		throw error;
	}
}

async function initializeDb(): Promise<TursoClient> {
	const ctx = createDbContext();
	let client: TursoClient;

	if (process.env.NODE_ENV === "test") {
		client = await createInMemoryClient();
	} else {
		client = await createTursoClient(ctx);
	}

	await runMigrations(client, {
		logger: (_msg) => {},
	});

	return client;
}

export function closeDb(): void {
	if (dbClient) {
		dbClient.close();
		dbClient = null;
	}
	initPromise = null;
}

// ============================================
// Runtime Config Service
// ============================================

let runtimeConfigService: RuntimeConfigService | null = null;

export async function getRuntimeConfigService(): Promise<RuntimeConfigService> {
	if (runtimeConfigService) {
		return runtimeConfigService;
	}

	const client = await getDbClient();
	const tradingRepo = new TradingConfigRepository(client);
	const agentRepo = new AgentConfigsRepository(client);
	const universeRepo = new UniverseConfigsRepository(client);

	runtimeConfigService = createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);
	return runtimeConfigService;
}

export function resetRuntimeConfigService(): void {
	runtimeConfigService = null;
}

// ============================================
// HelixDB Client
// ============================================

let helixClient: HelixClient | null = null;

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
			"Failed to create HelixDB client"
		);
		return null;
	}
}

export function closeHelixClient(): void {
	if (helixClient) {
		helixClient.close();
		helixClient = null;
	}
}

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

// ============================================
// HelixDB Validation
// ============================================

export class HelixDBValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HelixDBValidationError";
	}
}

export async function validateHelixDBAtStartup(
	ctx: ExecutionContext,
	options: {
		failFast?: boolean;
		maxLatencyMs?: number;
	} = {}
): Promise<HealthCheckResult> {
	const isBacktestEnv = isBacktest(ctx);
	const { failFast = !isBacktestEnv, maxLatencyMs = 5000 } = options;

	log.info({ environment: ctx.environment }, "Validating HelixDB connection");

	const health = await checkHelixHealth();

	if (!health.healthy) {
		const errorMsg =
			`HelixDB health check failed: ${health.error}. ` +
			`Ensure HelixDB is running at ${process.env.HELIX_HOST ?? "localhost"}:${process.env.HELIX_PORT ?? "6969"}`;

		log.error({ error: health.error }, errorMsg);

		if (failFast) {
			throw new HelixDBValidationError(errorMsg);
		}

		log.warn({}, "Continuing despite HelixDB health check failure (failFast=false)");
	} else if (health.latencyMs > maxLatencyMs) {
		log.warn({ latencyMs: health.latencyMs, maxLatencyMs }, "HelixDB latency exceeds threshold");
	} else {
		log.info({ latencyMs: health.latencyMs }, "HelixDB health check passed");
	}

	return health;
}

export async function validateHelixDBOrExit(ctx: ExecutionContext): Promise<void> {
	try {
		await validateHelixDBAtStartup(ctx, { failFast: !isBacktest(ctx) });
	} catch (error) {
		if (error instanceof HelixDBValidationError) {
			log.error(
				{ environment: ctx.environment, error: error.message },
				"HelixDB validation failed for worker service. Please ensure HelixDB is running and restart."
			);
			process.exit(1);
		}
		throw error;
	}
}
