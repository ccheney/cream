/**
 * Trading Cycle Trigger
 *
 * Domain service for triggering OODA trading cycles via Mastra API.
 */

import { log } from "../../shared/logger.js";

// ============================================
// Types
// ============================================

export interface CycleTriggerConfig {
	mastraApiUrl: string;
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
			return await this.triggerViaMastra(environment, symbols);
		} finally {
			this.running = false;
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
		mastraApiUrl: Bun.env.MASTRA_API_URL ?? "http://localhost:4111",
	});
}
