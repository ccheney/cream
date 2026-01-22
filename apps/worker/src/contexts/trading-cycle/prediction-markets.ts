/**
 * Prediction Markets Runner
 *
 * Domain service for running the prediction markets workflow.
 * Fetches data from Kalshi/Polymarket and stores computed signals.
 */

import { predictionMarketsWorkflow } from "@cream/api";
import { log } from "../../shared/logger.js";

// ============================================
// Types
// ============================================

export type MarketType = "FED_RATE" | "ECONOMIC_DATA" | "RECESSION";

export interface PredictionMarketsConfig {
	marketTypes: readonly MarketType[];
}

// ============================================
// Prediction Markets Service
// ============================================

const WORKFLOW_TIMEOUT_MS = 60_000; // 60 seconds

export class PredictionMarketsService {
	private running = false;
	private readonly config: PredictionMarketsConfig;

	constructor(
		config: PredictionMarketsConfig = { marketTypes: ["FED_RATE", "ECONOMIC_DATA", "RECESSION"] }
	) {
		this.config = config;
	}

	isRunning(): boolean {
		return this.running;
	}

	async run(): Promise<void> {
		if (this.running) {
			log.info({}, "Skipping prediction markets - previous run still in progress");
			return;
		}

		this.running = true;

		try {
			const run = await predictionMarketsWorkflow.createRun();
			await Promise.race([
				run.start({
					inputData: {
						marketTypes: [...this.config.marketTypes],
					},
				}),
				new Promise((_, reject) =>
					setTimeout(
						() => reject(new Error("Prediction markets workflow timed out")),
						WORKFLOW_TIMEOUT_MS
					)
				),
			]);
		} catch (error) {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"Prediction markets workflow failed"
			);
		} finally {
			this.running = false;
		}
	}
}

export function createPredictionMarketsService(
	config?: PredictionMarketsConfig
): PredictionMarketsService {
	return new PredictionMarketsService(config);
}
