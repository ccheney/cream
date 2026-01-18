/**
 * Newspaper Service Tests
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
// Import the real compileMorningNewspaper BEFORE setting up module mocks
// to prevent test isolation issues with other test files
import { compileMorningNewspaper as realCompileMorningNewspaper } from "@cream/api";
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
	])
);

const mockRepo = {
	getEntriesSinceClose: mockGetEntriesSinceClose,
	upsertNewspaper: mockUpsertNewspaper,
};

const mockGetMacroWatchRepo = mock(() => Promise.resolve(mockRepo));

const mockGetPreviousTradingDay = mock(() => Promise.resolve("2026-01-14"));
const mockCalendarService = {
	getPreviousTradingDay: mockGetPreviousTradingDay,
};
const mockGetCalendarService = mock<() => typeof mockCalendarService | null>(
	() => mockCalendarService
);

mock.module("@cream/api", () => ({
	getMacroWatchRepo: mockGetMacroWatchRepo,
	// Pass through the real compileMorningNewspaper to avoid breaking other tests
	compileMorningNewspaper: realCompileMorningNewspaper,
}));

mock.module("@cream/domain", () => ({
	getCalendarService: mockGetCalendarService,
}));

describe("NewspaperService", () => {
	let service: NewspaperService;

	beforeEach(() => {
		service = createNewspaperService();
		mockGetMacroWatchRepo.mockClear();
		mockGetEntriesSinceClose.mockClear();
		mockUpsertNewspaper.mockClear();
		mockGetCalendarService.mockClear();
		mockGetPreviousTradingDay.mockClear();
	});

	afterEach(() => {
		mockGetMacroWatchRepo.mockClear();
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
			expect(mockGetMacroWatchRepo).toHaveBeenCalled();
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
			mockGetMacroWatchRepo.mockImplementationOnce(
				() =>
					new Promise((resolve) =>
						setTimeout(
							() =>
								resolve({
									getEntriesSinceClose: mock(() => Promise.resolve([])),
									upsertNewspaper: mock(() => Promise.resolve()),
								}),
							100
						)
					)
			);

			const firstCompile = service.compile(["AAPL"]);
			await service.compile(["MSFT"]);

			await firstCompile;
			expect(mockGetMacroWatchRepo).toHaveBeenCalledTimes(1);
		});

		test("skips when no entries available", async () => {
			mockGetEntriesSinceClose.mockImplementationOnce(() => Promise.resolve([]));

			await service.compile(["AAPL"]);

			// When no entries, upsertNewspaper should not be called (compilation skipped)
			expect(mockUpsertNewspaper).not.toHaveBeenCalled();
		});

		test("handles calendar service not available", async () => {
			mockGetCalendarService.mockReturnValueOnce(null);

			await service.compile(["AAPL"]);

			expect(mockGetMacroWatchRepo).not.toHaveBeenCalled();
			expect(service.getLastCompile()).toBeNull();
		});

		test("handles errors gracefully", async () => {
			mockGetMacroWatchRepo.mockImplementationOnce(() =>
				Promise.reject(new Error("Database error"))
			);

			await service.compile(["AAPL"]);

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
