/**
 * Historical Adapter Factory Functions
 * @module
 */

import type { PredictionMarketsRepository } from "@cream/storage";
import { HistoricalPredictionMarketAdapter } from "./adapter.js";

/**
 * Create a historical adapter with a repository
 */
export function createHistoricalAdapter(
	repository: PredictionMarketsRepository
): HistoricalPredictionMarketAdapter {
	return new HistoricalPredictionMarketAdapter({ repository });
}

/**
 * Create a historical adapter from environment variables
 * Note: Requires repository to be passed for full functionality
 */
export function createHistoricalAdapterFromEnv(): HistoricalPredictionMarketAdapter {
	return new HistoricalPredictionMarketAdapter();
}
