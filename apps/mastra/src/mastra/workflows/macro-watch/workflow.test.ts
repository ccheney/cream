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
function SemanticScholarClientMock() {}
function ExtractionPipelineMock() {}
function EntityLinkerMock() {}
mock.module("@cream/external-context", () => ({
	fetchNewsHeadlines: async () => [],
	extractNewsContext: async () => ({ news: [], sentiment: {} }),
	createSemanticScholarClient: () => ({
		searchPapers: async () => ({ data: [], total: 0, offset: 0 }),
	}),
	SemanticScholarClient: SemanticScholarClientMock,
	createExtractionPipeline: () => ({
		processNews: async () => ({ events: [] }),
	}),
	ExtractionPipeline: ExtractionPipelineMock,
	createEntityLinker: () => ({
		link: async () => [],
	}),
	EntityLinker: EntityLinkerMock,
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

function registerSchemaValidationTests(): void {
	describe("schema validation", () => {
		const now = new Date().toISOString();
		registerMacroWatchInputSchemaTests();
		registerMacroWatchComponentSchemaTests(now);
		registerMacroWatchOutputSchemaTest(now);
	});
}

function registerMacroWatchInputSchemaTests(): void {
	it("should validate input schema with required cycleId", () => {
		expect(MacroWatchInputSchema.safeParse({ cycleId: "cycle-123" }).success).toBe(true);
	});

	it("should validate input schema with optional date", () => {
		expect(
			MacroWatchInputSchema.safeParse({ cycleId: "cycle-123", date: "2024-01-15" }).success,
		).toBe(true);
	});

	it("should reject input without cycleId", () => {
		expect(MacroWatchInputSchema.safeParse({}).success).toBe(false);
	});
}

function registerMacroWatchComponentSchemaTests(now: string): void {
	for (const schemaCase of buildMacroWatchSchemaCases(now)) {
		it(`should validate ${schemaCase.name}`, () => {
			expect(schemaCase.schema.safeParse(schemaCase.value).success).toBe(true);
		});
	}
}

function buildMacroWatchSchemaCases(
	now: string,
): { name: string; schema: z.ZodTypeAny; value: unknown }[] {
	return [
		{
			name: "NewsItemSchema",
			schema: NewsItemSchema,
			value: {
				headline: "Fed signals rate cut ahead",
				source: "Reuters",
				timestamp: now,
				summary: "Federal Reserve indicates potential rate cuts in coming months",
				sentiment: "POSITIVE" as const,
				symbols: ["SPY", "QQQ"],
			},
		},
		{
			name: "PredictionSignalSchema",
			schema: PredictionSignalSchema,
			value: {
				market: "Fed Rate Cut March 2024",
				probability: 0.72,
				change24h: 0.05,
				timestamp: now,
			},
		},
		{
			name: "EconomicIndicatorSchema",
			schema: EconomicIndicatorSchema,
			value: {
				indicator: "CPI YoY",
				value: 3.2,
				previousValue: 3.4,
				change: -0.2,
				timestamp: now,
			},
		},
		{
			name: "MoverSchema",
			schema: MoverSchema,
			value: {
				symbol: "NVDA",
				name: "NVIDIA Corporation",
				change: 5.2,
				volume: 50000000,
				reason: "Strong earnings beat",
			},
		},
		{
			name: "NewspaperSectionSchema",
			schema: NewspaperSectionSchema,
			value: {
				title: "Market Overview",
				content: "Markets rallied on Fed commentary...",
				highlights: ["S&P 500 up 1.2%", "Tech leads gains"],
			},
		},
	];
}

function registerMacroWatchOutputSchemaTest(now: string): void {
	it("should validate full output schema", () => {
		expect(
			MacroWatchOutputSchema.safeParse({
				cycleId: "cycle-123",
				timestamp: now,
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
				movers: { gainers: [], losers: [] },
				errors: [],
			}).success,
		).toBe(true);
	});
}

function registerWorkflowDefinitionTests(): void {
	describe("workflow definition", () => {
		it("should have correct workflow id", () => {
			expect(macroWatchWorkflow.id).toBe("macro-watch");
		});
	});
}

function registerScanStepTests(): void {
	describe("scan steps", () => {
		const stepIdCases = [
			{ step: scanNewsStep, expected: "macro-scan-news" },
			{ step: scanPredictionsStep, expected: "macro-scan-predictions" },
			{ step: scanEconomicStep, expected: "macro-scan-economic" },
			{ step: scanMoversStep, expected: "macro-scan-movers" },
			{ step: compileNewspaperStep, expected: "macro-compile-newspaper" },
		];

		for (const stepCase of stepIdCases) {
			it(`${stepCase.expected} should have correct id`, () => {
				expect(stepCase.step.id).toBe(stepCase.expected);
			});
		}

		const executionCases = [
			{ step: scanNewsStep, key: "news" },
			{ step: scanPredictionsStep, key: "predictions" },
			{ step: scanEconomicStep, key: "economic" },
		] as const;

		for (const executionCase of executionCases) {
			it(`${executionCase.key} step should execute and return array`, async () => {
				const result = await executionCase.step.execute(
					createStepContext({ cycleId: "test-cycle" }) as never,
				);
				expect(result).toHaveProperty("cycleId", "test-cycle");
				expect(result).toHaveProperty(executionCase.key);
				if (executionCase.key in result) {
					expect(Array.isArray(result[executionCase.key])).toBe(true);
				}
			});
		}

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
}

describe("macro-watch workflow", () => {
	registerSchemaValidationTests();
	registerWorkflowDefinitionTests();
	registerScanStepTests();
});
