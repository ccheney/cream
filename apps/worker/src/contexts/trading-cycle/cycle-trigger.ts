/**
 * Trading Cycle Trigger
 *
 * Domain service for triggering OODA trading cycles via Dashboard API.
 * Uses dashboard-api's /api/system/trigger-cycle endpoint which handles:
 * - Workflow execution via embedded Mastra
 * - Decision persistence to database
 * - WebSocket broadcasting of progress
 */

import { log } from "../../shared/logger.js";

// ============================================
// Types
// ============================================

export interface CycleTriggerConfig {
	dashboardApiUrl: string;
	internalSecret: string;
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

	async trigger(environment: string, _symbols: string[]): Promise<CycleTriggerResult | null> {
		if (this.running) {
			log.info({}, "Skipping trading cycle - previous run still in progress");
			return null;
		}

		this.running = true;

		try {
			return await this.triggerViaDashboardApi(environment);
		} finally {
			this.running = false;
		}
	}

	private async triggerViaDashboardApi(environment: string): Promise<CycleTriggerResult | null> {
		log.info(
			{ environment, dashboardApiUrl: this.config.dashboardApiUrl },
			"Triggering trading cycle via Dashboard API",
		);

		try {
			const response = await fetch(`${this.config.dashboardApiUrl}/api/system/trigger-cycle`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.config.internalSecret}`,
				},
				body: JSON.stringify({
					environment,
					// Symbols are loaded from runtime config by dashboard-api
				}),
			});

			if (!response.ok) {
				const errorBody = await response.text();
				log.error(
					{ status: response.status, body: errorBody },
					"Failed to trigger cycle via Dashboard API",
				);
				return null;
			}

			const result = (await response.json()) as { cycleId: string; status: string };
			log.info(
				{ cycleId: result.cycleId, status: result.status },
				"Trading cycle triggered successfully",
			);

			return {
				cycleId: result.cycleId,
				status: result.status,
			};
		} catch (error) {
			log.error(
				{
					error: error instanceof Error ? error.message : String(error),
					dashboardApiUrl: this.config.dashboardApiUrl,
				},
				"Failed to reach Dashboard API for trading cycle trigger",
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
		internalSecret: Bun.env.WORKER_INTERNAL_SECRET ?? "dev-internal-secret",
	});
}
