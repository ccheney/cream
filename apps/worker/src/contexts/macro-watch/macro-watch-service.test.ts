/**
 * MacroWatch Service Tests
 */

import { afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";

let createMacroWatchService: typeof import("./macro-watch-service.js").createMacroWatchService;
let MacroWatchService: typeof import("./macro-watch-service.js").MacroWatchService;

const mockRunMacroWatch = mock(() =>
	Promise.resolve({
		entries: [
			{
				id: "entry-1",
				timestamp: new Date().toISOString(),
				session: "OVERNIGHT" as const,
				category: "NEWS" as const,
				headline: "Apple announces new product",
				symbols: ["AAPL"],
				source: "Test",
			},
			{
				id: "entry-2",
				timestamp: new Date().toISOString(),
				session: "OVERNIGHT" as const,
				category: "PREDICTION" as const,
				headline: "Fed rate hike probability increased",
				symbols: [],
				source: "Test",
			},
		],
		totalCount: 2,
	}),
);

const mockCompileMorningNewspaper = mock(() =>
	Promise.resolve({ date: "2026-01-15", summary: "Test", sections: [] }),
);
const mockFormatNewspaperForLLM = mock(() => "Test");

mock.module("@cream/mastra", () => ({
	runMacroWatch: mockRunMacroWatch,
	compileMorningNewspaper: mockCompileMorningNewspaper,
	formatNewspaperForLLM: mockFormatNewspaperForLLM,
}));

beforeAll(async () => {
	({ createMacroWatchService, MacroWatchService } = await import("./macro-watch-service.js"));
});

let service: InstanceType<typeof MacroWatchService>;

beforeEach(() => {
	service = createMacroWatchService();
	mockRunMacroWatch.mockClear();
});

afterEach(() => {
	mockRunMacroWatch.mockClear();
});

test("constructor works with default config", () => {
	const svc = new MacroWatchService();
	expect(svc.isRunning()).toBe(false);
	expect(svc.getLastRun()).toBeNull();
});

test("constructor works with custom config", () => {
	const svc = new MacroWatchService({ maxEntriesPerHour: 100 });
	expect(svc.isRunning()).toBe(false);
});

test("run returns entries and saved count", async () => {
	const { entries, saved } = await service.run(["AAPL", "MSFT"]);
	expect(mockRunMacroWatch).toHaveBeenCalledTimes(1);
	expect(entries).toHaveLength(2);
	expect(entries[0]?.category).toBe("NEWS");
	expect(entries[1]?.category).toBe("PREDICTION");
	expect(saved).toBe(0);
});

test("run updates lastRun timestamp", async () => {
	expect(service.getLastRun()).toBeNull();
	await service.run(["AAPL"]);
	expect(service.getLastRun()).not.toBeNull();
	expect(service.getLastRun()).toBeInstanceOf(Date);
});

test("running flag returns to false after run", async () => {
	expect(service.isRunning()).toBe(false);
	await service.run(["AAPL"]);
	expect(service.isRunning()).toBe(false);
});

test("run skips when already running", async () => {
	mockRunMacroWatch.mockImplementationOnce(
		() => new Promise((resolve) => setTimeout(() => resolve({ entries: [], totalCount: 0 }), 100)),
	);
	const firstRun = service.run(["AAPL"]);
	const secondResult = await service.run(["MSFT"]);
	expect(secondResult).toEqual({ entries: [], saved: 0, helixIngested: 0 });
	await firstRun;
	expect(mockRunMacroWatch).toHaveBeenCalledTimes(1);
});

test("run returns empty result on errors", async () => {
	mockRunMacroWatch.mockImplementationOnce(() => Promise.reject(new Error("API error")));
	const result = await service.run(["AAPL"]);
	expect(result).toEqual({ entries: [], saved: 0, helixIngested: 0 });
	expect(service.isRunning()).toBe(false);
});

test("run uses lastRun on subsequent calls", async () => {
	await service.run(["AAPL"]);
	expect(mockRunMacroWatch.mock.calls[0]).toBeDefined();
	mockRunMacroWatch.mockClear();
	await service.run(["AAPL"]);
	expect(mockRunMacroWatch.mock.calls[0]).toBeDefined();
});

test("createMacroWatchService creates default instance", () => {
	const svc = createMacroWatchService();
	expect(svc).toBeInstanceOf(MacroWatchService);
});

test("createMacroWatchService creates configured instance", () => {
	const svc = createMacroWatchService({ maxEntriesPerHour: 50 });
	expect(svc).toBeInstanceOf(MacroWatchService);
});
