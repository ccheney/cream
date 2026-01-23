/**
 * Macro Watch Workflow
 *
 * Compiles a newspaper-style summary of market conditions.
 * Scans news, predictions, economic data, and market movers in parallel.
 */

import { createWorkflow } from "@mastra/core/workflows";

import { MacroWatchInputSchema, MacroWatchOutputSchema } from "./schemas.js";
import {
	compileNewspaperStep,
	scanEconomicStep,
	scanMoversStep,
	scanNewsStep,
	scanPredictionsStep,
} from "./steps/index.js";

export const macroWatchWorkflow = createWorkflow({
	id: "macro-watch",
	inputSchema: MacroWatchInputSchema,
	outputSchema: MacroWatchOutputSchema,
})
	// Run all scan steps in parallel
	.parallel([scanNewsStep, scanPredictionsStep, scanEconomicStep, scanMoversStep])
	// Map parallel results to compile input
	.map(async ({ inputData }) => {
		const newsResult = inputData["macro-scan-news"];
		const predictionsResult = inputData["macro-scan-predictions"];
		const economicResult = inputData["macro-scan-economic"];
		const moversResult = inputData["macro-scan-movers"];
		return {
			cycleId: newsResult.cycleId,
			news: newsResult.news,
			predictions: predictionsResult.predictions,
			economic: economicResult.economic,
			gainers: moversResult.gainers,
			losers: moversResult.losers,
		};
	})
	// Compile into newspaper format
	.then(compileNewspaperStep)
	.commit();
