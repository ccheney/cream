/**
 * Graph Traversal Functions
 *
 * Core traversal operations including basic traverse and weighted traverse.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { HelixClient } from "../../client.js";
import {
	calculateEdgePriority,
	calculateHubPenalty,
	calculateRecencyBoost,
	shouldFollowEdge,
} from "./scoring.js";
import type {
	GraphNode,
	TraversalOptions,
	TraversalResponse,
	WeightedTraversalResponse,
} from "./types.js";
import { DEFAULT_TRAVERSAL_OPTIONS } from "./types.js";

/**
 * Traverse the graph from a starting node.
 *
 * @param client - HelixDB client
 * @param startNodeId - Starting node ID
 * @param options - Traversal options
 * @returns Traversal results with paths and nodes
 *
 * @example
 * ```typescript
 * const result = await traverse(client, "decision-123", {
 *   maxDepth: 2,
 *   edgeTypes: ["INFLUENCED_DECISION"],
 *   direction: "incoming",
 * });
 * ```
 */
export async function traverse<T = Record<string, unknown>>(
	client: HelixClient,
	startNodeId: string,
	options: TraversalOptions = {},
): Promise<TraversalResponse<T>> {
	const opts = { ...DEFAULT_TRAVERSAL_OPTIONS, ...options };

	const params: Record<string, unknown> = {
		start_id: startNodeId,
		max_depth: opts.maxDepth,
		limit: opts.limit,
		direction: opts.direction,
		max_neighbors: opts.maxNeighborsPerNode,
	};

	if (opts.edgeTypes.length > 0) {
		params.edge_types = opts.edgeTypes;
	}

	if (opts.edgeWeightThreshold > 0) {
		params.min_edge_weight = opts.edgeWeightThreshold;
	}

	const result = await client.query<TraversalResponse<T>>("traverse", params);
	return result.data;
}

/**
 * Traverse the graph with edge weight prioritization.
 *
 * This function extends the basic traverse with:
 * 1. Edge weight threshold filtering (per edge type)
 * 2. Recency boost for recent edges
 * 3. Hub penalty for high-degree nodes
 * 4. Priority-based edge ordering
 *
 * @param client - HelixDB client
 * @param startNodeId - Starting node ID
 * @param options - Traversal options with weight settings
 * @returns Weighted traversal results with prioritized edges
 *
 * @example
 * ```typescript
 * const result = await weightedTraverse(client, "decision-123", {
 *   maxDepth: 2,
 *   edgeTypes: ["INFLUENCED_DECISION", "DEPENDS_ON"],
 *   edgeWeightThreshold: 0.5,
 *   recencyBoostDays: 14,
 * });
 *
 * // High-priority edges first
 * for (const { edge, priority } of result.prioritizedEdges) {
 *   console.log(`${edge.type}: ${priority.toFixed(2)}`);
 * }
 * ```
 */
export async function weightedTraverse<T = Record<string, unknown>>(
	client: HelixClient,
	startNodeId: string,
	options: TraversalOptions = {},
): Promise<WeightedTraversalResponse<T>> {
	const opts = { ...DEFAULT_TRAVERSAL_OPTIONS, ...options };
	const startTime = performance.now();

	const baseResult = await traverse<T>(client, startNodeId, options);

	const nodeEdgeCounts = new Map<string, number>();
	for (const path of baseResult.paths) {
		for (const edge of path.edges) {
			nodeEdgeCounts.set(edge.targetId, (nodeEdgeCounts.get(edge.targetId) ?? 0) + 1);
			nodeEdgeCounts.set(edge.sourceId, (nodeEdgeCounts.get(edge.sourceId) ?? 0) + 1);
		}
	}

	const allEdges = new Map<string, (typeof baseResult.paths)[0]["edges"][0]>();
	for (const path of baseResult.paths) {
		for (const edge of path.edges) {
			allEdges.set(edge.id, edge);
		}
	}

	const totalEdges = allEdges.size;

	const filteredEdges = Array.from(allEdges.values()).filter((edge) =>
		shouldFollowEdge(edge, opts),
	);

	const prioritizedEdges = filteredEdges.map((edge) => {
		const targetEdgeCount = nodeEdgeCounts.get(edge.targetId) ?? 0;
		const recencyBoost = calculateRecencyBoost(edge, opts);
		const hubPenalty = calculateHubPenalty(targetEdgeCount, opts);
		const priority = calculateEdgePriority(edge, targetEdgeCount, opts);

		return { edge, priority, recencyBoost, hubPenalty };
	});

	prioritizedEdges.sort((a, b) => b.priority - a.priority);

	const averagePriority =
		prioritizedEdges.length > 0
			? prioritizedEdges.reduce((sum, e) => sum + e.priority, 0) / prioritizedEdges.length
			: 0;

	return {
		...baseResult,
		executionTimeMs: performance.now() - startTime,
		prioritizedEdges,
		filterStats: {
			totalEdges,
			filteredEdges: filteredEdges.length,
			averagePriority,
		},
	};
}

/**
 * Find neighbors of a node.
 *
 * @param client - HelixDB client
 * @param nodeId - Node ID
 * @param options - Options for neighbor retrieval
 * @returns Neighboring nodes
 */
export async function getNeighbors<T = Record<string, unknown>>(
	client: HelixClient,
	nodeId: string,
	options: Pick<TraversalOptions, "edgeTypes" | "direction" | "limit"> = {},
): Promise<GraphNode<T>[]> {
	const result = await traverse<T>(client, nodeId, {
		maxDepth: 1,
		limit: options.limit ?? 100,
		edgeTypes: options.edgeTypes ?? [],
		direction: options.direction ?? "both",
	});

	return result.nodes.filter((n) => n.id !== nodeId);
}
