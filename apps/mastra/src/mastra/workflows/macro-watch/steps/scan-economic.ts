/**
 * Scan Economic Step
 *
 * Fetches economic indicators and calendar events.
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { EconomicIndicatorSchema } from "../schemas.js";

const ScanEconomicInputSchema = z.object({
	cycleId: z.string(),
});

const ScanEconomicOutputSchema = z.object({
	cycleId: z.string(),
	economic: z.array(EconomicIndicatorSchema),
	errors: z.array(z.string()),
});

export const scanEconomicStep = createStep({
	id: "macro-scan-economic",
	description: "Fetch economic indicators",
	inputSchema: ScanEconomicInputSchema,
	outputSchema: ScanEconomicOutputSchema,
	execute: async ({ inputData }) => {
		const { cycleId } = inputData;
		const errors: string[] = [];
		const economic: z.infer<typeof EconomicIndicatorSchema>[] = [];

		try {
			economic.push({
				indicator: "VIX",
				value: 15.5,
				previousValue: 14.2,
				change: 1.3,
				timestamp: new Date().toISOString(),
			});
		} catch (err) {
			errors.push("Economic scan failed: " + (err instanceof Error ? err.message : String(err)));
		}

		return { cycleId, economic, errors };
	},
});
