/**
 * Filings Sync Service Tests
 */

import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { RuntimeEnvironment } from "@cream/config";

import { createFilingsSyncService, FilingsSyncService } from "./filings-sync.js";

const mockSyncFilings = mock(() =>
	Promise.resolve({
		filingsIngested: 15,
		chunksCreated: 150,
		durationMs: 5000,
	}),
);

const mockIngestionService = { syncFilings: mockSyncFilings };
const mockCreateFilingsIngestionService = mock(() => mockIngestionService);

mock.module("@cream/filings", () => ({
	createFilingsIngestionService: mockCreateFilingsIngestionService,
}));

type Database = Parameters<typeof createFilingsSyncService>[0];
const mockDb = {} as unknown as Database;

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

test("constructor works with default config", () => {
	const svc = new FilingsSyncService(mockDb);
	expect(svc.isRunning()).toBe(false);
});

test("constructor works with custom config", () => {
	const svc = new FilingsSyncService(mockDb, { filingTypes: ["10-K"], limitPerSymbol: 3 });
	expect(svc.isRunning()).toBe(false);
});

test("sync returns ingestion result", async () => {
	const result = await service.sync(["AAPL", "MSFT", "GOOGL"], testEnvironment);
	expect(mockCreateFilingsIngestionService).toHaveBeenCalledWith(mockDb);
	expect(mockSyncFilings).toHaveBeenCalledTimes(1);
	expect(result).not.toBeNull();
	expect(result?.filingsIngested).toBe(15);
	expect(result?.chunksCreated).toBe(150);
	expect(result?.durationMs).toBe(5000);
});

test("sync passes expected parameters", async () => {
	await service.sync(["AAPL"], testEnvironment);
	expect(mockSyncFilings).toHaveBeenCalledWith({
		symbols: ["AAPL"],
		filingTypes: ["10-K", "10-Q", "8-K"],
		limitPerSymbol: 5,
		triggerSource: "scheduled",
		environment: testEnvironment,
	});
});

test("sync uses custom service config", async () => {
	const customService = new FilingsSyncService(mockDb, { filingTypes: ["8-K"], limitPerSymbol: 2 });
	await customService.sync(["AAPL"], testEnvironment);
	expect(mockSyncFilings).toHaveBeenCalledWith(
		expect.objectContaining({ filingTypes: ["8-K"], limitPerSymbol: 2 }),
	);
});

test("running flag resets after sync", async () => {
	expect(service.isRunning()).toBe(false);
	await service.sync(["AAPL"], testEnvironment);
	expect(service.isRunning()).toBe(false);
});

test("sync skips when already running", async () => {
	mockSyncFilings.mockImplementationOnce(
		() =>
			new Promise((resolve) =>
				setTimeout(
					() => resolve({ filingsIngested: 10, chunksCreated: 100, durationMs: 3000 }),
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

test("sync returns null on error", async () => {
	mockSyncFilings.mockImplementationOnce(() => Promise.reject(new Error("EDGAR API error")));
	const result = await service.sync(["AAPL"], testEnvironment);
	expect(result).toBeNull();
	expect(service.isRunning()).toBe(false);
});

test("sync forwards environment value", async () => {
	const environments: RuntimeEnvironment[] = ["PAPER", "LIVE"];
	for (const env of environments) {
		mockSyncFilings.mockClear();
		await service.sync(["AAPL"], env);
		expect(mockSyncFilings).toHaveBeenCalledWith(expect.objectContaining({ environment: env }));
	}
});

test("createFilingsSyncService creates default instance", () => {
	const svc = createFilingsSyncService(mockDb);
	expect(svc).toBeInstanceOf(FilingsSyncService);
});

test("createFilingsSyncService creates configured instance", () => {
	const svc = createFilingsSyncService(mockDb, {
		filingTypes: ["10-K", "10-Q"],
		limitPerSymbol: 10,
	});
	expect(svc).toBeInstanceOf(FilingsSyncService);
});
