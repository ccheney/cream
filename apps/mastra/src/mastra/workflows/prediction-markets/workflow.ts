/**
 * Prediction Markets Workflow
 *
 * Standalone workflow for fetching prediction market data.
 * Runs on a 15-minute schedule, separate from the hourly OODA loop.
 *
 * This workflow:
 * 1. Fetches data from Kalshi and Polymarket
 * 2. Computes macro risk signals
 * 3. Transforms events for agent consumption
 */

import { createWorkflow } from "@mastra/core/workflows";

import { PredictionMarketsInputSchema, PredictionMarketsOutputSchema } from "./schemas.js";
import { fetchPredictionMarketsStep } from "./steps/index.js";

export const predictionMarketsWorkflow = createWorkflow({
	id: "prediction-markets",
	description: "Fetch and process prediction market data",
	inputSchema: PredictionMarketsInputSchema,
	outputSchema: PredictionMarketsOutputSchema,
})
	.then(fetchPredictionMarketsStep)
	.commit();
