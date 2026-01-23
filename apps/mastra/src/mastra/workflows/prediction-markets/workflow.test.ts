/**
 * Prediction Markets Workflow Integration Tests
 *
 * Tests the prediction markets workflow schema validation
 * and step execution with mocked dependencies.
 */

import { describe, expect, it, mock } from "bun:test";
import { z } from "zod";
import {
	MacroRiskSignalsSchema,
	PredictionMarketsInputSchema,
	PredictionMarketsOutputSchema,
} from "./schemas.js";
import { fetchPredictionMarketsStep } from "./steps/index.js";
import { predictionMarketsWorkflow } from "./workflow.js";

// Mock @cream/domain to return test context
mock.module("@cream/domain", () => ({
	createContext: () => ({
		environment: "PAPER",
		source: "test",
		traceId: "test-trace",
	}),
	requireEnv: () => "PAPER",
	isTest: () => true,
}));

// Mock @cream/config
mock.module("@cream/config", () => ({
	createDefaultPredictionMarketsConfig: () => ({
		kalshi: { enabled: false },
		polymarket: { enabled: false },
	}),
}));

// Mock @cream/prediction-markets
mock.module("@cream/prediction-markets", () => ({
	createUnifiedClient: () => null,
	toNumericScores: () => ({}),
}));

// Mock @cream/logger
mock.module("@cream/logger", () => ({
	createNodeLogger: () => ({
		info: () => {},
		warn: () => {},
		error: () => {},
	}),
}));

// Mock @cream/external-context (needed for transitive imports)
const mockZodSchema = z.object({});
mock.module("@cream/external-context", () => ({
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

describe("prediction-markets workflow", () => {
	describe("schema validation", () => {
		it("should validate input schema with default market types", () => {
			const result = PredictionMarketsInputSchema.safeParse({});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.marketTypes).toEqual(["FED_RATE", "ECONOMIC_DATA", "RECESSION"]);
			}
		});

		it("should validate input schema with custom market types", () => {
			const result = PredictionMarketsInputSchema.safeParse({
				marketTypes: ["FED_RATE", "ELECTION"],
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.marketTypes).toEqual(["FED_RATE", "ELECTION"]);
			}
		});

		it("should reject invalid market types", () => {
			const result = PredictionMarketsInputSchema.safeParse({
				marketTypes: ["INVALID_TYPE"],
			});
			expect(result.success).toBe(false);
		});

		it("should validate output schema structure", () => {
			const output = {
				signals: {
					platforms: ["kalshi", "polymarket"],
					timestamp: new Date().toISOString(),
					fedCutProbability: 0.65,
				},
				scores: { fedCut: 0.65 },
				numericScores: { fedCut: 65 },
				eventCount: 10,
				arbitrageAlertCount: 2,
				fetchedAt: new Date().toISOString(),
			};
			const result = PredictionMarketsOutputSchema.safeParse(output);
			expect(result.success).toBe(true);
		});

		it("should validate MacroRiskSignals with optional fields", () => {
			const signals = {
				platforms: [],
				timestamp: new Date().toISOString(),
			};
			const result = MacroRiskSignalsSchema.safeParse(signals);
			expect(result.success).toBe(true);
		});

		it("should validate MacroRiskSignals with all fields", () => {
			const signals = {
				fedCutProbability: 0.65,
				fedHikeProbability: 0.15,
				recessionProbability12m: 0.35,
				macroUncertaintyIndex: 0.5,
				policyEventRisk: 0.4,
				marketConfidence: 0.7,
				marketCount: 25,
				platforms: ["kalshi", "polymarket"],
				timestamp: new Date().toISOString(),
			};
			const result = MacroRiskSignalsSchema.safeParse(signals);
			expect(result.success).toBe(true);
		});
	});

	describe("workflow definition", () => {
		it("should have correct workflow id", () => {
			expect(predictionMarketsWorkflow.id).toBe("prediction-markets");
		});
	});

	describe("fetchPredictionMarketsStep", () => {
		it("should have correct step id", () => {
			expect(fetchPredictionMarketsStep.id).toBe("fetch-prediction-markets");
		});

		it("should execute and return empty data in test mode", async () => {
			const result = await fetchPredictionMarketsStep.execute({
				inputData: { marketTypes: ["FED_RATE"] },
				mapiTraceId: "test",
				runId: "test-run",
				context: { machineContext: undefined },
				getInitData: () => undefined,
				getStepResult: () => undefined,
				runtimeContext: {},
			} as never);

			expect(result).toHaveProperty("signals");
			expect(result).toHaveProperty("fetchedAt");
			if ("signals" in result && "eventCount" in result) {
				expect(result.signals.platforms).toEqual([]);
				expect(result.eventCount).toBe(0);
			}
		});

		it("should return valid output schema from step execution", async () => {
			const result = await fetchPredictionMarketsStep.execute({
				inputData: { marketTypes: ["FED_RATE", "RECESSION"] },
				mapiTraceId: "test",
				runId: "test-run",
				context: { machineContext: undefined },
				getInitData: () => undefined,
				getStepResult: () => undefined,
				runtimeContext: {},
			} as never);

			const validation = PredictionMarketsOutputSchema.safeParse(result);
			expect(validation.success).toBe(true);
		});
	});
});
