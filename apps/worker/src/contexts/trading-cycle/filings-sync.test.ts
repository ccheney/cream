/**
 * Filings Sync Service Tests
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { RuntimeEnvironment } from "@cream/config";
import { createFilingsSyncService, FilingsSyncService } from "./filings-sync.js";

const mockSyncFilings = mock(() =>
	Promise.resolve({
		filingsIngested: 15,
		chunksCreated: 150,
		durationMs: 5000,
	}),
);

const mockIngestionService = {
	syncFilings: mockSyncFilings,
};

const mockCreateFilingsIngestionService = mock(() => mockIngestionService);

mock.module("@cream/filings", () => ({
	createFilingsIngestionService: mockCreateFilingsIngestionService,
}));

type Database = Parameters<typeof createFilingsSyncService>[0];

/**
 * Test double for Database. The FilingsSyncService delegates to createFilingsIngestionService
 * which is mocked above, so the actual database methods are never called during tests.
 * Using unknown cast since Drizzle's Database type has complex generic constraints.
 */
const mockDb = {} as unknown as Database;

describe("FilingsSyncService", () => {
	let service: FilingsSyncService;
	const testEnvironment: RuntimeEnvironment = "PAPER";

	beforeEach(() => {
		service = createFilingsSyncService(mockDb);
		mockCreateFilingsIngestionService.mockClear();
		mockSyncFilings.mockClear();
	});

	afterEach(() => {
		mockCreateFilingsIngestionService.mockClear();
		mockSyncFilings.mockClear();
	});

	describe("constructor", () => {
		test("creates service with default config", () => {
			const svc = new FilingsSyncService(mockDb);
			expect(svc.isRunning()).toBe(false);
		});

		test("creates service with custom config", () => {
			const svc = new FilingsSyncService(mockDb, {
				filingTypes: ["10-K"],
				limitPerSymbol: 3,
			});
			expect(svc.isRunning()).toBe(false);
		});
	});

	describe("sync", () => {
		test("syncs filings and returns result", async () => {
			const symbols = ["AAPL", "MSFT", "GOOGL"];
			const result = await service.sync(symbols, testEnvironment);

			expect(mockCreateFilingsIngestionService).toHaveBeenCalledWith(mockDb);
			expect(mockSyncFilings).toHaveBeenCalledTimes(1);
			expect(result).not.toBeNull();
			expect(result?.filingsIngested).toBe(15);
			expect(result?.chunksCreated).toBe(150);
			expect(result?.durationMs).toBe(5000);
		});

		test("passes correct parameters to syncFilings", async () => {
			const symbols = ["AAPL"];
			await service.sync(symbols, testEnvironment);

			expect(mockSyncFilings).toHaveBeenCalledWith({
				symbols: ["AAPL"],
				filingTypes: ["10-K", "10-Q", "8-K"],
				limitPerSymbol: 5,
				triggerSource: "scheduled",
				environment: testEnvironment,
			});
		});

		test("uses custom config for filing types", async () => {
			const customService = new FilingsSyncService(mockDb, {
				filingTypes: ["8-K"],
				limitPerSymbol: 2,
			});

			await customService.sync(["AAPL"], testEnvironment);

			expect(mockSyncFilings).toHaveBeenCalledWith(
				expect.objectContaining({
					filingTypes: ["8-K"],
					limitPerSymbol: 2,
				}),
			);
		});

		test("sets running flag during execution", async () => {
			expect(service.isRunning()).toBe(false);

			const syncPromise = service.sync(["AAPL"], testEnvironment);

			await syncPromise;
			expect(service.isRunning()).toBe(false);
		});

		test("skips if already running", async () => {
			mockSyncFilings.mockImplementationOnce(
				() =>
					new Promise((resolve) =>
						setTimeout(
							() =>
								resolve({
									filingsIngested: 10,
									chunksCreated: 100,
									durationMs: 3000,
								}),
							100,
						),
					),
			);

			const firstSync = service.sync(["AAPL"], testEnvironment);
			const secondResult = await service.sync(["MSFT"], testEnvironment);

			expect(secondResult).toBeNull();

			await firstSync;
			expect(mockSyncFilings).toHaveBeenCalledTimes(1);
		});

		test("returns null on error", async () => {
			mockSyncFilings.mockImplementationOnce(() => Promise.reject(new Error("EDGAR API error")));

			const result = await service.sync(["AAPL"], testEnvironment);

			expect(result).toBeNull();
			expect(service.isRunning()).toBe(false);
		});

		test("handles different environments", async () => {
			const environments: RuntimeEnvironment[] = ["PAPER", "LIVE"];

			for (const env of environments) {
				mockSyncFilings.mockClear();
				await service.sync(["AAPL"], env);

				expect(mockSyncFilings).toHaveBeenCalledWith(
					expect.objectContaining({
						environment: env,
					}),
				);
			}
		});
	});

	describe("createFilingsSyncService", () => {
		test("creates service instance", () => {
			const svc = createFilingsSyncService(mockDb);
			expect(svc).toBeInstanceOf(FilingsSyncService);
		});

		test("creates service with config", () => {
			const svc = createFilingsSyncService(mockDb, {
				filingTypes: ["10-K", "10-Q"],
				limitPerSymbol: 10,
			});
			expect(svc).toBeInstanceOf(FilingsSyncService);
		});
	});
});
