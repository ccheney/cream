/**
 * Prediction Markets Workflow Schemas
 *
 * Input and output schemas for prediction market data fetching.
 */

import { z } from "zod";

// Market type enum
export const MarketTypeSchema = z.enum([
	"FED_RATE",
	"ECONOMIC_DATA",
	"RECESSION",
	"GEOPOLITICAL",
	"REGULATORY",
	"ELECTION",
]);

export type MarketType = z.infer<typeof MarketTypeSchema>;

// Workflow input
export const PredictionMarketsInputSchema = z.object({
	/** Market types to fetch */
	marketTypes: z
		.array(MarketTypeSchema)
		.optional()
		.default(["FED_RATE", "ECONOMIC_DATA", "RECESSION"]),
});

export type PredictionMarketsInput = z.infer<typeof PredictionMarketsInputSchema>;

// Signals from prediction markets
export const MacroRiskSignalsSchema = z.object({
	fedCutProbability: z.number().optional(),
	fedHikeProbability: z.number().optional(),
	recessionProbability12m: z.number().optional(),
	macroUncertaintyIndex: z.number().optional(),
	policyEventRisk: z.number().optional(),
	marketConfidence: z.number().optional(),
	marketCount: z.number().optional(),
	platforms: z.array(z.string()),
	timestamp: z.string(),
});

// Workflow output
export const PredictionMarketsOutputSchema = z.object({
	signals: MacroRiskSignalsSchema,
	scores: z.record(z.string(), z.number().optional()),
	numericScores: z.record(z.string(), z.number()),
	eventCount: z.number(),
	arbitrageAlertCount: z.number(),
	fetchedAt: z.string(),
});

export type PredictionMarketsOutput = z.infer<typeof PredictionMarketsOutputSchema>;
