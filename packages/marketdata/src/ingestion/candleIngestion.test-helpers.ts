import { mock } from "bun:test";
import type { AlpacaBar, AlpacaMarketDataClient } from "../providers/alpaca";
import type { Candle, CandleStorage, Timeframe } from "./candleIngestion";

export const mockBars: AlpacaBar[] = [
	{
		symbol: "AAPL",
		open: 150,
		high: 152,
		low: 149,
		close: 151,
		volume: 1000000,
		vwap: 150.5,
		timestamp: "2024-01-01T09:00:00Z",
		tradeCount: 5000,
	},
	{
		symbol: "AAPL",
		open: 151,
		high: 153,
		low: 150,
		close: 152,
		volume: 1100000,
		vwap: 151.5,
		timestamp: "2024-01-01T10:00:00Z",
		tradeCount: 5500,
	},
	{
		symbol: "AAPL",
		open: 152,
		high: 154,
		low: 151,
		close: 153,
		volume: 1200000,
		vwap: 152.5,
		timestamp: "2024-01-01T11:00:00Z",
		tradeCount: 6000,
	},
	{
		symbol: "AAPL",
		open: 153,
		high: 155,
		low: 152,
		close: 154,
		volume: 1300000,
		vwap: 153.5,
		timestamp: "2024-01-01T12:00:00Z",
		tradeCount: 6500,
	},
	{
		symbol: "AAPL",
		open: 154,
		high: 156,
		low: 153,
		close: 155,
		volume: 1400000,
		vwap: 154.5,
		timestamp: "2024-01-01T13:00:00Z",
		tradeCount: 7000,
	},
];

export function createMockAlpacaClient(): AlpacaMarketDataClient {
	return {
		getBars: mock(() => Promise.resolve(mockBars)),
		getQuotes: mock(() => Promise.resolve(new Map())),
		getQuote: mock(() => Promise.resolve(null)),
		getSnapshots: mock(() => Promise.resolve(new Map())),
		getLatestTrades: mock(() => Promise.resolve(new Map())),
		getOptionContracts: mock(() => Promise.resolve([])),
		getOptionSnapshots: mock(() => Promise.resolve(new Map())),
		getOptionExpirations: mock(() => Promise.resolve([])),
		getStockSplits: mock(() => Promise.resolve([])),
		getDividends: mock(() => Promise.resolve([])),
	} as unknown as AlpacaMarketDataClient;
}

export function createMockStorage(): CandleStorage & { candles: Candle[] } {
	const candles: Candle[] = [];
	return {
		candles,
		upsert: mock(async (candle: Candle) => {
			candles.push(candle);
		}),
		bulkUpsert: mock(async (newCandles: Candle[]) => {
			candles.push(...newCandles);
			return newCandles.length;
		}),
		getLastCandle: mock(async (symbol: string, timeframe: Timeframe) => {
			const matching = candles.filter((c) => c.symbol === symbol && c.timeframe === timeframe);
			if (matching.length === 0) {
				return null;
			}
			const sorted = matching.sort(
				(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
			);
			return sorted[0] ?? null;
		}),
	};
}
