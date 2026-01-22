/**
 * Shared Database Infrastructure
 *
 * Database client management (Drizzle + PostgreSQL), RuntimeConfigService, and HelixDB client.
 * Used across all bounded contexts that need database access.
 */

import { createRuntimeConfigService, type RuntimeConfigService } from "@cream/config";
import { type ExecutionContext, isTest } from "@cream/domain";
import { createHelixClientFromEnv, type HealthCheckResult, type HelixClient } from "@cream/helix";
import {
	AgentConfigsRepository,
	closeDb as closeDbConnection,
	type Database,
	getDb,
	TradingConfigRepository,
	UniverseConfigsRepository,
} from "@cream/storage";
import { log } from "./logger.js";

// ============================================
// Database Client (Drizzle + PostgreSQL)
// ============================================

export function getDbClient(): Database {
	return getDb();
}

export { closeDbConnection as closeDb };

// ============================================
// Runtime Config Service
// ============================================

let runtimeConfigService: RuntimeConfigService | null = null;

export function getRuntimeConfigService(): RuntimeConfigService {
	if (runtimeConfigService) {
		return runtimeConfigService;
	}

	// Repositories use getDb() internally
	const tradingRepo = new TradingConfigRepository();
	const agentRepo = new AgentConfigsRepository();
	const universeRepo = new UniverseConfigsRepository();

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
			"Failed to create HelixDB client",
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
	} = {},
): Promise<HealthCheckResult> {
	const isTestEnv = isTest(ctx);
	const { failFast = !isTestEnv, maxLatencyMs = 5000 } = options;

	log.info({ environment: ctx.environment }, "Validating HelixDB connection");

	const health = await checkHelixHealth();

	if (!health.healthy) {
		const errorMsg =
			`HelixDB health check failed: ${health.error}. ` +
			`Ensure HelixDB is running at ${Bun.env.HELIX_HOST ?? "localhost"}:${Bun.env.HELIX_PORT ?? "6969"}`;

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
		await validateHelixDBAtStartup(ctx, { failFast: !isTest(ctx) });
	} catch (error) {
		if (error instanceof HelixDBValidationError) {
			log.error(
				{ environment: ctx.environment, error: error.message },
				"HelixDB validation failed for worker service. Please ensure HelixDB is running and restart.",
			);
			process.exit(1);
		}
		throw error;
	}
}
