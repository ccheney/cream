/**
 * Trading Cycle Types
 *
 * All interfaces and type definitions for the trading cycle workflow.
 */

import type { ExecutionContext } from "@cream/domain";
import type { IndicatorSnapshot } from "@cream/indicators";
import type { ThesisState } from "@cream/storage";

import type { OnStreamChunk } from "../../../agents/mastra-agents.js";

// ============================================
// Prediction Markets
// ============================================

/**
 * Prediction market signals from the prediction markets workflow.
 * Updated every 15 minutes.
 */
export interface PredictionMarketSignals {
	fedCutProbability?: number;
	fedHikeProbability?: number;
	recessionProbability12m?: number;
	macroUncertaintyIndex?: number;
	policyEventRisk?: number;
	marketConfidence?: number;
	cpiSurpriseDirection?: number;
	gdpSurpriseDirection?: number;
	timestamp?: string;
	platforms?: string[];
}

// ============================================
// External Context
// ============================================

export interface ExternalContext {
	news: Array<{
		eventId: string;
		type: string;
		summary: string;
		sentiment: string;
		symbols: string[];
		importance: number;
		eventTime: string;
	}>;
	sentiment: Record<string, number>;
	macroIndicators: Record<string, number>;
	/** Prediction market signals (Fed rate, recession probability, etc.) */
	predictionMarketSignals?: PredictionMarketSignals;
}

// ============================================
// Agent Status Events
// ============================================

/**
 * Agent status event for WebSocket streaming.
 */
export interface AgentStatusEvent {
	cycleId: string;
	agentType:
		| "news_analyst"
		| "fundamentals_analyst"
		| "bullish_researcher"
		| "bearish_researcher"
		| "trader"
		| "risk_manager"
		| "critic";
	status: "running" | "complete" | "error";
	output?: string;
	error?: string;
	durationMs?: number;
	timestamp: string;
}

// ============================================
// Workflow Input/Output
// ============================================

export interface WorkflowInput {
	cycleId: string;
	/** ExecutionContext with environment and source */
	context: ExecutionContext;
	instruments?: string[];
	/** Force stub mode even in PAPER/LIVE (for testing) */
	forceStub?: boolean;
	/** Use draft config instead of active config (for testing new settings) */
	useDraftConfig?: boolean;
	/** External context from gatherExternalContext step */
	externalContext?: ExternalContext;
	/** Optional callback for agent status events (WebSocket streaming) */
	onAgentEvent?: (event: AgentStatusEvent) => void;
	/** Optional callback for streaming agent chunks (tool calls, reasoning) */
	onStreamChunk?: OnStreamChunk;
}

// ============================================
// Market Data Types
// ============================================

/**
 * Candle data structure (OHLCV).
 */
export interface CandleData {
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

/**
 * Quote data structure with bid/ask prices.
 */
export interface QuoteData {
	bid: number;
	ask: number;
	bidSize: number;
	askSize: number;
	timestamp: number;
}

export interface MarketSnapshot {
	instruments: string[];
	/** Candle data keyed by symbol */
	candles: Record<string, CandleData[]>;
	/** Quote data keyed by symbol */
	quotes: Record<string, QuoteData>;
	/** Indicator snapshots keyed by symbol (from IndicatorService) */
	indicators?: Record<string, IndicatorSnapshot>;
	/** Timestamp when the snapshot was created */
	timestamp: number;
}

// ============================================
// Regime and Memory Types
// ============================================

export interface RegimeData {
	regime: string;
	confidence: number;
	reasoning?: string;
}

export interface MemoryContext {
	relevantCases: unknown[];
	regimeLabels: Record<string, RegimeData>;
}

// ============================================
// Analysis Types
// ============================================

export interface SentimentAnalysis {
	instrument_id: string;
	event_impacts: unknown[];
	overall_sentiment: string;
	sentiment_strength: number;
	duration_expectation: string;
	linked_event_ids: string[];
}

export interface FundamentalsAnalysis {
	instrument_id: string;
	fundamental_drivers: string[];
	fundamental_headwinds: string[];
	valuation_context: string;
	macro_context: string;
	event_risk: unknown[];
	fundamental_thesis: string;
	linked_event_ids: string[];
}

export interface Research {
	instrument_id: string;
	thesis: string;
	supporting_factors: { factor: string; source: string; strength: string }[];
	conviction_level: number;
	memory_case_ids: string[];
	strongest_counterargument: string;
}

// ============================================
// Decision Types
// ============================================

export interface Decision {
	decisionId: string;
	instrumentId: string;
	action: "BUY" | "SELL" | "HOLD" | "CLOSE";
	direction: "LONG" | "SHORT" | "FLAT";
	size: { value: number; unit: string };
	strategyFamily: string;
	timeHorizon: string;
	rationale: {
		summary: string;
		bullishFactors: string[];
		bearishFactors: string[];
		decisionLogic: string;
		memoryReferences: string[];
	};
	thesisState: string;
}

export interface WorkflowDecisionPlan {
	cycleId: string;
	timestamp: string;
	decisions: Decision[];
	portfolioNotes: string;
}

export interface Approval {
	verdict: "APPROVE" | "REJECT";
	violations?: unknown[];
	required_changes?: unknown[];
	notes?: string;
}

// ============================================
// Workflow State
// ============================================

export interface WorkflowState {
	cycleId: string;
	timestamp: string;
	marketSnapshot?: MarketSnapshot;
	memoryContext?: MemoryContext;
	sentimentAnalysis?: SentimentAnalysis[];
	fundamentalsAnalysis?: FundamentalsAnalysis[];
	bullishResearch?: Research[];
	bearishResearch?: Research[];
	decisionPlan?: WorkflowDecisionPlan;
	riskApproval?: Approval;
	criticApproval?: Approval;
	constraintCheck?: { passed: boolean; violations: string[] };
	orderSubmission?: { submitted: boolean; orderIds: string[]; errors: string[] };
}

// ============================================
// Thesis Lifecycle Types
// ============================================

/**
 * Thesis update tracking for workflow result
 */
export interface ThesisUpdate {
	thesisId: string;
	instrumentId: string;
	fromState: ThesisState | null;
	toState: ThesisState;
	action: string;
	reason?: string;
}

/**
 * Research trigger result
 */
export interface ResearchTriggerResult {
	triggered: boolean;
	trigger?: {
		type: string;
		severity: string;
		reason: string;
	};
	hypothesis?: {
		hypothesisId: string;
		title: string;
	};
}

/**
 * Indicator trigger result from checkIndicatorTrigger
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md
 */
export interface IndicatorTriggerResult {
	shouldTrigger: boolean;
	triggerReason: string | null;
	conditions: {
		regimeGapDetected: boolean;
		currentRegime: string;
		regimeGapDetails?: string;
		closestIndicatorSimilarity: number;
		rollingIC30Day: number;
		icDecayDays: number;
		existingIndicatorsUnderperforming: boolean;
		daysSinceLastAttempt: number;
		activeIndicatorCount: number;
		maxIndicatorCapacity: number;
	};
	summary: string;
	recommendation: string;
}

// ============================================
// Workflow Result
// ============================================

export interface WorkflowResult {
	cycleId: string;
	approved: boolean;
	iterations: number;
	orderSubmission: { submitted: boolean; orderIds: string[]; errors: string[] };
	mode: "STUB" | "LLM";
	/** Config version ID used for this cycle (for audit trail) */
	configVersion: string | null;
	/** Thesis lifecycle updates made during this cycle */
	thesisUpdates?: ThesisUpdate[];
	/** Research trigger detection result */
	researchTrigger?: ResearchTriggerResult;
	/** Indicator synthesis trigger detection result */
	indicatorTrigger?: IndicatorTriggerResult;
	/** Thesis memory ingestion result */
	thesisMemoryIngestion?: { ingested: number; errors: string[] };
}
