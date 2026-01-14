/**
 * HelixDB Node and Edge Validation Schemas
 *
 * Zod schemas for validating data before HelixDB node/edge creation.
 * These schemas ensure data integrity for the graph database.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */

import { z } from "zod";
import {
	AgentTypeEnum,
	ConfidenceSchema,
	DatetimeSchema,
	EquityTickerSchema,
	MarketRegime,
	UuidSchema,
} from "./turso.js";

export const EMBEDDING_DIMENSION = 1536;

/**
 * Vector embedding validator (1536 dimensions for Voyage-3).
 */
export const EmbeddingSchema = z
	.array(z.number())
	.length(EMBEDDING_DIMENSION)
	.describe("Voyage-3 embedding vector");

/**
 * Stores agent reasoning and observations with vector embeddings
 * for similarity search.
 */
export const MemoryNodeSchema = z.object({
	id: UuidSchema,
	content: z.string().min(1).max(10000),
	embedding: EmbeddingSchema,
	createdAt: DatetimeSchema,
	agentType: AgentTypeEnum,
	cycleId: z.string().min(1).optional(),
	symbol: EquityTickerSchema.optional(),
	metadata: z.record(z.string(), z.any()).optional(),
});
export type MemoryNode = z.infer<typeof MemoryNodeSchema>;

/** For creation before embedding is computed. */
export const MemoryNodeCreateSchema = MemoryNodeSchema.omit({ embedding: true }).extend({
	embedding: EmbeddingSchema.optional(),
});
export type MemoryNodeCreate = z.infer<typeof MemoryNodeCreateSchema>;

export const CitationSource = z.enum([
	"FMP",
	"NEWS_API",
	"SEC_EDGAR",
	"EARNINGS_CALL",
	"ANALYST_REPORT",
	"SOCIAL_MEDIA",
	"OTHER",
]);
export type CitationSource = z.infer<typeof CitationSource>;

/** External sources that inform decisions. */
export const CitationNodeSchema = z.object({
	id: UuidSchema,
	url: z.string().url(),
	title: z.string().min(1).max(500),
	contentSnippet: z.string().max(2000).optional(),
	relevanceScore: ConfidenceSchema.optional(),
	source: CitationSource,
	fetchedAt: DatetimeSchema,
	publishedAt: DatetimeSchema.optional(),
	author: z.string().max(200).optional(),
	sentiment: z.number().min(-1).max(1).optional(),
	metadata: z.record(z.string(), z.any()).optional(),
});
export type CitationNode = z.infer<typeof CitationNodeSchema>;

export const ThesisState = z.enum([
	"WATCHING", // Monitoring for entry conditions
	"ENTERED", // Initial position taken
	"ADDING", // Adding to position
	"MANAGING", // Holding and monitoring
	"EXITING", // Reducing position
	"CLOSED", // Position fully closed
	"INVALIDATED", // Thesis proven wrong
]);
export type ThesisState = z.infer<typeof ThesisState>;

/** Trading thesis with state machine tracking. */
export const ThesisNodeSchema = z.object({
	id: UuidSchema,
	symbol: EquityTickerSchema,
	narrative: z.string().min(10).max(5000),
	state: ThesisState,
	createdAt: DatetimeSchema,
	updatedAt: DatetimeSchema,
	entryTrigger: z.string().max(1000).optional(),
	exitTrigger: z.string().max(1000).optional(),
	invalidation: z.string().max(1000).optional(),
	targetPrice: z.number().positive().optional(),
	stopPrice: z.number().positive().optional(),
	timeHorizon: z.string().max(50).optional(),
	confidence: ConfidenceSchema,
	metadata: z.record(z.string(), z.any()).optional(),
});
export type ThesisNode = z.infer<typeof ThesisNodeSchema>;

export const ThesisUpdateSchema = ThesisNodeSchema.partial().extend({
	id: UuidSchema,
	updatedAt: DatetimeSchema,
});
export type ThesisUpdate = z.infer<typeof ThesisUpdateSchema>;

/** Market regime and conditions at a point in time. */
export const MarketContextNodeSchema = z.object({
	id: UuidSchema,
	timestamp: DatetimeSchema,
	regime: MarketRegime,
	regimeConfidence: ConfidenceSchema,
	vix: z.number().nonnegative().optional(),
	vixChange: z.number().optional(),
	spyChange: z.number().optional(),
	qqqChange: z.number().optional(),
	iwmChange: z.number().optional(),
	sectorPerformance: z.record(z.string(), z.number()).optional(),
	marketBreadth: z.number().min(-1).max(1).optional(),
	advanceDecline: z.number().optional(),
	newHighsNewLows: z.number().optional(),
	fearGreedIndex: z.number().min(0).max(100).optional(),
	metadata: z.record(z.string(), z.any()).optional(),
});
export type MarketContextNode = z.infer<typeof MarketContextNodeSchema>;

/** Links decisions to citations and other graph nodes. */
export const DecisionNodeSchema = z.object({
	id: UuidSchema,
	cycleId: z.string().min(1),
	symbol: EquityTickerSchema,
	action: z.enum(["BUY", "SELL", "HOLD", "CLOSE"]),
	direction: z.enum(["LONG", "SHORT", "FLAT"]),
	createdAt: DatetimeSchema,
	confidence: ConfidenceSchema,
});
export type DecisionNode = z.infer<typeof DecisionNodeSchema>;

/** Connects a decision to citations that informed it. */
export const CitesEdgeSchema = z.object({
	fromId: UuidSchema,
	toId: UuidSchema,
	relevanceScore: ConfidenceSchema,
	createdAt: DatetimeSchema,
});
export type CitesEdge = z.infer<typeof CitesEdgeSchema>;

/** Connects a memory to a thesis it supports. */
export const SupportsEdgeSchema = z.object({
	fromId: UuidSchema,
	toId: UuidSchema,
	confidence: ConfidenceSchema,
	reasoning: z.string().max(500).optional(),
	createdAt: DatetimeSchema,
});
export type SupportsEdge = z.infer<typeof SupportsEdgeSchema>;

/** Connects a memory to a thesis it invalidates. */
export const InvalidatesEdgeSchema = z.object({
	fromId: UuidSchema,
	toId: UuidSchema,
	reason: z.string().min(1).max(1000),
	severity: z.enum(["minor", "moderate", "major", "critical"]),
	createdAt: DatetimeSchema,
});
export type InvalidatesEdge = z.infer<typeof InvalidatesEdgeSchema>;

/** Thesis state transitions (same thesis, different state snapshots). */
export const TransitionsEdgeSchema = z.object({
	fromId: UuidSchema,
	toId: UuidSchema,
	fromState: ThesisState,
	toState: ThesisState,
	timestamp: DatetimeSchema,
	reason: z.string().max(1000).optional(),
	triggeredBy: z
		.enum(["price_action", "time_decay", "invalidation", "target_hit", "stop_hit", "manual"])
		.optional(),
});
export type TransitionsEdge = z.infer<typeof TransitionsEdgeSchema>;

/** Connects decisions/memories to market context. */
export const OccurredInEdgeSchema = z.object({
	fromId: UuidSchema,
	toId: UuidSchema,
	createdAt: DatetimeSchema,
});
export type OccurredInEdge = z.infer<typeof OccurredInEdgeSchema>;

/** Connects memories that reference each other. */
export const ReferencesEdgeSchema = z.object({
	fromId: UuidSchema,
	toId: UuidSchema,
	relationshipType: z.enum(["extends", "contradicts", "clarifies", "supersedes"]),
	createdAt: DatetimeSchema,
});
export type ReferencesEdge = z.infer<typeof ReferencesEdgeSchema>;

export const VectorSearchQuerySchema = z.object({
	embedding: EmbeddingSchema,
	topK: z.number().int().min(1).max(100).default(10),
	minSimilarity: ConfidenceSchema.default(0.7),
	filterAgentTypes: z.array(AgentTypeEnum).optional(),
	filterSymbols: z.array(EquityTickerSchema).optional(),
	filterDateRange: z
		.object({
			from: DatetimeSchema.optional(),
			to: DatetimeSchema.optional(),
		})
		.optional(),
});
export type VectorSearchQuery = z.infer<typeof VectorSearchQuerySchema>;

export const VectorSearchResultSchema = z.object({
	id: UuidSchema,
	similarity: ConfidenceSchema,
	content: z.string(),
	agentType: AgentTypeEnum,
	createdAt: DatetimeSchema,
	metadata: z.record(z.string(), z.any()).optional(),
});
export type VectorSearchResult = z.infer<typeof VectorSearchResultSchema>;

export function validateEmbedding(embedding: number[]): boolean {
	return embedding.length === EMBEDDING_DIMENSION;
}

/** Enforces valid state machine transitions. */
export function validateThesisTransition(fromState: ThesisState, toState: ThesisState): boolean {
	const validTransitions: Record<ThesisState, ThesisState[]> = {
		WATCHING: ["ENTERED", "CLOSED"], // Can enter or give up
		ENTERED: ["ADDING", "MANAGING", "EXITING", "INVALIDATED"], // Various paths from entry
		ADDING: ["MANAGING", "EXITING", "INVALIDATED"], // Continue or exit
		MANAGING: ["ADDING", "EXITING", "INVALIDATED"], // Hold, add more, or exit
		EXITING: ["CLOSED", "MANAGING"], // Complete exit or resume managing
		CLOSED: [], // Terminal state
		INVALIDATED: ["CLOSED"], // Must close after invalidation
	};

	return validTransitions[fromState]?.includes(toState) ?? false;
}

export default {
	EMBEDDING_DIMENSION,
	EmbeddingSchema,
	MemoryNodeSchema,
	MemoryNodeCreateSchema,
	CitationNodeSchema,
	CitationSource,
	ThesisNodeSchema,
	ThesisState,
	ThesisUpdateSchema,
	MarketContextNodeSchema,
	DecisionNodeSchema,
	CitesEdgeSchema,
	SupportsEdgeSchema,
	InvalidatesEdgeSchema,
	TransitionsEdgeSchema,
	OccurredInEdgeSchema,
	ReferencesEdgeSchema,
	VectorSearchQuerySchema,
	VectorSearchResultSchema,
	validateEmbedding,
	validateThesisTransition,
};
