/**
 * Vector Search Query Helpers
 *
 * Type-safe helpers for compiled vector similarity queries in HelixDB.
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
	nodeType: "TradeDecision",
	filters: {},
	timeoutMs: 2000,
};

interface QueryDispatch {
	queryName: string;
	params: Record<string, unknown>;
	nodeType: string;
}

function toRowArray(value: unknown): Record<string, unknown>[] {
	if (Array.isArray(value)) {
		return value.filter(
			(row): row is Record<string, unknown> => typeof row === "object" && row !== null,
		);
	}
	if (value && typeof value === "object") {
		return [value as Record<string, unknown>];
	}
	return [];
}

function resolveSimilarity(row: Record<string, unknown>): number {
	const directSimilarity = row.similarity;
	if (typeof directSimilarity === "number" && Number.isFinite(directSimilarity)) {
		return directSimilarity;
	}

	const score = row.score;
	if (typeof score === "number" && Number.isFinite(score)) {
		return score;
	}

	const distance = row.distance;
	if (typeof distance === "number" && Number.isFinite(distance)) {
		return 1 / (1 + Math.max(0, distance));
	}

	return 0;
}

function resolveNodeId(row: Record<string, unknown>, fallback: string): string {
	return (
		(typeof row.id === "string" && row.id) ||
		(typeof row._id === "string" && row._id) ||
		(typeof row.decision_id === "string" && row.decision_id) ||
		(typeof row.event_id === "string" && row.event_id) ||
		(typeof row.item_id === "string" && row.item_id) ||
		(typeof row.chunk_id === "string" && row.chunk_id) ||
		(typeof row.thesis_id === "string" && row.thesis_id) ||
		(typeof row.hypothesis_id === "string" && row.hypothesis_id) ||
		(typeof row.paper_id === "string" && row.paper_id) ||
		(typeof row.symbol === "string" && row.symbol) ||
		fallback
	);
}

function sanitizeFilters(filters: Record<string, unknown>): Record<string, unknown> {
	const sanitized = { ...filters };
	delete sanitized.query_text;
	return sanitized;
}

function matchesFilters(row: Record<string, unknown>, filters: Record<string, unknown>): boolean {
	const sanitizedFilters = sanitizeFilters(filters);
	return Object.entries(sanitizedFilters).every(([key, value]) => {
		if (value === undefined || value === null) {
			return true;
		}
		return row[key] === value;
	});
}

interface DispatchContext {
	queryText: string;
	filters: Record<string, unknown>;
	limit: number;
	nodeType: string;
}

type DispatchResolver = (context: DispatchContext) => QueryDispatch;

function getStringFilter(filters: Record<string, unknown>, key: string): string | undefined {
	const value = filters[key];
	return typeof value === "string" ? value : undefined;
}

const buildTradeDecisionDispatch: DispatchResolver = (context) => {
	const instrumentId = getStringFilter(context.filters, "instrument_id");
	if (instrumentId) {
		return {
			queryName: "SearchDecisionsByInstrument",
			params: { query_text: context.queryText, instrument_id: instrumentId, limit: context.limit },
			nodeType: context.nodeType,
		};
	}

	return {
		queryName: "SearchSimilarDecisions",
		params: { query_text: context.queryText, limit: context.limit },
		nodeType: context.nodeType,
	};
};

const buildFilingDispatch: DispatchResolver = (context) => {
	const companySymbol = getStringFilter(context.filters, "company_symbol");
	if (companySymbol) {
		return {
			queryName: "SearchFilingsByCompany",
			params: { query: context.queryText, company_symbol: companySymbol, limit: context.limit },
			nodeType: context.nodeType,
		};
	}

	return {
		queryName: "SearchFilings",
		params: { query: context.queryText, limit: context.limit },
		nodeType: context.nodeType,
	};
};

const buildTranscriptDispatch: DispatchResolver = (context) => {
	const companySymbol = getStringFilter(context.filters, "company_symbol");
	if (companySymbol) {
		return {
			queryName: "SearchTranscriptsByCompany",
			params: { query: context.queryText, company_symbol: companySymbol, limit: context.limit },
			nodeType: context.nodeType,
		};
	}

	return {
		queryName: "SearchTranscripts",
		params: { query: context.queryText, limit: context.limit },
		nodeType: context.nodeType,
	};
};

const buildNewsDispatch: DispatchResolver = (context) => ({
	queryName: "SearchNews",
	params: { query: context.queryText, limit: context.limit },
	nodeType: context.nodeType,
});

const buildExternalEventDispatch: DispatchResolver = (context) => {
	const eventType = getStringFilter(context.filters, "event_type");
	if (eventType) {
		return {
			queryName: "SearchExternalEventsByType",
			params: { query: context.queryText, event_type: eventType, limit: context.limit },
			nodeType: context.nodeType,
		};
	}

	return {
		queryName: "SearchExternalEvents",
		params: { query: context.queryText, limit: context.limit },
		nodeType: context.nodeType,
	};
};

const buildThesisDispatch: DispatchResolver = (context) => {
	const outcome = getStringFilter(context.filters, "outcome");
	if (outcome) {
		return {
			queryName: "SearchThesesByOutcome",
			params: { query_text: context.queryText, outcome, limit: context.limit },
			nodeType: context.nodeType,
		};
	}

	return {
		queryName: "SearchSimilarTheses",
		params: { query_text: context.queryText, limit: context.limit },
		nodeType: context.nodeType,
	};
};

const buildResearchHypothesisDispatch: DispatchResolver = (context) => {
	const status = getStringFilter(context.filters, "status");
	if (status) {
		return {
			queryName: "SearchHypothesesByStatus",
			params: { query_text: context.queryText, status, limit: context.limit },
			nodeType: context.nodeType,
		};
	}

	const mechanism = getStringFilter(context.filters, "market_mechanism");
	if (mechanism) {
		return {
			queryName: "SearchHypothesesByMechanism",
			params: { query_text: context.queryText, market_mechanism: mechanism, limit: context.limit },
			nodeType: context.nodeType,
		};
	}

	return {
		queryName: "SearchSimilarHypotheses",
		params: { query_text: context.queryText, limit: context.limit },
		nodeType: context.nodeType,
	};
};

const buildAcademicPaperDispatch: DispatchResolver = (context) => ({
	queryName: "SearchAcademicPapers",
	params: { query_text: context.queryText, limit: context.limit },
	nodeType: context.nodeType,
});

const DISPATCH_RESOLVERS: Record<string, DispatchResolver> = {
	AcademicPaper: buildAcademicPaperDispatch,
	ExternalEvent: buildExternalEventDispatch,
	FilingChunk: buildFilingDispatch,
	NewsItem: buildNewsDispatch,
	ResearchHypothesis: buildResearchHypothesisDispatch,
	ThesisMemory: buildThesisDispatch,
	TradeDecision: buildTradeDecisionDispatch,
	TranscriptChunk: buildTranscriptDispatch,
};

function resolveQueryDispatch(
	queryText: string,
	options: Required<VectorSearchOptions>,
): QueryDispatch {
	const resolver = DISPATCH_RESOLVERS[options.nodeType];
	if (!resolver) {
		throw new Error(`Unsupported vector search nodeType: ${options.nodeType}`);
	}

	return resolver({
		queryText,
		filters: options.filters,
		limit: Math.max(options.topK * 2, options.topK),
		nodeType: options.nodeType,
	});
}

/**
 * Perform a vector similarity search.
 *
 * @param client - HelixDB client
 * @param queryText - Query text (embedded in Helix via Embed())
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
	queryText: string,
	options: VectorSearchOptions = {},
): Promise<VectorSearchResponse<T>> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const dispatch = resolveQueryDispatch(queryText, opts);
	const result = await client.query<unknown>(dispatch.queryName, dispatch.params);
	const rows = toRowArray(result.data);
	const filtered = rows
		.filter((row) => matchesFilters(row, opts.filters))
		.map((row, index) => {
			const similarity = resolveSimilarity(row);
			const id = resolveNodeId(row, `${dispatch.nodeType}-${index}`);
			return {
				id,
				type: dispatch.nodeType,
				properties: row as T,
				similarity,
			};
		})
		.filter((row) => row.similarity >= opts.minSimilarity)
		.toSorted((a, b) => b.similarity - a.similarity)
		.slice(0, opts.topK);

	return {
		results: filtered,
		executionTimeMs: result.executionTimeMs,
		count: filtered.length,
	};
}

/**
 * Search for similar trade decisions by rationale.
 *
 * @param client - HelixDB client
 * @param queryText - Query text
 * @param options - Search options
 * @returns Similar trade decisions
 */
export async function searchSimilarDecisions(
	client: HelixClient,
	queryText: string,
	options: Omit<VectorSearchOptions, "nodeType"> = {},
): Promise<VectorSearchResponse> {
	return vectorSearch(client, queryText, {
		...options,
		nodeType: "TradeDecision",
	});
}

/**
 * Search for similar news items by headline/content.
 *
 * @param client - HelixDB client
 * @param queryText - Query text
 * @param options - Search options
 * @returns Similar news items
 */
export async function searchSimilarNews(
	client: HelixClient,
	queryText: string,
	options: Omit<VectorSearchOptions, "nodeType"> = {},
): Promise<VectorSearchResponse> {
	return vectorSearch(client, queryText, {
		...options,
		nodeType: "NewsItem",
	});
}

/**
 * Search for similar filing chunks.
 *
 * @param client - HelixDB client
 * @param queryText - Query text
 * @param options - Search options
 * @returns Similar filing chunks
 */
export async function searchSimilarFilings(
	client: HelixClient,
	queryText: string,
	options: Omit<VectorSearchOptions, "nodeType"> = {},
): Promise<VectorSearchResponse> {
	return vectorSearch(client, queryText, {
		...options,
		nodeType: "FilingChunk",
	});
}

/**
 * Search for similar transcript chunks.
 *
 * @param client - HelixDB client
 * @param queryText - Query text
 * @param options - Search options
 * @returns Similar transcript chunks
 */
export async function searchSimilarTranscripts(
	client: HelixClient,
	queryText: string,
	options: Omit<VectorSearchOptions, "nodeType"> = {},
): Promise<VectorSearchResponse> {
	return vectorSearch(client, queryText, {
		...options,
		nodeType: "TranscriptChunk",
	});
}
