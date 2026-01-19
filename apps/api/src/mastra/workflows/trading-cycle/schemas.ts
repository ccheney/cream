/**
 * Trading Cycle Workflow Schemas
 *
 * Zod schemas for the Mastra trading cycle workflow.
 * Defines input, output, and state schemas for type-safe workflow execution.
 */

import { z } from "zod";

// ============================================
// Memory Context Schemas
// ============================================

export const MemoryCaseSchema = z.object({
	caseId: z.string(),
	symbol: z.string(),
	action: z.string(),
	regime: z.string(),
	rationale: z.string(),
	similarity: z.number(),
});

// ============================================
// Event Schemas (for agent outputs)
// ============================================

export const EventImpactSchema = z.object({
	event_id: z.string(),
	event_type: z.enum([
		"EARNINGS",
		"GUIDANCE",
		"M&A",
		"REGULATORY",
		"PRODUCT",
		"MACRO",
		"ANALYST",
		"SOCIAL",
	]),
	impact_direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL", "UNCERTAIN"]),
	impact_magnitude: z.enum(["HIGH", "MEDIUM", "LOW"]),
	reasoning: z.string(),
});

export const EventRiskSchema = z.object({
	event: z.string(),
	date: z.string(),
	potential_impact: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

// ============================================
// Approval Schemas
// ============================================

export const ConstraintViolationSchema = z.object({
	constraint: z.string(),
	current_value: z.union([z.string(), z.number()]),
	limit: z.union([z.string(), z.number()]),
	severity: z.enum(["CRITICAL", "WARNING"]),
	affected_decisions: z.array(z.string()),
});

export const RequiredChangeSchema = z.object({
	decisionId: z.string(),
	change: z.string(),
	reason: z.string(),
});

// ============================================
// Prediction Markets
// ============================================

export const PredictionMarketSignalsSchema = z.object({
	fedCutProbability: z.number().optional(),
	fedHikeProbability: z.number().optional(),
	recessionProbability12m: z.number().optional(),
	macroUncertaintyIndex: z.number().optional(),
	policyEventRisk: z.number().optional(),
	marketConfidence: z.number().optional(),
	cpiSurpriseDirection: z.number().optional(),
	gdpSurpriseDirection: z.number().optional(),
	timestamp: z.string().optional(),
	platforms: z.array(z.string()).optional(),
});

// ============================================
// External Context
// ============================================

export const NewsEventSchema = z.object({
	eventId: z.string(),
	type: z.string(),
	summary: z.string(),
	sentiment: z.string(),
	symbols: z.array(z.string()),
	importance: z.number(),
	eventTime: z.string(),
});

export const ExternalContextSchema = z.object({
	news: z.array(NewsEventSchema),
	sentiment: z.record(z.string(), z.number()),
	macroIndicators: z.record(z.string(), z.number()),
	predictionMarketSignals: PredictionMarketSignalsSchema.optional(),
});

// ============================================
// Market Data
// ============================================

export const CandleDataSchema = z.object({
	timestamp: z.number(),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number(),
});

export const QuoteDataSchema = z.object({
	bid: z.number(),
	ask: z.number(),
	bidSize: z.number(),
	askSize: z.number(),
	timestamp: z.number(),
});

export const MarketSnapshotSchema = z.object({
	instruments: z.array(z.string()),
	candles: z.record(z.string(), z.array(CandleDataSchema)),
	quotes: z.record(z.string(), QuoteDataSchema),
	indicators: z.record(z.string(), z.number()).optional(),
	timestamp: z.number(),
});

// ============================================
// Regime and Memory
// ============================================

export const RegimeDataSchema = z.object({
	regime: z.string(),
	confidence: z.number(),
	reasoning: z.string().optional(),
});

export const MemoryContextSchema = z.object({
	relevantCases: z.array(MemoryCaseSchema),
	regimeLabels: z.record(z.string(), RegimeDataSchema),
});

// ============================================
// Analysis Outputs
// ============================================

export const SentimentAnalysisSchema = z.object({
	instrument_id: z.string(),
	event_impacts: z.array(EventImpactSchema),
	overall_sentiment: z.string(),
	sentiment_strength: z.number(),
	duration_expectation: z.string(),
	linked_event_ids: z.array(z.string()),
});

export const FundamentalsAnalysisSchema = z.object({
	instrument_id: z.string(),
	fundamental_drivers: z.array(z.string()),
	fundamental_headwinds: z.array(z.string()),
	valuation_context: z.string(),
	macro_context: z.string(),
	event_risk: z.array(EventRiskSchema),
	fundamental_thesis: z.string(),
	linked_event_ids: z.array(z.string()),
});

export const ResearchSchema = z.object({
	instrument_id: z.string(),
	thesis: z.string(),
	supporting_factors: z.array(
		z.object({
			factor: z.string(),
			source: z.string(),
			strength: z.string(),
		})
	),
	conviction_level: z.number(),
	memory_case_ids: z.array(z.string()),
	strongest_counterargument: z.string(),
});

// ============================================
// Decision Types
// ============================================

export const StopLossSchema = z.object({
	price: z.number(),
	type: z.enum(["FIXED", "TRAILING"]),
});

export const TakeProfitSchema = z.object({
	price: z.number(),
});

export const OptionLegSchema = z.object({
	symbol: z.string().describe("OCC option symbol (e.g., AAPL250117P00190000)"),
	ratioQty: z.number().int().describe("Signed ratio: positive=buy, negative=sell"),
	positionIntent: z.enum(["BUY_TO_OPEN", "BUY_TO_CLOSE", "SELL_TO_OPEN", "SELL_TO_CLOSE"]),
});

export const DecisionSchema = z.object({
	decisionId: z.string(),
	instrumentId: z.string(),
	action: z.enum(["BUY", "SELL", "HOLD", "CLOSE"]),
	direction: z.enum(["LONG", "SHORT", "FLAT"]),
	size: z.object({
		value: z.number(),
		unit: z.string(),
	}),
	stopLoss: StopLossSchema.optional(),
	takeProfit: TakeProfitSchema.optional(),
	strategyFamily: z.string(),
	timeHorizon: z.string(),
	rationale: z.object({
		summary: z.string(),
		bullishFactors: z.array(z.string()),
		bearishFactors: z.array(z.string()),
		decisionLogic: z.string(),
		memoryReferences: z.array(z.string()),
	}),
	thesisState: z.string(),
	confidence: z.number().min(0).max(1),
	legs: z.array(OptionLegSchema).optional(),
	netLimitPrice: z.number().optional(),
});

export const DecisionPlanSchema = z.object({
	cycleId: z.string(),
	timestamp: z.string(),
	decisions: z.array(DecisionSchema),
	portfolioNotes: z.string(),
});

export const ApprovalSchema = z.object({
	verdict: z.enum(["APPROVE", "REJECT"]),
	violations: z.array(ConstraintViolationSchema).optional(),
	required_changes: z.array(RequiredChangeSchema).optional(),
	notes: z.string().optional(),
});

// ============================================
// Workflow Input Schema
// ============================================

export const WorkflowInputSchema = z.object({
	cycleId: z.string(),
	instruments: z.array(z.string()).default(["AAPL", "MSFT", "GOOGL"]),
	useDraftConfig: z.boolean().optional(),
	externalContext: ExternalContextSchema.optional(),
});

export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;

// ============================================
// Workflow State Schema
// ============================================

export const WorkflowStateSchema = z.object({
	cycleId: z.string(),
	timestamp: z.string(),
	configVersion: z.string().nullable().default(null),
	mode: z.enum(["STUB", "LLM"]).default("STUB"),

	// OBSERVE phase
	marketSnapshot: MarketSnapshotSchema.optional(),

	// ORIENT phase
	memoryContext: MemoryContextSchema.optional(),
	regimeLabels: z.record(z.string(), RegimeDataSchema).optional(),

	// DECIDE - Analysis phase
	newsAnalysis: z.array(SentimentAnalysisSchema).optional(),
	fundamentalsAnalysis: z.array(FundamentalsAnalysisSchema).optional(),

	// DECIDE - Debate phase
	bullishResearch: z.array(ResearchSchema).optional(),
	bearishResearch: z.array(ResearchSchema).optional(),

	// DECIDE - Trader phase
	decisionPlan: DecisionPlanSchema.optional(),

	// DECIDE - Consensus phase
	riskApproval: ApprovalSchema.optional(),
	criticApproval: ApprovalSchema.optional(),
	iterations: z.number().default(0),
	approved: z.boolean().default(false),

	// ACT phase
	constraintCheck: z
		.object({
			passed: z.boolean(),
			violations: z.array(z.string()),
		})
		.optional(),
	orderSubmission: z
		.object({
			submitted: z.boolean(),
			orderIds: z.array(z.string()),
			errors: z.array(z.string()),
		})
		.optional(),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

// ============================================
// Workflow Output Schema
// ============================================

export const ThesisUpdateSchema = z.object({
	thesisId: z.string(),
	instrumentId: z.string(),
	fromState: z.string().nullable(),
	toState: z.string(),
	action: z.string(),
	reason: z.string().optional(),
});

export const WorkflowResultSchema = z.object({
	cycleId: z.string(),
	approved: z.boolean(),
	iterations: z.number(),
	orderSubmission: z.object({
		submitted: z.boolean(),
		orderIds: z.array(z.string()),
		errors: z.array(z.string()),
	}),
	decisionPlan: DecisionPlanSchema.optional(),
	riskApproval: ApprovalSchema.optional(),
	criticApproval: ApprovalSchema.optional(),
	mode: z.enum(["STUB", "LLM"]),
	configVersion: z.string().nullable(),
	thesisUpdates: z.array(ThesisUpdateSchema).optional(),
	thesisMemoryIngestion: z
		.object({
			ingested: z.number(),
			errors: z.array(z.string()),
		})
		.optional(),
});

export type WorkflowResult = z.infer<typeof WorkflowResultSchema>;
