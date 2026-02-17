import { z } from "zod";

/**
 * Option type (call or put).
 */
export type OptionType = "call" | "put";

/**
 * Extended option contract with market data.
 */
export const OptionWithMarketDataSchema = z.object({
	ticker: z.string(),
	underlying: z.string(),
	type: z.enum(["call", "put"]),
	expiration: z.string(),
	strike: z.number(),
	dte: z.number(),
	delta: z.number().optional(),
	gamma: z.number().optional(),
	theta: z.number().optional(),
	vega: z.number().optional(),
	iv: z.number().optional(),
	bid: z.number().optional(),
	ask: z.number().optional(),
	mid: z.number().optional(),
	spread: z.number().optional(),
	spreadPct: z.number().optional(),
	lastPrice: z.number().optional(),
	volume: z.number().optional(),
	openInterest: z.number().optional(),
	ivPercentile: z.number().optional(),
	ivPercentileData: z
		.object({
			currentIV: z.number(),
			percentile: z.number(),
			observationCount: z.number(),
			high52Week: z.number(),
			low52Week: z.number(),
			averageIV: z.number(),
		})
		.optional(),
	liquidityScore: z.number().optional(),
	overallScore: z.number().optional(),
});

export type OptionWithMarketData = z.infer<typeof OptionWithMarketDataSchema>;

/**
 * Filter criteria for option chain scanning.
 */
export interface OptionFilterCriteria {
	minDte?: number;
	maxDte?: number;
	minDelta?: number;
	maxDelta?: number;
	optionType?: OptionType | "both";
	minVolume?: number;
	minOpenInterest?: number;
	maxSpreadPct?: number;
	maxSpreadAbs?: number;
	minIvPercentile?: number;
	maxIvPercentile?: number;
	minUnderlyingVolume?: number;
}

/**
 * Default filter criteria for different strategies.
 */
export const DEFAULT_FILTERS: Record<string, OptionFilterCriteria> = {
	creditSpread: {
		minDte: 30,
		maxDte: 60,
		minDelta: 0.15,
		maxDelta: 0.3,
		minVolume: 100,
		minOpenInterest: 500,
		maxSpreadPct: 0.1,
		minIvPercentile: 50,
	},
	debitSpread: {
		minDte: 21,
		maxDte: 45,
		minDelta: 0.3,
		maxDelta: 0.5,
		minVolume: 50,
		minOpenInterest: 200,
		maxSpreadPct: 0.08,
		maxIvPercentile: 50,
	},
	coveredCall: {
		minDte: 14,
		maxDte: 45,
		minDelta: 0.25,
		maxDelta: 0.4,
		optionType: "call",
		minVolume: 100,
		minOpenInterest: 300,
		maxSpreadPct: 0.08,
	},
	cashSecuredPut: {
		minDte: 21,
		maxDte: 45,
		minDelta: 0.2,
		maxDelta: 0.35,
		optionType: "put",
		minVolume: 100,
		minOpenInterest: 500,
		maxSpreadPct: 0.1,
		minIvPercentile: 40,
	},
	longOption: {
		minDte: 30,
		maxDte: 90,
		minDelta: 0.4,
		maxDelta: 0.6,
		minVolume: 200,
		minOpenInterest: 1000,
		maxSpreadPct: 0.05,
		maxIvPercentile: 40,
	},
};

/**
 * Scoring weights for candidate ranking.
 */
export interface ScoringWeights {
	liquidity: number;
	spread: number;
	delta: number;
	iv: number;
	dte: number;
}

/**
 * Greeks data for an option.
 */
export interface OptionGreeks {
	delta?: number;
	gamma?: number;
	theta?: number;
	vega?: number;
	iv?: number;
	bid?: number;
	ask?: number;
	lastPrice?: number;
	volume?: number;
	openInterest?: number;
}

/**
 * Function to fetch greeks for a list of option tickers.
 */
export type GreeksProvider = (tickers: string[]) => Promise<Map<string, OptionGreeks>>;
