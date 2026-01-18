/**
 * OHLCV Candle Test Fixtures
 *
 * Deterministic, realistic candlestick data for testing technical indicators
 * and regime classification. Data patterns simulate realistic market behavior
 * including trends, mean reversion, and volatility changes.
 *
 * Note: These are static fixtures used in test mode to ensure
 * deterministic test behavior.
 */

import type { Candle } from "@cream/indicators";
import { FIXTURE_TIMESTAMP } from "./snapshot.fixture";

/**
 * Hour in milliseconds for timestamp calculations.
 */
const HOUR_MS = 60 * 60 * 1000;

/**
 * Pre-generated SPY candle data representing a mild uptrend with normal volatility.
 * 120 hourly candles to support 100-period indicators with buffer.
 */
export const SPY_CANDLES: Candle[] = generateTrendingCandles({
	symbol: "SPY",
	count: 120,
	startPrice: 465.0,
	endPrice: 477.82, // Matches snapshot fixture
	avgVolume: 52_000_000,
	volatility: 0.008,
	endTimestamp: FIXTURE_TIMESTAMP,
});

/**
 * QQQ candles - similar uptrend to SPY (correlated).
 */
export const QQQ_CANDLES: Candle[] = generateTrendingCandles({
	symbol: "QQQ",
	count: 120,
	startPrice: 395.0,
	endPrice: 407.65,
	avgVolume: 38_000_000,
	volatility: 0.01,
	endTimestamp: FIXTURE_TIMESTAMP,
});

/**
 * AAPL candles - moderate uptrend with slightly higher volatility.
 */
export const AAPL_CANDLES: Candle[] = generateTrendingCandles({
	symbol: "AAPL",
	count: 120,
	startPrice: 178.5,
	endPrice: 186.95,
	avgVolume: 45_000_000,
	volatility: 0.012,
	endTimestamp: FIXTURE_TIMESTAMP,
});

/**
 * MSFT candles - steady uptrend with low volatility.
 */
export const MSFT_CANDLES: Candle[] = generateTrendingCandles({
	symbol: "MSFT",
	count: 120,
	startPrice: 370.0,
	endPrice: 381.45,
	avgVolume: 18_000_000,
	volatility: 0.008,
	endTimestamp: FIXTURE_TIMESTAMP,
});

/**
 * GOOGL candles - moderate uptrend.
 */
export const GOOGL_CANDLES: Candle[] = generateTrendingCandles({
	symbol: "GOOGL",
	count: 120,
	startPrice: 138.0,
	endPrice: 143.75,
	avgVolume: 22_000_000,
	volatility: 0.01,
	endTimestamp: FIXTURE_TIMESTAMP,
});

/**
 * AMZN candles - uptrend with moderate volatility.
 */
export const AMZN_CANDLES: Candle[] = generateTrendingCandles({
	symbol: "AMZN",
	count: 120,
	startPrice: 172.0,
	endPrice: 180.25,
	avgVolume: 35_000_000,
	volatility: 0.011,
	endTimestamp: FIXTURE_TIMESTAMP,
});

/**
 * NVDA candles - strong uptrend with higher volatility.
 */
export const NVDA_CANDLES: Candle[] = generateTrendingCandles({
	symbol: "NVDA",
	count: 120,
	startPrice: 460.0,
	endPrice: 490.65,
	avgVolume: 42_000_000,
	volatility: 0.018,
	endTimestamp: FIXTURE_TIMESTAMP,
});

/**
 * TSLA candles - high volatility with trend.
 */
export const TSLA_CANDLES: Candle[] = generateTrendingCandles({
	symbol: "TSLA",
	count: 120,
	startPrice: 235.0,
	endPrice: 252.45,
	avgVolume: 98_000_000,
	volatility: 0.025,
	endTimestamp: FIXTURE_TIMESTAMP,
});

/**
 * JPM candles - financial sector, moderate trend.
 */
export const JPM_CANDLES: Candle[] = generateTrendingCandles({
	symbol: "JPM",
	count: 120,
	startPrice: 190.0,
	endPrice: 197.25,
	avgVolume: 8_000_000,
	volatility: 0.009,
	endTimestamp: FIXTURE_TIMESTAMP,
});

/**
 * JNJ candles - defensive, low volatility.
 */
export const JNJ_CANDLES: Candle[] = generateTrendingCandles({
	symbol: "JNJ",
	count: 120,
	startPrice: 154.0,
	endPrice: 157.1,
	avgVolume: 6_000_000,
	volatility: 0.006,
	endTimestamp: FIXTURE_TIMESTAMP,
});

/**
 * Pre-built candle map for quick lookup.
 */
const CANDLE_FIXTURES: Record<string, Candle[]> = {
	SPY: SPY_CANDLES,
	QQQ: QQQ_CANDLES,
	AAPL: AAPL_CANDLES,
	MSFT: MSFT_CANDLES,
	GOOGL: GOOGL_CANDLES,
	AMZN: AMZN_CANDLES,
	NVDA: NVDA_CANDLES,
	TSLA: TSLA_CANDLES,
	JPM: JPM_CANDLES,
	JNJ: JNJ_CANDLES,
};

/**
 * Configuration for generating trending candles.
 */
interface TrendingCandleConfig {
	symbol: string;
	count: number;
	startPrice: number;
	endPrice: number;
	avgVolume: number;
	volatility: number;
	endTimestamp: number;
}

/**
 * Generate deterministic trending candle data.
 *
 * Uses a seeded approach based on price levels to create realistic
 * price movement without using Math.random().
 */
function generateTrendingCandles(config: TrendingCandleConfig): Candle[] {
	const { count, startPrice, endPrice, avgVolume, volatility, endTimestamp } = config;

	const candles: Candle[] = [];
	const priceStep = (endPrice - startPrice) / count;

	// Generate candles from oldest to newest
	for (let i = 0; i < count; i++) {
		const timestamp = endTimestamp - (count - 1 - i) * HOUR_MS;

		// Base price follows the trend
		const trendPrice = startPrice + priceStep * i;

		// Add deterministic "noise" based on position in series
		// This creates realistic-looking wiggles without randomness
		const noise =
			Math.sin(i * 0.5) * volatility * trendPrice +
			Math.cos(i * 0.3) * volatility * trendPrice * 0.5;

		const adjustedPrice = trendPrice + noise;

		// Generate OHLC based on position in the trend
		const open = adjustedPrice;
		const close = adjustedPrice + priceStep + Math.sin(i * 0.7) * volatility * trendPrice;

		// High and low extend beyond open/close based on volatility
		const range = Math.abs(close - open);
		const highExtension = volatility * trendPrice * (0.5 + Math.sin(i * 0.4) * 0.3);
		const lowExtension = volatility * trendPrice * (0.5 + Math.cos(i * 0.4) * 0.3);

		const high = Math.max(open, close) + highExtension + range * 0.2;
		const low = Math.min(open, close) - lowExtension - range * 0.2;

		// Volume varies in a deterministic pattern
		const volumeVariation = 1 + Math.sin(i * 0.6) * 0.3 + Math.cos(i * 0.2) * 0.2;
		const volume = Math.round(avgVolume * volumeVariation);

		candles.push({
			timestamp,
			open: Number(open.toFixed(2)),
			high: Number(high.toFixed(2)),
			low: Number(low.toFixed(2)),
			close: Number(close.toFixed(2)),
			volume,
		});
	}

	// Ensure the last candle's close matches the expected end price
	const lastCandle = candles[candles.length - 1];
	if (lastCandle) {
		lastCandle.close = endPrice;
	}

	return candles;
}

/**
 * Get candle fixtures for a symbol.
 * Returns a copy to prevent mutation of the original fixture.
 *
 * @param symbol - The ticker symbol
 * @param count - Number of candles to return (optional, defaults to all)
 * @returns Array of Candle fixtures
 */
export function getCandleFixtures(symbol: string, count?: number): Candle[] {
	const fixture = CANDLE_FIXTURES[symbol];

	if (fixture) {
		const candles = count ? fixture.slice(-count) : fixture;
		// Return a deep copy to prevent mutation
		return JSON.parse(JSON.stringify(candles)) as Candle[];
	}

	// Generate deterministic default candles for unknown symbols
	return generateDefaultCandles(symbol, count ?? 120);
}

/**
 * Generate deterministic default candles for unknown symbols.
 */
function generateDefaultCandles(symbol: string, count: number): Candle[] {
	// Simple hash function for deterministic values
	const hash = symbol.split("").reduce((acc, char) => {
		return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
	}, 0);

	// Generate base price and trend based on hash
	const basePrice = 50 + Math.abs(hash % 250);
	const trendDirection = hash % 2 === 0 ? 1 : -1;
	const trendMagnitude = 0.05 + Math.abs(hash % 50) / 1000;
	const volatility = 0.01 + Math.abs(hash % 30) / 1000;
	const avgVolume = 1_000_000 + Math.abs(hash % 10_000_000);

	const endPrice = basePrice * (1 + trendDirection * trendMagnitude);

	return generateTrendingCandles({
		symbol,
		count,
		startPrice: basePrice,
		endPrice,
		avgVolume,
		volatility,
		endTimestamp: FIXTURE_TIMESTAMP,
	});
}

/**
 * Get candle fixtures for multiple symbols.
 *
 * @param symbols - Array of ticker symbols
 * @param count - Number of candles per symbol (optional)
 * @returns Map of symbol to Candle array
 */
export function getCandleFixturesMap(symbols: string[], count?: number): Map<string, Candle[]> {
	const candleMap = new Map<string, Candle[]>();
	for (const symbol of symbols) {
		candleMap.set(symbol, getCandleFixtures(symbol, count));
	}
	return candleMap;
}
