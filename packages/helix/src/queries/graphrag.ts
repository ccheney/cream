/**
 * GraphRAG Query Helpers
 *
 * Unified cross-type vector search with graph traversal for RAG queries.
 * Searches across FilingChunk, TranscriptChunk, NewsItem, ExternalEvent
 * and discovers connected Company nodes via graph edges.
 *
 * @see docs/plans/34-graphrag-query-tool.md
 */

import type { HelixClient } from "../client";

// ============================================
// Types
// ============================================

/**
 * Options for GraphRAG search.
 */
export interface GraphRAGSearchOptions {
	/** Natural language query text */
	query: string;
	/** Maximum results per type (default: 10) */
	limit?: number;
	/** Filter to specific company symbol */
	symbol?: string;
}

/**
 * Filing chunk result from vector search.
 */
export interface FilingChunkResult {
	id: string;
	filingId: string;
	companySymbol: string;
	filingType: string;
	filingDate: string;
	chunkText: string;
	chunkIndex: number;
	score: number;
}

/**
 * Transcript chunk result from vector search.
 */
export interface TranscriptChunkResult {
	id: string;
	transcriptId: string;
	companySymbol: string;
	callDate: string;
	speaker: string;
	chunkText: string;
	chunkIndex: number;
	score: number;
}

/**
 * News item result from vector search.
 */
export interface NewsItemResult {
	id: string;
	headline: string;
	bodyText: string;
	source: string;
	relatedSymbols: string;
	sentimentScore: number;
	score: number;
}

/**
 * External event result from vector search.
 */
export interface ExternalEventResult {
	id: string;
	eventId: string;
	eventType: string;
	textSummary: string;
	relatedInstrumentIds: string;
	score: number;
}

/**
 * Company node from graph traversal.
 */
export interface CompanyResult {
	id: string;
	symbol: string;
	name: string;
	sector: string;
	industry: string;
	marketCapBucket: string;
	/** Source of discovery (filing, transcript, news, related, dependent) */
	source: "filing" | "transcript" | "news" | "related" | "dependent";
}

/**
 * Unified GraphRAG search result.
 */
export interface GraphRAGSearchResult {
	/** Filing chunks matching the query */
	filingChunks: FilingChunkResult[];
	/** Transcript chunks matching the query */
	transcriptChunks: TranscriptChunkResult[];
	/** News items matching the query */
	newsItems: NewsItemResult[];
	/** External events matching the query */
	externalEvents: ExternalEventResult[];
	/** Companies discovered via graph traversal (deduplicated) */
	companies: CompanyResult[];
	/** Query execution time in milliseconds */
	executionTimeMs: number;
}

// ============================================
// Raw Response Types (from HelixDB)
// ============================================

interface RawFilingChunk {
	id: string;
	label: string;
	data: number[];
	score: number;
	filing_id?: { String: string } | string | null;
	company_symbol?: { String: string } | string | null;
	filing_type?: { String: string } | string | null;
	filing_date?: { String: string } | string | null;
	chunk_text?: { String: string } | string | null;
	chunk_index?: { U32: number } | number | null;
}

interface RawTranscriptChunk {
	id: string;
	label: string;
	data: number[];
	score: number;
	transcript_id?: { String: string } | string | null;
	company_symbol?: { String: string } | string | null;
	call_date?: { String: string } | string | null;
	speaker?: { String: string } | string | null;
	chunk_text?: { String: string } | string | null;
	chunk_index?: { U32: number } | number | null;
}

interface RawNewsItem {
	id: string;
	label: string;
	data: number[];
	score: number;
	headline?: { String: string } | string | null;
	body_text?: { String: string } | string | null;
	source?: { String: string } | string | null;
	related_symbols?: { String: string } | string | null;
	sentiment_score?: { F64: number } | number | null;
}

interface RawExternalEvent {
	id: string;
	label: string;
	data: number[];
	score: number;
	event_id?: { String: string } | string | null;
	event_type?: { String: string } | string | null;
	text_summary?: { String: string } | string | null;
	related_instrument_ids?: { String: string } | string | null;
}

interface RawCompany {
	id: string;
	label: string;
	symbol?: { String: string } | string | null;
	name?: { String: string } | string | null;
	sector?: { String: string } | string | null;
	industry?: { String: string } | string | null;
	market_cap_bucket?: { String: string } | string | null;
}

interface SearchGraphContextResponse {
	filing_chunks: RawFilingChunk[];
	transcript_chunks: RawTranscriptChunk[];
	news_items: RawNewsItem[];
	external_events: RawExternalEvent[];
	filing_companies: RawCompany[];
	transcript_companies: RawCompany[];
	news_companies: RawCompany[];
}

interface SearchGraphContextByCompanyResponse {
	filing_chunks: RawFilingChunk[];
	transcript_chunks: RawTranscriptChunk[];
	news_items: RawNewsItem[];
	company: RawCompany[];
	news_companies: RawCompany[];
	related_companies: RawCompany[];
	dependent_companies: RawCompany[];
}

// ============================================
// Helpers
// ============================================

/**
 * Extract string value from HelixDB typed value wrapper.
 */
function extractString(value: { String: string } | string | null | undefined): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "object" && "String" in value) {
		return value.String;
	}
	return "";
}

/**
 * Extract number value from HelixDB typed value wrapper.
 */
function extractNumber(
	value: { F64: number } | { U32: number } | number | null | undefined,
): number {
	if (value === null || value === undefined) {
		return 0;
	}
	if (typeof value === "number") {
		return value;
	}
	if (typeof value === "object" && "F64" in value) {
		return value.F64;
	}
	if (typeof value === "object" && "U32" in value) {
		return value.U32;
	}
	return 0;
}

/**
 * Transform raw filing chunk to typed result.
 */
function transformFilingChunk(raw: RawFilingChunk): FilingChunkResult {
	return {
		id: raw.id,
		filingId: extractString(raw.filing_id),
		companySymbol: extractString(raw.company_symbol),
		filingType: extractString(raw.filing_type),
		filingDate: extractString(raw.filing_date),
		chunkText: extractString(raw.chunk_text),
		chunkIndex: extractNumber(raw.chunk_index),
		score: raw.score,
	};
}

/**
 * Transform raw transcript chunk to typed result.
 */
function transformTranscriptChunk(raw: RawTranscriptChunk): TranscriptChunkResult {
	return {
		id: raw.id,
		transcriptId: extractString(raw.transcript_id),
		companySymbol: extractString(raw.company_symbol),
		callDate: extractString(raw.call_date),
		speaker: extractString(raw.speaker),
		chunkText: extractString(raw.chunk_text),
		chunkIndex: extractNumber(raw.chunk_index),
		score: raw.score,
	};
}

/**
 * Transform raw news item to typed result.
 */
function transformNewsItem(raw: RawNewsItem): NewsItemResult {
	return {
		id: raw.id,
		headline: extractString(raw.headline),
		bodyText: extractString(raw.body_text),
		source: extractString(raw.source),
		relatedSymbols: extractString(raw.related_symbols),
		sentimentScore: extractNumber(raw.sentiment_score),
		score: raw.score,
	};
}

/**
 * Transform raw external event to typed result.
 */
function transformExternalEvent(raw: RawExternalEvent): ExternalEventResult {
	return {
		id: raw.id,
		eventId: extractString(raw.event_id),
		eventType: extractString(raw.event_type),
		textSummary: extractString(raw.text_summary),
		relatedInstrumentIds: extractString(raw.related_instrument_ids),
		score: raw.score,
	};
}

/**
 * Transform raw company to typed result with source.
 */
function transformCompany(raw: RawCompany, source: CompanyResult["source"]): CompanyResult {
	return {
		id: raw.id,
		symbol: extractString(raw.symbol),
		name: extractString(raw.name),
		sector: extractString(raw.sector),
		industry: extractString(raw.industry),
		marketCapBucket: extractString(raw.market_cap_bucket),
		source,
	};
}

/**
 * Deduplicate companies by symbol, preferring earlier sources.
 */
function deduplicateCompanies(companies: CompanyResult[]): CompanyResult[] {
	const seen = new Map<string, CompanyResult>();
	for (const company of companies) {
		if (company.symbol && !seen.has(company.symbol)) {
			seen.set(company.symbol, company);
		}
	}
	return Array.from(seen.values());
}

function transformSearchContent(
	response: Pick<
		SearchGraphContextResponse | SearchGraphContextByCompanyResponse,
		"filing_chunks" | "transcript_chunks" | "news_items"
	>,
): Omit<GraphRAGSearchResult, "externalEvents" | "companies" | "executionTimeMs"> {
	return {
		filingChunks: (response.filing_chunks ?? []).map(transformFilingChunk),
		transcriptChunks: (response.transcript_chunks ?? []).map(transformTranscriptChunk),
		newsItems: (response.news_items ?? []).map(transformNewsItem),
	};
}

function collectCompaniesBySource(
	companyGroups: Array<{ companies: RawCompany[] | undefined; source: CompanyResult["source"] }>,
): CompanyResult[] {
	return companyGroups
		.flatMap(({ companies, source }) =>
			(companies ?? []).map((raw) => transformCompany(raw, source)),
		)
		.filter((company) => company.symbol.length > 0);
}

function buildUnifiedSearchResult(
	response: SearchGraphContextResponse,
	startTime: number,
): GraphRAGSearchResult {
	const content = transformSearchContent(response);
	const externalEvents = (response.external_events ?? []).map(transformExternalEvent);
	const companies = deduplicateCompanies(
		collectCompaniesBySource([
			{ companies: response.filing_companies, source: "filing" },
			{ companies: response.transcript_companies, source: "transcript" },
			{ companies: response.news_companies, source: "news" },
		]),
	);

	return {
		...content,
		externalEvents,
		companies,
		executionTimeMs: performance.now() - startTime,
	};
}

function buildCompanySearchResult(
	response: SearchGraphContextByCompanyResponse,
	startTime: number,
): GraphRAGSearchResult {
	const content = transformSearchContent(response);
	const companies = deduplicateCompanies(
		collectCompaniesBySource([
			{ companies: response.company, source: "filing" },
			{ companies: response.news_companies, source: "news" },
			{ companies: response.related_companies, source: "related" },
			{ companies: response.dependent_companies, source: "dependent" },
		]),
	);

	return {
		...content,
		externalEvents: [],
		companies,
		executionTimeMs: performance.now() - startTime,
	};
}

// ============================================
// Main Functions
// ============================================

/**
 * Perform a unified GraphRAG search across all document types.
 *
 * Searches FilingChunk, TranscriptChunk, NewsItem, and ExternalEvent
 * vectors, then traverses graph edges to discover connected Company nodes.
 *
 * @param client - HelixDB client
 * @param options - Search options
 * @returns Unified search results with companies
 *
 * @example
 * ```typescript
 * const results = await searchGraphContext(client, {
 *   query: "semiconductor supply chain constraints",
 *   limit: 20,
 * });
 *
 * // Access results by type
 * for (const filing of results.filingChunks) {
 *   console.log(`${filing.companySymbol}: ${filing.chunkText.slice(0, 100)}`);
 * }
 *
 * // See discovered companies
 * for (const company of results.companies) {
 *   console.log(`${company.symbol} (${company.source}): ${company.name}`);
 * }
 * ```
 */
export async function searchGraphContext(
	client: HelixClient,
	options: GraphRAGSearchOptions,
): Promise<GraphRAGSearchResult> {
	const { query, limit = 10, symbol } = options;
	const startTime = performance.now();

	if (symbol) {
		const result = await client.query<SearchGraphContextByCompanyResponse>(
			"SearchGraphContextByCompany",
			{
				query,
				company_symbol: symbol,
				limit,
			},
		);
		return buildCompanySearchResult(result.data, startTime);
	}

	const result = await client.query<SearchGraphContextResponse>("SearchGraphContext", {
		query,
		limit,
	});
	return buildUnifiedSearchResult(result.data, startTime);
}

/**
 * Search for graph context related to a specific company.
 *
 * This is a convenience wrapper that calls searchGraphContext with the symbol option.
 *
 * @param client - HelixDB client
 * @param symbol - Company ticker symbol
 * @param query - Natural language query
 * @param limit - Maximum results per type
 * @returns Search results filtered to company with related/dependent companies
 */
export async function searchGraphContextByCompany(
	client: HelixClient,
	symbol: string,
	query: string,
	limit = 10,
): Promise<GraphRAGSearchResult> {
	return searchGraphContext(client, { query, limit, symbol });
}
