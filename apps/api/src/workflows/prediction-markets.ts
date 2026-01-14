/**
 * Prediction Markets Workflow
 *
 * Standalone workflow for fetching prediction market data.
 * Runs on a 15-minute schedule, separate from the hourly OODA loop.
 *
 * This workflow:
 * 1. Fetches data from Kalshi and Polymarket
 * 2. Computes macro risk signals
 * 3. Stores snapshots and signals to the database
 * 4. Transforms events for agent consumption
 */

import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import {
	fetchPredictionMarketsStep,
	PredictionMarketOutputSchema,
} from "../steps/fetchPredictionMarkets.js";

// ============================================
// Workflow Definition
// ============================================

export const predictionMarketsWorkflow = createWorkflow({
	id: "prediction-markets",
	description: "Fetch and process prediction market data",
	inputSchema: z.object({
		/** Market types to fetch */
		marketTypes: z
			.array(
				z.enum(["FED_RATE", "ECONOMIC_DATA", "RECESSION", "GEOPOLITICAL", "REGULATORY", "ELECTION"])
			)
			.optional()
			.default(["FED_RATE", "ECONOMIC_DATA", "RECESSION"]),
	}),
	outputSchema: PredictionMarketOutputSchema,
});

// Wire steps
predictionMarketsWorkflow.then(fetchPredictionMarketsStep).commit();

export type PredictionMarketsInput = z.infer<typeof predictionMarketsWorkflow.inputSchema>;
export type PredictionMarketsOutput = z.infer<typeof predictionMarketsWorkflow.outputSchema>;
