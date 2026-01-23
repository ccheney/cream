/**
 * Trading Cycle Trigger
 *
 * Domain service for triggering OODA trading cycles.
 * Supports two modes:
 * - Legacy: Triggers via dashboard-api (when USE_MASTRA_APP=false)
 * - New: Triggers directly via Mastra API (when USE_MASTRA_APP=true)
 */

import { MASTRA_API_URL, USE_MASTRA_APP } from "@cream/config";
import { log } from "../../shared/logger.js";

// ============================================
// Types
// ============================================

export interface CycleTriggerConfig {
	dashboardApiUrl: string;
	mastraApiUrl: string;
	workerInternalSecret: string;
	useMastraApp: boolean;
}

export interface CycleTriggerResult {
	cycleId: string;
	status: string;
}

// ============================================
// Cycle Trigger Service
// ============================================

export class CycleTriggerService {
	private readonly config: CycleTriggerConfig;
	private running = false;

	constructor(config: CycleTriggerConfig) {
		this.config = config;
	}

	isRunning(): boolean {
		return this.running;
	}

	async trigger(environment: string, symbols: string[]): Promise<CycleTriggerResult | null> {
		if (this.running) {
			log.info({}, "Skipping trading cycle - previous run still in progress");
			return null;
		}

		this.running = true;

		try {
			if (this.config.useMastraApp) {
				return await this.triggerViaMastra(environment, symbols);
			}
			return await this.triggerViaDashboardApi(environment, symbols);
		} finally {
			this.running = false;
		}
	}

	private async triggerViaDashboardApi(
		environment: string,
		symbols: string[],
	): Promise<CycleTriggerResult | null> {
		log.info({ environment }, "Triggering trading cycle via dashboard-api");

		try {
			const response = await fetch(`${this.config.dashboardApiUrl}/api/system/trigger-cycle`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.config.workerInternalSecret}`,
				},
				body: JSON.stringify({
					environment,
					symbols,
				}),
			});

			if (!response.ok) {
				const errorBody = await response.text();
				log.error(
					{ status: response.status, body: errorBody },
					"Failed to trigger trading cycle via dashboard-api",
				);
				return null;
			}

			const result = (await response.json()) as CycleTriggerResult;
			log.info(
				{ cycleId: result.cycleId, status: result.status },
				"Trading cycle triggered successfully via dashboard-api",
			);
			return result;
		} catch (error) {
			log.error(
				{
					error: error instanceof Error ? error.message : String(error),
					dashboardApiUrl: this.config.dashboardApiUrl,
				},
				"Failed to reach dashboard-api for trading cycle trigger",
			);
			return null;
		}
	}

	private async triggerViaMastra(
		environment: string,
		symbols: string[],
	): Promise<CycleTriggerResult | null> {
		log.info(
			{ environment, mastraApiUrl: this.config.mastraApiUrl },
			"Triggering trading cycle via Mastra API",
		);

		const cycleId = crypto.randomUUID();

		try {
			// Step 1: Create run
			const createResponse = await fetch(
				`${this.config.mastraApiUrl}/api/workflows/tradingCycleWorkflow/create-run?runId=${cycleId}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
				},
			);

			if (!createResponse.ok) {
				const errorBody = await createResponse.text();
				log.error(
					{ status: createResponse.status, body: errorBody },
					"Failed to create Mastra workflow run",
				);
				return null;
			}

			// Step 2: Start streaming execution
			const streamResponse = await fetch(
				`${this.config.mastraApiUrl}/api/workflows/tradingCycleWorkflow/stream?runId=${cycleId}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						inputData: {
							cycleId,
							instruments: symbols,
							environment,
						},
					}),
				},
			);

			if (!streamResponse.ok) {
				const errorBody = await streamResponse.text();
				log.error(
					{ status: streamResponse.status, body: errorBody },
					"Failed to start Mastra workflow stream",
				);
				return null;
			}

			// Stream is started - workflow will run asynchronously
			log.info({ cycleId }, "Trading cycle triggered successfully via Mastra API");

			return {
				cycleId,
				status: "queued",
			};
		} catch (error) {
			log.error(
				{
					error: error instanceof Error ? error.message : String(error),
					mastraApiUrl: this.config.mastraApiUrl,
				},
				"Failed to reach Mastra API for trading cycle trigger",
			);
			return null;
		}
	}
}

export function createCycleTriggerService(config: CycleTriggerConfig): CycleTriggerService {
	return new CycleTriggerService(config);
}

export function createCycleTriggerServiceFromEnv(): CycleTriggerService {
	return new CycleTriggerService({
		dashboardApiUrl: Bun.env.DASHBOARD_API_URL ?? "http://localhost:3001",
		mastraApiUrl: MASTRA_API_URL,
		workerInternalSecret: Bun.env.WORKER_INTERNAL_SECRET ?? "dev-internal-secret",
		useMastraApp: USE_MASTRA_APP,
	});
}
