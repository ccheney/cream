/**
 * ShortInterestBatchJob error handling, retry, and edge case tests
 */

import { expect, it, mock } from "bun:test";
import type { ShortInterestIndicators } from "@cream/storage";
import { ShortInterestBatchJob } from "./short-interest-batch.js";
import {
	createMockFINRAClient,
	createMockFINRARecord,
	createMockRepository,
} from "./short-interest-batch.test-helpers.js";

it("continues on individual symbol errors when configured", async () => {
	const records = [
		createMockFINRARecord({ symbolCode: "AAPL" }),
		createMockFINRARecord({ symbolCode: "MSFT" }),
	];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	let callCount = 0;

	mockRepo.upsert = mock(async (): Promise<ShortInterestIndicators> => {
		callCount++;
		if (callCount === 1) {
			throw new Error("Database error");
		}
		return {
			id: `si_${callCount}`,
			symbol: "MSFT",
			settlementDate: "2024-01-15",
			shortInterest: 1000000,
			shortInterestRatio: 2.5,
			shortPctFloat: 0.05,
			daysToCover: 3,
			shortInterestChange: null,
			source: "FINRA",
			fetchedAt: new Date().toISOString(),
		};
	});

	const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
		continueOnError: true,
	});
	const result = await job.run(["AAPL", "MSFT"]);

	expect(result.processed).toBe(1);
	expect(result.failed).toBe(1);
	expect(result.errors).toHaveLength(1);
	expect(result.errors[0]?.symbol).toBe("AAPL");
	expect(result.errors[0]?.error).toContain("Database error");
});

it("stops on error when continueOnError is false", async () => {
	const records = [
		createMockFINRARecord({ symbolCode: "AAPL" }),
		createMockFINRARecord({ symbolCode: "MSFT" }),
	];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();

	mockRepo.upsert = mock(async () => {
		throw new Error("Database error");
	});

	const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
		continueOnError: false,
	});

	await expect(job.run(["AAPL", "MSFT"])).rejects.toThrow("Database error");
});

it("handles batch-level FINRA API failures", async () => {
	const mockFinra = createMockFINRAClient();
	const mockRepo = createMockRepository();
	mockFinra.getShortInterestBySymbols = mock(async () => {
		throw new Error("FINRA API unavailable");
	});

	const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
		maxRetries: 0,
		continueOnError: true,
	});
	const result = await job.run(["AAPL", "MSFT"]);

	expect(result.processed).toBe(0);
	expect(result.failed).toBe(2);
	expect(result.errors).toHaveLength(2);
});

it("throws batch-level errors when continueOnError is false", async () => {
	const mockFinra = createMockFINRAClient();
	const mockRepo = createMockRepository();
	mockFinra.getShortInterestBySymbols = mock(async () => {
		throw new Error("FINRA API unavailable");
	});

	const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
		maxRetries: 0,
		continueOnError: false,
	});

	await expect(job.run(["AAPL"])).rejects.toThrow("FINRA API unavailable");
});

it("retries failed API calls", async () => {
	const mockFinra = createMockFINRAClient();
	const mockRepo = createMockRepository();
	let attempts = 0;
	mockFinra.getShortInterestBySymbols = mock(async () => {
		attempts++;
		if (attempts < 3) {
			throw new Error("Temporary failure");
		}
		return [createMockFINRARecord()];
	});

	const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
		maxRetries: 3,
		retryDelayMs: 10,
	});
	const result = await job.run(["AAPL"]);

	expect(attempts).toBe(3);
	expect(result.processed).toBe(1);
});

it("gives up after max retries", async () => {
	const mockFinra = createMockFINRAClient();
	const mockRepo = createMockRepository();
	mockFinra.getShortInterestBySymbols = mock(async () => {
		throw new Error("Persistent failure");
	});

	const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
		maxRetries: 2,
		retryDelayMs: 10,
		continueOnError: true,
	});
	const result = await job.run(["AAPL"]);

	expect(mockFinra.getShortInterestBySymbols).toHaveBeenCalledTimes(3);
	expect(result.failed).toBe(1);
});

it("retries getLatestSettlementDate on failure", async () => {
	const mockFinra = createMockFINRAClient();
	const mockRepo = createMockRepository();
	let attempts = 0;
	mockFinra.getLatestSettlementDate = mock(async () => {
		attempts++;
		if (attempts < 2) {
			throw new Error("Temporary failure");
		}
		return "2024-01-15";
	});
	mockFinra.getShortInterestBySymbols = mock(async () => [createMockFINRARecord()]);

	const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
		maxRetries: 3,
		retryDelayMs: 10,
	});
	await job.run(["AAPL"]);

	expect(attempts).toBe(2);
});

it("returns execution time in milliseconds", async () => {
	const mockFinra = createMockFINRAClient([createMockFINRARecord()]);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	const result = await job.run(["AAPL"]);

	expect(result.durationMs).toBeGreaterThanOrEqual(0);
	expect(typeof result.durationMs).toBe("number");
});

it("returns error details for failed symbols", async () => {
	const mockFinra = createMockFINRAClient([createMockFINRARecord()]);
	const mockRepo = createMockRepository();
	mockRepo.upsert = mock(async () => {
		throw new Error("Constraint violation");
	});

	const job = new ShortInterestBatchJob(mockFinra, mockRepo, undefined, {
		continueOnError: true,
	});
	const result = await job.run(["AAPL"]);

	expect(result.errors).toHaveLength(1);
	expect(result.errors[0]).toEqual({
		symbol: "AAPL",
		error: "Constraint violation",
	});
});

it("handles empty symbol list", async () => {
	const mockFinra = createMockFINRAClient();
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	const result = await job.run([]);

	expect(result.processed).toBe(0);
	expect(result.failed).toBe(0);
	expect(mockFinra.getShortInterestBySymbols).not.toHaveBeenCalled();
});

it("handles null values in FINRA response", async () => {
	const records = [
		createMockFINRARecord({
			previousShortPositionQuantity: null,
			averageDailyVolumeQuantity: null,
			daysToCoverQuantity: null,
		}),
	];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	await job.run(["AAPL"]);

	expect(mockRepo.upsertCalls[0]?.shortInterestRatio).toBeNull();
	expect(mockRepo.upsertCalls[0]?.shortInterestChange).toBeNull();
	expect(mockRepo.upsertCalls[0]?.daysToCover).toBeNull();
});

it("handles duplicate symbols in input", async () => {
	const mockFinra = createMockFINRAClient([createMockFINRARecord()]);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	await job.run(["AAPL", "AAPL"]);

	expect(mockRepo.upsertCalls).toHaveLength(2);
});

it("handles very large short interest values", async () => {
	const records = [
		createMockFINRARecord({
			currentShortPositionQuantity: 999999999999,
			previousShortPositionQuantity: 888888888888,
			averageDailyVolumeQuantity: 100000000,
		}),
	];
	const mockFinra = createMockFINRAClient(records);
	const mockRepo = createMockRepository();
	const job = new ShortInterestBatchJob(mockFinra, mockRepo);

	await job.run(["AAPL"]);

	expect(mockRepo.upsertCalls[0]?.shortInterest).toBe(999999999999);
	expect(mockRepo.upsertCalls[0]?.shortInterestRatio).toBe(9999.99999999);
});
