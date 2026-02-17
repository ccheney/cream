/**
 * Newspaper Service Tests
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";

let createNewspaperService: typeof import("./newspaper-service.js").createNewspaperService;
let NewspaperService: typeof import("./newspaper-service.js").NewspaperService;

const mockCompileMorningNewspaper = mock(() => ({
	content: {
		date: "2026-01-15",
		summary: "Test summary",
		entryCount: 2,
		sections: {
			macro: "Macro section",
			universe: "Universe section",
			predictionMarkets: "Prediction section",
			economicCalendar: "Calendar section",
		},
	},
	storageInput: {
		date: "2026-01-15",
		summary: "Test summary",
		entryCount: 2,
		sections: {
			macro: ["Macro section"],
			universe: ["Universe section"],
			predictionMarkets: ["Prediction section"],
			economicCalendar: ["Calendar section"],
		},
	},
}));

const mockFormatNewspaperForLLM = mock(() => "Formatted summary");
const mockRunMacroWatch = mock(() => Promise.resolve({ entries: [], totalCount: 0 }));

mock.module("@cream/mastra", () => ({
	compileMorningNewspaper: mockCompileMorningNewspaper,
	formatNewspaperForLLM: mockFormatNewspaperForLLM,
	runMacroWatch: mockRunMacroWatch,
}));

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

const createFilingSyncRunsRepository = () => ({
	start: async () => ({ id: "run-1" }) as { id: string },
	updateProgress: async () => undefined,
	complete: async () => undefined,
	fail: async () => undefined,
});

const createFilingsRepository = () => ({
	existsByAccessionNumber: async () => false,
	create: async () => ({ id: "filing-1" }) as { id: string },
	markComplete: async () => undefined,
});

function createMockMacroWatchRepository() {
	return createMacroWatchRepository();
}

function createMockFilingSyncRunsRepository() {
	return createFilingSyncRunsRepository();
}

function createMockFilingsRepository() {
	return createFilingsRepository();
}

const createMacroWatchRepository = () => ({
	...mockRepo,
});

mock.module("@cream/storage", () => ({
	MacroWatchRepository: createMockMacroWatchRepository,
	FilingSyncRunsRepository: createMockFilingSyncRunsRepository,
	FilingsRepository: createMockFilingsRepository,
}));

mock.module("@cream/domain", () => ({
	getCalendarService: mockGetCalendarService,
	createContext: () => ({
		environment: "PAPER",
		source: "test",
		traceId: "test-trace",
	}),
	getModelId: () => "google/gemini-2.0-flash",
	requireEnv: () => "PAPER",
	isTest: () => true,
	calculateCaseStatistics: () => ({ totalCases: 0 }),
	isLive: () => false,
	getLLMProvider: () => "google",
	getLLMModelId: () => "gemini-2.0-flash",
	getFullModelId: () => "google/gemini-2.0-flash",
}));

let service: NewspaperService;

beforeEach(() => {
	service = createNewspaperService();
	mockCompileMorningNewspaper.mockClear();
	mockFormatNewspaperForLLM.mockClear();
	mockGetEntriesSinceClose.mockClear();
	mockUpsertNewspaper.mockClear();
	mockGetCalendarService.mockClear();
	mockGetPreviousTradingDay.mockClear();
});

beforeAll(async () => {
	({ createNewspaperService, NewspaperService } = await import("./newspaper-service.js"));
});

afterEach(() => {
	mockCompileMorningNewspaper.mockClear();
	mockFormatNewspaperForLLM.mockClear();
	mockGetEntriesSinceClose.mockClear();
	mockUpsertNewspaper.mockClear();
	mockGetCalendarService.mockClear();
	mockGetPreviousTradingDay.mockClear();
});

afterAll(() => {
	mock.restore();
});

test("constructor creates service with default config", () => {
	const svc = new NewspaperService();
	expect(svc.isRunning()).toBe(false);
	expect(svc.getLastCompile()).toBeNull();
});

test("constructor creates service with custom config", () => {
	const svc = new NewspaperService({ maxBulletsPerSection: 10 });
	expect(svc.isRunning()).toBe(false);
});

test("compile compiles newspaper from overnight entries", async () => {
	await service.compile(["AAPL", "MSFT"]);

	expect(mockGetCalendarService).toHaveBeenCalled();
	expect(mockGetEntriesSinceClose).toHaveBeenCalled();
	expect(mockCompileMorningNewspaper).toHaveBeenCalled();
	expect(mockUpsertNewspaper).toHaveBeenCalled();
});

test("compile updates lastCompile timestamp after success", async () => {
	expect(service.getLastCompile()).toBeNull();

	await service.compile(["AAPL"]);

	expect(service.getLastCompile()).not.toBeNull();
	expect(service.getLastCompile()).toBeInstanceOf(Date);
});

test("compile resets running flag after execution", async () => {
	expect(service.isRunning()).toBe(false);

	await service.compile(["AAPL"]);

	expect(service.isRunning()).toBe(false);
});

test("compile skips if already running", async () => {
	mockGetEntriesSinceClose.mockImplementationOnce(
		() => new Promise((resolve) => setTimeout(() => resolve([]), 100)),
	);

	const firstCompile = service.compile(["AAPL"]);
	const result = await service.compile(["MSFT"]);

	expect(result.compiled).toBe(false);
	expect(result.message).toBe("Already running");

	await firstCompile;
});

test("compile skips when no entries are available", async () => {
	mockGetEntriesSinceClose.mockImplementationOnce(() => Promise.resolve([]));

	await service.compile(["AAPL"]);

	expect(mockUpsertNewspaper).not.toHaveBeenCalled();
});

test("compile handles missing calendar service", async () => {
	mockGetCalendarService.mockReturnValueOnce(null);

	const result = await service.compile(["AAPL"]);

	expect(result.compiled).toBe(false);
	expect(result.message).toBe("CalendarService not available");
	expect(service.getLastCompile()).toBeNull();
});

test("compile handles errors gracefully", async () => {
	mockGetEntriesSinceClose.mockImplementationOnce(() =>
		Promise.reject(new Error("Database error")),
	);

	const result = await service.compile(["AAPL"]);

	expect(result.compiled).toBe(false);
	expect(service.isRunning()).toBe(false);
	expect(service.getLastCompile()).toBeNull();
});

test("createNewspaperService creates service instance", () => {
	const svc = createNewspaperService();
	expect(svc).toBeInstanceOf(NewspaperService);
});

test("createNewspaperService creates service with config", () => {
	const svc = createNewspaperService({ maxBulletsPerSection: 5 });
	expect(svc).toBeInstanceOf(NewspaperService);
});
