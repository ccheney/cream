/**
 * Indicators Tool
 *
 * Calculate technical indicators using gRPC MarketDataService for bars
 * and @cream/indicators for calculations.
 */

import { timestampDate } from "@bufbuild/protobuf/wkt";
import { type ExecutionContext, isBacktest } from "@cream/domain";
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
import { getMarketDataClient } from "../clients.js";
import type { IndicatorResult } from "../types.js";

/**
 * Supported indicator types for recalcIndicator tool
 */
type SupportedIndicator = "RSI" | "SMA" | "EMA" | "ATR" | "BOLLINGER" | "STOCHASTIC" | "VOLUME_SMA";

/**
 * Calculate a specific indicator from candle data
 */
function calculateIndicatorFromCandles(
	indicator: SupportedIndicator,
	candles: Candle[],
	params: Record<string, number>
): { values: number[]; timestamps: number[] } {
	const results: { value: number; timestamp: number }[] = [];

	switch (indicator) {
		case "RSI": {
			const period = params.period ?? 14;
			// calculateRSI returns RSIResult | null for single value, use calculateRSISeries for array
			const rsiResult = calculateRSI(candles, period);
			if (rsiResult) {
				results.push({ value: rsiResult.rsi, timestamp: rsiResult.timestamp });
			}
			break;
		}
		case "SMA": {
			const period = params.period ?? 20;
			// calculateSMA returns number | null, not an array
			const smaValue = calculateSMA(candles, period);
			if (smaValue !== null && candles.length > 0) {
				const lastBar = candles[candles.length - 1];
				if (lastBar) {
					results.push({ value: smaValue, timestamp: lastBar.timestamp });
				}
			}
			break;
		}
		case "EMA": {
			const period = params.period ?? 20;
			// calculateEMA returns EMAResult | null (uses .ema not .ma)
			const emaResult = calculateEMA(candles, period);
			if (emaResult) {
				results.push({ value: emaResult.ema, timestamp: emaResult.timestamp });
			}
			break;
		}
		case "ATR": {
			const period = params.period ?? 14;
			// calculateATR returns number | null, not ATRResult
			const atrValue = calculateATR(candles, period);
			if (atrValue !== null && candles.length > 0) {
				const lastBar = candles[candles.length - 1];
				if (lastBar) {
					results.push({ value: atrValue, timestamp: lastBar.timestamp });
				}
			}
			break;
		}
		case "BOLLINGER": {
			const period = params.period ?? 20;
			const multiplier = params.stdDev ?? 2.0;
			// calculateBollingerBands takes (bars, period, multiplier)
			const bbResult = calculateBollingerBands(candles, period, multiplier);
			if (bbResult) {
				results.push({ value: bbResult.middle, timestamp: bbResult.timestamp });
			}
			break;
		}
		case "STOCHASTIC": {
			const kPeriod = params.kPeriod ?? 14;
			const dPeriod = params.dPeriod ?? 3;
			// calculateStochastic takes settings object
			const stochResult = calculateStochastic(candles, { kPeriod, dPeriod });
			if (stochResult) {
				results.push({ value: stochResult.k, timestamp: stochResult.timestamp });
			}
			break;
		}
		case "VOLUME_SMA": {
			const period = params.period ?? 20;
			// calculateVolumeSMA takes config object
			const volResult = calculateVolumeSMA(candles, { period });
			if (volResult) {
				results.push({ value: volResult.volumeSma, timestamp: volResult.timestamp });
			}
			break;
		}
	}

	return {
		values: results.map((r) => r.value),
		timestamps: results.map((r) => r.timestamp),
	};
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
	params: Record<string, number> = {}
): Promise<IndicatorResult> {
	if (isBacktest(ctx)) {
		throw new Error("recalcIndicator is not available in BACKTEST mode");
	}

	// Validate indicator name
	const normalizedIndicator = indicator.toUpperCase() as SupportedIndicator;
	const supportedIndicators: SupportedIndicator[] = [
		"RSI",
		"SMA",
		"EMA",
		"ATR",
		"BOLLINGER",
		"STOCHASTIC",
		"VOLUME_SMA",
	];

	if (!supportedIndicators.includes(normalizedIndicator)) {
		throw new Error(
			`Unsupported indicator: ${indicator}. Supported: ${supportedIndicators.join(", ")}`
		);
	}

	const client = getMarketDataClient();

	// Fetch bars from MarketDataService
	// Request 1-hour bars (timeframe 60) for the symbol
	const timeframe = params.timeframe ?? 60;
	const response = await client.getSnapshot({
		symbols: [symbol],
		includeBars: true,
		barTimeframes: [timeframe],
	});

	// Extract bars and convert to Candle format
	const symbolSnapshot = response.data.snapshot?.symbols?.find((s) => s.symbol === symbol);
	const bars = symbolSnapshot?.bars ?? [];

	if (bars.length === 0) {
		throw new Error(`No bars found for symbol: ${symbol}`);
	}

	// Convert protobuf bars to Candle format
	const candles: Candle[] = bars.map((bar) => ({
		timestamp: bar.timestamp ? timestampDate(bar.timestamp).getTime() : Date.now(),
		open: bar.open,
		high: bar.high,
		low: bar.low,
		close: bar.close,
		volume: Number(bar.volume),
	}));

	// Sort by timestamp (oldest first)
	candles.sort((a, b) => a.timestamp - b.timestamp);

	// Calculate the indicator
	const result = calculateIndicatorFromCandles(normalizedIndicator, candles, params);

	return {
		indicator: normalizedIndicator,
		symbol,
		values: result.values,
		timestamps: result.timestamps.map((ts) => new Date(ts).toISOString()),
	};
}
