/**
 * CBR Type Definitions
 *
 * All interfaces and local type definitions for Case-Based Reasoning.
 * Local copies of HelixDB types are included to avoid cyclic dependencies.
 *
 * @module
 */

import type { CaseResult, CaseStatistics, RetrievedCase } from "@cream/domain";

/**
 * Query result from HelixDB.
 * Local copy to avoid cyclic dependency with @cream/helix.
 */
export interface QueryResult<T = unknown> {
	data: T;
	executionTimeMs: number;
}

/**
 * Minimal HelixDB client interface for CBR operations.
 * Local copy to avoid cyclic dependency with @cream/helix.
 */
export interface HelixClient {
	query<T = unknown>(queryName: string, params?: Record<string, unknown>): Promise<QueryResult<T>>;
}

/**
 * Market snapshot for CBR retrieval.
 * Contains the context needed to find similar historical cases.
 */
export interface CBRMarketSnapshot {
	/** Instrument being traded (e.g., "AAPL", "AAPL240119C150") */
	instrumentId: string;
	/** Underlying symbol for options (e.g., "AAPL") */
	underlyingSymbol?: string;
	/** Current market regime classification */
	regimeLabel: string;
	/** Sector classification (e.g., "Technology") */
	sector?: string;
	/** Key technical indicators */
	indicators?: {
		rsi?: number;
		atr?: number;
		volatility?: number;
		sma20?: number;
		sma50?: number;
		volumeRatio?: number;
	};
	/** Current price */
	currentPrice?: number;
	/** Position context description */
	positionContext?: string;
}

/**
 * CBR retrieval options.
 */
export interface CBRRetrievalOptions {
	/** Maximum number of cases to retrieve (default: 10) */
	topK?: number;
	/** Minimum similarity score (default: 0.5) */
	minSimilarity?: number;
	/** Whether to include influencing events (default: false) */
	includeEvents?: boolean;
	/** Filter by specific regime (uses snapshot regime if not set) */
	filterRegime?: string;
	/** Filter by sector */
	filterSector?: string;
	/** Maximum age of cases in days (default: unlimited) */
	maxAgeDays?: number;
	/** Environment filter (default: current environment) */
	environment?: "PAPER" | "LIVE";
}

/**
 * Result of CBR retrieval.
 */
export interface CBRRetrievalResult {
	/** Retrieved cases in domain format */
	cases: RetrievedCase[];
	/** Aggregate statistics */
	statistics: CaseStatistics;
	/** Execution time in milliseconds */
	executionTimeMs: number;
	/** Query embedding used */
	queryEmbedding?: number[];
	/** Whether corrective retrieval was applied */
	correctionApplied?: boolean;
}

/**
 * Result of retaining a case.
 */
export interface CaseRetentionResult {
	/** Whether the case was successfully stored */
	success: boolean;
	/** Decision ID of the stored case */
	decisionId: string;
	/** Error message if storage failed */
	error?: string;
}

/**
 * Extract similarity features from a market snapshot.
 * Used for hybrid retrieval (combining vector similarity with structured matching).
 */
export interface SimilarityFeatures {
	/** Regime classification */
	regime: string;
	/** RSI bucket (oversold/neutral/overbought) */
	rsiBucket: "oversold" | "neutral" | "overbought";
	/** Volatility bucket (low/medium/high) */
	volatilityBucket: "low" | "medium" | "high";
	/** Sector classification */
	sector?: string;
	/** Instrument or underlying symbol */
	symbol: string;
}

/**
 * Quality metrics for CBR retrieval.
 */
export interface CBRQualityMetrics {
	/** Average similarity score of retrieved cases */
	avgSimilarity: number;
	/** Number of cases retrieved */
	caseCount: number;
	/** Whether enough cases were found (>= minCases) */
	sufficientCases: boolean;
	/** Diversity of regimes in retrieved cases */
	regimeDiversity: number;
	/** Win rate of retrieved cases */
	historicalWinRate: number;
	/** Quality score (0-1) */
	qualityScore: number;
}

/**
 * Raw result from SearchSimilarDecisions query.
 */
export interface SearchSimilarDecisionsResult {
	decision_id: string;
	instrument_id: string;
	regime_label: string;
	action: string;
	rationale_text: string;
	environment: string;
	similarity_score: number;
	underlying_symbol?: string;
	decision_json?: string;
	realized_outcome?: string;
	created_at?: string;
	cycle_id?: string;
	snapshot_reference?: string;
	closed_at?: string;
}

export type { CaseResult, CaseStatistics, RetrievedCase };
