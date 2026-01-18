/**
 * GraphRAG Tool Implementation
 *
 * Unified cross-type vector search with graph traversal for RAG queries.
 * Searches across FilingChunk, TranscriptChunk, NewsItem, ExternalEvent
 * and discovers connected Company nodes via graph edges.
 */

import { type ExecutionContext, isTest } from "@cream/domain";
import {
	type GraphRAGSearchResult,
	searchGraphContext,
	searchGraphContextByCompany,
} from "@cream/helix";
import { getHelixClient } from "../clients.js";

/**
 * Parameters for GraphRAG query.
 */
export interface GraphRAGQueryParams {
	/** Natural language query text */
	query: string;
	/** Maximum results per type (default: 10) */
	limit?: number;
	/** Filter to specific company symbol */
	symbol?: string;
}

/**
 * Result from GraphRAG query - re-exports types from @cream/helix.
 */
export type GraphRAGQueryResult = GraphRAGSearchResult;

/**
 * Empty result for test mode.
 */
function emptyResult(_query: string): GraphRAGQueryResult {
	return {
		filingChunks: [],
		transcriptChunks: [],
		newsItems: [],
		externalEvents: [],
		companies: [],
		executionTimeMs: 0,
	};
}

/**
 * Query HelixDB using GraphRAG for unified cross-type search.
 *
 * Performs vector similarity search across multiple document types
 * (filings, transcripts, news, events) and discovers connected
 * companies via graph traversal.
 *
 * @param ctx - ExecutionContext
 * @param params - Query parameters
 * @returns Unified search results with companies
 *
 * @example
 * ```typescript
 * const result = await graphragQuery(ctx, {
 *   query: "semiconductor supply chain constraints",
 *   limit: 20,
 * });
 *
 * // Access results by type
 * for (const filing of result.filingChunks) {
 *   console.log(`${filing.companySymbol}: ${filing.chunkText.slice(0, 100)}`);
 * }
 *
 * // See discovered companies
 * for (const company of result.companies) {
 *   console.log(`${company.symbol} (${company.source}): ${company.name}`);
 * }
 * ```
 */
export async function graphragQuery(
	ctx: ExecutionContext,
	params: GraphRAGQueryParams
): Promise<GraphRAGQueryResult> {
	if (isTest(ctx)) {
		return emptyResult(params.query);
	}

	const client = getHelixClient();
	const { query, limit = 10, symbol } = params;

	if (symbol) {
		return searchGraphContextByCompany(client, symbol, query, limit);
	}

	return searchGraphContext(client, { query, limit });
}
