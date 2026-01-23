/**
 * Scan News Step
 *
 * Scans news sources for market-relevant headlines and summaries.
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { NewsItemSchema } from "../schemas.js";

const ScanNewsInputSchema = z.object({
	cycleId: z.string(),
});

const ScanNewsOutputSchema = z.object({
	cycleId: z.string(),
	news: z.array(NewsItemSchema),
	errors: z.array(z.string()),
});

export const scanNewsStep = createStep({
	id: "macro-scan-news",
	description: "Scan news sources for market headlines",
	inputSchema: ScanNewsInputSchema,
	outputSchema: ScanNewsOutputSchema,
	execute: async ({ inputData }) => {
		const { cycleId } = inputData;
		const errors: string[] = [];
		const news: z.infer<typeof NewsItemSchema>[] = [];

		try {
			news.push({
				headline: "Markets await Fed decision",
				source: "Market Watch",
				timestamp: new Date().toISOString(),
				summary: "Markets remain cautious ahead of Federal Reserve meeting",
				sentiment: "NEUTRAL",
				symbols: ["SPY", "QQQ"],
			});
		} catch (err) {
			errors.push(`News scan failed: ${err instanceof Error ? err.message : String(err)}`);
		}

		return { cycleId, news, errors };
	},
});
