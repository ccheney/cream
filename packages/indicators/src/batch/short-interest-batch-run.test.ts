/**
 * ShortInterestBatchJob run and batching tests
 */

import { expect, it } from "bun:test";
import type { CreateShortInterestInput } from "@cream/storage";
import { ShortInterestBatchJob } from "./short-interest-batch.js";
import {
	createMockFINRAClient,
	createMockFINRARecord,
	createMockRepository,
	createMockSharesProvider,
} from "./short-interest-batch.test-helpers.js";

it("processes symbols and stores short interest data", async () => {
	const records = [
		createMockFINRARecord({ symbolCode: "AAPL" }),
		createMockFINRARecord({ symbolCode: "MSFT", currentShortPositionQuantity: 200000 }),
	];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	const result = await job.run(["AAPL", "MSFT"]);

	expect(result.processed).toBe(2);
	expect(result.failed).toBe(0);
	expect(mockRepo.upsertCalls).toHaveLength(2);
});

it("uses provided settlement date", async () => {
	const mockFinra = createMockFINRAClient([createMockFINRARecord()]);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	await job.run(["AAPL"], "2024-02-01");

	expect(mockFinra.getShortInterestBySymbols).toHaveBeenCalledWith(["AAPL"], "2024-02-01");
});

it("fetches latest settlement date when not provided", async () => {
	const mockFinra = createMockFINRAClient([createMockFINRARecord()]);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	await job.run(["AAPL"]);

	expect(mockFinra.getLatestSettlementDate).toHaveBeenCalled();
});

it("skips symbols without FINRA data", async () => {
	const records = [createMockFINRARecord({ symbolCode: "AAPL" })];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	const result = await job.run(["AAPL", "XYZ"]);

	expect(result.processed).toBe(1);
	expect(result.failed).toBe(0);
	expect(mockRepo.upsertCalls).toHaveLength(1);
});

it("calculates short % of float when shares provider is available", async () => {
	const records = [createMockFINRARecord({ currentShortPositionQuantity: 100000 })];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const sharesData = new Map([["AAPL", { sharesOutstanding: 10000000, floatShares: 8000000 }]]);
	const mockSharesProvider = createMockSharesProvider(sharesData);
	const job = new ShortInterestBatchJob(mockFinra, mockRepo, mockSharesProvider);

	await job.run(["AAPL"]);

	expect(mockRepo.upsertCalls).toHaveLength(1);
	expect(mockRepo.upsertCalls[0]?.shortPctFloat).toBeCloseTo(0.0125, 6);
});

it("handles missing float shares data", async () => {
	const records = [createMockFINRARecord()];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const sharesData = new Map([["AAPL", { sharesOutstanding: 10000000, floatShares: null }]]);
	const mockSharesProvider = createMockSharesProvider(sharesData);
	const job = new ShortInterestBatchJob(mockFinra, mockRepo, mockSharesProvider);

	await job.run(["AAPL"]);

	expect(mockRepo.upsertCalls[0]?.shortPctFloat).toBeNull();
});

it("calculates short interest ratio", async () => {
	const records = [
		createMockFINRARecord({
			currentShortPositionQuantity: 100000,
			averageDailyVolumeQuantity: 25000,
		}),
	];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	await job.run(["AAPL"]);

	expect(mockRepo.upsertCalls[0]?.shortInterestRatio).toBe(4);
});

it("calculates short interest change (momentum)", async () => {
	const records = [
		createMockFINRARecord({
			currentShortPositionQuantity: 120000,
			previousShortPositionQuantity: 100000,
		}),
	];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	await job.run(["AAPL"]);

	expect(mockRepo.upsertCalls[0]?.shortInterestChange).toBe(0.2);
});

it("stores FINRA days to cover value", async () => {
	const records = [createMockFINRARecord({ daysToCoverQuantity: 3.5 })];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	await job.run(["AAPL"]);

	expect(mockRepo.upsertCalls[0]?.daysToCover).toBe(3.5);
});

it("sets source to FINRA", async () => {
	const mockFinra = createMockFINRAClient([createMockFINRARecord()]);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	await job.run(["AAPL"]);

	expect(mockRepo.upsertCalls[0]?.source).toBe("FINRA");
});

it("normalizes symbol to uppercase", async () => {
	const records = [createMockFINRARecord({ symbolCode: "aapl" })];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	await job.run(["aapl"]);

	expect(mockRepo.upsertCalls[0]?.symbol).toBe("AAPL");
});

it("processes multiple symbols successfully", async () => {
	const records = [
		createMockFINRARecord({ symbolCode: "AAPL" }),
		createMockFINRARecord({ symbolCode: "MSFT" }),
	];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	await job.run(["AAPL", "MSFT"]);

	const symbols = mockRepo.upsertCalls.map((call: CreateShortInterestInput) => call.symbol);
	expect(symbols).toContain("AAPL");
	expect(symbols).toContain("MSFT");
});

it("processes symbols in batches", async () => {
	const symbols = Array.from({ length: 250 }, (_, i) => `SYM${i}`);
	const records = symbols.map((symbol) => createMockFINRARecord({ symbolCode: symbol }));
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	const result = await job.run(symbols);

	expect(mockFinra.getShortInterestBySymbols).toHaveBeenCalledTimes(3);
	expect(result.processed).toBe(250);
});

it("respects custom batch size", async () => {
	const symbols = Array.from({ length: 100 }, (_, i) => `SYM${i}`);
	const records = symbols.map((symbol) => createMockFINRARecord({ symbolCode: symbol }));
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, { batchSize: 25 });

	const result = await job.run(symbols);

	expect(mockFinra.getShortInterestBySymbols).toHaveBeenCalledTimes(4);
	expect(result.processed).toBe(100);
});
