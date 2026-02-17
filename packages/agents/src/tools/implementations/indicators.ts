/**
 * Indicators Tool
 *
 * Calculate technical indicators using gRPC MarketDataService for bars
 * and @cream/indicators for calculations.
 */

import { timestampDate } from "@bufbuild/protobuf/wkt";
import { type ExecutionContext, isTest } from "@cream/domain";
import {
	type Candle,
	calculateATR,
	calculateBollingerBands,
	calculateEMA,
	calculateRSI,
	calculateSMA,
	calculateStochastic,
	calculateVolumeSMA,
} from "@cream/indicators";
import type { Bar, SymbolSnapshot } from "@cream/schema-gen/cream/v1/market_snapshot";
import { getMarketDataClient } from "../clients.js";
import type { IndicatorResult } from "../types.js";

/**
 * Supported indicator types for recalcIndicator tool
 */
type SupportedIndicator = "RSI" | "SMA" | "EMA" | "ATR" | "BOLLINGER" | "STOCHASTIC" | "VOLUME_SMA";

type IndicatorCalculation = { value: number; timestamp: number } | null;
type IndicatorCalculator = (
	candles: Candle[],
	params: Record<string, number>,
) => IndicatorCalculation;

const SUPPORTED_INDICATORS: SupportedIndicator[] = [
	"RSI",
	"SMA",
	"EMA",
	"ATR",
	"BOLLINGER",
	"STOCHASTIC",
	"VOLUME_SMA",
];

function getLastCandleTimestamp(candles: Candle[]): number | null {
	return candles.at(-1)?.timestamp ?? null;
}

function toPointWithLastTimestamp(candles: Candle[], value: number | null): IndicatorCalculation {
	const timestamp = getLastCandleTimestamp(candles);
	if (value === null || timestamp === null) {
		return null;
	}
	return { value, timestamp };
}

function calculateRsi(candles: Candle[], params: Record<string, number>): IndicatorCalculation {
	const period = params.period ?? 14;
	const result = calculateRSI(candles, period);
	return result ? { value: result.rsi, timestamp: result.timestamp } : null;
}

function calculateSma(candles: Candle[], params: Record<string, number>): IndicatorCalculation {
	return toPointWithLastTimestamp(candles, calculateSMA(candles, params.period ?? 20));
}

function calculateEma(candles: Candle[], params: Record<string, number>): IndicatorCalculation {
	const period = params.period ?? 20;
	const result = calculateEMA(candles, period);
	return result ? { value: result.ema, timestamp: result.timestamp } : null;
}

function calculateAtr(candles: Candle[], params: Record<string, number>): IndicatorCalculation {
	return toPointWithLastTimestamp(candles, calculateATR(candles, params.period ?? 14));
}

function calculateBollinger(
	candles: Candle[],
	params: Record<string, number>,
): IndicatorCalculation {
	const period = params.period ?? 20;
	const multiplier = params.stdDev ?? 2.0;
	const result = calculateBollingerBands(candles, period, multiplier);
	return result ? { value: result.middle, timestamp: result.timestamp } : null;
}

function calculateStochasticIndicator(
	candles: Candle[],
	params: Record<string, number>,
): IndicatorCalculation {
	const result = calculateStochastic(candles, {
		kPeriod: params.kPeriod ?? 14,
		dPeriod: params.dPeriod ?? 3,
	});
	return result ? { value: result.k, timestamp: result.timestamp } : null;
}

function calculateVolumeSma(
	candles: Candle[],
	params: Record<string, number>,
): IndicatorCalculation {
	const result = calculateVolumeSMA(candles, { period: params.period ?? 20 });
	return result ? { value: result.volumeSma, timestamp: result.timestamp } : null;
}

const INDICATOR_CALCULATORS: Record<SupportedIndicator, IndicatorCalculator> = {
	RSI: calculateRsi,
	SMA: calculateSma,
	EMA: calculateEma,
	ATR: calculateAtr,
	BOLLINGER: calculateBollinger,
	STOCHASTIC: calculateStochasticIndicator,
	VOLUME_SMA: calculateVolumeSma,
};

function normalizeIndicator(indicator: string): SupportedIndicator {
	const normalized = indicator.toUpperCase() as SupportedIndicator;
	if (!SUPPORTED_INDICATORS.includes(normalized)) {
		throw new Error(
			`Unsupported indicator: ${indicator}. Supported: ${SUPPORTED_INDICATORS.join(", ")}`,
		);
	}
	return normalized;
}

function toCandle(bar: Bar): Candle {
	return {
		timestamp: bar.timestamp ? timestampDate(bar.timestamp).getTime() : Date.now(),
		open: bar.open,
		high: bar.high,
		low: bar.low,
		close: bar.close,
		volume: Number(bar.volume),
	};
}

async function fetchCandlesForSymbol(symbol: string, timeframe: number): Promise<Candle[]> {
	const client = getMarketDataClient();
	const response = await client.getSnapshot({
		symbols: [symbol],
		includeBars: true,
		barTimeframes: [timeframe],
	});
	const symbolSnapshot = response.data.snapshot?.symbols?.find(
		(snapshot: SymbolSnapshot) => snapshot.symbol === symbol,
	);
	const bars = symbolSnapshot?.bars ?? [];
	if (bars.length === 0) {
		throw new Error(`No bars found for symbol: ${symbol}`);
	}

	const candles = bars.map(toCandle);
	candles.sort((a, b) => a.timestamp - b.timestamp);
	return candles;
}

/**
 * Calculate a specific indicator from candle data
 */
function calculateIndicatorFromCandles(
	indicator: SupportedIndicator,
	candles: Candle[],
	params: Record<string, number>,
): { values: number[]; timestamps: number[] } {
	const calculation = INDICATOR_CALCULATORS[indicator](candles, params);
	if (!calculation) {
		return { values: [], timestamps: [] };
	}

	return { values: [calculation.value], timestamps: [calculation.timestamp] };
}

/**
 * Recalculate a technical indicator
 *
 * Uses gRPC MarketDataService to fetch bars, then calculates indicator
 * using the @cream/indicators package.
 *
 * @param ctx - ExecutionContext
 * @param indicator - Indicator name (RSI, ATR, SMA, EMA, BOLLINGER, STOCHASTIC, VOLUME_SMA)
 * @param symbol - Instrument symbol
 * @param params - Indicator parameters (period, etc.)
 * @returns Indicator values with timestamps
 * @throws Error if indicator not supported, no bars found, or gRPC fails
 */
export async function recalcIndicator(
	ctx: ExecutionContext,
	indicator: string,
	symbol: string,
	params: Record<string, number> = {},
): Promise<IndicatorResult> {
	if (isTest(ctx)) {
		throw new Error("recalcIndicator is not available in test mode");
	}

	const normalizedIndicator = normalizeIndicator(indicator);
	const timeframe = params.timeframe ?? 60;
	const candles = await fetchCandlesForSymbol(symbol, timeframe);
	const result = calculateIndicatorFromCandles(normalizedIndicator, candles, params);

	return {
		indicator: normalizedIndicator,
		symbol,
		values: result.values,
		timestamps: result.timestamps.map((ts) => new Date(ts).toISOString()),
	};
}
