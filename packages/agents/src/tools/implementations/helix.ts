/**
 * Helix Tool
 *
 * Query HelixDB for memory/graph data.
 */

import { type ExecutionContext, isTest } from "@cream/domain";
import { getHelixClient } from "../clients.js";
import type { HelixQueryResult } from "../types.js";

/**
 * Query HelixDB for memory/graph data
 *
 * Uses the @cream/helix client to execute HelixQL queries.
 *
 * @param ctx - ExecutionContext
 * @param queryName - HelixQL query name (registered in HelixDB)
 * @param params - Query parameters
 * @returns Query result with nodes and edges
 * @throws Error if HelixDB query fails or test mode is used
 */
export async function helixQuery(
	ctx: ExecutionContext,
	queryName: string,
	params: Record<string, unknown> = {},
): Promise<HelixQueryResult> {
	if (isTest(ctx)) {
		throw new Error("helixQuery is not available in test mode");
	}

	const client = getHelixClient();

	// Execute the HelixQL query
	const result = await client.query(queryName, params);

	// Map query result to HelixQueryResult format
	// The actual structure depends on the query, but typically includes nodes and edges
	const data = result.data as {
		nodes?: unknown[];
		edges?: unknown[];
		[key: string]: unknown;
	};

	return {
		nodes: data.nodes ?? [],
		edges: data.edges ?? [],
		metadata: {
			executionTimeMs: result.executionTimeMs,
			queryName,
			...params,
		},
	};
}
