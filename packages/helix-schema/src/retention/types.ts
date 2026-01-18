/**
 * Types for Active Forgetting Policy
 *
 * Defines all type definitions, interfaces, and Zod schemas
 * for the forgetting curve retention system.
 */

import { z } from "zod/v4";

// ============================================
// Zod Schemas
// ============================================

/**
 * Environment for retention decisions
 */
export const ForgettingEnvironment = z.enum(["LIVE", "PAPER"]);
export type ForgettingEnvironment = z.infer<typeof ForgettingEnvironment>;

/**
 * Node type for forgetting decisions
 */
export const ForgettingNodeType = z.enum([
	"TradeDecision",
	"TradeLifecycleEvent",
	"ExternalEvent",
	"FilingChunk",
	"TranscriptChunk",
	"NewsItem",
	"Company",
	"MacroEntity",
]);
export type ForgettingNodeType = z.infer<typeof ForgettingNodeType>;

// ============================================
// Core Interfaces
// ============================================

/**
 * Information about a node for forgetting decisions
 */
export interface NodeInfo {
	/** Node unique identifier */
	id: string;
	/** Node type */
	nodeType: ForgettingNodeType;
	/** Trading environment */
	environment: ForgettingEnvironment;
	/** When the node was created */
	createdAt: Date;
	/** Number of times the node has been accessed/retrieved */
	accessCount: number;
	/** Number of graph edges connected to this node */
	edgeCount: number;
	/** Realized P/L (only for TradeDecision nodes) */
	realizedPnl?: number;
	/** Last time the node was accessed */
	lastAccessedAt?: Date;
}

/**
 * Retention score breakdown for debugging/analysis
 */
export interface RetentionScoreBreakdown {
	/** Base score (always 1.0) */
	baseScore: number;
	/** Recency factor (exponential decay) */
	recencyFactor: number;
	/** Frequency factor (1 + log-scaled access count) */
	frequencyFactor: number;
	/** Importance factor (1 + domain-specific weight) */
	importanceFactor: number;
	/** Whether compliance override applies */
	complianceOverride: boolean;
	/** Final retention score */
	finalScore: number;
	/** Age in days */
	ageDays: number;
}

/**
 * Forgetting decision for a node
 */
export interface ForgettingDecision {
	/** Node ID */
	nodeId: string;
	/** Retention score */
	score: number;
	/** Score breakdown for analysis */
	breakdown: RetentionScoreBreakdown;
	/** Whether the node should be summarized */
	shouldSummarize: boolean;
	/** Whether the node should be deleted */
	shouldDelete: boolean;
	/** Reason for the decision */
	reason: string;
}

// ============================================
// Trade Cohort Types
// ============================================

/**
 * Trade cohort summary for aggregated decisions
 */
export interface TradeCohortSummary {
	/** Summary type identifier */
	summaryType: "trade_cohort";
	/** Time period (e.g., "2024-Q3") */
	period: string;
	/** Instrument identifier */
	instrumentId: string;
	/** Market regime label */
	regimeLabel: string;
	/** Aggregated statistics */
	stats: {
		/** Total number of decisions */
		totalDecisions: number;
		/** Win rate (0-1) */
		winRate: number;
		/** Average return per trade */
		avgReturn: number;
		/** Average holding period in days */
		avgHoldingDays: number;
		/** Total realized P/L */
		totalPnl: number;
	};
	/** IDs of notable decisions (top performers, outliers) */
	notableDecisionIds: string[];
	/** Compressed/clustered rationale embedding */
	compressedRationaleEmbedding?: number[];
}

/**
 * Trade decision info for cohort summarization
 */
export interface TradeDecisionInfo {
	/** Decision ID */
	decisionId: string;
	/** Instrument ID */
	instrumentId: string;
	/** Regime label */
	regimeLabel: string;
	/** Created timestamp */
	createdAt: Date;
	/** Closed timestamp */
	closedAt?: Date;
	/** Realized P/L */
	realizedPnl: number;
	/** Return percentage */
	returnPct: number;
	/** Whether the trade was profitable */
	isWin: boolean;
}

// ============================================
// Graph Pruning Types
// ============================================

/**
 * Graph pruning action
 */
export type GraphPruningAction =
	| { type: "remove_edge"; edgeId: string; reason: string }
	| { type: "remove_node"; nodeId: string; reason: string }
	| { type: "merge_subgraph"; nodeIds: string[]; summaryNodeId: string; reason: string }
	| {
			type: "prune_hub";
			nodeId: string;
			retainedEdges: number;
			prunedEdges: number;
			reason: string;
	  };

/**
 * Graph pruning configuration
 */
export interface GraphPruningConfig {
	/** Minimum edge weight to retain (default: 0.3) */
	minEdgeWeight: number;
	/** Maximum isolated subgraph size to merge (default: 5) */
	maxIsolatedSubgraphSize: number;
	/** Maximum edges for hub nodes (default: 100) */
	maxHubEdges: number;
	/** Hub edge threshold before pruning (default: 1000) */
	hubEdgeThreshold: number;
}

/**
 * Default graph pruning configuration
 */
export const DEFAULT_PRUNING_CONFIG: GraphPruningConfig = {
	minEdgeWeight: 0.3,
	maxIsolatedSubgraphSize: 5,
	maxHubEdges: 100,
	hubEdgeThreshold: 1000,
};

/**
 * Edge information for pruning decisions
 */
export interface EdgeInfo {
	/** Edge ID */
	edgeId: string;
	/** Source node ID */
	sourceId: string;
	/** Target node ID */
	targetId: string;
	/** Edge weight (0-1) */
	weight: number;
}

/**
 * Node connectivity info for pruning
 */
export interface NodeConnectivity {
	/** Node ID */
	nodeId: string;
	/** Connected edge IDs */
	edgeIds: string[];
	/** Sorted edges by weight (for hub pruning) */
	edgesByWeight?: EdgeInfo[];
}

// ============================================
// Access Tracking Types
// ============================================

/**
 * Access tracking record for a node
 */
export interface AccessRecord {
	/** Node ID */
	nodeId: string;
	/** Total access count */
	accessCount: number;
	/** Last access timestamp */
	lastAccessedAt: Date;
	/** First access timestamp */
	firstAccessedAt: Date;
}

// ============================================
// Metrics Types
// ============================================

/**
 * Summary statistics for a batch of forgetting decisions
 */
export interface ForgettingMetrics {
	/** Total nodes evaluated */
	totalNodes: number;
	/** Nodes with compliance override */
	complianceOverrideCount: number;
	/** Nodes eligible for summarization */
	summarizationCandidates: number;
	/** Nodes eligible for deletion */
	deletionCandidates: number;
	/** Average retention score (excluding infinite) */
	avgRetentionScore: number;
	/** Median retention score (excluding infinite) */
	medianRetentionScore: number;
	/** Score distribution buckets */
	scoreDistribution: {
		infinite: number;
		high: number; // >= 0.5
		medium: number; // 0.1 - 0.5
		low: number; // 0.05 - 0.1
		veryLow: number; // < 0.05
	};
}
