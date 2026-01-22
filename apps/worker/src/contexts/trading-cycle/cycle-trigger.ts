/**
 * Trading Cycle Trigger
 *
 * Domain service for triggering OODA trading cycles via dashboard-api.
 * The worker delegates cycle execution to dashboard-api for unified streaming.
 */

import { log } from "../../shared/logger.js";

// ============================================
// Types
// ============================================

export interface CycleTriggerConfig {
	dashboardApiUrl: string;
	workerInternalSecret: string;
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
				"Trading cycle triggered successfully",
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
		} finally {
			this.running = false;
		}
	}
}

export function createCycleTriggerService(config: CycleTriggerConfig): CycleTriggerService {
	return new CycleTriggerService(config);
}

export function createCycleTriggerServiceFromEnv(): CycleTriggerService {
	return new CycleTriggerService({
		dashboardApiUrl: Bun.env.DASHBOARD_API_URL ?? "http://localhost:3001",
		workerInternalSecret: Bun.env.WORKER_INTERNAL_SECRET ?? "dev-internal-secret",
	});
}
