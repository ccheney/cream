/**
 * Fetch Prediction Markets Step
 *
 * Fetches prediction market data from Kalshi and Polymarket,
 * computes macro risk signals.
 *
 * Runs on a 15-minute schedule (separate from hourly OODA loop).
 */

import { createDefaultPredictionMarketsConfig, type PredictionMarketsConfig } from "@cream/config";
import { createContext, type ExecutionContext, isTest, requireEnv } from "@cream/domain";
import { createNodeLogger } from "@cream/logger";
import {
	createUnifiedClient,
	toNumericScores,
	type UnifiedPredictionMarketClient,
} from "@cream/prediction-markets";
import { createStep } from "@mastra/core/workflows";

import { PredictionMarketsInputSchema, PredictionMarketsOutputSchema } from "../schemas.js";

const log = createNodeLogger({ service: "prediction-markets", level: "info" });

/**
 * Create ExecutionContext for step invocation.
 */
function createStepContext(): ExecutionContext {
	return createContext(requireEnv(), "scheduled");
}

// Singleton client
let unifiedClient: UnifiedPredictionMarketClient | null = null;

/**
 * Build PredictionMarketsConfig from environment variables
 */
function buildConfigFromEnv(): PredictionMarketsConfig {
	const config = createDefaultPredictionMarketsConfig();

	// Check for Kalshi credentials
	const hasKalshi = Boolean(Bun.env.KALSHI_API_KEY_ID && Bun.env.KALSHI_PRIVATE_KEY_PATH);
	if (hasKalshi) {
		config.kalshi.enabled = true;
		config.kalshi.api_key_id = Bun.env.KALSHI_API_KEY_ID;
		const keyPath = Bun.env.KALSHI_PRIVATE_KEY_PATH ?? "";
		config.kalshi.private_key_path = keyPath.startsWith("/")
			? keyPath
			: `${process.cwd()}/${keyPath}`;
	} else {
		config.kalshi.enabled = false;
	}

	// Polymarket is enabled by default (REST-based, no auth required)
	config.polymarket.enabled = true;

	return config;
}

function getUnifiedClient(): UnifiedPredictionMarketClient | null {
	if (unifiedClient) {
		return unifiedClient;
	}

	const config = buildConfigFromEnv();

	if (!config.kalshi.enabled && !config.polymarket.enabled) {
		return null;
	}

	try {
		unifiedClient = createUnifiedClient(config);
		return unifiedClient;
	} catch {
		return null;
	}
}

export const fetchPredictionMarketsStep = createStep({
	id: "fetch-prediction-markets",
	description: "Fetch prediction market data and compute macro signals",
	inputSchema: PredictionMarketsInputSchema,
	outputSchema: PredictionMarketsOutputSchema,
	retries: 2,
	execute: async ({ inputData }) => {
		const fetchedAt = new Date().toISOString();
		const ctx = createStepContext();

		// In test mode, return empty context
		if (isTest(ctx)) {
			return {
				signals: {
					platforms: [],
					timestamp: fetchedAt,
				},
				scores: {},
				numericScores: {},
				eventCount: 0,
				arbitrageAlertCount: 0,
				fetchedAt,
			};
		}

		const client = getUnifiedClient();
		if (!client) {
			return {
				signals: {
					platforms: [],
					timestamp: fetchedAt,
				},
				scores: {},
				numericScores: {},
				eventCount: 0,
				arbitrageAlertCount: 0,
				fetchedAt,
			};
		}

		try {
			const marketData = await client.getAllMarketData(inputData.marketTypes);

			log.info(
				{ eventCount: marketData.events.length, platforms: marketData.signals.platforms },
				"Fetched prediction market data",
			);

			const numericScores = toNumericScores(marketData.scores);

			return {
				signals: marketData.signals,
				scores: marketData.scores,
				numericScores,
				eventCount: marketData.events.length,
				arbitrageAlertCount: marketData.arbitrageAlerts.length,
				fetchedAt,
			};
		} catch (error) {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to fetch prediction market data",
			);
			return {
				signals: {
					platforms: [],
					timestamp: fetchedAt,
				},
				scores: {},
				numericScores: {},
				eventCount: 0,
				arbitrageAlertCount: 0,
				fetchedAt,
			};
		}
	},
});
