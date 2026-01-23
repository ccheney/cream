/**
 * Macro Watch Workflow Schemas
 *
 * Zod schemas for the macro watch workflow that compiles
 * a newspaper-style summary of market conditions.
 */

import { z } from "zod";

export const NewsItemSchema = z.object({
	headline: z.string(),
	source: z.string(),
	timestamp: z.string(),
	summary: z.string(),
	sentiment: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]),
	symbols: z.array(z.string()),
});

export const PredictionSignalSchema = z.object({
	market: z.string(),
	probability: z.number(),
	change24h: z.number().optional(),
	timestamp: z.string(),
});

export const EconomicIndicatorSchema = z.object({
	indicator: z.string(),
	value: z.number(),
	previousValue: z.number().optional(),
	change: z.number().optional(),
	timestamp: z.string(),
});

export const MoverSchema = z.object({
	symbol: z.string(),
	name: z.string(),
	change: z.number(),
	volume: z.number(),
	reason: z.string().optional(),
});

export const NewspaperSectionSchema = z.object({
	title: z.string(),
	content: z.string(),
	highlights: z.array(z.string()),
});

export const MacroWatchInputSchema = z.object({
	cycleId: z.string(),
	date: z.string().optional(),
});

export const MacroWatchOutputSchema = z.object({
	cycleId: z.string(),
	timestamp: z.string(),
	sections: z.array(NewspaperSectionSchema),
	news: z.array(NewsItemSchema),
	predictions: z.array(PredictionSignalSchema),
	economic: z.array(EconomicIndicatorSchema),
	movers: z.object({
		gainers: z.array(MoverSchema),
		losers: z.array(MoverSchema),
	}),
	errors: z.array(z.string()),
});
