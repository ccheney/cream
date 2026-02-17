import type { Timeframe } from "../ingestion/candleIngestion";
import type { Candle } from "./gaps";

export function createCandle(
	timestamp: string,
	close: number,
	volume = 1000000,
	overrides: Partial<Candle> = {},
): Candle {
	return {
		symbol: "AAPL",
		timeframe: "1h" as Timeframe,
		timestamp,
		open: close * 0.99,
		high: close * 1.01,
		low: close * 0.98,
		close,
		volume,
		...overrides,
	};
}

export function createCandleSeries(
	count: number,
	startPrice = 100,
	intervalMs = 3600000,
): Candle[] {
	const candles: Candle[] = [];
	const baseTime = Date.now() - count * intervalMs;

	for (let i = 0; i < count; i++) {
		const variation = Math.sin(i * 0.5) * 2;
		const price = startPrice + variation;
		candles.push(
			createCandle(
				new Date(baseTime + i * intervalMs).toISOString(),
				price,
				1000000 + (i % 10) * 10000,
			),
		);
	}

	return candles;
}
