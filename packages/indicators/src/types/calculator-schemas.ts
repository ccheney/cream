import { z } from "zod";

export const CalculatorResultSchema = z.object({
	value: z.number().nullable(),
	timestamp: z.number(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CalculatorResult = z.infer<typeof CalculatorResultSchema>;

export const OHLCVBarSchema = z.object({
	timestamp: z.number(),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number(),
});
export type OHLCVBar = z.infer<typeof OHLCVBarSchema>;

export type Candle = OHLCVBar;

export const QuoteSchema = z.object({
	timestamp: z.number(),
	bidPrice: z.number(),
	bidSize: z.number(),
	askPrice: z.number(),
	askSize: z.number(),
});
export type Quote = z.infer<typeof QuoteSchema>;
