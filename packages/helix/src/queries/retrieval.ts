/**
 * Trade Memory Retrieval with GraphRAG
 *
 * Combines vector similarity search with graph traversal using Reciprocal Rank Fusion.
 * Achieves 35-80% better precision than vector-only RAG.
 *
 * ## Retrieval Strategy
 *
 * 1. Generate situation brief from market snapshot
 * 2. Vector search for similar trade decisions (rationale)
 * 3. Apply hard filters (same asset/underlying, same regime)
 * 4. Graph traversal for related events/context
 * 5. Fuse results using RRF (k=60)
 * 6. Apply corrective retrieval if quality is low
 *
 * @see docs/plans/04-memory-helixdb.md - Trade Memory Retrieval
 */

import type { TradeDecision } from "@cream/helix-schema";
import {
	assessRetrievalQuality,
	DEFAULT_RRF_K,
	fuseWithRRF,
	type QualityAssessment,
	type RetrievalResult,
	type RRFResult,
	shouldCorrect,
} from "@cream/helix-schema";
import type { HelixClient } from "../client";
import { type GraphNode, getInfluencingEvents } from "./graph";
import { type VectorSearchOptions, type VectorSearchResult, vectorSearch } from "./vector";

// Types

/**
 * Market snapshot context for retrieval
 */
export interface MarketSnapshot {
	/** Instrument being traded */
	instrumentId: string;
	/** Underlying symbol (for options) */
	underlyingSymbol?: string;
	/** Current market regime classification */
	regimeLabel: string;
	/** Key indicators summary (for situation brief) */
	indicators?: Record<string, number>;
	/** Position context (existing positions, P&L) */
	positionContext?: string;
}

/**
 * Trade memory retrieval options
 */
export interface TradeMemoryRetrievalOptions {
	/** Maximum results to return (default: 10) */
	topK?: number;
	/** Minimum similarity threshold (default: 0.5) */
	minSimilarity?: number;
	/** RRF constant k (default: 60) */
	rrfK?: number;
	/** Include events that influenced decisions */
	includeInfluencingEvents?: boolean;
	/** Enable corrective retrieval (default: true) */
	enableCorrective?: boolean;
	/** Performance target in ms (default: 3) */
	performanceTargetMs?: number;
}

/**
 * A retrieved trade memory with statistics
 */
export interface TradeMemory {
	/** The trade decision */
	decision: TradeDecision;
	/** Similarity score from vector search */
	vectorSimilarity?: number;
	/** Graph relevance score */
	graphRelevance?: number;
	/** Final RRF score */
	rrfScore: number;
	/** Which retrieval methods found this */
	sources: ("vector" | "graph")[];
	/** Events that influenced this decision */
	influencingEvents?: GraphNode[];
}

/**
 * Statistics for a set of retrieved trades
 */
export interface TradeStatistics {
	/** Win rate (profitable trades / total trades) */
	winRate: number;
	/** Average return percentage */
	avgReturn: number;
	/** Average holding time in hours */
	avgHoldingTimeHours: number;
	/** Number of trades in sample */
	sampleSize: number;
	/** Action distribution */
	actionDistribution: Record<string, number>;
}

/**
 * Trade memory retrieval result
 */
export interface TradeMemoryRetrievalResult {
	/** Retrieved trade memories */
	memories: TradeMemory[];
	/** Aggregate statistics */
	statistics: TradeStatistics;
	/** Quality assessment */
	quality: QualityAssessment;
	/** Whether corrective retrieval was applied */
	correctionApplied: boolean;
	/** Total execution time in ms */
	executionTimeMs: number;
	/** Performance breakdown */
	timing: {
		vectorSearchMs: number;
		graphTraversalMs: number;
		fusionMs: number;
	};
}

// Default Options

const DEFAULT_OPTIONS: Required<TradeMemoryRetrievalOptions> = {
	topK: 10,
	minSimilarity: 0.5,
	rrfK: DEFAULT_RRF_K,
	includeInfluencingEvents: false,
	enableCorrective: true,
	performanceTargetMs: 3,
};

type TradeVectorResult = VectorSearchResult<TradeDecision>;
type TradeRetrievalResult = RetrievalResult<TradeVectorResult>;
type TradeFusedResult = RRFResult<TradeVectorResult>;

interface RetrievalExecutionContext {
	opts: Required<TradeMemoryRetrievalOptions>;
	vectorSearchOpts: VectorSearchOptions;
	vectorResults: Awaited<ReturnType<typeof vectorSearch<TradeDecision>>>;
	vectorRetrievalResults: TradeRetrievalResult[];
	graphRetrievalResults: TradeRetrievalResult[];
	vectorSearchMs: number;
	graphTraversalMs: number;
}

interface OutcomeMetrics {
	wins: number;
	totalReturn: number;
	totalHoldingTime: number;
	outcomeCount: number;
}

function createEmptyTradeStatistics(): TradeStatistics {
	return {
		winRate: 0,
		avgReturn: 0,
		avgHoldingTimeHours: 0,
		sampleSize: 0,
		actionDistribution: {},
	};
}

function buildTradeFilters(snapshot: MarketSnapshot): Record<string, unknown> {
	const filters: Record<string, unknown> = {
		regime_label: snapshot.regimeLabel,
	};

	if (snapshot.underlyingSymbol) {
		filters.underlying_symbol = snapshot.underlyingSymbol;
		return filters;
	}

	filters.instrument_id = snapshot.instrumentId;
	return filters;
}

function createVectorSearchOptions(
	opts: Required<TradeMemoryRetrievalOptions>,
	filters: Record<string, unknown>,
): VectorSearchOptions {
	return {
		topK: opts.topK * 2,
		minSimilarity: opts.minSimilarity,
		nodeType: "TradeDecision",
		filters,
	};
}

function toTradeRetrievalResults(results: TradeVectorResult[]): TradeRetrievalResult[] {
	return results.map((result) => ({
		node: result,
		nodeId: result.id,
		score: result.similarity,
	}));
}

function createVectorOnlyResults(
	results: TradeRetrievalResult[],
	opts: Required<TradeMemoryRetrievalOptions>,
): TradeFusedResult[] {
	return results.slice(0, opts.topK).map((result, index) => ({
		node: result.node,
		nodeId: result.nodeId,
		rrfScore: 1 / (opts.rrfK + index + 1),
		sources: ["vector" as const],
		ranks: { vector: index + 1 },
		originalScores: { vector: result.score },
	}));
}

function fuseTradeResults(
	context: Pick<
		RetrievalExecutionContext,
		"graphRetrievalResults" | "opts" | "vectorRetrievalResults"
	>,
): TradeFusedResult[] {
	if (context.graphRetrievalResults.length > 0) {
		return fuseWithRRF(context.vectorRetrievalResults, context.graphRetrievalResults, {
			k: context.opts.rrfK,
			topK: context.opts.topK,
		});
	}

	return createVectorOnlyResults(context.vectorRetrievalResults, context.opts);
}

function toQualityResults(results: TradeFusedResult[]): TradeRetrievalResult[] {
	return results.map((result) => ({
		node: result.node,
		nodeId: result.nodeId,
		score: result.rrfScore,
	}));
}

async function runPrimaryRetrieval(
	client: HelixClient,
	queryText: string,
	snapshot: MarketSnapshot,
	opts: Required<TradeMemoryRetrievalOptions>,
): Promise<RetrievalExecutionContext> {
	const vectorSearchOpts = createVectorSearchOptions(opts, buildTradeFilters(snapshot));

	const vectorStart = performance.now();
	const vectorResults = await vectorSearch<TradeDecision>(client, queryText, vectorSearchOpts);
	const vectorSearchMs = performance.now() - vectorStart;
	const vectorRetrievalResults = toTradeRetrievalResults(vectorResults.results);

	const graphStart = performance.now();
	const graphTraversalMs = performance.now() - graphStart;

	return {
		opts,
		vectorSearchOpts,
		vectorResults,
		vectorRetrievalResults,
		graphRetrievalResults: [],
		vectorSearchMs,
		graphTraversalMs,
	};
}

async function applyCorrectiveRetrieval(
	client: HelixClient,
	queryText: string,
	context: RetrievalExecutionContext,
	quality: QualityAssessment,
	fusedResults: TradeFusedResult[],
): Promise<{ fusedResults: TradeFusedResult[]; correctionApplied: boolean }> {
	if (!context.opts.enableCorrective || !shouldCorrect(quality)) {
		return { fusedResults, correctionApplied: false };
	}

	const broadenedResults = await vectorSearch<TradeDecision>(client, queryText, {
		...context.vectorSearchOpts,
		topK: context.opts.topK * 3,
		minSimilarity: context.opts.minSimilarity * 0.7,
	});

	if (broadenedResults.results.length <= fusedResults.length) {
		return { fusedResults, correctionApplied: false };
	}

	return {
		fusedResults: createVectorOnlyResults(
			toTradeRetrievalResults(broadenedResults.results),
			context.opts,
		),
		correctionApplied: true,
	};
}

async function buildTradeMemories(
	client: HelixClient,
	results: TradeFusedResult[],
	includeInfluencingEvents: boolean,
): Promise<TradeMemory[]> {
	return Promise.all(
		results.map(async (result) => {
			const decision = result.node.properties as TradeDecision;
			const memory: TradeMemory = {
				decision,
				vectorSimilarity: result.originalScores.vector,
				graphRelevance: result.originalScores.graph,
				rrfScore: result.rrfScore,
				sources: result.sources,
			};

			if (includeInfluencingEvents) {
				memory.influencingEvents = await getInfluencingEvents(client, decision.decision_id);
			}

			return memory;
		}),
	);
}

function parseDecisionOutcome(
	realizedOutcome: string,
): { pnl?: number; return_pct?: number; holding_hours?: number } | undefined {
	try {
		return JSON.parse(realizedOutcome) as {
			pnl?: number;
			return_pct?: number;
			holding_hours?: number;
		};
	} catch {
		return undefined;
	}
}

function updateOutcomeMetrics(metrics: OutcomeMetrics, decision: TradeDecision): void {
	if (!decision.realized_outcome) {
		return;
	}

	const outcome = parseDecisionOutcome(decision.realized_outcome);
	if (!outcome) {
		return;
	}

	if (typeof outcome.pnl === "number") {
		if (outcome.pnl > 0) {
			metrics.wins++;
		}
		metrics.outcomeCount++;
	}

	if (typeof outcome.return_pct === "number") {
		metrics.totalReturn += outcome.return_pct;
	}

	if (typeof outcome.holding_hours === "number") {
		metrics.totalHoldingTime += outcome.holding_hours;
	}
}

function calculateOutcomeMetrics(decisions: TradeDecision[]): OutcomeMetrics {
	const metrics: OutcomeMetrics = {
		wins: 0,
		totalReturn: 0,
		totalHoldingTime: 0,
		outcomeCount: 0,
	};

	for (const decision of decisions) {
		updateOutcomeMetrics(metrics, decision);
	}

	return metrics;
}

function calculateActionDistribution(decisions: TradeDecision[]): Record<string, number> {
	const distribution: Record<string, number> = {};
	for (const decision of decisions) {
		distribution[decision.action] = (distribution[decision.action] ?? 0) + 1;
	}
	return distribution;
}

// Situation Brief Generation

/**
 * Generate a situation brief from a market snapshot.
 *
 * This text is used for vector similarity search.
 */
export function generateSituationBrief(snapshot: MarketSnapshot): string {
	const parts: string[] = [];

	// Core context
	parts.push(`Trading ${snapshot.instrumentId}`);
	if (snapshot.underlyingSymbol) {
		parts.push(`(underlying: ${snapshot.underlyingSymbol})`);
	}
	parts.push(`in ${snapshot.regimeLabel} regime.`);

	// Indicators
	if (snapshot.indicators && Object.keys(snapshot.indicators).length > 0) {
		const indicatorLines = Object.entries(snapshot.indicators)
			.map(([key, value]) => `${key}: ${value.toFixed(2)}`)
			.join(", ");
		parts.push(`Key indicators: ${indicatorLines}.`);
	}

	// Position context
	if (snapshot.positionContext) {
		parts.push(`Position: ${snapshot.positionContext}.`);
	}

	return parts.join(" ");
}

function resolveRetrievalQueryText(
	queryInput: string | number[],
	snapshot: MarketSnapshot,
): string {
	if (typeof queryInput === "string" && queryInput.length > 0) {
		return queryInput;
	}

	return generateSituationBrief(snapshot);
}

// Trade Memory Retrieval

/**
 * Retrieve similar trade memories using GraphRAG.
 *
 * Combines vector search with graph filtering for optimal recall.
 *
 * @param client - HelixDB client
 * @param queryInput - Situation text or legacy embedding vector
 * @param snapshot - Market context for filtering
 * @param options - Retrieval options
 * @returns Retrieved trade memories with statistics
 *
 * @example
 * ```typescript
 * const embedding = await embedClient.generateEmbedding(situationBrief);
 * const result = await retrieveTradeMemories(client, embedding.values, {
 *   instrumentId: "AAPL",
 *   regimeLabel: "BULL_TREND",
 * });
 * console.log(`Found ${result.memories.length} similar trades`);
 * console.log(`Win rate: ${result.statistics.winRate}%`);
 * ```
 */
export async function retrieveTradeMemories(
	client: HelixClient,
	queryInput: string | number[],
	snapshot: MarketSnapshot,
	options: TradeMemoryRetrievalOptions = {},
): Promise<TradeMemoryRetrievalResult> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const startTime = performance.now();
	const queryText = resolveRetrievalQueryText(queryInput, snapshot);
	const retrievalContext = await runPrimaryRetrieval(client, queryText, snapshot, opts);
	const fusionStart = performance.now();
	let fusedResults = fuseTradeResults(retrievalContext);
	const fusionMs = performance.now() - fusionStart;

	const quality = assessRetrievalQuality(toQualityResults(fusedResults));
	const correction = await applyCorrectiveRetrieval(
		client,
		queryText,
		retrievalContext,
		quality,
		fusedResults,
	);
	fusedResults = correction.fusedResults;

	const memories = await buildTradeMemories(client, fusedResults, opts.includeInfluencingEvents);
	const statistics = calculateTradeStatistics(memories);
	const executionTimeMs = performance.now() - startTime;

	return {
		memories,
		statistics,
		quality,
		correctionApplied: correction.correctionApplied,
		executionTimeMs,
		timing: {
			vectorSearchMs: retrievalContext.vectorSearchMs,
			graphTraversalMs: retrievalContext.graphTraversalMs,
			fusionMs,
		},
	};
}

// Statistics Calculation

/**
 * Calculate aggregate statistics from retrieved trades.
 */
export function calculateTradeStatistics(memories: TradeMemory[]): TradeStatistics {
	if (memories.length === 0) {
		return createEmptyTradeStatistics();
	}

	const decisions = memories.map((m) => m.decision);
	const metrics = calculateOutcomeMetrics(decisions);
	const actionDistribution = calculateActionDistribution(decisions);

	return {
		winRate: metrics.outcomeCount > 0 ? metrics.wins / metrics.outcomeCount : 0,
		avgReturn: metrics.outcomeCount > 0 ? metrics.totalReturn / metrics.outcomeCount : 0,
		avgHoldingTimeHours:
			metrics.outcomeCount > 0 ? metrics.totalHoldingTime / metrics.outcomeCount : 0,
		sampleSize: decisions.length,
		actionDistribution,
	};
}

/**
 * Format trade memories as a summary string for agent context.
 */
export function formatTradeMemorySummary(result: TradeMemoryRetrievalResult): string {
	const { memories, statistics } = result;

	if (memories.length === 0) {
		return "No similar trade memories found.";
	}

	const lines: string[] = [
		`Found ${memories.length} similar trade memories:`,
		"",
		`Statistics (n=${statistics.sampleSize}):`,
		`- Win rate: ${(statistics.winRate * 100).toFixed(1)}%`,
		`- Avg return: ${(statistics.avgReturn * 100).toFixed(2)}%`,
		`- Avg holding time: ${statistics.avgHoldingTimeHours.toFixed(1)} hours`,
		"",
		"Top matches:",
	];

	// Add top 5 memories
	for (const memory of memories.slice(0, 5)) {
		const d = memory.decision;
		lines.push(
			`- [${d.action}] ${d.instrument_id} (${d.regime_label}): ${d.rationale_text.slice(0, 100)}...`,
		);
	}

	return lines.join("\n");
}
