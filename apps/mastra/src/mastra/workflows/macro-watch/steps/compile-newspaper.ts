/**
 * Compile Newspaper Step
 *
 * Compiles all scanned data into a newspaper-style summary.
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import {
	EconomicIndicatorSchema,
	MacroWatchOutputSchema,
	MoverSchema,
	NewsItemSchema,
	type NewspaperSectionSchema,
	PredictionSignalSchema,
} from "../schemas.js";

const CompileNewspaperInputSchema = z.object({
	cycleId: z.string(),
	news: z.array(NewsItemSchema),
	predictions: z.array(PredictionSignalSchema),
	economic: z.array(EconomicIndicatorSchema),
	gainers: z.array(MoverSchema),
	losers: z.array(MoverSchema),
});

export const compileNewspaperStep = createStep({
	id: "macro-compile-newspaper",
	description: "Compile market data into newspaper format",
	inputSchema: CompileNewspaperInputSchema,
	outputSchema: MacroWatchOutputSchema,
	execute: async ({ inputData }) => {
		const { cycleId, news, predictions, economic, gainers, losers } = inputData;
		const errors: string[] = [];
		const sections: z.infer<typeof NewspaperSectionSchema>[] = [];

		// Headlines section
		sections.push({
			title: "Top Headlines",
			content: news.map((n) => n.headline).join("\n"),
			highlights: news.slice(0, 3).map((n) => n.headline),
		});

		// Market Movers section
		sections.push({
			title: "Market Movers",
			content: [
				"Top Gainers: " +
					gainers.map((g) => g.symbol + " +" + g.change.toFixed(1) + "%").join(", "),
				"Top Losers: " + losers.map((l) => l.symbol + " " + l.change.toFixed(1) + "%").join(", "),
			].join("\n"),
			highlights: [...gainers.slice(0, 2), ...losers.slice(0, 2)].map(
				(m) => m.symbol + ": " + m.reason,
			),
		});

		// Prediction Markets section
		if (predictions.length > 0) {
			sections.push({
				title: "Prediction Markets",
				content: predictions
					.map((p) => p.market + ": " + (p.probability * 100).toFixed(0) + "%")
					.join("\n"),
				highlights: predictions.slice(0, 3).map((p) => p.market),
			});
		}

		// Economic Indicators section
		if (economic.length > 0) {
			sections.push({
				title: "Economic Indicators",
				content: economic.map((e) => e.indicator + ": " + e.value).join("\n"),
				highlights: economic.slice(0, 3).map((e) => e.indicator),
			});
		}

		return {
			cycleId,
			timestamp: new Date().toISOString(),
			sections,
			news,
			predictions,
			economic,
			movers: { gainers, losers },
			errors,
		};
	},
});
