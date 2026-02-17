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
	ConstraintsSchema,
	EnrichedPositionSchema,
	MarketSnapshotSchema,
	type QuoteDataSchema,
	RecentCloseSchema,
	RegimeDataSchema,
} from "../schemas.js";

// ============================================
// Schemas
// ============================================

const ObserveInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	instruments: z.array(z.string()).min(1).describe("Symbols to observe"),
	constraints: ConstraintsSchema.optional().describe(
		"Runtime constraints passed from workflow input",
	),
	recentCloses: z
		.array(RecentCloseSchema)
		.optional()
		.describe("Recently closed positions (cooldown prevention)"),
	positions: z
		.array(EnrichedPositionSchema)
		.optional()
		.describe("Current open positions with thesis context"),
});

const ObserveOutputSchema = z.object({
	cycleId: z.string(),
	marketSnapshot: MarketSnapshotSchema,
	regimeLabels: z.record(z.string(), RegimeDataSchema),
	constraints: ConstraintsSchema.optional(),
	recentCloses: z.array(RecentCloseSchema).optional(),
	positions: z.array(EnrichedPositionSchema).optional(),
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

interface MarketDataBundle {
	candles: Record<string, z.infer<typeof CandleDataSchema>[]>;
	quotes: Record<string, z.infer<typeof QuoteDataSchema>>;
	historicalCandles: Map<string, Candle[]>;
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
		const { cycleId, instruments, constraints, recentCloses, positions } = inputData;
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

		// Classify regime and fetch ATM IV in parallel
		const [regimeLabels, atmIVs] = await Promise.all([
			classifyAllRegimes(instruments, historicalCandles, warnings),
			fetchATMImpliedVolatility(instruments, quotes, warnings),
		]);

		const indicators: Record<string, number> = {};
		for (const [symbol, iv] of Object.entries(atmIVs)) {
			indicators[`${symbol}:atmIV`] = iv;
		}

		const marketSnapshot = {
			instruments,
			candles,
			quotes,
			...(Object.keys(indicators).length > 0 ? { indicators } : {}),
			timestamp: Date.now(),
		};

		return {
			cycleId,
			marketSnapshot,
			regimeLabels,
			constraints,
			recentCloses,
			positions,
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
): Promise<MarketDataBundle> {
	if (!isAlpacaConfigured()) {
		warnings.push("Alpaca not configured - using stub data");
		return buildStubMarketData(instruments);
	}

	try {
		return await fetchLiveMarketData(instruments, errors);
	} catch (error) {
		errors.push(`Market data fetch error: ${formatError(error)}`);
		return createEmptyMarketDataBundle();
	}
}

function createEmptyMarketDataBundle(): MarketDataBundle {
	return { candles: {}, quotes: {}, historicalCandles: new Map<string, Candle[]>() };
}

function buildStubMarketData(instruments: string[]): MarketDataBundle {
	const data = createEmptyMarketDataBundle();
	for (const symbol of instruments) {
		const stubPrice = 100 + Math.random() * 100;
		data.quotes[symbol] = {
			bid: stubPrice * 0.999,
			ask: stubPrice * 1.001,
			bidSize: 100,
			askSize: 100,
			timestamp: Date.now(),
		};
		const reversedCandles = generateStubCandles(stubPrice).toReversed();
		data.historicalCandles.set(symbol, reversedCandles);
		data.candles[symbol] = reversedCandles;
	}
	return data;
}

function generateStubCandles(stubPrice: number): Candle[] {
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
	return stubCandles;
}

async function fetchLiveMarketData(
	instruments: string[],
	errors: string[],
): Promise<MarketDataBundle> {
	const data = createEmptyMarketDataBundle();
	const client = createAlpacaClientFromEnv();
	const snapshots = await client.getSnapshots(instruments);
	const dateWindow = createBarsDateWindow();
	for (const symbol of instruments) {
		populateQuoteFromSnapshot(symbol, snapshots.get(symbol), data.quotes, errors);
		await fetchSymbolBars(symbol, client, dateWindow, data, errors);
	}
	return data;
}

function createBarsDateWindow(): { fromDate: string; toDate: string; requiredBars: number } {
	const requiredBars = getRequiredCandleCount(DEFAULT_RULE_BASED_CONFIG) + 10;
	const to = new Date();
	const from = new Date();
	from.setDate(from.getDate() - 90);
	return {
		fromDate: from.toISOString().split("T")[0] ?? "",
		toDate: to.toISOString().split("T")[0] ?? "",
		requiredBars,
	};
}

function populateQuoteFromSnapshot(
	symbol: string,
	snapshot:
		| {
				latestTrade?: { price?: number; timestamp?: string };
				latestQuote?: { bidPrice?: number; askPrice?: number; bidSize?: number; askSize?: number };
		  }
		| undefined,
	quotes: Record<string, z.infer<typeof QuoteDataSchema>>,
	errors: string[],
): void {
	if (!snapshot) {
		errors.push(`No snapshot data for ${symbol}`);
		return;
	}
	const last = snapshot.latestTrade?.price ?? 0;
	quotes[symbol] = {
		bid: snapshot.latestQuote?.bidPrice ?? last,
		ask: snapshot.latestQuote?.askPrice ?? last,
		bidSize: snapshot.latestQuote?.bidSize ?? 0,
		askSize: snapshot.latestQuote?.askSize ?? 0,
		timestamp: snapshot.latestTrade?.timestamp
			? new Date(snapshot.latestTrade.timestamp).getTime()
			: Date.now(),
	};
}

async function fetchSymbolBars(
	symbol: string,
	client: ReturnType<typeof createAlpacaClientFromEnv>,
	dateWindow: { fromDate: string; toDate: string; requiredBars: number },
	data: MarketDataBundle,
	errors: string[],
): Promise<void> {
	try {
		const bars = await client.getBars(
			symbol,
			"1Hour",
			dateWindow.fromDate,
			dateWindow.toDate,
			dateWindow.requiredBars,
		);
		const symbolCandles = bars.map((bar) => ({
			timestamp: new Date(bar.timestamp).getTime(),
			open: bar.open,
			high: bar.high,
			low: bar.low,
			close: bar.close,
			volume: bar.volume,
		}));
		data.historicalCandles.set(symbol, symbolCandles);
		data.candles[symbol] = symbolCandles;
	} catch (error) {
		errors.push(`Failed to fetch bars for ${symbol}: ${formatError(error)}`);
	}
}

async function classifyAllRegimes(
	instruments: string[],
	historicalCandles: Map<string, Candle[]>,
	warnings: string[],
): Promise<Record<string, z.infer<typeof RegimeDataSchema>>> {
	const regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>> = {};
	for (const symbol of instruments) {
		const symbolCandles = historicalCandles.get(symbol);
		if (symbolCandles && symbolCandles.length > 0) {
			regimeLabels[symbol] = classifySymbolRegime(symbolCandles, warnings);
		} else {
			regimeLabels[symbol] = {
				regime: "RANGE_BOUND",
				confidence: 0.5,
				reasoning: "Insufficient data for regime classification",
			};
		}
	}
	return regimeLabels;
}

async function fetchATMImpliedVolatility(
	instruments: string[],
	quotes: Record<string, z.infer<typeof QuoteDataSchema>>,
	warnings: string[],
): Promise<Record<string, number>> {
	const atmIVs: Record<string, number> = {};

	if (!isAlpacaConfigured()) {
		return atmIVs;
	}

	const client = createAlpacaClientFromEnv();

	const today = new Date();
	const minExp = new Date(today);
	minExp.setDate(minExp.getDate() + 30);
	const maxExp = new Date(today);
	maxExp.setDate(maxExp.getDate() + 45);

	const results = await Promise.allSettled(
		instruments.map(async (symbol) => {
			const quote = quotes[symbol];
			if (!quote) return { symbol, iv: undefined };

			const midPrice = (quote.bid + quote.ask) / 2;
			if (midPrice <= 0) return { symbol, iv: undefined };

			const contracts = await client.getOptionContracts(symbol, {
				expirationDateGte: minExp.toISOString().slice(0, 10),
				expirationDateLte: maxExp.toISOString().slice(0, 10),
				strikePriceGte: midPrice * 0.95,
				strikePriceLte: midPrice * 1.05,
				limit: 20,
			});

			if (contracts.length === 0) return { symbol, iv: undefined };

			const contractSymbols = contracts.map((c) => c.symbol);
			const snapshots = await client.getOptionSnapshots(contractSymbols);

			const ivValues: number[] = [];
			for (const [, snap] of snapshots) {
				if (snap.impliedVolatility != null && snap.impliedVolatility > 0) {
					ivValues.push(snap.impliedVolatility);
				}
			}

			if (ivValues.length === 0) return { symbol, iv: undefined };

			const avgIV = ivValues.reduce((sum, v) => sum + v, 0) / ivValues.length;
			return { symbol, iv: avgIV };
		}),
	);

	for (const result of results) {
		if (result.status === "fulfilled" && result.value.iv != null) {
			atmIVs[result.value.symbol] = result.value.iv;
		} else if (result.status === "rejected") {
			warnings.push(`ATM IV fetch failed: ${formatError(result.reason)}`);
		}
	}

	return atmIVs;
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
