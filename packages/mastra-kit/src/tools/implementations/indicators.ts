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
      const rsiResults = calculateRSI(candles, { period });
      for (const r of rsiResults) {
        results.push({ value: r.rsi, timestamp: r.timestamp });
      }
      break;
    }
    case "SMA": {
      const period = params.period ?? 20;
      const smaResults = calculateSMA(candles, { period });
      for (const r of smaResults) {
        results.push({ value: r.ma, timestamp: r.timestamp });
      }
      break;
    }
    case "EMA": {
      const period = params.period ?? 20;
      const emaResults = calculateEMA(candles, { period });
      for (const r of emaResults) {
        results.push({ value: r.ma, timestamp: r.timestamp });
      }
      break;
    }
    case "ATR": {
      const period = params.period ?? 14;
      const atrResults = calculateATR(candles, { period });
      for (const r of atrResults) {
        results.push({ value: r.atr, timestamp: r.timestamp });
      }
      break;
    }
    case "BOLLINGER": {
      const period = params.period ?? 20;
      const stdDev = params.stdDev ?? 2.0;
      const bbResults = calculateBollingerBands(candles, { period, stdDev });
      // Return middle band as the primary value
      for (const r of bbResults) {
        results.push({ value: r.middle, timestamp: r.timestamp });
      }
      break;
    }
    case "STOCHASTIC": {
      const kPeriod = params.kPeriod ?? 14;
      const dPeriod = params.dPeriod ?? 3;
      const stochResults = calculateStochastic(candles, { kPeriod, dPeriod, slow: true });
      // Return %K as the primary value
      for (const r of stochResults) {
        results.push({ value: r.k, timestamp: r.timestamp });
      }
      break;
    }
    case "VOLUME_SMA": {
      const period = params.period ?? 20;
      const volResults = calculateVolumeSMA(candles, { period });
      for (const r of volResults) {
        results.push({ value: r.volumeSma, timestamp: r.timestamp });
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
