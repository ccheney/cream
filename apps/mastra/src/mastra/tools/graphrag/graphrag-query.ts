/**
 * GraphRAG Query Tool
 *
 * Unified cross-type vector search with graph traversal.
 */

import { graphragQuery as graphragQueryImpl } from "@cream/agents/implementations";
import { createContext, requireEnv } from "@cream/domain";
import { HelixError } from "@cream/helix";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

const GraphRAGQueryInputSchema = z.object({
	query: z.string().min(3).describe("Natural language query for semantic search"),
	limit: z
		.number()
		.min(1)
		.max(50)
		.optional()
		.describe("Maximum results per type (default: 10, max: 50)"),
	symbol: z.string().optional().describe("Filter to specific company symbol"),
});

const GraphRAGQueryOutputSchema = z.object({
	filingChunks: z.array(z.unknown()),
	transcriptChunks: z.array(z.unknown()),
	newsItems: z.array(z.unknown()),
	externalEvents: z.array(z.unknown()),
	companies: z.array(z.unknown()),
	executionTimeMs: z.number(),
});

export const graphragQuery = createTool({
	id: "graphragQuery",
	description: `Query HelixDB using GraphRAG for unified cross-type search. Use this tool to:
- Search across filings, transcripts, news, and events simultaneously
- Discover related companies via graph traversal
- Find relevant historical context for current analysis

Returns results from multiple document types with company connections.`,
	inputSchema: GraphRAGQueryInputSchema,
	outputSchema: GraphRAGQueryOutputSchema,
	execute: async (inputData) => {
		const ctx = createToolContext();
		try {
			return await graphragQueryImpl(ctx, {
				query: inputData.query,
				limit: inputData.limit,
				symbol: inputData.symbol,
			});
		} catch (error) {
			if (isHelixUnavailable(error)) {
				return {
					filingChunks: [],
					transcriptChunks: [],
					newsItems: [],
					externalEvents: [],
					companies: [],
					executionTimeMs: 0,
				};
			}
			throw error;
		}
	},
});

function isHelixUnavailable(error: unknown): boolean {
	if (!(error instanceof HelixError)) return false;
	if (error.code === "CIRCUIT_OPEN" || error.code === "CONNECTION_FAILED") return true;
	if (error.code === "QUERY_FAILED" && error.cause instanceof Error) {
		const msg = error.cause.message;
		return msg.includes("ConnectionRefused") || msg.includes("Unable to connect");
	}
	return false;
}

export { GraphRAGQueryInputSchema, GraphRAGQueryOutputSchema };
