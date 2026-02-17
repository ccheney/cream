/**
 * Trading Cycle Workflow Schema Tests
 */

import { describe, expect, it } from "bun:test";

import {
	ApprovalSchema,
	DecisionSchema,
	MarketSnapshotSchema,
	MemoryContextSchema,
	RegimeDataSchema,
	WorkflowInputSchema,
	WorkflowResultSchema,
} from "./schemas.js";
import { registerTradingCycleMocks } from "./test-helpers/mock-dependencies.js";
import { tradingCycleWorkflow } from "./workflow.js";

registerTradingCycleMocks();

function registerWorkflowInputSchemaTests(): void {
	describe("WorkflowInputSchema", () => {
		it("should validate required fields", () => {
			expect(
				WorkflowInputSchema.safeParse({
					cycleId: "cycle-123",
					instruments: ["AAPL", "MSFT"],
				}).success,
			).toBe(true);
		});

		it("should reject empty instruments array", () => {
			expect(
				WorkflowInputSchema.safeParse({
					cycleId: "cycle-123",
					instruments: [],
				}).success,
			).toBe(false);
		});
	});
}

function registerSupportingSchemaTests(): void {
	describe("supporting schemas", () => {
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
			expect(MarketSnapshotSchema.safeParse(snapshot).success).toBe(true);
		});

		it("should validate RegimeDataSchema", () => {
			expect(
				RegimeDataSchema.safeParse({
					regime: "BULL_TREND",
					confidence: 0.85,
					reasoning: "Strong upward momentum with increasing volume",
				}).success,
			).toBe(true);
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
			expect(MemoryContextSchema.safeParse(memory).success).toBe(true);
		});
	});
}

function registerDecisionSchemaTests(): void {
	describe("decision schemas", () => {
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
			expect(DecisionSchema.safeParse(decision).success).toBe(true);
		});

		it("should validate ApprovalSchema", () => {
			expect(
				ApprovalSchema.safeParse({
					verdict: "APPROVE" as const,
					approvedDecisionIds: ["dec-1"],
					notes: "All risk constraints satisfied",
				}).success,
			).toBe(true);
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
			expect(WorkflowResultSchema.safeParse(result).success).toBe(true);
		});
	});
}

describe("trading-cycle workflow schemas", () => {
	registerWorkflowInputSchemaTests();
	registerSupportingSchemaTests();
	registerDecisionSchemaTests();

	describe("workflow definition", () => {
		it("should have correct workflow id", () => {
			expect(tradingCycleWorkflow.id).toBe("trading-cycle");
		});
	});
});
