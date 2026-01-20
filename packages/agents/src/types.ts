/**
 * Type definitions for the Mastra Agent Kit
 *
 * Defines agent types, output schemas, and consensus types
 * for the 8-agent trading network.
 *
 * NOTE: Model selection is now global via trading_config.global_model.
 * All agents use the same model (configured via LLM_MODEL_ID env var).
 *
 * @see docs/plans/05-agents.md
 */

// ============================================
// Agent Types
// ============================================

export const AGENT_TYPES = [
	"grounding_agent",
	"news_analyst",
	"fundamentals_analyst",
	"bullish_researcher",
	"bearish_researcher",
	"trader",
	"risk_manager",
	"critic",
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

// ============================================
// Agent Configuration
// ============================================

export interface AgentConfig {
	/** Unique agent type identifier */
	type: AgentType;

	/** Display name */
	name: string;

	/** Short description of role */
	role: string;

	/** Personality traits for consistent behavior */
	personality: string[];

	/** Tools this agent can use */
	tools: string[];
}

// ============================================
// News & Sentiment Analyst Output
// ============================================

/** Event types aligned with domain EventType from @cream/domain */
export type EventType =
	| "EARNINGS"
	| "MACRO"
	| "NEWS"
	| "SENTIMENT_SPIKE"
	| "SEC_FILING"
	| "DIVIDEND"
	| "SPLIT"
	| "M_AND_A"
	| "ANALYST_RATING"
	| "CONFERENCE"
	| "GUIDANCE"
	| "PREDICTION_MARKET"
	| "OTHER";

export type ImpactDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNCERTAIN";
export type ImpactMagnitude = "HIGH" | "MEDIUM" | "LOW";
export type SentimentType = "BULLISH" | "BEARISH" | "NEUTRAL" | "MIXED";
export type SentimentDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "MIXED";
export type DurationExpectation = "INTRADAY" | "DAYS" | "WEEKS" | "PERSISTENT";
export type NewsVolumeLevel = "HIGH" | "MODERATE" | "LOW";

/** Analysis of an individual news item from the pipeline */
export interface NewsItemAnalysis {
	/** News item ID from NewsContext */
	news_id: string;
	/** Headline text */
	headline: string;
	/** Source (Reuters, Bloomberg, etc.) */
	source: string;
	/** Publication timestamp */
	published_at: string;
	/** LLM-derived sentiment score (-1 to 1) */
	sentiment_score: number;
	/** Sentiment direction classification */
	sentiment_direction: SentimentDirection;
	/** Relevance score (0 to 1) */
	relevance_score: number;
	/** Related ticker symbols */
	tickers: string[];
	/** Agent's assessment of this news item's market impact */
	impact_assessment: string;
}

/** Analysis of an event from recentEvents */
export interface EventImpact {
	/** Event ID for cross-referencing */
	event_id: string;
	/** Event type aligned with domain EventType */
	event_type: EventType;
	/** When the event occurred */
	event_time?: string;
	/** Source type (news, press_release, macro, transcript) */
	source_type: string;
	/** Importance score from input (0 to 1) */
	importance_score: number;
	/** Assessed impact direction */
	impact_direction: ImpactDirection;
	/** Assessed impact magnitude */
	impact_magnitude: ImpactMagnitude;
	/** Reasoning for the impact assessment */
	reasoning: string;
}

/** Source citation from grounding context */
export interface SourceCitation {
	/** Source URL */
	url: string;
	/** Source title or headline */
	title: string;
	/** Why this source is relevant */
	relevance: string;
	/** Source type from grounding (url for web/news, x for X posts) */
	source_type?: "url" | "x" | "news";
}

/** Enriched sentiment analysis output capturing full input data richness */
export interface SentimentAnalysisOutput {
	/** Instrument being analyzed */
	instrument_id: string;

	/** Individual news items analyzed with assessments */
	news_items: NewsItemAnalysis[];

	/** Events analyzed with impact assessments */
	event_impacts: EventImpact[];

	/** Bullish catalysts synthesized from grounding and news */
	bullish_catalysts: string[];

	/** Bearish risks synthesized from grounding and news */
	bearish_risks: string[];

	/** Overall sentiment assessment */
	overall_sentiment: SentimentType;

	/** Sentiment strength/confidence (0 to 1) */
	sentiment_strength: number;

	/** News volume assessment based on news_volume indicator */
	news_volume_assessment: NewsVolumeLevel;

	/** Event risk flag based on event_risk indicator */
	event_risk_flag: boolean;

	/** Expected duration of sentiment impact */
	duration_expectation: DurationExpectation;

	/** Sources cited from grounding context */
	sources: SourceCitation[];

	/** Event IDs referenced in analysis */
	linked_event_ids: string[];

	/** News item IDs referenced in analysis */
	linked_news_ids: string[];

	/** Key themes identified across news and events */
	key_themes: string[];

	/** Divergences between indicators and news content */
	divergences?: string[];

	/** Summary synthesis of sentiment analysis */
	summary: string;
}

// ============================================
// Fundamentals & Macro Analyst Output
// ============================================

export interface EventRisk {
	event: string;
	date: string;
	potential_impact: ImpactMagnitude;
}

export interface FundamentalsAnalysisOutput {
	instrument_id: string;
	fundamental_drivers: string[];
	fundamental_headwinds: string[];
	valuation_context: string;
	macro_context: string;
	event_risk: EventRisk[];
	fundamental_thesis: string;
	linked_event_ids: string[];
}

// ============================================
// Research Agent Outputs
// ============================================

export type FactorSource = "TECHNICAL" | "SENTIMENT" | "FUNDAMENTAL" | "MEMORY";
export type FactorStrength = "STRONG" | "MODERATE" | "WEAK";

export interface SupportingFactor {
	factor: string;
	source: FactorSource;
	strength: FactorStrength;
}

export interface BullishResearchOutput {
	instrument_id: string;
	bullish_thesis: string;
	supporting_factors: SupportingFactor[];
	target_conditions: string;
	invalidation_conditions: string;
	conviction_level: number;
	memory_case_ids: string[];
	strongest_counterargument: string;
}

export interface BearishResearchOutput {
	instrument_id: string;
	bearish_thesis: string;
	supporting_factors: SupportingFactor[];
	target_conditions: string;
	invalidation_conditions: string;
	conviction_level: number;
	memory_case_ids: string[];
	strongest_counterargument: string;
}

// ============================================
// Trader Agent Output (DecisionPlan)
// ============================================

export type TradeAction = "BUY" | "SELL" | "HOLD" | "CLOSE";
export type TradeDirection = "LONG" | "SHORT" | "FLAT";
export type SizeUnit = "SHARES" | "CONTRACTS" | "DOLLARS" | "PCT_EQUITY";
export type StopType = "FIXED" | "TRAILING";

export type StrategyFamily =
	| "EQUITY_LONG"
	| "EQUITY_SHORT"
	| "OPTION_LONG"
	| "OPTION_SHORT"
	| "VERTICAL_SPREAD"
	| "IRON_CONDOR"
	| "STRADDLE"
	| "STRANGLE"
	| "CALENDAR_SPREAD";

export type TimeHorizon = "INTRADAY" | "SWING" | "POSITION";

export type ThesisState = "WATCHING" | "ENTERED" | "ADDING" | "MANAGING" | "EXITING" | "CLOSED";

export interface TradeSize {
	value: number;
	unit: SizeUnit;
}

export interface StopLoss {
	price: number;
	type: StopType;
}

export interface TakeProfit {
	price: number;
}

export interface Rationale {
	summary: string;
	bullishFactors: string[];
	bearishFactors: string[];
	decisionLogic: string;
	memoryReferences?: string[];
}

/**
 * Option leg for multi-leg strategies (spreads, iron condors, etc.)
 */
export interface OptionLeg {
	/** OCC option symbol (e.g., "AAPL250117P00190000") */
	symbol: string;
	/** Signed ratio: positive=buy, negative=sell */
	ratioQty: number;
	/** Position intent for the leg */
	positionIntent: "BUY_TO_OPEN" | "BUY_TO_CLOSE" | "SELL_TO_OPEN" | "SELL_TO_CLOSE";
}

export interface Decision {
	decisionId: string;
	instrumentId: string;
	action: TradeAction;
	direction: TradeDirection;
	size: TradeSize;
	stopLoss?: StopLoss;
	takeProfit?: TakeProfit;
	strategyFamily: StrategyFamily;
	timeHorizon: TimeHorizon;
	rationale: Rationale;
	thesisState: ThesisState;
	/** Confidence score [0.0, 1.0] representing conviction in this decision */
	confidence: number;
	/** Option legs for multi-leg strategies (empty for single-leg orders) */
	legs?: OptionLeg[];
	/** Net limit price for multi-leg orders (debit positive, credit negative) */
	netLimitPrice?: number;
}

export interface DecisionPlan {
	cycleId: string;
	timestamp: string;
	decisions: Decision[];
	portfolioNotes: string;
}

// ============================================
// Shared Approval Types
// ============================================

export type ViolationSeverity = "CRITICAL" | "WARNING";
export type ApprovalVerdict = "APPROVE" | "PARTIAL_APPROVE" | "REJECT";

export interface ApprovalViolation {
	constraint: string;
	current_value: string | number;
	limit: string | number;
	severity: ViolationSeverity;
	affected_decisions: string[];
}

export interface ApprovalRequiredChange {
	decisionId: string;
	change: string;
	reason: string;
}

export interface ApprovalOutput {
	verdict: ApprovalVerdict;
	/** Decision IDs that passed validation (required for PARTIAL_APPROVE) */
	approvedDecisionIds: string[];
	/** Decision IDs that failed validation (required for PARTIAL_APPROVE/REJECT) */
	rejectedDecisionIds: string[];
	violations: ApprovalViolation[];
	required_changes: ApprovalRequiredChange[];
	notes: string;
}

// Risk Manager uses the shared approval output type
export type RiskManagerOutput = ApprovalOutput;

// Critic uses the shared approval output type
export type CriticOutput = ApprovalOutput;

// Legacy type aliases for backwards compatibility
export type ConstraintViolation = ApprovalViolation;
export type RequiredChange = ApprovalRequiredChange;

// ============================================
// Consensus Types
// ============================================

export interface ConsensusInput {
	plan: DecisionPlan;
	riskManagerOutput: RiskManagerOutput;
	criticOutput: CriticOutput;
}

export interface ConsensusResult {
	approved: boolean;
	plan: DecisionPlan;
	riskManagerVerdict: ApprovalVerdict;
	criticVerdict: ApprovalVerdict;
	iterations: number;
	rejectionReasons: string[];
}

// ============================================
// Self-Check Output
// ============================================

export interface ValidationError {
	path: string;
	issue: string;
	expected: string;
	found: string;
}

export interface ValidationWarning {
	path: string;
	issue: string;
}

export interface SelfCheckOutput {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
	corrected_json?: DecisionPlan;
}

// ============================================
// Agent Context Types
// ============================================

export interface ThesisContext {
	instrumentId: string;
	currentState: ThesisState;
	entryPrice: number | null;
	entryDate: string | null;
	currentPnL: number | null;
	stopLoss: number | null;
	takeProfit: number | null;
	addCount: number;
	maxPositionReached: boolean;
	daysHeld: number;
}

export interface PortfolioState {
	positions: Position[];
	buyingPower: number;
	totalEquity: number;
	currentDrawdown: number;
	maxDrawdown: number;
}

export interface Position {
	instrumentId: string;
	quantity: number;
	averageCost: number;
	currentPrice: number;
	unrealizedPnL: number;
	unrealizedPnLPercent: number;
}
