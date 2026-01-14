/**
 * CBR Memory Context Builder
 *
 * Builds MemoryContext structures from CBR retrieval results for agent consumption.
 *
 * @module
 */

import type { MemoryContext } from "@cream/domain";
import type { EmbeddingClient } from "../embeddings.js";
import { retrieveSimilarCases } from "./retrieval.js";
import type {
	CBRMarketSnapshot,
	CBRRetrievalOptions,
	CBRRetrievalResult,
	HelixClient,
} from "./types.js";

/**
 * Build a MemoryContext from CBR retrieval result.
 *
 * This creates the complete memory context structure that agents
 * use for decision-making.
 *
 * @param retrievalResult - Result from retrieveSimilarCases
 * @returns MemoryContext for agent consumption
 */
export function buildMemoryContext(retrievalResult: CBRRetrievalResult): MemoryContext {
	return {
		retrievedCases: retrievalResult.cases,
		caseStatistics: retrievalResult.statistics,
	};
}

/**
 * Retrieve similar cases and build memory context in one call.
 *
 * Convenience function that combines retrieval and context building.
 *
 * @param client - HelixDB client
 * @param embeddingClient - Embedding client
 * @param snapshot - Current market context
 * @param options - Retrieval options
 * @returns MemoryContext ready for agent use
 */
export async function retrieveMemoryContext(
	client: HelixClient,
	embeddingClient: EmbeddingClient,
	snapshot: CBRMarketSnapshot,
	options: CBRRetrievalOptions = {}
): Promise<MemoryContext> {
	const result = await retrieveSimilarCases(client, embeddingClient, snapshot, options);
	return buildMemoryContext(result);
}
