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

export type EventType =
	| "EARNINGS"
	| "GUIDANCE"
	| "M&A"
	| "REGULATORY"
	| "PRODUCT"
	| "MACRO"
	| "ANALYST"
	| "SOCIAL";

export type ImpactDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNCERTAIN";
export type ImpactMagnitude = "HIGH" | "MEDIUM" | "LOW";
export type SentimentType = "BULLISH" | "BEARISH" | "NEUTRAL" | "MIXED";
export type DurationExpectation = "INTRADAY" | "DAYS" | "WEEKS" | "PERSISTENT";

export interface EventImpact {
	event_id: string;
	event_type: EventType;
	impact_direction: ImpactDirection;
	impact_magnitude: ImpactMagnitude;
	reasoning: string;
}

export interface SentimentAnalysisOutput {
	instrument_id: string;
	event_impacts: EventImpact[];
	overall_sentiment: SentimentType;
	sentiment_strength: number;
	duration_expectation: DurationExpectation;
	linked_event_ids: string[];
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
	memoryReferences: string[];
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
}

export interface DecisionPlan {
	cycleId: string;
	timestamp: string;
	decisions: Decision[];
	portfolioNotes: string;
}

// ============================================
// Risk Manager Output
// ============================================

export type ViolationSeverity = "CRITICAL" | "WARNING";
export type ApprovalVerdict = "APPROVE" | "REJECT";

export interface ConstraintViolation {
	constraint: string;
	current_value: string | number;
	limit: string | number;
	severity: ViolationSeverity;
	affected_decisions: string[];
}

export interface RequiredChange {
	decisionId: string;
	change: string;
	reason: string;
}

export interface RiskManagerOutput {
	verdict: ApprovalVerdict;
	violations: ConstraintViolation[];
	required_changes: RequiredChange[];
	risk_notes: string;
}

// ============================================
// Critic Output
// ============================================

export type EvidenceStatus = "NOT_FOUND" | "CONTRADICTED";

export interface Inconsistency {
	decisionId: string;
	issue: string;
	expected: string;
	found: string;
}

export interface MissingJustification {
	decisionId: string;
	missing: string;
}

export interface HallucinationFlag {
	decisionId: string;
	claim: string;
	evidence_status: EvidenceStatus;
}

export interface CriticRequiredChange {
	decisionId: string;
	change: string;
}

export interface CriticOutput {
	verdict: ApprovalVerdict;
	inconsistencies: Inconsistency[];
	missing_justifications: MissingJustification[];
	hallucination_flags: HallucinationFlag[];
	required_changes: CriticRequiredChange[];
}

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
