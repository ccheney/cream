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
	ConstraintsConfigRepository,
	closeDb as closeDbConnection,
	type Database,
	getDb,
	ScannerConfigsRepository,
	TradingConfigRepository,
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
	const scannerRepo = new ScannerConfigsRepository();
	const constraintsRepo = new ConstraintsConfigRepository();

	runtimeConfigService = createRuntimeConfigService(
		tradingRepo,
		agentRepo,
		scannerRepo,
		constraintsRepo,
	);
	return runtimeConfigService;
}

export function resetRuntimeConfigService(): void {
	runtimeConfigService = null;
}

// ============================================
// HelixDB Client
// ============================================

let helixClient: HelixClient | null = null;

export function getHelixClient(): HelixClient {
	if (helixClient) {
		return helixClient;
	}

	helixClient = createHelixClientFromEnv();
	return helixClient;
}

export function closeHelixClient(): void {
	if (helixClient) {
		helixClient.close();
		helixClient = null;
	}
}

export async function checkHelixHealth(): Promise<HealthCheckResult> {
	try {
		const client = getHelixClient();
		return client.healthCheck();
	} catch (error) {
		return {
			healthy: false,
			latencyMs: 0,
			error: error instanceof Error ? error.message : "HelixDB client could not be created",
		};
	}
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
		const configuredEndpoint = Bun.env.HELIX_URL
			? Bun.env.HELIX_URL
			: Bun.env.HELIX_HOST && Bun.env.HELIX_PORT
				? `${Bun.env.HELIX_HOST}:${Bun.env.HELIX_PORT}`
				: "not configured";
		const errorMsg =
			`HelixDB health check failed: ${health.error}. ` +
			`Ensure HelixDB endpoint is configured and reachable (${configuredEndpoint}).`;

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
