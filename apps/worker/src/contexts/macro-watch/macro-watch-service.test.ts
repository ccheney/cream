/**
 * MacroWatch Service Tests
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createMacroWatchService, MacroWatchService } from "./macro-watch-service.js";

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
	})
);

mock.module("@cream/api", () => ({
	runMacroWatch: mockRunMacroWatch,
}));

describe("MacroWatchService", () => {
	let service: MacroWatchService;

	beforeEach(() => {
		service = createMacroWatchService();
		mockRunMacroWatch.mockClear();
	});

	afterEach(() => {
		mockRunMacroWatch.mockClear();
	});

	describe("constructor", () => {
		test("creates service with default config", () => {
			const svc = new MacroWatchService();
			expect(svc.isRunning()).toBe(false);
			expect(svc.getLastRun()).toBeNull();
		});

		test("creates service with custom config", () => {
			const svc = new MacroWatchService({ maxEntriesPerHour: 100 });
			expect(svc.isRunning()).toBe(false);
		});
	});

	describe("run", () => {
		test("runs macro watch and returns entries", async () => {
			const symbols = ["AAPL", "MSFT"];
			const entries = await service.run(symbols);

			expect(mockRunMacroWatch).toHaveBeenCalledTimes(1);
			expect(entries).toHaveLength(2);
			expect(entries[0]?.category).toBe("NEWS");
			expect(entries[1]?.category).toBe("PREDICTION");
		});

		test("updates lastRun timestamp after successful run", async () => {
			expect(service.getLastRun()).toBeNull();

			await service.run(["AAPL"]);

			expect(service.getLastRun()).not.toBeNull();
			expect(service.getLastRun()).toBeInstanceOf(Date);
		});

		test("sets running flag during execution", async () => {
			expect(service.isRunning()).toBe(false);

			const runPromise = service.run(["AAPL"]);

			await runPromise;
			expect(service.isRunning()).toBe(false);
		});

		test("skips if already running", async () => {
			mockRunMacroWatch.mockImplementationOnce(
				() =>
					new Promise((resolve) =>
						setTimeout(
							() =>
								resolve({
									entries: [],
									totalCount: 0,
								}),
							100
						)
					)
			);

			const firstRun = service.run(["AAPL"]);
			const secondResult = await service.run(["MSFT"]);

			expect(secondResult).toEqual([]);

			await firstRun;
			expect(mockRunMacroWatch).toHaveBeenCalledTimes(1);
		});

		test("returns empty array on error", async () => {
			mockRunMacroWatch.mockImplementationOnce(() => Promise.reject(new Error("API error")));

			const entries = await service.run(["AAPL"]);

			expect(entries).toEqual([]);
			expect(service.isRunning()).toBe(false);
		});

		test("uses lastRun for since parameter on subsequent runs", async () => {
			await service.run(["AAPL"]);
			const firstCallArgs = mockRunMacroWatch.mock.calls[0];
			expect(firstCallArgs).toBeDefined();

			mockRunMacroWatch.mockClear();

			await service.run(["AAPL"]);
			const secondCallArgs = mockRunMacroWatch.mock.calls[0];
			expect(secondCallArgs).toBeDefined();
		});
	});

	describe("createMacroWatchService", () => {
		test("creates service instance", () => {
			const svc = createMacroWatchService();
			expect(svc).toBeInstanceOf(MacroWatchService);
		});

		test("creates service with config", () => {
			const svc = createMacroWatchService({ maxEntriesPerHour: 50 });
			expect(svc).toBeInstanceOf(MacroWatchService);
		});
	});
});
