/**
 * Trading Cycle Workflow Integration Tests
 *
 * Tests the trading cycle OODA loop workflow schema validation
 * and step execution with mocked dependencies.
 */

import { describe, expect, it, mock } from "bun:test";
import { z } from "zod";
import {
	ApprovalSchema,
	DecisionSchema,
	MarketSnapshotSchema,
	MemoryContextSchema,
	RegimeDataSchema,
	WorkflowInputSchema,
	WorkflowResultSchema,
} from "./schemas.js";
import {
	actStep,
	analystsStep,
	consensusStep,
	debateStep,
	groundingStep,
	observeStep,
	orientStep,
	traderStep,
} from "./steps/index.js";
import { tradingCycleWorkflow } from "./workflow.js";

// Mock @cream/domain
mock.module("@cream/domain", () => ({
	createContext: () => ({
		environment: "PAPER",
		source: "test",
		traceId: "test-trace",
	}),
	requireEnv: () => "PAPER",
	isTest: () => true,
}));

// Mock @cream/marketdata
mock.module("@cream/marketdata", () => ({
	isAlpacaConfigured: () => false,
	createAlpacaClientFromEnv: () => ({
		getSnapshots: async () => new Map(),
		getBars: async () => [],
	}),
}));

// Mock @cream/regime
mock.module("@cream/regime", () => ({
	classifyRegime: () => ({
		regime: "RANGE",
		confidence: 0.7,
		reasoning: "Mock regime classification",
	}),
	DEFAULT_RULE_BASED_CONFIG: {},
	getRequiredCandleCount: () => 50,
}));

// Mock @cream/universe
mock.module("@cream/universe", () => ({
	resolveUniverseSymbols: async () => ["AAPL", "MSFT"],
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

describe("trading-cycle workflow", () => {
	describe("schema validation", () => {
		it("should validate WorkflowInputSchema with required fields", () => {
			const result = WorkflowInputSchema.safeParse({
				cycleId: "cycle-123",
				instruments: ["AAPL", "MSFT"],
			});
			expect(result.success).toBe(true);
		});

		it("should reject empty instruments array", () => {
			const result = WorkflowInputSchema.safeParse({
				cycleId: "cycle-123",
				instruments: [],
			});
			expect(result.success).toBe(false);
		});

		it("should validate MarketSnapshotSchema", () => {
			const snapshot = {
				instruments: ["AAPL"],
				candles: {
					AAPL: [
						{
							timestamp: Date.now(),
							open: 150,
							high: 152,
							low: 149,
							close: 151,
							volume: 1000000,
						},
					],
				},
				quotes: {
					AAPL: {
						bid: 150.5,
						ask: 150.6,
						bidSize: 100,
						askSize: 100,
						timestamp: Date.now(),
					},
				},
				timestamp: Date.now(),
			};
			const result = MarketSnapshotSchema.safeParse(snapshot);
			expect(result.success).toBe(true);
		});

		it("should validate RegimeDataSchema", () => {
			const regime = {
				regime: "BULL_TREND",
				confidence: 0.85,
				reasoning: "Strong upward momentum with increasing volume",
			};
			const result = RegimeDataSchema.safeParse(regime);
			expect(result.success).toBe(true);
		});

		it("should validate MemoryContextSchema", () => {
			const memory = {
				relevantCases: [
					{
						caseId: "case-1",
						symbol: "AAPL",
						action: "BUY",
						regime: "BULL_TREND",
						rationale: "Strong earnings momentum",
						similarity: 0.92,
					},
				],
				regimeLabels: {
					AAPL: {
						regime: "BULL_TREND",
						confidence: 0.85,
					},
				},
			};
			const result = MemoryContextSchema.safeParse(memory);
			expect(result.success).toBe(true);
		});

		it("should validate DecisionSchema", () => {
			const decision = {
				decisionId: "dec-1",
				instrumentId: "AAPL",
				action: "BUY" as const,
				direction: "LONG" as const,
				size: { value: 100, unit: "shares" },
				stopLoss: { price: 145, type: "FIXED" as const },
				takeProfit: { price: 165 },
				strategyFamily: "momentum",
				timeHorizon: "swing",
				rationale: {
					summary: "Strong breakout with volume confirmation",
					bullishFactors: ["Earnings beat", "Technical breakout"],
					bearishFactors: ["Broad market weakness"],
					decisionLogic: "Risk/reward favorable at 2:1",
					memoryReferences: ["case-1"],
				},
				thesisState: "ACTIVE",
				confidence: 0.75,
			};
			const result = DecisionSchema.safeParse(decision);
			expect(result.success).toBe(true);
		});

		it("should validate ApprovalSchema", () => {
			const approval = {
				verdict: "APPROVE" as const,
				approvedDecisionIds: ["dec-1"],
				notes: "All risk constraints satisfied",
			};
			const result = ApprovalSchema.safeParse(approval);
			expect(result.success).toBe(true);
		});

		it("should validate WorkflowResultSchema", () => {
			const result = {
				cycleId: "cycle-123",
				approved: true,
				iterations: 1,
				orderSubmission: {
					submitted: true,
					orderIds: ["order-1"],
					errors: [],
				},
				mode: "LLM" as const,
				configVersion: null,
			};
			const validation = WorkflowResultSchema.safeParse(result);
			expect(validation.success).toBe(true);
		});
	});

	describe("workflow definition", () => {
		it("should have correct workflow id", () => {
			expect(tradingCycleWorkflow.id).toBe("trading-cycle");
		});
	});

	describe("OODA steps", () => {
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

		describe("observeStep", () => {
			it("should have correct step id", () => {
				expect(observeStep.id).toBe("observe-market");
			});

			it("should execute and return market snapshot", async () => {
				const result = await observeStep.execute(
					createStepContext({
						cycleId: "test-cycle",
						instruments: ["AAPL"],
					}) as never,
				);

				expect(result).toHaveProperty("cycleId", "test-cycle");
				expect(result).toHaveProperty("marketSnapshot");
				expect(result).toHaveProperty("regimeLabels");
				if ("marketSnapshot" in result) {
					expect(result.marketSnapshot.instruments).toContain("AAPL");
				}
			});
		});

		describe("orientStep", () => {
			it("should have correct step id", () => {
				expect(orientStep.id).toBe("orient-context");
			});

			it("should execute and return memory context", async () => {
				const marketSnapshot = {
					instruments: ["AAPL"],
					candles: {},
					quotes: {},
					timestamp: Date.now(),
				};

				const result = await orientStep.execute(
					createStepContext({
						cycleId: "test-cycle",
						marketSnapshot,
						regimeLabels: {
							AAPL: { regime: "RANGE_BOUND", confidence: 0.5 },
						},
					}) as never,
				);

				expect(result).toHaveProperty("cycleId", "test-cycle");
				expect(result).toHaveProperty("memoryContext");
				expect(result).toHaveProperty("mode");
				if ("mode" in result) {
					expect(result.mode).toBe("STUB");
				}
			});
		});

		describe("groundingStep", () => {
			it("should have correct step id", () => {
				expect(groundingStep.id).toBe("grounding-context");
			});
		});

		describe("analystsStep", () => {
			it("should have correct step id", () => {
				expect(analystsStep.id).toBe("analysts-parallel");
			});
		});

		describe("debateStep", () => {
			it("should have correct step id", () => {
				expect(debateStep.id).toBe("debate-researchers");
			});
		});

		describe("traderStep", () => {
			it("should have correct step id", () => {
				expect(traderStep.id).toBe("trader-synthesize");
			});
		});

		describe("consensusStep", () => {
			it("should have correct step id", () => {
				expect(consensusStep.id).toBe("consensus-approval");
			});
		});

		describe("actStep", () => {
			it("should have correct step id", () => {
				expect(actStep.id).toBe("act-execute");
			});

			it("should execute and return workflow result when not approved", async () => {
				const result = await actStep.execute(
					createStepContext({
						cycleId: "test-cycle",
						approved: false,
						iterations: 1,
						mode: "STUB",
					}) as never,
				);

				expect(result).toHaveProperty("cycleId", "test-cycle");
				expect(result).toHaveProperty("approved", false);
				expect(result).toHaveProperty("orderSubmission");
				if ("orderSubmission" in result) {
					expect(result.orderSubmission.submitted).toBe(false);
				}
			});

			it("should execute and submit orders when approved with valid plan", async () => {
				const decisionPlan = {
					cycleId: "test-cycle",
					timestamp: new Date().toISOString(),
					decisions: [
						{
							decisionId: "dec-1",
							instrumentId: "AAPL",
							action: "BUY" as const,
							direction: "LONG" as const,
							size: { value: 100, unit: "shares" },
							stopLoss: { price: 145, type: "FIXED" as const },
							strategyFamily: "momentum",
							timeHorizon: "swing",
							rationale: {
								summary: "Test",
								bullishFactors: [],
								bearishFactors: [],
								decisionLogic: "Test",
								memoryReferences: [],
							},
							thesisState: "ACTIVE",
							confidence: 0.8,
						},
					],
					portfolioNotes: "Test notes",
				};

				const result = await actStep.execute(
					createStepContext({
						cycleId: "test-cycle",
						approved: true,
						iterations: 1,
						decisionPlan,
						mode: "LLM",
					}) as never,
				);

				expect(result).toHaveProperty("cycleId", "test-cycle");
				expect(result).toHaveProperty("approved", true);
				if ("orderSubmission" in result) {
					expect(result.orderSubmission.submitted).toBe(true);
					expect(result.orderSubmission.orderIds.length).toBeGreaterThan(0);
				}
			});

			it("should reject orders with constraint violations", async () => {
				const decisionPlan = {
					cycleId: "test-cycle",
					timestamp: new Date().toISOString(),
					decisions: [
						{
							decisionId: "dec-1",
							instrumentId: "AAPL",
							action: "BUY" as const,
							direction: "LONG" as const,
							size: { value: 100, unit: "shares" },
							strategyFamily: "momentum",
							timeHorizon: "swing",
							rationale: {
								summary: "Test",
								bullishFactors: [],
								bearishFactors: [],
								decisionLogic: "Test",
								memoryReferences: [],
							},
							thesisState: "ACTIVE",
							confidence: 0.8,
						},
					],
					portfolioNotes: "Test notes",
				};

				const result = await actStep.execute(
					createStepContext({
						cycleId: "test-cycle",
						approved: true,
						iterations: 1,
						decisionPlan,
						mode: "LLM",
					}) as never,
				);

				if ("orderSubmission" in result) {
					expect(result.orderSubmission.submitted).toBe(false);
					expect(result.orderSubmission.errors).toContain("AAPL: Buy order missing stop loss");
				}
			});

			it("should return valid WorkflowResultSchema", async () => {
				const result = await actStep.execute(
					createStepContext({
						cycleId: "test-cycle",
						approved: false,
						iterations: 2,
						mode: "STUB",
					}) as never,
				);

				const validation = WorkflowResultSchema.safeParse(result);
				expect(validation.success).toBe(true);
			});
		});
	});
});
