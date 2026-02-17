/**
 * Candle Ingestion Service Tests
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import { requireValue } from "@cream/test-utils";
import type { AlpacaMarketDataClient } from "../providers/alpaca";
import { type Candle, CandleIngestionService, type CandleStorage } from "./candleIngestion";
import { createMockAlpacaClient, createMockStorage } from "./candleIngestion.test-helpers";

describe("ingestSymbol success cases", () => {
	let alpacaClient: AlpacaMarketDataClient;
	let storage: CandleStorage & { candles: Candle[] };
	let service: CandleIngestionService;

	beforeEach(() => {
		alpacaClient = createMockAlpacaClient();
		storage = createMockStorage();
		service = new CandleIngestionService(alpacaClient, storage);
	});

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
		const firstCandle = requireValue(storage.candles[0], "stored candle");
		expect(firstCandle.symbol).toBe("AAPL");
		expect(firstCandle.timeframe).toBe("1h");
		expect(firstCandle.open).toBe(150);
		expect(firstCandle.high).toBe(152);
		expect(firstCandle.low).toBe(149);
		expect(firstCandle.close).toBe(151);
		expect(firstCandle.volume).toBe(1000000);
		expect(firstCandle.vwap).toBe(150.5);
		expect(firstCandle.tradeCount).toBe(5000);
		expect(firstCandle.adjusted).toBe(true);
	});
});

describe("ingestSymbol error handling", () => {
	let alpacaClient: AlpacaMarketDataClient;
	let storage: CandleStorage & { candles: Candle[] };

	beforeEach(() => {
		alpacaClient = createMockAlpacaClient();
		storage = createMockStorage();
	});

	it("handles empty results", async () => {
		const emptyClient = {
			...alpacaClient,
			getBars: mock(() => Promise.resolve([])),
		} as unknown as AlpacaMarketDataClient;

		const service = new CandleIngestionService(emptyClient, storage as unknown as CandleStorage);
		const result = await service.ingestSymbol("UNKNOWN", {
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

		const service = new CandleIngestionService(errorClient, storage as unknown as CandleStorage);
		const result = await service.ingestSymbol("AAPL", {
			from: "2024-01-01",
			to: "2024-01-05",
			timeframe: "1h",
		});

		expect(result.errors).toContain("API rate limit exceeded");
	});
});

describe("ingestUniverse", () => {
	it("ingests multiple symbols", async () => {
		const service = new CandleIngestionService(
			createMockAlpacaClient(),
			createMockStorage() as unknown as CandleStorage,
		);

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
		const alpacaClient = createMockAlpacaClient();
		const storage = createMockStorage();
		const service = new CandleIngestionService(alpacaClient, storage);

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
		const alpacaClient = createMockAlpacaClient();
		const service = new CandleIngestionService(
			alpacaClient,
			createMockStorage() as unknown as CandleStorage,
		);

		const result = await service.incrementalUpdate("NEW", "1h");

		expect(result.symbol).toBe("NEW");
		expect(alpacaClient.getBars).toHaveBeenCalled();
	});
});
