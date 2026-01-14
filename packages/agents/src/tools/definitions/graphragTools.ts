/**
 * GraphRAG Mastra Tool Definition
 *
 * Unified cross-type vector search with graph traversal for RAG queries.
 * Provides LLM agents with semantic search across filings, transcripts,
 * news, and events with automatic company discovery via graph edges.
 */

import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { graphragQuery } from "../implementations/graphrag.js";

/**
 * Create ExecutionContext for tool invocation.
 */
function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

// ============================================
// Schemas
// ============================================

const FilingChunkResultSchema = z.object({
	id: z.string(),
	filingId: z.string(),
	companySymbol: z.string(),
	filingType: z.string(),
	filingDate: z.string(),
	chunkText: z.string(),
	chunkIndex: z.number(),
	score: z.number().describe("Vector similarity score (0-1)"),
});

const TranscriptChunkResultSchema = z.object({
	id: z.string(),
	transcriptId: z.string(),
	companySymbol: z.string(),
	callDate: z.string(),
	speaker: z.string(),
	chunkText: z.string(),
	chunkIndex: z.number(),
	score: z.number().describe("Vector similarity score (0-1)"),
});

const NewsItemResultSchema = z.object({
	id: z.string(),
	headline: z.string(),
	bodyText: z.string(),
	source: z.string(),
	relatedSymbols: z.string(),
	sentimentScore: z.number().describe("Sentiment from -1.0 (bearish) to 1.0 (bullish)"),
	score: z.number().describe("Vector similarity score (0-1)"),
});

const ExternalEventResultSchema = z.object({
	id: z.string(),
	eventId: z.string(),
	eventType: z.string(),
	textSummary: z.string(),
	relatedInstrumentIds: z.string(),
	score: z.number().describe("Vector similarity score (0-1)"),
});

const CompanyResultSchema = z.object({
	id: z.string(),
	symbol: z.string(),
	name: z.string(),
	sector: z.string(),
	industry: z.string(),
	marketCapBucket: z.string(),
	source: z
		.enum(["filing", "transcript", "news", "related", "dependent"])
		.describe("How this company was discovered"),
});

export const GraphRAGQueryInputSchema = z.object({
	query: z
		.string()
		.min(3)
		.describe(
			"Natural language query for semantic search (e.g., 'semiconductor supply chain constraints')"
		),
	limit: z.number().min(1).max(50).optional().describe("Maximum results per type (default: 10)"),
	symbol: z.string().optional().describe("Filter to specific company ticker symbol (e.g., 'AAPL')"),
});

export const GraphRAGQueryOutputSchema = z.object({
	filingChunks: z.array(FilingChunkResultSchema).describe("SEC filing chunks matching the query"),
	transcriptChunks: z
		.array(TranscriptChunkResultSchema)
		.describe("Earnings call transcript chunks matching the query"),
	newsItems: z.array(NewsItemResultSchema).describe("News articles matching the query"),
	externalEvents: z.array(ExternalEventResultSchema).describe("External events matching the query"),
	companies: z.array(CompanyResultSchema).describe("Companies discovered via graph traversal"),
	executionTimeMs: z.number().describe("Query execution time in milliseconds"),
});

export type GraphRAGQueryInput = z.infer<typeof GraphRAGQueryInputSchema>;
export type GraphRAGQueryOutput = z.infer<typeof GraphRAGQueryOutputSchema>;

// ============================================
// Tool Definition
// ============================================

export const graphragQueryTool = createTool({
	id: "graphrag_query",
	description: `Unified semantic search across SEC filings, earnings transcripts, news, and events with company discovery.

Use this tool when you need to:
- Search for relevant context across multiple document types simultaneously
- Find information about specific topics (e.g., "supply chain issues", "AI investments")
- Discover related companies through graph relationships
- Get context for trading decisions from filings, transcripts, and news

The tool performs vector similarity search using text embeddings across:
- FilingChunks: SEC 10-K, 10-Q, 8-K filing sections
- TranscriptChunks: Earnings call transcript segments with speaker attribution
- NewsItems: News articles with sentiment scores
- ExternalEvents: Market events (macro, regulatory, etc.)

Graph traversal automatically discovers:
- Companies mentioned in matching documents
- Related companies (via RELATED_TO edges)
- Dependent companies (via DEPENDS_ON edges)

Results are ranked by vector similarity score (0-1, higher is better).

BACKTEST mode: Returns empty results (no HelixDB access).
PAPER/LIVE mode: Queries HelixDB for real semantic search.

Requires HELIX_URL or HELIX_HOST/HELIX_PORT environment variables.`,
	inputSchema: GraphRAGQueryInputSchema,
	outputSchema: GraphRAGQueryOutputSchema,
	execute: async (inputData): Promise<GraphRAGQueryOutput> => {
		const ctx = createToolContext();
		const result = await graphragQuery(ctx, {
			query: inputData.query,
			limit: inputData.limit,
			symbol: inputData.symbol,
		});
		return result;
	},
});
