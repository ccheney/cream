/**
 * Candle Ingestion Service Tests
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { AlpacaBar, AlpacaMarketDataClient } from "../providers/alpaca";
import {
	aggregateCandles,
	type Candle,
	CandleIngestionService,
	type CandleStorage,
	checkStaleness,
	type Timeframe,
} from "./candleIngestion";

// ============================================
// Mock Data
// ============================================

const mockBars: AlpacaBar[] = [
	{
		symbol: "AAPL",
		open: 150.0,
		high: 152.0,
		low: 149.0,
		close: 151.0,
		volume: 1000000,
		vwap: 150.5,
		timestamp: "2024-01-01T09:00:00Z",
		tradeCount: 5000,
	},
	{
		symbol: "AAPL",
		open: 151.0,
		high: 153.0,
		low: 150.0,
		close: 152.0,
		volume: 1100000,
		vwap: 151.5,
		timestamp: "2024-01-01T10:00:00Z",
		tradeCount: 5500,
	},
	{
		symbol: "AAPL",
		open: 152.0,
		high: 154.0,
		low: 151.0,
		close: 153.0,
		volume: 1200000,
		vwap: 152.5,
		timestamp: "2024-01-01T11:00:00Z",
		tradeCount: 6000,
	},
	{
		symbol: "AAPL",
		open: 153.0,
		high: 155.0,
		low: 152.0,
		close: 154.0,
		volume: 1300000,
		vwap: 153.5,
		timestamp: "2024-01-01T12:00:00Z",
		tradeCount: 6500,
	},
	{
		symbol: "AAPL",
		open: 154.0,
		high: 156.0,
		low: 153.0,
		close: 155.0,
		volume: 1400000,
		vwap: 154.5,
		timestamp: "2024-01-01T13:00:00Z",
		tradeCount: 7000,
	},
];

function createMockAlpacaClient(): AlpacaMarketDataClient {
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

function createMockStorage(): CandleStorage & { candles: Candle[] } {
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
			return matching.sort(
				(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
			)[0]!;
		}),
	};
}

// ============================================
// CandleIngestionService Tests
// ============================================

describe("CandleIngestionService", () => {
	let alpacaClient: AlpacaMarketDataClient;
	let storage: CandleStorage & { candles: Candle[] };
	let service: CandleIngestionService;

	beforeEach(() => {
		alpacaClient = createMockAlpacaClient();
		storage = createMockStorage();
		service = new CandleIngestionService(alpacaClient, storage);
	});

	describe("ingestSymbol", () => {
		it("fetches and stores candles for a symbol", async () => {
			const result = await service.ingestSymbol("AAPL", {
				from: "2024-01-01",
				to: "2024-01-05",
				timeframe: "1h",
			});

			expect(result.symbol).toBe("AAPL");
			expect(result.timeframe).toBe("1h");
			expect(result.candlesFetched).toBe(5);
			expect(result.candlesStored).toBe(5);
			expect(result.errors).toHaveLength(0);
			expect(result.durationMs).toBeGreaterThanOrEqual(0);
		});

		it("converts Alpaca bars to candle format correctly", async () => {
			await service.ingestSymbol("AAPL", {
				from: "2024-01-01",
				to: "2024-01-05",
				timeframe: "1h",
			});

			expect(storage.candles).toHaveLength(5);
			const firstCandle = storage.candles[0]!;
			expect(firstCandle.symbol).toBe("AAPL");
			expect(firstCandle.timeframe).toBe("1h");
			expect(firstCandle.open).toBe(150.0);
			expect(firstCandle.high).toBe(152.0);
			expect(firstCandle.low).toBe(149.0);
			expect(firstCandle.close).toBe(151.0);
			expect(firstCandle.volume).toBe(1000000);
			expect(firstCandle.vwap).toBe(150.5);
			expect(firstCandle.tradeCount).toBe(5000);
			expect(firstCandle.adjusted).toBe(true);
		});

		it("handles empty results", async () => {
			const emptyClient = {
				...alpacaClient,
				getBars: mock(() => Promise.resolve([])),
			} as unknown as AlpacaMarketDataClient;

			const svc = new CandleIngestionService(emptyClient, storage);
			const result = await svc.ingestSymbol("UNKNOWN", {
				from: "2024-01-01",
				to: "2024-01-05",
				timeframe: "1h",
			});

			expect(result.candlesFetched).toBe(0);
			expect(result.candlesStored).toBe(0);
			expect(result.errors).toContain("No candles returned for UNKNOWN");
		});

		it("handles API errors gracefully", async () => {
			const errorClient = {
				...alpacaClient,
				getBars: mock(() => Promise.reject(new Error("API rate limit exceeded"))),
			} as unknown as AlpacaMarketDataClient;

			const svc = new CandleIngestionService(errorClient, storage);
			const result = await svc.ingestSymbol("AAPL", {
				from: "2024-01-01",
				to: "2024-01-05",
				timeframe: "1h",
			});

			expect(result.errors).toContain("API rate limit exceeded");
		});
	});

	describe("ingestUniverse", () => {
		it("ingests multiple symbols", async () => {
			const results = await service.ingestUniverse(["AAPL", "MSFT", "GOOGL"], {
				from: "2024-01-01",
				to: "2024-01-05",
				timeframe: "1h",
			});

			expect(results.size).toBe(3);
			expect(results.get("AAPL")?.candlesFetched).toBe(5);
			expect(results.get("MSFT")?.candlesFetched).toBe(5);
			expect(results.get("GOOGL")?.candlesFetched).toBe(5);
		});
	});

	describe("incrementalUpdate", () => {
		it("fetches from last candle date", async () => {
			// Add existing candle
			storage.candles.push({
				symbol: "AAPL",
				timeframe: "1h",
				timestamp: "2024-01-03T12:00:00.000Z",
				open: 150,
				high: 152,
				low: 149,
				close: 151,
				volume: 1000000,
				vwap: 150.5,
				tradeCount: 5000,
				adjusted: true,
			});

			const result = await service.incrementalUpdate("AAPL", "1h");

			expect(result.symbol).toBe("AAPL");
			expect(alpacaClient.getBars).toHaveBeenCalled();
		});

		it("backfills 30 days if no existing data", async () => {
			const result = await service.incrementalUpdate("NEW", "1h");

			expect(result.symbol).toBe("NEW");
			expect(alpacaClient.getBars).toHaveBeenCalled();
		});
	});
});

// ============================================
// Staleness Detection Tests
// ============================================

describe("checkStaleness", () => {
	it("returns stale for null candle", () => {
		const result = checkStaleness(null, "1h");

		expect(result.isStale).toBe(true);
		expect(result.staleMinutes).toBe(Infinity);
		expect(result.lastTimestamp).toBeNull();
	});

	it("returns not stale for recent candle", () => {
		const recentCandle: Candle = {
			symbol: "AAPL",
			timeframe: "1h",
			timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
			open: 150,
			high: 152,
			low: 149,
			close: 151,
			volume: 1000000,
			vwap: 150.5,
			tradeCount: 5000,
			adjusted: true,
		};

		const result = checkStaleness(recentCandle, "1h");

		expect(result.isStale).toBe(false);
		expect(result.staleMinutes).toBeLessThan(120);
	});

	it("returns stale for old candle", () => {
		const oldCandle: Candle = {
			symbol: "AAPL",
			timeframe: "1h",
			timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
			open: 150,
			high: 152,
			low: 149,
			close: 151,
			volume: 1000000,
			vwap: 150.5,
			tradeCount: 5000,
			adjusted: true,
		};

		const result = checkStaleness(oldCandle, "1h");

		expect(result.isStale).toBe(true);
		expect(result.staleMinutes).toBeGreaterThan(120);
	});
});

// ============================================
// Aggregation Tests
// ============================================

describe("aggregateCandles", () => {
	const hourlyCandles: Candle[] = [
		{
			symbol: "AAPL",
			timeframe: "1h",
			timestamp: "2024-01-01T09:00:00.000Z",
			open: 150,
			high: 152,
			low: 149,
			close: 151,
			volume: 1000000,
			vwap: 150.5,
			tradeCount: 5000,
			adjusted: true,
		},
		{
			symbol: "AAPL",
			timeframe: "1h",
			timestamp: "2024-01-01T10:00:00.000Z",
			open: 151,
			high: 154,
			low: 150,
			close: 153,
			volume: 1100000,
			vwap: 152.0,
			tradeCount: 5500,
			adjusted: true,
		},
		{
			symbol: "AAPL",
			timeframe: "1h",
			timestamp: "2024-01-01T11:00:00.000Z",
			open: 153,
			high: 155,
			low: 152,
			close: 154,
			volume: 1200000,
			vwap: 153.5,
			tradeCount: 6000,
			adjusted: true,
		},
		{
			symbol: "AAPL",
			timeframe: "1h",
			timestamp: "2024-01-01T12:00:00.000Z",
			open: 154,
			high: 156,
			low: 153,
			close: 155,
			volume: 1300000,
			vwap: 154.5,
			tradeCount: 6500,
			adjusted: true,
		},
	];

	it("aggregates 1h to 4h candles", () => {
		const result = aggregateCandles(hourlyCandles, "4h");

		expect(result).toHaveLength(1);
		const candle = result[0]!;
		expect(candle.timeframe).toBe("4h");
		expect(candle.open).toBe(150); // First candle's open
		expect(candle.high).toBe(156); // Max high
		expect(candle.low).toBe(149); // Min low
		expect(candle.close).toBe(155); // Last candle's close
		expect(candle.volume).toBe(4600000); // Sum of volumes
	});

	it("calculates VWAP correctly", () => {
		const result = aggregateCandles(hourlyCandles, "4h");

		// VWAP = sum(price * volume) / sum(volume)
		const expectedVWAP =
			(150.5 * 1000000 + 152.0 * 1100000 + 153.5 * 1200000 + 154.5 * 1300000) /
			(1000000 + 1100000 + 1200000 + 1300000);

		expect(result[0]!.vwap).toBeCloseTo(expectedVWAP, 2);
	});

	it("throws error for invalid aggregation direction", () => {
		expect(() => aggregateCandles(hourlyCandles, "1m")).toThrow(
			"Cannot aggregate to smaller timeframe"
		);
	});

	it("handles empty input", () => {
		const result = aggregateCandles([], "4h");
		expect(result).toHaveLength(0);
	});
});
