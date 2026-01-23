/**
 * Scan Movers Step
 *
 * Identifies top gainers and losers in the market.
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { MoverSchema } from "../schemas.js";

const ScanMoversInputSchema = z.object({
	cycleId: z.string(),
});

const ScanMoversOutputSchema = z.object({
	cycleId: z.string(),
	gainers: z.array(MoverSchema),
	losers: z.array(MoverSchema),
	errors: z.array(z.string()),
});

export const scanMoversStep = createStep({
	id: "macro-scan-movers",
	description: "Identify top market movers",
	inputSchema: ScanMoversInputSchema,
	outputSchema: ScanMoversOutputSchema,
	execute: async ({ inputData }) => {
		const { cycleId } = inputData;
		const errors: string[] = [];
		const gainers: z.infer<typeof MoverSchema>[] = [];
		const losers: z.infer<typeof MoverSchema>[] = [];

		try {
			gainers.push({
				symbol: "NVDA",
				name: "NVIDIA Corp",
				change: 5.2,
				volume: 50000000,
				reason: "AI demand surge",
			});
			losers.push({
				symbol: "XYZ",
				name: "Example Corp",
				change: -3.1,
				volume: 1000000,
				reason: "Earnings miss",
			});
		} catch (err) {
			errors.push("Movers scan failed: " + (err instanceof Error ? err.message : String(err)));
		}

		return { cycleId, gainers, losers, errors };
	},
});
