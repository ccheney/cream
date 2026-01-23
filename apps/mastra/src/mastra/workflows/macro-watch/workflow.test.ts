/**
 * Macro Watch Workflow Integration Tests
 *
 * Tests the macro watch workflow schema validation
 * and step execution with mocked dependencies.
 */

import { describe, expect, it, mock } from "bun:test";
import { z } from "zod";
import {
	EconomicIndicatorSchema,
	MacroWatchInputSchema,
	MacroWatchOutputSchema,
	MoverSchema,
	NewsItemSchema,
	NewspaperSectionSchema,
	PredictionSignalSchema,
} from "./schemas.js";
import {
	compileNewspaperStep,
	scanEconomicStep,
	scanMoversStep,
	scanNewsStep,
	scanPredictionsStep,
} from "./steps/index.js";
import { macroWatchWorkflow } from "./workflow.js";

// Mock @cream/domain
mock.module("@cream/domain", () => ({
	createContext: () => ({
		environment: "PAPER",
		source: "test",
		traceId: "test-trace",
	}),
	requireEnv: () => "PAPER",
	isTest: () => true,
	calculateCaseStatistics: () => ({
		total: 0,
		byAction: {},
		byRegime: {},
		averageSimilarity: 0,
	}),
}));

// Mock @cream/external-context
const mockZodSchema = z.object({});
mock.module("@cream/external-context", () => ({
	fetchNewsHeadlines: async () => [],
	extractNewsContext: async () => ({ news: [], sentiment: {} }),
	createSemanticScholarClient: () => ({
		searchPapers: async () => ({ data: [], total: 0, offset: 0 }),
	}),
	SemanticScholarClient: class {},
	createExtractionPipeline: () => ({
		processNews: async () => ({ events: [] }),
	}),
	ExtractionPipeline: class {},
	createEntityLinker: () => ({
		link: async () => [],
	}),
	EntityLinker: class {},
	ExtractionResultSchema: mockZodSchema,
	DataPointSchema: mockZodSchema,
	EntityTypeSchema: z.enum(["PERSON", "ORG", "PRODUCT"]),
	EventTypeSchema: z.enum(["EARNINGS", "MACRO"]),
	ExtractedEntitySchema: mockZodSchema,
	SentimentSchema: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]),
}));

// Mock @cream/prediction-markets
mock.module("@cream/prediction-markets", () => ({
	createUnifiedClient: () => null,
	toNumericScores: () => ({}),
}));

// Mock @cream/config
mock.module("@cream/config", () => ({
	createDefaultPredictionMarketsConfig: () => ({
		kalshi: { enabled: false },
		polymarket: { enabled: false },
	}),
}));

// Mock @cream/marketdata
mock.module("@cream/marketdata", () => ({
	isAlpacaConfigured: () => false,
	createAlpacaClientFromEnv: () => ({
		getSnapshots: async () => new Map(),
		getMovers: async () => ({ gainers: [], losers: [] }),
	}),
}));

// Mock @cream/logger
mock.module("@cream/logger", () => ({
	createNodeLogger: () => ({
		info: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {},
	}),
}));

describe("macro-watch workflow", () => {
	describe("schema validation", () => {
		it("should validate input schema with required cycleId", () => {
			const result = MacroWatchInputSchema.safeParse({
				cycleId: "cycle-123",
			});
			expect(result.success).toBe(true);
		});

		it("should validate input schema with optional date", () => {
			const result = MacroWatchInputSchema.safeParse({
				cycleId: "cycle-123",
				date: "2024-01-15",
			});
			expect(result.success).toBe(true);
		});

		it("should reject input without cycleId", () => {
			const result = MacroWatchInputSchema.safeParse({});
			expect(result.success).toBe(false);
		});

		it("should validate NewsItemSchema", () => {
			const newsItem = {
				headline: "Fed signals rate cut ahead",
				source: "Reuters",
				timestamp: new Date().toISOString(),
				summary: "Federal Reserve indicates potential rate cuts in coming months",
				sentiment: "POSITIVE" as const,
				symbols: ["SPY", "QQQ"],
			};
			const result = NewsItemSchema.safeParse(newsItem);
			expect(result.success).toBe(true);
		});

		it("should validate PredictionSignalSchema", () => {
			const signal = {
				market: "Fed Rate Cut March 2024",
				probability: 0.72,
				change24h: 0.05,
				timestamp: new Date().toISOString(),
			};
			const result = PredictionSignalSchema.safeParse(signal);
			expect(result.success).toBe(true);
		});

		it("should validate EconomicIndicatorSchema", () => {
			const indicator = {
				indicator: "CPI YoY",
				value: 3.2,
				previousValue: 3.4,
				change: -0.2,
				timestamp: new Date().toISOString(),
			};
			const result = EconomicIndicatorSchema.safeParse(indicator);
			expect(result.success).toBe(true);
		});

		it("should validate MoverSchema", () => {
			const mover = {
				symbol: "NVDA",
				name: "NVIDIA Corporation",
				change: 5.2,
				volume: 50000000,
				reason: "Strong earnings beat",
			};
			const result = MoverSchema.safeParse(mover);
			expect(result.success).toBe(true);
		});

		it("should validate NewspaperSectionSchema", () => {
			const section = {
				title: "Market Overview",
				content: "Markets rallied on Fed commentary...",
				highlights: ["S&P 500 up 1.2%", "Tech leads gains"],
			};
			const result = NewspaperSectionSchema.safeParse(section);
			expect(result.success).toBe(true);
		});

		it("should validate full output schema", () => {
			const output = {
				cycleId: "cycle-123",
				timestamp: new Date().toISOString(),
				sections: [
					{
						title: "Market Summary",
						content: "Markets closed higher...",
						highlights: ["SPY +1.5%"],
					},
				],
				news: [],
				predictions: [],
				economic: [],
				movers: {
					gainers: [],
					losers: [],
				},
				errors: [],
			};
			const result = MacroWatchOutputSchema.safeParse(output);
			expect(result.success).toBe(true);
		});
	});

	describe("workflow definition", () => {
		it("should have correct workflow id", () => {
			expect(macroWatchWorkflow.id).toBe("macro-watch");
		});
	});

	describe("scan steps", () => {
		const createStepContext = (inputData: Record<string, unknown>) => ({
			inputData,
			mapiTraceId: "test",
			runId: "test-run",
			context: { machineContext: undefined },
			suspend: async () => undefined,
			getInitData: () => undefined,
			getStepResult: () => undefined,
			runtimeContext: {},
		});

		it("scanNewsStep should have correct id", () => {
			expect(scanNewsStep.id).toBe("macro-scan-news");
		});

		it("scanPredictionsStep should have correct id", () => {
			expect(scanPredictionsStep.id).toBe("macro-scan-predictions");
		});

		it("scanEconomicStep should have correct id", () => {
			expect(scanEconomicStep.id).toBe("macro-scan-economic");
		});

		it("scanMoversStep should have correct id", () => {
			expect(scanMoversStep.id).toBe("macro-scan-movers");
		});

		it("compileNewspaperStep should have correct id", () => {
			expect(compileNewspaperStep.id).toBe("macro-compile-newspaper");
		});

		it("scanNewsStep should execute and return news array", async () => {
			const result = await scanNewsStep.execute(
				createStepContext({ cycleId: "test-cycle" }) as never,
			);
			expect(result).toHaveProperty("cycleId", "test-cycle");
			expect(result).toHaveProperty("news");
			if ("news" in result) {
				expect(Array.isArray(result.news)).toBe(true);
			}
		});

		it("scanPredictionsStep should execute and return predictions array", async () => {
			const result = await scanPredictionsStep.execute(
				createStepContext({ cycleId: "test-cycle" }) as never,
			);
			expect(result).toHaveProperty("cycleId", "test-cycle");
			expect(result).toHaveProperty("predictions");
			if ("predictions" in result) {
				expect(Array.isArray(result.predictions)).toBe(true);
			}
		});

		it("scanEconomicStep should execute and return economic array", async () => {
			const result = await scanEconomicStep.execute(
				createStepContext({ cycleId: "test-cycle" }) as never,
			);
			expect(result).toHaveProperty("cycleId", "test-cycle");
			expect(result).toHaveProperty("economic");
			if ("economic" in result) {
				expect(Array.isArray(result.economic)).toBe(true);
			}
		});

		it("scanMoversStep should execute and return gainers/losers", async () => {
			const result = await scanMoversStep.execute(
				createStepContext({ cycleId: "test-cycle" }) as never,
			);
			expect(result).toHaveProperty("cycleId", "test-cycle");
			expect(result).toHaveProperty("gainers");
			expect(result).toHaveProperty("losers");
			if ("gainers" in result && "losers" in result) {
				expect(Array.isArray(result.gainers)).toBe(true);
				expect(Array.isArray(result.losers)).toBe(true);
			}
		});

		it("compileNewspaperStep should compile sections from scan results", async () => {
			const result = await compileNewspaperStep.execute(
				createStepContext({
					cycleId: "test-cycle",
					news: [],
					predictions: [],
					economic: [],
					gainers: [],
					losers: [],
				}) as never,
			);
			expect(result).toHaveProperty("cycleId", "test-cycle");
			expect(result).toHaveProperty("sections");
			expect(result).toHaveProperty("timestamp");
			if ("sections" in result) {
				expect(Array.isArray(result.sections)).toBe(true);
			}
		});
	});
});
