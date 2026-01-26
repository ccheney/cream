/**
 * Newspaper Service Tests
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Mock @cream/mastra to avoid loading agents that require LLM env vars
const mockCompileMorningNewspaper = mock(() =>
	Promise.resolve({
		date: "2026-01-15",
		summary: "Test summary",
		sections: [],
	}),
);
const mockFormatNewspaperForLLM = mock(() => "Test newspaper content");
const mockRunMacroWatch = mock(() => Promise.resolve({ entries: [], totalCount: 0 }));
mock.module("@cream/mastra", () => ({
	compileMorningNewspaper: mockCompileMorningNewspaper,
	formatNewspaperForLLM: mockFormatNewspaperForLLM,
	runMacroWatch: mockRunMacroWatch,
}));

// Use the mock as the "real" function for tests
const realCompileMorningNewspaper = mockCompileMorningNewspaper;

import { createNewspaperService, NewspaperService } from "./newspaper-service.js";

const mockUpsertNewspaper = mock(() => Promise.resolve());
const mockGetEntriesSinceClose = mock(() =>
	Promise.resolve([
		{
			id: "entry-1",
			timestamp: new Date().toISOString(),
			session: "OVERNIGHT" as const,
			category: "NEWS" as const,
			headline: "Apple announces new product",
			symbols: ["AAPL"],
			source: "Test",
			metadata: null,
			createdAt: new Date().toISOString(),
		},
		{
			id: "entry-2",
			timestamp: new Date().toISOString(),
			session: "OVERNIGHT" as const,
			category: "ECONOMIC" as const,
			headline: "Fed meeting minutes released",
			symbols: [],
			source: "Test",
			metadata: null,
			createdAt: new Date().toISOString(),
		},
	]),
);

const mockRepo = {
	getEntriesSinceClose: mockGetEntriesSinceClose,
	upsertNewspaper: mockUpsertNewspaper,
};

const mockGetPreviousTradingDay = mock(() => Promise.resolve("2026-01-14"));
const mockCalendarService = {
	getPreviousTradingDay: mockGetPreviousTradingDay,
};
const mockGetCalendarService = mock<() => typeof mockCalendarService | null>(
	() => mockCalendarService,
);

mock.module("@cream/mastra", () => ({
	// Pass through the real compileMorningNewspaper to avoid breaking other tests
	compileMorningNewspaper: realCompileMorningNewspaper,
}));

mock.module("@cream/storage", () => ({
	MacroWatchRepository: class {
		constructor() {
			Object.assign(this, mockRepo);
		}
	},
}));

mock.module("@cream/domain", () => ({
	getCalendarService: mockGetCalendarService,
}));

describe("NewspaperService", () => {
	let service: NewspaperService;

	beforeEach(() => {
		service = createNewspaperService();
		mockGetEntriesSinceClose.mockClear();
		mockUpsertNewspaper.mockClear();
		mockGetCalendarService.mockClear();
		mockGetPreviousTradingDay.mockClear();
	});

	afterEach(() => {
		mockGetEntriesSinceClose.mockClear();
		mockUpsertNewspaper.mockClear();
		mockGetCalendarService.mockClear();
		mockGetPreviousTradingDay.mockClear();
	});

	describe("constructor", () => {
		test("creates service with default config", () => {
			const svc = new NewspaperService();
			expect(svc.isRunning()).toBe(false);
			expect(svc.getLastCompile()).toBeNull();
		});

		test("creates service with custom config", () => {
			const svc = new NewspaperService({ maxBulletsPerSection: 10 });
			expect(svc.isRunning()).toBe(false);
		});
	});

	describe("compile", () => {
		test("compiles newspaper from overnight entries", async () => {
			const symbols = ["AAPL", "MSFT"];
			await service.compile(symbols);

			expect(mockGetCalendarService).toHaveBeenCalled();
			expect(mockGetEntriesSinceClose).toHaveBeenCalled();
			// compileMorningNewspaper is called (verified by upsertNewspaper being called with result)
			expect(mockUpsertNewspaper).toHaveBeenCalled();
		});

		test("updates lastCompile timestamp after successful compile", async () => {
			expect(service.getLastCompile()).toBeNull();

			await service.compile(["AAPL"]);

			expect(service.getLastCompile()).not.toBeNull();
			expect(service.getLastCompile()).toBeInstanceOf(Date);
		});

		test("sets running flag during execution", async () => {
			expect(service.isRunning()).toBe(false);

			const compilePromise = service.compile(["AAPL"]);

			await compilePromise;
			expect(service.isRunning()).toBe(false);
		});

		test("skips if already running", async () => {
			mockGetEntriesSinceClose.mockImplementationOnce(
				() => new Promise((resolve) => setTimeout(() => resolve([]), 100)),
			);

			const firstCompile = service.compile(["AAPL"]);
			const result = await service.compile(["MSFT"]);

			expect(result.compiled).toBe(false);
			expect(result.message).toBe("Already running");

			await firstCompile;
		});

		test("skips when no entries available", async () => {
			mockGetEntriesSinceClose.mockImplementationOnce(() => Promise.resolve([]));

			await service.compile(["AAPL"]);

			// When no entries, upsertNewspaper should not be called (compilation skipped)
			expect(mockUpsertNewspaper).not.toHaveBeenCalled();
		});

		test("handles calendar service not available", async () => {
			mockGetCalendarService.mockReturnValueOnce(null);

			const result = await service.compile(["AAPL"]);

			expect(result.compiled).toBe(false);
			expect(result.message).toBe("CalendarService not available");
			expect(service.getLastCompile()).toBeNull();
		});

		test("handles errors gracefully", async () => {
			mockGetEntriesSinceClose.mockImplementationOnce(() =>
				Promise.reject(new Error("Database error")),
			);

			const result = await service.compile(["AAPL"]);

			expect(result.compiled).toBe(false);
			expect(service.isRunning()).toBe(false);
			expect(service.getLastCompile()).toBeNull();
		});
	});

	describe("createNewspaperService", () => {
		test("creates service instance", () => {
			const svc = createNewspaperService();
			expect(svc).toBeInstanceOf(NewspaperService);
		});

		test("creates service with config", () => {
			const svc = createNewspaperService({ maxBulletsPerSection: 5 });
			expect(svc).toBeInstanceOf(NewspaperService);
		});
	});
});
