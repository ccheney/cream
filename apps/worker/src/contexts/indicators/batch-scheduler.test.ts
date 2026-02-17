/**
 * Indicator Batch Scheduler Tests
 */

import { afterEach, beforeEach, expect, mock, test } from "bun:test";

import { IndicatorBatchScheduler } from "./batch-scheduler.js";
import type { IndicatorSchedulerConfig, IndicatorSchedulerDependencies } from "./types.js";

const createMockDependencies = (): IndicatorSchedulerDependencies => ({
	finraClient: {} as unknown as IndicatorSchedulerDependencies["finraClient"],
	sharesProvider: {} as unknown as IndicatorSchedulerDependencies["sharesProvider"],
	sentimentProvider: {} as unknown as IndicatorSchedulerDependencies["sentimentProvider"],
	alpacaClient: {} as unknown as IndicatorSchedulerDependencies["alpacaClient"],
	shortInterestRepo: {} as unknown as IndicatorSchedulerDependencies["shortInterestRepo"],
	sentimentRepo: {} as unknown as IndicatorSchedulerDependencies["sentimentRepo"],
	corporateActionsRepo: {} as unknown as IndicatorSchedulerDependencies["corporateActionsRepo"],
	getSymbols: mock(() => ["AAPL", "MSFT", "GOOGL"]),
});

const createMockConfig = (
	overrides: Partial<IndicatorSchedulerConfig> = {},
): IndicatorSchedulerConfig => ({
	enabled: {
		shortInterest: true,
		sentiment: true,
		corporateActions: true,
	},
	...overrides,
});

let scheduler: IndicatorBatchScheduler;
let mockDeps: IndicatorSchedulerDependencies;
let mockConfig: IndicatorSchedulerConfig;

beforeEach(() => {
	mockDeps = createMockDependencies();
	mockConfig = createMockConfig();
	scheduler = new IndicatorBatchScheduler(mockDeps, mockConfig);
});

afterEach(() => {
	scheduler.stop();
});

test("constructor initializes enabled jobs as idle", () => {
	const status = scheduler.getJobStatus();
	expect(status.shortInterest.status).toBe("idle");
	expect(status.sentiment.status).toBe("idle");
	expect(status.corporateActions.status).toBe("idle");
});

test("constructor initializes disabled jobs when config disables all", () => {
	const disabledScheduler = new IndicatorBatchScheduler(
		mockDeps,
		createMockConfig({
			enabled: { shortInterest: false, sentiment: false, corporateActions: false },
		}),
	);
	const status = disabledScheduler.getJobStatus();
	expect(status.shortInterest.status).toBe("disabled");
	expect(status.sentiment.status).toBe("disabled");
	expect(status.corporateActions.status).toBe("disabled");
});

test("constructor initializes run counts to zero", () => {
	const status = scheduler.getJobStatus();
	expect(status.shortInterest.runCount).toBe(0);
	expect(status.sentiment.runCount).toBe(0);
	expect(status.corporateActions.runCount).toBe(0);
});

test("start schedules enabled jobs", () => {
	scheduler.start();
	const status = scheduler.getJobStatus();
	expect(status.shortInterest.nextRun).not.toBeNull();
	expect(status.sentiment.nextRun).not.toBeNull();
	expect(status.corporateActions.nextRun).not.toBeNull();
});

test("stop can be called after start", () => {
	scheduler.start();
	const statusBeforeStop = scheduler.getJobStatus();
	expect(statusBeforeStop.shortInterest.nextRun).not.toBeNull();
	scheduler.stop();
});

test("start does not schedule disabled jobs", () => {
	const partialScheduler = new IndicatorBatchScheduler(
		mockDeps,
		createMockConfig({
			enabled: { shortInterest: true, sentiment: false, corporateActions: false },
		}),
	);
	partialScheduler.start();
	const status = partialScheduler.getJobStatus();
	expect(status.shortInterest.nextRun).not.toBeNull();
	expect(status.sentiment.nextRun).toBeNull();
	expect(status.corporateActions.nextRun).toBeNull();
	partialScheduler.stop();
});

test("getJobStatus returns all known jobs", () => {
	const status = scheduler.getJobStatus();
	expect(status).toHaveProperty("shortInterest");
	expect(status).toHaveProperty("sentiment");
	expect(status).toHaveProperty("corporateActions");
});

test("getJobStatus includes expected fields", () => {
	const status = scheduler.getJobStatus();
	for (const jobStatus of Object.values(status)) {
		expect(jobStatus).toHaveProperty("status");
		expect(jobStatus).toHaveProperty("lastRun");
		expect(jobStatus).toHaveProperty("lastResult");
		expect(jobStatus).toHaveProperty("lastError");
		expect(jobStatus).toHaveProperty("nextRun");
		expect(jobStatus).toHaveProperty("runCount");
	}
});

test("triggerJob throws for unknown job", async () => {
	await expect(scheduler.triggerJob("unknown" as never)).rejects.toThrow("Unknown job");
});

test("triggerJob throws for disabled job", async () => {
	const disabledScheduler = new IndicatorBatchScheduler(
		mockDeps,
		createMockConfig({
			enabled: { shortInterest: false, sentiment: true, corporateActions: true },
		}),
	);
	await expect(disabledScheduler.triggerJob("shortInterest")).rejects.toThrow(
		"Job shortInterest is disabled",
	);
});

test("job execution tracking starts with null/zero values", async () => {
	const status = scheduler.getJobStatus();
	expect(status.shortInterest.lastRun).toBeNull();
	expect(status.shortInterest.runCount).toBe(0);
});
