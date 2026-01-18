/**
 * Search Filings Tool
 *
 * Searches SEC filing chunks in HelixDB using semantic search.
 * Supports filtering by symbol and filing type.
 */

import { type ExecutionContext, isTest } from "@cream/domain";
import { createHelixClientFromEnv, type HelixClient } from "@cream/helix";
import type { FilingChunk } from "@cream/helix-schema";

// ============================================
// Types
// ============================================

export interface SearchFilingsParams {
	/** Search query for semantic matching */
	query: string;
	/** Filter by company symbol (optional) */
	symbol?: string;
	/** Filter by filing type(s) (optional) */
	filingTypes?: string[];
	/** Maximum number of results (default: 10) */
	limit?: number;
}

export interface FilingChunkSummary {
	/** Unique chunk identifier */
	chunkId: string;
	/** Filing identifier (accession number) */
	filingId: string;
	/** Company symbol */
	symbol: string;
	/** Filing type (10-K, 10-Q, 8-K, etc.) */
	filingType: string;
	/** Filing date (YYYY-MM-DD) */
	filingDate: string;
	/** Chunk text content */
	content: string;
	/** Position within the filing */
	chunkIndex: number;
	/** Similarity score from vector search */
	score?: number;
}

export interface SearchFilingsResult {
	/** Found filing chunks */
	chunks: FilingChunkSummary[];
	/** Total matching chunks found */
	totalFound: number;
	/** Search query used */
	query: string;
}

// ============================================
// HelixDB Client
// ============================================

let helixClient: HelixClient | null = null;

function getHelixClient(): HelixClient {
	if (!helixClient) {
		helixClient = createHelixClientFromEnv();
	}
	return helixClient;
}

// ============================================
// Core Implementation
// ============================================

/**
 * Search SEC filing chunks using semantic search.
 *
 * Uses HelixDB vector search on FilingChunk embeddings.
 * Filters can be applied by symbol and filing type.
 *
 * @param ctx - ExecutionContext
 * @param params - Search parameters
 * @returns Search results with matching chunks
 */
export async function searchFilings(
	ctx: ExecutionContext,
	params: SearchFilingsParams
): Promise<SearchFilingsResult> {
	// In test mode, return empty results for consistent/fast execution
	if (isTest(ctx)) {
		return {
			chunks: [],
			totalFound: 0,
			query: params.query,
		};
	}

	const client = getHelixClient();
	const limit = params.limit ?? 10;

	// Choose query based on whether symbol filter is provided
	let results: FilingChunk[];

	if (params.symbol) {
		// Use filtered query by company symbol
		const response = await client.query("SearchFilingsByCompany", {
			query: params.query,
			company_symbol: params.symbol.toUpperCase(),
			limit,
		});
		results = extractFilingChunks(response.data);
	} else {
		// Use general search query
		const response = await client.query("SearchFilings", {
			query: params.query,
			limit,
		});
		results = extractFilingChunks(response.data);
	}

	// Apply filing type filter if specified (HelixDB doesn't support multi-field WHERE)
	if (params.filingTypes && params.filingTypes.length > 0) {
		const normalizedTypes = params.filingTypes.map((t) => t.toUpperCase());
		results = results.filter((chunk) => normalizedTypes.includes(chunk.filing_type.toUpperCase()));
	}

	// Transform to summary format
	const chunks: FilingChunkSummary[] = results.map((chunk, index) => ({
		chunkId: chunk.chunk_id,
		filingId: chunk.filing_id,
		symbol: chunk.company_symbol,
		filingType: chunk.filing_type as string,
		filingDate: chunk.filing_date,
		content: chunk.chunk_text,
		chunkIndex: chunk.chunk_index,
		// HelixDB returns results sorted by similarity, use index as proxy for score
		score: 1 - index * 0.05,
	}));

	return {
		chunks,
		totalFound: chunks.length,
		query: params.query,
	};
}

/**
 * Extract FilingChunk array from HelixDB query response.
 */
function extractFilingChunks(data: unknown): FilingChunk[] {
	// HelixDB returns results in various formats depending on query
	if (!data) {
		return [];
	}

	// Check for array directly
	if (Array.isArray(data)) {
		return data as FilingChunk[];
	}

	// Check for results wrapper
	const dataObj = data as Record<string, unknown>;
	if (dataObj.results && Array.isArray(dataObj.results)) {
		return dataObj.results as FilingChunk[];
	}

	// Check for nodes array (graph query format)
	if (dataObj.nodes && Array.isArray(dataObj.nodes)) {
		return dataObj.nodes as FilingChunk[];
	}

	return [];
}
