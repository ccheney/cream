/**
 * Helix Query Tool
 *
 * Query the HelixDB knowledge graph.
 */

import { graphragQuery } from "@cream/agents/implementations";
import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Create ExecutionContext for tool invocation.
 */
function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

const HelixQueryInputSchema = z.object({
	query: z
		.string()
		.min(3)
		.describe("Natural language query for semantic search (e.g., 'AAPL earnings guidance')"),
	symbol: z.string().optional().describe("Optional company ticker symbol filter (e.g., 'AAPL')"),
	limit: z
		.number()
		.min(1)
		.max(50)
		.optional()
		.describe("Maximum results per type to return (default: 10)"),
	maxNodes: z
		.number()
		.min(1)
		.max(200)
		.optional()
		.describe("Maximum nodes to return to the agent (default: 50)"),
	maxEdges: z
		.number()
		.min(1)
		.max(200)
		.optional()
		.describe("Maximum edges to return to the agent (default: 100)"),
});

const HelixQueryOutputSchema = z.object({
	nodes: z
		.array(z.unknown())
		.describe("Graph nodes returned by query. Structure depends on query type"),
	edges: z.array(z.unknown()).describe("Graph edges/relationships between nodes"),
	metadata: z
		.record(z.string(), z.unknown())
		.describe("Query metadata: timing, match count, similarity scores"),
});

export interface HelixQueryResult {
	nodes: unknown[];
	edges: unknown[];
	metadata: Record<string, unknown>;
}

export const helixQuery = createTool({
	id: "helixQuery",
	description: `Query for memory/graph data using semantic search. Use this tool to:
- Retrieve similar historical cases from memory
- Query knowledge graph relationships
- Access vector similarity search results
- Fetch agent memory and learned patterns

Stores of the system's learned memory including:
- Historical trade outcomes and their contexts
- Market pattern embeddings for similarity search
- Cross-session learning and pattern recognition`,
	inputSchema: HelixQueryInputSchema,
	outputSchema: HelixQueryOutputSchema,
	execute: async (inputData): Promise<HelixQueryResult> => {
		const ctx = createToolContext();
		const trunc = (text: string, maxChars = 1200) =>
			text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;

		const result = await graphragQuery(ctx, {
			query: inputData.query,
			limit: inputData.limit,
			symbol: inputData.symbol,
		});

		// Flatten GraphRAG results into a generic node list
		const nodes: unknown[] = [
			...result.filingChunks.map((c) => ({
				...c,
				_type: "FilingChunk",
				chunkText: trunc(c.chunkText),
			})),
			...result.transcriptChunks.map((c) => ({
				...c,
				_type: "TranscriptChunk",
				chunkText: trunc(c.chunkText),
			})),
			...result.newsItems.map((n) => ({ ...n, _type: "NewsItem", bodyText: trunc(n.bodyText) })),
			...result.externalEvents.map((e) => ({ ...e, _type: "ExternalEvent" })),
			...result.companies.map((c) => ({ ...c, _type: "Company" })),
		];
		const edges: unknown[] = [];

		// Guardrail: limit payload size
		const maxNodes = inputData.maxNodes ?? 50;
		const maxEdges = inputData.maxEdges ?? 100;

		const nodesTotal = nodes.length;
		const edgesTotal = edges.length;

		const clippedNodes = nodesTotal > maxNodes ? nodes.slice(0, maxNodes) : nodes;
		const clippedEdges = edgesTotal > maxEdges ? edges.slice(0, maxEdges) : edges;

		return {
			nodes: clippedNodes,
			edges: clippedEdges,
			metadata: {
				executionTimeMs: result.executionTimeMs,
				query: inputData.query,
				symbol: inputData.symbol,
				limit: inputData.limit ?? 10,
				nodesTotal,
				edgesTotal,
				nodesReturned: clippedNodes.length,
				edgesReturned: clippedEdges.length,
				truncated: nodesTotal > clippedNodes.length || edgesTotal > clippedEdges.length,
			},
		};
	},
});

export { HelixQueryInputSchema, HelixQueryOutputSchema };
