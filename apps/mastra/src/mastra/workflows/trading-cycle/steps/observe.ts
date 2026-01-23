/**
 * Observe Step
 *
 * First step in the OODA trading cycle. Gathers market data, indicators,
 * positions, and regime classification into a complete MarketSnapshot.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createAlpacaClientFromEnv, isAlpacaConfigured } from "@cream/marketdata";
import { classifyRegime, DEFAULT_RULE_BASED_CONFIG, getRequiredCandleCount } from "@cream/regime";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import {
	type CandleDataSchema,
	MarketSnapshotSchema,
	type QuoteDataSchema,
	RegimeDataSchema,
} from "../schemas.js";

// ============================================
// Schemas
// ============================================

const ObserveInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	instruments: z.array(z.string()).min(1).describe("Symbols to observe"),
});

const ObserveOutputSchema = z.object({
	cycleId: z.string(),
	marketSnapshot: MarketSnapshotSchema,
	regimeLabels: z.record(z.string(), RegimeDataSchema),
	errors: z.array(z.string()),
	warnings: z.array(z.string()),
	metrics: z.object({
		totalMs: z.number(),
	}),
});

// ============================================
// Types
// ============================================

interface Candle {
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

// ============================================
// Step Definition
// ============================================

export const observeStep = createStep({
	id: "observe-market",
	description: "Fetch market snapshot for analysis including quotes, candles, and regime",
	inputSchema: ObserveInputSchema,
	outputSchema: ObserveOutputSchema,
	execute: async ({ inputData }) => {
		const startTime = performance.now();
		const { cycleId, instruments } = inputData;
		const errors: string[] = [];
		const warnings: string[] = [];

		if (instruments.length === 0) {
			throw new Error("No instruments provided");
		}

		// Fetch market data and candles
		const { candles, quotes, historicalCandles } = await fetchMarketData(
			instruments,
			errors,
			warnings,
		);

		// Classify regime for each symbol
		const regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>> = {};
		for (const symbol of instruments) {
			const symbolCandles = historicalCandles.get(symbol);
			if (symbolCandles && symbolCandles.length > 0) {
				const regime = classifySymbolRegime(symbolCandles, warnings);
				regimeLabels[symbol] = regime;
			} else {
				regimeLabels[symbol] = {
					regime: "RANGE_BOUND",
					confidence: 0.5,
					reasoning: "Insufficient data for regime classification",
				};
			}
		}

		const marketSnapshot = {
			instruments,
			candles,
			quotes,
			timestamp: Date.now(),
		};

		return {
			cycleId,
			marketSnapshot,
			regimeLabels,
			errors,
			warnings,
			metrics: {
				totalMs: performance.now() - startTime,
			},
		};
	},
});

// ============================================
// Helper Functions
// ============================================

async function fetchMarketData(
	instruments: string[],
	errors: string[],
	warnings: string[],
): Promise<{
	candles: Record<string, z.infer<typeof CandleDataSchema>[]>;
	quotes: Record<string, z.infer<typeof QuoteDataSchema>>;
	historicalCandles: Map<string, Candle[]>;
}> {
	const candles: Record<string, z.infer<typeof CandleDataSchema>[]> = {};
	const quotes: Record<string, z.infer<typeof QuoteDataSchema>> = {};
	const historicalCandles = new Map<string, Candle[]>();

	if (!isAlpacaConfigured()) {
		warnings.push("Alpaca not configured - using stub data");

		for (const symbol of instruments) {
			const stubPrice = 100 + Math.random() * 100;
			quotes[symbol] = {
				bid: stubPrice * 0.999,
				ask: stubPrice * 1.001,
				bidSize: 100,
				askSize: 100,
				timestamp: Date.now(),
			};

			// Generate stub candles for regime classification
			const stubCandles: Candle[] = [];
			for (let i = 0; i < 100; i++) {
				const basePrice = stubPrice * (1 + (Math.random() - 0.5) * 0.1);
				stubCandles.push({
					timestamp: Date.now() - i * 3600000,
					open: basePrice,
					high: basePrice * 1.01,
					low: basePrice * 0.99,
					close: basePrice * (1 + (Math.random() - 0.5) * 0.02),
					volume: 100000 + Math.random() * 100000,
				});
			}
			historicalCandles.set(symbol, stubCandles.reverse());
			candles[symbol] = stubCandles;
		}

		return { candles, quotes, historicalCandles };
	}

	try {
		const client = createAlpacaClientFromEnv();
		const snapshots = await client.getSnapshots(instruments);

		// Fetch historical candles for regime
		const requiredBars = getRequiredCandleCount(DEFAULT_RULE_BASED_CONFIG) + 10;
		const to = new Date();
		const from = new Date();
		from.setDate(from.getDate() - 90);

		for (const symbol of instruments) {
			const alpacaSnapshot = snapshots.get(symbol);

			if (alpacaSnapshot) {
				const last = alpacaSnapshot.latestTrade?.price ?? 0;
				quotes[symbol] = {
					bid: alpacaSnapshot.latestQuote?.bidPrice ?? last,
					ask: alpacaSnapshot.latestQuote?.askPrice ?? last,
					bidSize: alpacaSnapshot.latestQuote?.bidSize ?? 0,
					askSize: alpacaSnapshot.latestQuote?.askSize ?? 0,
					timestamp: alpacaSnapshot.latestTrade?.timestamp
						? new Date(alpacaSnapshot.latestTrade.timestamp).getTime()
						: Date.now(),
				};
			} else {
				errors.push(`No snapshot data for ${symbol}`);
			}

			// Fetch historical bars
			try {
				const fromDate = from.toISOString().split("T")[0] ?? "";
				const toDate = to.toISOString().split("T")[0] ?? "";
				const bars = await client.getBars(symbol, "1Hour", fromDate, toDate, requiredBars);

				const symbolCandles: Candle[] = bars.map((bar) => ({
					timestamp: new Date(bar.timestamp).getTime(),
					open: bar.open,
					high: bar.high,
					low: bar.low,
					close: bar.close,
					volume: bar.volume,
				}));

				historicalCandles.set(symbol, symbolCandles);
				candles[symbol] = symbolCandles;
			} catch (error) {
				errors.push(`Failed to fetch bars for ${symbol}: ${formatError(error)}`);
			}
		}
	} catch (error) {
		errors.push(`Market data fetch error: ${formatError(error)}`);
	}

	return { candles, quotes, historicalCandles };
}

function classifySymbolRegime(
	symbolCandles: Candle[],
	warnings: string[],
): z.infer<typeof RegimeDataSchema> {
	const requiredCount = getRequiredCandleCount(DEFAULT_RULE_BASED_CONFIG);

	if (symbolCandles.length < requiredCount) {
		warnings.push(`Insufficient candles for regime: ${symbolCandles.length}/${requiredCount}`);
		return {
			regime: "RANGE_BOUND",
			confidence: 0.5,
			reasoning: "Insufficient data",
		};
	}

	try {
		const result = classifyRegime({ candles: symbolCandles }, DEFAULT_RULE_BASED_CONFIG);

		const regimeMap: Record<string, string> = {
			BULL_TREND: "BULL_TREND",
			BEAR_TREND: "BEAR_TREND",
			RANGE: "RANGE_BOUND",
			HIGH_VOL: "HIGH_VOL",
			LOW_VOL: "LOW_VOL",
		};

		return {
			regime: regimeMap[result.regime] ?? "RANGE_BOUND",
			confidence: result.confidence ?? 0.7,
			reasoning: result.reasoning,
		};
	} catch {
		return {
			regime: "RANGE_BOUND",
			confidence: 0.5,
			reasoning: "Classification error",
		};
	}
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
