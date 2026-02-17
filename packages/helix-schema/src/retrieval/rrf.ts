/**
 * Reciprocal Rank Fusion (RRF) for Hybrid Retrieval
 *
 * Combines vector similarity search with graph traversal results using RRF algorithm.
 * Research shows hybrid GraphRAG achieves 35-80% better precision than vector-only RAG.
 *
 * ## RRF Algorithm
 *
 * For each node appearing in result set i:
 * ```
 * final_score = Σ (1 / (k + rank_i))
 * ```
 *
 * Where:
 * - k = 60 (standard RRF constant, provides smooth ranking curve)
 * - rank_i = position in result set i (1-based)
 *
 * The k constant determines how quickly relevance drops off:
 * - Higher k → more uniform weighting across ranks
 * - Lower k → stronger preference for top-ranked items
 * - k=60 is empirically optimal (Cormack et al., 2009)
 *
 * ## Why k=60?
 *
 * Research shows k=60 balances:
 * - Preventing top-heavy bias (k too low → only top 3-5 matter)
 * - Maintaining rank signal (k too high → all ranks equal)
 *
 * @see docs/plans/04-memory-helixdb.md for full specification
 * @see https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking
 * @see Cormack, Clarke & Buettcher (2009) "Reciprocal Rank Fusion outperforms Condorcet"
 */

// ============================================
// Types
// ============================================

/**
 * A single result from a retrieval method (vector search or graph traversal)
 */
export interface RetrievalResult<T = unknown> {
	/** The retrieved node/item */
	node: T;
	/** Unique identifier for deduplication */
	nodeId: string;
	/** Original score from the retrieval method (e.g., cosine similarity, relevance) */
	score: number;
}

/**
 * A ranked result with position information
 */
export interface RankedResult<T = unknown> extends RetrievalResult<T> {
	/** Rank position (1-based) */
	rank: number;
	/** Source retrieval method */
	source: "vector" | "graph";
}

/**
 * Final RRF-scored result
 */
export interface RRFResult<T = unknown> {
	/** The retrieved node */
	node: T;
	/** Unique identifier */
	nodeId: string;
	/** Final RRF score (sum of 1/(k + rank) across methods) */
	rrfScore: number;
	/** Which methods returned this node */
	sources: ("vector" | "graph")[];
	/** Original ranks by source */
	ranks: {
		vector?: number;
		graph?: number;
	};
	/** Original scores by source */
	originalScores: {
		vector?: number;
		graph?: number;
	};
}

/**
 * RRF fusion options
 */
export interface RRFOptions {
	/**
	 * RRF constant k (default: 60)
	 *
	 * Controls how quickly relevance drops off with rank:
	 * - Higher k → more uniform weighting
	 * - Lower k → stronger top-rank preference
	 */
	k?: number;

	/**
	 * Maximum results to return (default: 10)
	 */
	topK?: number;

	/**
	 * Minimum RRF score threshold (default: 0, no threshold)
	 * Useful for filtering low-relevance results
	 */
	minScore?: number;
}

// ============================================
// Constants
// ============================================

/**
 * Standard RRF k constant (empirically optimal)
 *
 * @see Cormack, Clarke & Buettcher (2009)
 */
export const DEFAULT_RRF_K = 60;

/**
 * Default number of results to return
 */
export const DEFAULT_TOP_K = 10;

type SourceType = "vector" | "graph";

type AggregatedResult<T> = {
	node: T;
	nodeId: string;
	rrfScore: number;
	sources: SourceType[];
	ranks: { vector?: number; graph?: number };
	originalScores: { vector?: number; graph?: number };
};

type MultiMethodAggregate<T> = {
	node: T;
	nodeId: string;
	rrfScore: number;
	sourcesByMethod: Record<string, number>;
};

// ============================================
// Core RRF Functions
// ============================================

/**
 * Calculate RRF score for a single rank position
 *
 * @param rank - 1-based rank position
 * @param k - RRF constant (default: 60)
 * @returns RRF score component
 */
export function calculateRRFScore(rank: number, k: number = DEFAULT_RRF_K): number {
	if (rank < 1) {
		throw new Error("Rank must be >= 1 (1-based indexing)");
	}
	return 1 / (k + rank);
}

/**
 * Assign ranks to results (1-based, ties get same rank)
 *
 * Results are sorted by score descending, then assigned ranks.
 * Ties (equal scores) receive the same rank.
 *
 * @param results - Retrieval results to rank
 * @param source - Source method label
 * @returns Ranked results
 */
export function assignRanks<T>(
	results: RetrievalResult<T>[],
	source: SourceType,
): RankedResult<T>[] {
	// Sort by score descending
	const sorted = results.toSorted((a, b) => b.score - a.score);

	let currentRank = 1;
	let previousScore: number | null = null;
	let skipCount = 0;

	return sorted.map((result, _index) => {
		if (previousScore !== null && result.score < previousScore) {
			// Score decreased, advance rank by accumulated ties
			currentRank += 1 + skipCount;
			skipCount = 0;
		} else if (previousScore !== null && result.score === previousScore) {
			// Tie: keep same rank, increment skip count
			skipCount++;
		}

		previousScore = result.score;

		return {
			...result,
			rank: currentRank,
			source,
		};
	});
}

function createAggregateMap<T>(): Map<string, AggregatedResult<T>> {
	return new Map<string, AggregatedResult<T>>();
}

function insertOrMergeRankedResult<T>(
	resultMap: Map<string, AggregatedResult<T>>,
	result: RankedResult<T>,
	k: number,
): void {
	const score = calculateRRFScore(result.rank, k);
	const existing = resultMap.get(result.nodeId);
	if (!existing) {
		resultMap.set(result.nodeId, {
			node: result.node,
			nodeId: result.nodeId,
			rrfScore: score,
			sources: [result.source],
			ranks: { [result.source]: result.rank },
			originalScores: { [result.source]: result.score },
		});
		return;
	}
	existing.rrfScore += score;
	existing.sources.push(result.source);
	existing.ranks[result.source] = result.rank;
	existing.originalScores[result.source] = result.score;
}

function mergeRankedResults<T>(
	resultMap: Map<string, AggregatedResult<T>>,
	results: RankedResult<T>[],
	k: number,
): void {
	for (const result of results) {
		insertOrMergeRankedResult(resultMap, result, k);
	}
}

function buildTopResults<T>(
	resultMap: Map<string, AggregatedResult<T>>,
	minScore: number,
	topK: number,
): RRFResult<T>[] {
	return Array.from(resultMap.values())
		.filter((result) => result.rrfScore >= minScore)
		.sort((a, b) => b.rrfScore - a.rrfScore)
		.slice(0, topK);
}

/**
 * Fuse vector search and graph traversal results using RRF
 *
 * This is the main entry point for hybrid retrieval.
 *
 * @param vectorResults - Results from vector similarity search
 * @param graphResults - Results from graph traversal
 * @param options - RRF options
 * @returns Fused and re-ranked results
 */
export function fuseWithRRF<T>(
	vectorResults: RetrievalResult<T>[],
	graphResults: RetrievalResult<T>[],
	options: RRFOptions = {},
): RRFResult<T>[] {
	const { k = DEFAULT_RRF_K, topK = DEFAULT_TOP_K, minScore = 0 } = options;
	const resultMap = createAggregateMap<T>();
	mergeRankedResults(resultMap, assignRanks(vectorResults, "vector"), k);
	mergeRankedResults(resultMap, assignRanks(graphResults, "graph"), k);
	return buildTopResults(resultMap, minScore, topK);
}

function updateRankTracking(
	previousScore: number | null,
	currentRank: number,
	skipCount: number,
	score: number,
): { rank: number; skips: number } {
	if (previousScore === null) {
		return { rank: currentRank, skips: skipCount };
	}
	if (score < previousScore) {
		return { rank: currentRank + 1 + skipCount, skips: 0 };
	}
	if (score === previousScore) {
		return { rank: currentRank, skips: skipCount + 1 };
	}
	return { rank: currentRank, skips: skipCount };
}

function mergeMultiMethodResult<T>(
	resultMap: Map<string, MultiMethodAggregate<T>>,
	method: string,
	result: RetrievalResult<T>,
	rank: number,
	k: number,
): void {
	const score = calculateRRFScore(rank, k);
	const existing = resultMap.get(result.nodeId);
	if (existing) {
		existing.rrfScore += score;
		existing.sourcesByMethod[method] = rank;
		return;
	}
	resultMap.set(result.nodeId, {
		node: result.node,
		nodeId: result.nodeId,
		rrfScore: score,
		sourcesByMethod: { [method]: rank },
	});
}

function processResultSet<T>(
	resultMap: Map<string, MultiMethodAggregate<T>>,
	method: string,
	results: RetrievalResult<T>[],
	k: number,
): void {
	let currentRank = 1;
	let previousScore: number | null = null;
	let skipCount = 0;
	for (const result of results.toSorted((a, b) => b.score - a.score)) {
		const tracking = updateRankTracking(previousScore, currentRank, skipCount, result.score);
		currentRank = tracking.rank;
		skipCount = tracking.skips;
		previousScore = result.score;
		mergeMultiMethodResult(resultMap, method, result, currentRank, k);
	}
}

function mapMultiMethodResult<T>(result: MultiMethodAggregate<T>): RRFResult<T> & {
	sourcesByMethod: Record<string, number>;
} {
	return {
		node: result.node,
		nodeId: result.nodeId,
		rrfScore: result.rrfScore,
		sources: Object.keys(result.sourcesByMethod) as SourceType[],
		ranks: Object.fromEntries(
			Object.entries(result.sourcesByMethod).map(([method, rank]) => [method, rank]),
		) as { vector?: number; graph?: number },
		originalScores: {},
		sourcesByMethod: result.sourcesByMethod,
	};
}

/**
 * Fuse multiple result sets using RRF (generalized version)
 *
 * Supports any number of retrieval methods, not just vector + graph.
 *
 * @param resultSets - Array of result sets, each with a method name and results
 * @param options - RRF options
 * @returns Fused and re-ranked results
 */
export function fuseMultipleWithRRF<T>(
	resultSets: { method: string; results: RetrievalResult<T>[] }[],
	options: RRFOptions = {},
): (RRFResult<T> & { sourcesByMethod: Record<string, number> })[] {
	const { k = DEFAULT_RRF_K, topK = DEFAULT_TOP_K, minScore = 0 } = options;
	const resultMap = new Map<string, MultiMethodAggregate<T>>();
	for (const { method, results } of resultSets) {
		processResultSet(resultMap, method, results, k);
	}
	return Array.from(resultMap.values())
		.filter((r) => r.rrfScore >= minScore)
		.sort((a, b) => b.rrfScore - a.rrfScore)
		.slice(0, topK)
		.map(mapMultiMethodResult);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate expected RRF score for a node appearing in both result sets
 *
 * Useful for testing and debugging.
 *
 * @param vectorRank - Rank in vector results (1-based)
 * @param graphRank - Rank in graph results (1-based)
 * @param k - RRF constant
 * @returns Combined RRF score
 */
export function calculateCombinedRRFScore(
	vectorRank: number,
	graphRank: number,
	k: number = DEFAULT_RRF_K,
): number {
	return calculateRRFScore(vectorRank, k) + calculateRRFScore(graphRank, k);
}

/**
 * Get the maximum possible RRF score (rank 1 in all methods)
 *
 * @param methodCount - Number of retrieval methods
 * @param k - RRF constant
 * @returns Maximum possible score
 */
export function getMaxRRFScore(methodCount: number, k: number = DEFAULT_RRF_K): number {
	return methodCount * calculateRRFScore(1, k);
}

/**
 * Normalize RRF scores to [0, 1] range
 *
 * @param results - RRF results to normalize
 * @param methodCount - Number of retrieval methods used
 * @returns Results with normalized scores
 */
export function normalizeRRFScores<T>(
	results: RRFResult<T>[],
	methodCount = 2,
): (RRFResult<T> & { normalizedScore: number })[] {
	const maxScore = getMaxRRFScore(methodCount);

	return results.map((r) => ({
		...r,
		normalizedScore: r.rrfScore / maxScore,
	}));
}

/**
 * Calculate boost percentage for nodes appearing in multiple methods
 *
 * Nodes in both vector and graph results get a score boost.
 *
 * @param singleMethodScore - Score if node appeared in only one method
 * @param actualScore - Actual combined score
 * @returns Boost percentage (e.g., 0.5 = 50% boost)
 */
export function calculateMultiMethodBoost(singleMethodScore: number, actualScore: number): number {
	if (singleMethodScore === 0) {
		return 0;
	}
	return (actualScore - singleMethodScore) / singleMethodScore;
}
