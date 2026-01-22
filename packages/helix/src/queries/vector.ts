/**
 * Vector Search Query Helpers
 *
 * Type-safe helpers for vector similarity search in HelixDB.
 * Target latency: ~2ms for vector search operations.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { HelixClient } from "../client";

/**
 * Vector search options.
 */
export interface VectorSearchOptions {
	/** Maximum number of results to return (default: 10) */
	topK?: number;
	/** Minimum similarity threshold 0-1 (default: 0.0) */
	minSimilarity?: number;
	/** Filter by node type */
	nodeType?: string;
	/** Additional property filters */
	filters?: Record<string, unknown>;
	/** Maximum query time in milliseconds (default: 2000) */
	timeoutMs?: number;
}

/**
 * Vector search result.
 */
export interface VectorSearchResult<T = Record<string, unknown>> {
	/** Node ID */
	id: string;
	/** Node type */
	type: string;
	/** Node properties */
	properties: T;
	/** Similarity score (0-1) */
	similarity: number;
}

/**
 * Vector search response.
 */
export interface VectorSearchResponse<T = Record<string, unknown>> {
	/** Search results ordered by similarity (descending) */
	results: VectorSearchResult<T>[];
	/** Total execution time in milliseconds */
	executionTimeMs: number;
	/** Number of results returned */
	count: number;
}

/**
 * Default vector search options.
 */
const DEFAULT_OPTIONS: Required<VectorSearchOptions> = {
	topK: 10,
	minSimilarity: 0.0,
	nodeType: "",
	filters: {},
	timeoutMs: 2000,
};

/**
 * Perform a vector similarity search.
 *
 * @param client - HelixDB client
 * @param embedding - Query embedding vector
 * @param options - Search options
 * @returns Search results ordered by similarity
 *
 * @example
 * ```typescript
 * const results = await vectorSearch(client, embedding, {
 *   topK: 5,
 *   minSimilarity: 0.7,
 *   nodeType: "TradeDecision",
 * });
 * ```
 */
export async function vectorSearch<T = Record<string, unknown>>(
	client: HelixClient,
	embedding: number[],
	options: VectorSearchOptions = {},
): Promise<VectorSearchResponse<T>> {
	const opts = { ...DEFAULT_OPTIONS, ...options };

	const params: Record<string, unknown> = {
		embedding,
		top_k: opts.topK,
		min_similarity: opts.minSimilarity,
	};

	if (opts.nodeType) {
		params.node_type = opts.nodeType;
	}

	if (Object.keys(opts.filters).length > 0) {
		params.filters = opts.filters;
	}

	// Execute the vector search query
	// Query name matches the compiled HelixQL query
	const result = await client.query<VectorSearchResult<T>[]>("vectorSearch", params);

	return {
		results: result.data,
		executionTimeMs: result.executionTimeMs,
		count: result.data.length,
	};
}

/**
 * Search for similar trade decisions by rationale.
 *
 * @param client - HelixDB client
 * @param rationaleEmbedding - Embedding of the rationale text
 * @param options - Search options
 * @returns Similar trade decisions
 */
export async function searchSimilarDecisions(
	client: HelixClient,
	rationaleEmbedding: number[],
	options: Omit<VectorSearchOptions, "nodeType"> = {},
): Promise<VectorSearchResponse> {
	return vectorSearch(client, rationaleEmbedding, {
		...options,
		nodeType: "TradeDecision",
	});
}

/**
 * Search for similar news items by headline/content.
 *
 * @param client - HelixDB client
 * @param contentEmbedding - Embedding of the news content
 * @param options - Search options
 * @returns Similar news items
 */
export async function searchSimilarNews(
	client: HelixClient,
	contentEmbedding: number[],
	options: Omit<VectorSearchOptions, "nodeType"> = {},
): Promise<VectorSearchResponse> {
	return vectorSearch(client, contentEmbedding, {
		...options,
		nodeType: "NewsItem",
	});
}

/**
 * Search for similar filing chunks.
 *
 * @param client - HelixDB client
 * @param chunkEmbedding - Embedding of the filing chunk
 * @param options - Search options
 * @returns Similar filing chunks
 */
export async function searchSimilarFilings(
	client: HelixClient,
	chunkEmbedding: number[],
	options: Omit<VectorSearchOptions, "nodeType"> = {},
): Promise<VectorSearchResponse> {
	return vectorSearch(client, chunkEmbedding, {
		...options,
		nodeType: "FilingChunk",
	});
}

/**
 * Search for similar transcript chunks.
 *
 * @param client - HelixDB client
 * @param chunkEmbedding - Embedding of the transcript chunk
 * @param options - Search options
 * @returns Similar transcript chunks
 */
export async function searchSimilarTranscripts(
	client: HelixClient,
	chunkEmbedding: number[],
	options: Omit<VectorSearchOptions, "nodeType"> = {},
): Promise<VectorSearchResponse> {
	return vectorSearch(client, chunkEmbedding, {
		...options,
		nodeType: "TranscriptChunk",
	});
}
