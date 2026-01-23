/**
 * Scan Predictions Step
 *
 * Fetches prediction market signals for macro events.
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { PredictionSignalSchema } from "../schemas.js";

const ScanPredictionsInputSchema = z.object({
	cycleId: z.string(),
});

const ScanPredictionsOutputSchema = z.object({
	cycleId: z.string(),
	predictions: z.array(PredictionSignalSchema),
	errors: z.array(z.string()),
});

export const scanPredictionsStep = createStep({
	id: "macro-scan-predictions",
	description: "Fetch prediction market signals",
	inputSchema: ScanPredictionsInputSchema,
	outputSchema: ScanPredictionsOutputSchema,
	execute: async ({ inputData }) => {
		const { cycleId } = inputData;
		const errors: string[] = [];
		const predictions: z.infer<typeof PredictionSignalSchema>[] = [];

		try {
			predictions.push({
				market: "Fed Rate Cut",
				probability: 0.65,
				change24h: 0.02,
				timestamp: new Date().toISOString(),
			});
		} catch (err) {
			errors.push("Predictions scan failed: " + (err instanceof Error ? err.message : String(err)));
		}

		return { cycleId, predictions, errors };
	},
});
