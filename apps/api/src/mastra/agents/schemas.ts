/**
 * Zod schemas for structured agent outputs.
 *
 * All schemas used for agent structured output validation.
 */

import { z } from "zod";

// ============================================
// Sentiment Analysis Schemas
// ============================================

/** Event types aligned with domain EventType from @cream/domain */
export const EventTypeSchema = z.enum([
	"EARNINGS",
	"MACRO",
	"NEWS",
	"SENTIMENT_SPIKE",
	"SEC_FILING",
	"DIVIDEND",
	"SPLIT",
	"M_AND_A",
	"ANALYST_RATING",
	"CONFERENCE",
	"GUIDANCE",
	"PREDICTION_MARKET",
	"OTHER",
]);

export const SentimentDirectionSchema = z.enum(["BULLISH", "BEARISH", "NEUTRAL", "MIXED"]);
export const ImpactDirectionSchema = z.enum(["BULLISH", "BEARISH", "NEUTRAL", "UNCERTAIN"]);
export const ImpactMagnitudeSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const NewsVolumeLevelSchema = z.enum(["HIGH", "MODERATE", "LOW"]);
export const DurationExpectationSchema = z.enum(["INTRADAY", "DAYS", "WEEKS", "PERSISTENT"]);

/** Analysis of an individual news item from the pipeline */
export const NewsItemAnalysisSchema = z.object({
	news_id: z.string().describe("News item ID from NewsContext"),
	headline: z.string().describe("Headline text"),
	source: z.string().describe("Source (Reuters, Bloomberg, etc.)"),
	published_at: z.string().describe("Publication timestamp"),
	sentiment_score: z.number().min(-1).max(1).describe("LLM-derived sentiment score (-1 to 1)"),
	sentiment_direction: SentimentDirectionSchema.describe("Sentiment direction classification"),
	relevance_score: z.number().min(0).max(1).describe("Relevance score (0 to 1)"),
	tickers: z.array(z.string()).describe("Related ticker symbols"),
	impact_assessment: z.string().describe("Agent's assessment of this news item's market impact"),
});

/** Analysis of an event from recentEvents */
export const EventImpactSchema = z.object({
	event_id: z.string().describe("Event ID for cross-referencing"),
	event_type: EventTypeSchema.describe("Event type aligned with domain EventType"),
	event_time: z.string().optional().describe("When the event occurred"),
	source_type: z.string().describe("Source type (news, press_release, macro, transcript)"),
	importance_score: z.number().min(0).max(1).describe("Importance score from input (0 to 1)"),
	impact_direction: ImpactDirectionSchema.describe("Assessed impact direction"),
	impact_magnitude: ImpactMagnitudeSchema.describe("Assessed impact magnitude"),
	reasoning: z.string().describe("Reasoning for the impact assessment"),
});

/** Source citation from grounding context */
export const SourceCitationSchema = z.object({
	url: z.string().describe("Source URL"),
	title: z.string().describe("Source title or headline"),
	relevance: z.string().describe("Why this source is relevant"),
	source_type: z
		.enum(["url", "x", "news"])
		.optional()
		.describe("Source type from grounding (url for web/news, x for X posts)"),
});

/** Enriched sentiment analysis output capturing full input data richness */
export const SentimentAnalysisSchema = z.object({
	instrument_id: z.string().describe("Instrument being analyzed"),

	news_items: z
		.array(NewsItemAnalysisSchema)
		.describe("Individual news items analyzed with assessments"),

	event_impacts: z.array(EventImpactSchema).describe("Events analyzed with impact assessments"),

	bullish_catalysts: z
		.array(z.string())
		.describe("Bullish catalysts synthesized from grounding and news"),

	bearish_risks: z.array(z.string()).describe("Bearish risks synthesized from grounding and news"),

	overall_sentiment: SentimentDirectionSchema.describe("Overall sentiment assessment"),

	sentiment_strength: z.number().min(0).max(1).describe("Sentiment strength/confidence (0 to 1)"),

	news_volume_assessment: NewsVolumeLevelSchema.describe(
		"News volume assessment based on news_volume indicator",
	),

	event_risk_flag: z.boolean().describe("Event risk flag based on event_risk indicator"),

	duration_expectation: DurationExpectationSchema.describe("Expected duration of sentiment impact"),

	sources: z.array(SourceCitationSchema).describe("Sources cited from grounding context"),

	linked_event_ids: z.array(z.string()).describe("Event IDs referenced in analysis"),

	linked_news_ids: z.array(z.string()).describe("News item IDs referenced in analysis"),

	key_themes: z.array(z.string()).describe("Key themes identified across news and events"),

	divergences: z
		.array(z.string())
		.optional()
		.describe("Divergences between indicators and news content"),

	summary: z.string().describe("Summary synthesis of sentiment analysis"),
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
	memoryReferences: z.array(z.string()).optional().default([]),
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
	confidence: z.number().min(0).max(1).describe("Confidence score [0.0, 1.0] for this decision"),
	legs: z
		.array(OptionLegSchema)
		.optional()
		.describe("Option legs for multi-leg strategies (e.g., spreads, iron condors)"),
	netLimitPrice: z
		.number()
		.optional()
		.describe("Net limit price for multi-leg orders (debit positive, credit negative)"),
});

export const DecisionPlanSchema = z.object({
	cycleId: z.string(),
	timestamp: z.string(),
	decisions: z.array(DecisionSchema),
	portfolioNotes: z.string(),
});

// ============================================
// Shared Approval Schemas
// ============================================

export const ApprovalViolationSchema = z.object({
	constraint: z.string(),
	current_value: z.union([z.string(), z.number()]),
	limit: z.union([z.string(), z.number()]),
	severity: z.enum(["CRITICAL", "WARNING"]),
	affected_decisions: z.array(z.string()),
});

export const ApprovalRequiredChangeSchema = z.object({
	decisionId: z.string(),
	change: z.string(),
	reason: z.string(),
});

export const ApprovalOutputSchema = z.object({
	verdict: z.enum(["APPROVE", "PARTIAL_APPROVE", "REJECT"]),
	approvedDecisionIds: z
		.array(z.string())
		.describe("Decision IDs that passed validation (required for PARTIAL_APPROVE)"),
	rejectedDecisionIds: z
		.array(z.string())
		.describe("Decision IDs that failed validation (required for PARTIAL_APPROVE/REJECT)"),
	violations: z.array(ApprovalViolationSchema),
	required_changes: z.array(ApprovalRequiredChangeSchema),
	notes: z.string(),
});

// Risk Manager uses the shared approval schema
export const RiskManagerOutputSchema = ApprovalOutputSchema;

// Critic uses the shared approval schema
export const CriticOutputSchema = ApprovalOutputSchema;

// Legacy exports for backwards compatibility
export const ConstraintViolationSchema = ApprovalViolationSchema;
export const RequiredChangeSchema = ApprovalRequiredChangeSchema;

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
 * Matches Grok's citation response format:
 * { sourceType: "url" | "x", url: string, title: string }
 */
export const GroundingSourceSchema = z.object({
	url: z.string().describe("Source URL"),
	title: z.string().describe("Source title or headline"),
	relevance: z.string().describe("Why this source is relevant"),
	sourceType: z
		.enum(["url", "x", "news"])
		.optional()
		.describe("Source type from Grok (url for web/news, x for X posts)"),
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
