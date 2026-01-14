/**
 * Zod schemas for structured agent outputs.
 *
 * All schemas used for agent structured output validation.
 */

import { z } from "zod";

// ============================================
// Sentiment Analysis Schemas
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

export const SentimentAnalysisSchema = z.object({
	instrument_id: z.string(),
	event_impacts: z.array(EventImpactSchema),
	overall_sentiment: z.enum(["BULLISH", "BEARISH", "NEUTRAL", "MIXED"]),
	sentiment_strength: z.number().min(0).max(1),
	duration_expectation: z.enum(["INTRADAY", "DAYS", "WEEKS", "PERSISTENT"]),
	linked_event_ids: z.array(z.string()),
});

// ============================================
// Fundamentals Analysis Schemas
// ============================================

export const EventRiskSchema = z.object({
	event: z.string(),
	date: z.string(),
	potential_impact: z.enum(["HIGH", "MEDIUM", "LOW"]),
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

// ============================================
// Research Schemas
// ============================================

export const SupportingFactorSchema = z.object({
	factor: z.string(),
	source: z.enum(["TECHNICAL", "SENTIMENT", "FUNDAMENTAL", "MEMORY"]),
	strength: z.enum(["STRONG", "MODERATE", "WEAK"]),
});

export const BullishResearchSchema = z.object({
	instrument_id: z.string(),
	bullish_thesis: z.string(),
	supporting_factors: z.array(SupportingFactorSchema),
	target_conditions: z.string(),
	invalidation_conditions: z.string(),
	conviction_level: z.number().min(0).max(1),
	memory_case_ids: z.array(z.string()),
	strongest_counterargument: z.string(),
});

export const BearishResearchSchema = z.object({
	instrument_id: z.string(),
	bearish_thesis: z.string(),
	supporting_factors: z.array(SupportingFactorSchema),
	target_conditions: z.string(),
	invalidation_conditions: z.string(),
	conviction_level: z.number().min(0).max(1),
	memory_case_ids: z.array(z.string()),
	strongest_counterargument: z.string(),
});

// ============================================
// Decision Plan Schemas
// ============================================

export const TradeSizeSchema = z.object({
	value: z.number(),
	unit: z.enum(["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"]),
});

export const StopLossSchema = z.object({
	price: z.number(),
	type: z.enum(["FIXED", "TRAILING"]),
});

export const TakeProfitSchema = z.object({
	price: z.number(),
});

export const RationaleSchema = z.object({
	summary: z.string(),
	bullishFactors: z.array(z.string()),
	bearishFactors: z.array(z.string()),
	decisionLogic: z.string(),
	memoryReferences: z.array(z.string()),
});

export const DecisionSchema = z.object({
	decisionId: z.string(),
	instrumentId: z.string(),
	action: z.enum(["BUY", "SELL", "HOLD", "CLOSE"]),
	direction: z.enum(["LONG", "SHORT", "FLAT"]),
	size: TradeSizeSchema,
	stopLoss: StopLossSchema.optional(),
	takeProfit: TakeProfitSchema.optional(),
	strategyFamily: z.enum([
		"EQUITY_LONG",
		"EQUITY_SHORT",
		"OPTION_LONG",
		"OPTION_SHORT",
		"VERTICAL_SPREAD",
		"IRON_CONDOR",
		"STRADDLE",
		"STRANGLE",
		"CALENDAR_SPREAD",
	]),
	timeHorizon: z.enum(["INTRADAY", "SWING", "POSITION"]),
	rationale: RationaleSchema,
	thesisState: z.enum(["WATCHING", "ENTERED", "ADDING", "MANAGING", "EXITING", "CLOSED"]),
});

export const DecisionPlanSchema = z.object({
	cycleId: z.string(),
	timestamp: z.string(),
	decisions: z.array(DecisionSchema),
	portfolioNotes: z.string(),
});

// ============================================
// Risk Manager Schemas
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

export const RiskManagerOutputSchema = z.object({
	verdict: z.enum(["APPROVE", "REJECT"]),
	violations: z.array(ConstraintViolationSchema),
	required_changes: z.array(RequiredChangeSchema),
	risk_notes: z.string(),
});

// ============================================
// Critic Schemas
// ============================================

export const InconsistencySchema = z.object({
	decisionId: z.string(),
	issue: z.string(),
	expected: z.string(),
	found: z.string(),
});

export const MissingJustificationSchema = z.object({
	decisionId: z.string(),
	missing: z.string(),
});

export const HallucinationFlagSchema = z.object({
	decisionId: z.string(),
	claim: z.string(),
	evidence_status: z.enum(["NOT_FOUND", "CONTRADICTED"]),
});

export const CriticRequiredChangeSchema = z.object({
	decisionId: z.string(),
	change: z.string(),
});

export const CriticOutputSchema = z.object({
	verdict: z.enum(["APPROVE", "REJECT"]),
	inconsistencies: z.array(InconsistencySchema),
	missing_justifications: z.array(MissingJustificationSchema),
	hallucination_flags: z.array(HallucinationFlagSchema),
	required_changes: z.array(CriticRequiredChangeSchema),
});

// ============================================
// Idea Agent Schemas
// ============================================

export const IdeaAgentOutputSchema = z.object({
	hypothesis_id: z.string(),
	title: z.string(),
	economic_rationale: z.string(),
	market_mechanism: z.enum([
		"BEHAVIORAL_BIAS",
		"STRUCTURAL_CONSTRAINT",
		"INFORMATION_ASYMMETRY",
		"LIQUIDITY_PREMIUM",
		"RISK_PREMIUM",
	]),
	target_regime: z.enum(["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL", "LOW_VOL"]),
	expected_metrics: z.object({
		ic_target: z.number(),
		sharpe_target: z.number(),
		decay_half_life_days: z.number(),
	}),
	falsification_criteria: z.array(z.string()),
	required_features: z.array(z.string()),
	parameter_count: z.number(),
	related_literature: z.array(
		z.object({
			title: z.string(),
			authors: z.string(),
			url: z.string().nullable(),
			relevance: z.string(),
		})
	),
	originality_justification: z.string(),
	similar_past_hypotheses: z.array(
		z.object({
			hypothesis_id: z.string(),
			outcome: z.enum(["validated", "rejected"]),
			lesson: z.string(),
		})
	),
	implementation_hints: z.string(),
});

export type IdeaAgentOutput = z.infer<typeof IdeaAgentOutputSchema>;

// ============================================
// Grounding Agent Schemas
// ============================================

/**
 * Per-symbol grounding context gathered from web searches.
 * Includes symbol as explicit field for Gemini JSON Schema compatibility.
 */
export const SymbolGroundingSchema = z.object({
	symbol: z.string().describe("Stock ticker symbol (e.g., AAPL, MSFT)"),
	news: z.array(z.string()).describe("Key headlines and recent developments"),
	fundamentals: z.array(z.string()).describe("Valuation context and analyst views"),
	bullCase: z.array(z.string()).describe("Bullish catalysts and opportunities"),
	bearCase: z.array(z.string()).describe("Bearish risks and concerns"),
});

/**
 * Global/macro grounding context.
 */
export const GlobalGroundingSchema = z.object({
	macro: z.array(z.string()).describe("Market-wide themes and Fed policy"),
	events: z.array(z.string()).describe("Upcoming economic events and catalysts"),
});

/**
 * Source reference from grounding search.
 */
export const GroundingSourceSchema = z.object({
	url: z.string().describe("Source URL"),
	title: z.string().describe("Source title or headline"),
	relevance: z.string().describe("Why this source is relevant"),
});

/**
 * Complete grounding output from the Web Grounding Agent.
 * Uses array instead of record for Gemini JSON Schema compatibility.
 */
export const GroundingOutputSchema = z.object({
	perSymbol: z.array(SymbolGroundingSchema).describe("Grounding context for each symbol"),
	global: GlobalGroundingSchema.describe("Market-wide grounding context"),
	sources: z.array(GroundingSourceSchema).describe("Key sources referenced"),
});

export type GroundingOutput = z.infer<typeof GroundingOutputSchema>;
export type SymbolGrounding = z.infer<typeof SymbolGroundingSchema>;
export type GlobalGrounding = z.infer<typeof GlobalGroundingSchema>;
export type GroundingSource = z.infer<typeof GroundingSourceSchema>;
