/**
 * Graph Traversal Functions
 *
 * Traversal helpers backed by compiled Helix queries.
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
	GraphEdge,
	GraphNode,
	TraversalOptions,
	TraversalResponse,
	WeightedTraversalResponse,
} from "./types.js";
import { DEFAULT_TRAVERSAL_OPTIONS } from "./types.js";

type SupportedTraversal =
	| {
			queryName: "GetInfluencingEvents";
			params: { decision_id: string };
			edgeType: "INFLUENCED_DECISION";
			direction: "incoming";
			resultNodeType: "ExternalEvent";
	  }
	| {
			queryName: "GetInfluencedDecisions";
			params: { event_id: string };
			edgeType: "INFLUENCED_DECISION";
			direction: "outgoing";
			resultNodeType: "TradeDecision";
	  }
	| {
			queryName: "GetTradeWithEvents";
			params: { decision_id: string };
			edgeType: "HAS_EVENT";
			direction: "outgoing";
			resultNodeType: "TradeLifecycleEvent";
	  };

function toRowArray<T>(value: unknown): T[] {
	if (Array.isArray(value)) {
		return value as T[];
	}
	if (value && typeof value === "object") {
		return [value as T];
	}
	return [];
}

function toGraphNode<T>(
	row: Record<string, unknown>,
	fallbackType: string,
	fallbackId: string,
): GraphNode<T> {
	const id =
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
		(typeof row.entity_id === "string" && row.entity_id) ||
		fallbackId;

	const type = typeof row.type === "string" && row.type.length > 0 ? row.type : fallbackType;
	return {
		id,
		type,
		properties: row as T,
	};
}

function resolveTraversal(startNodeId: string, options: TraversalOptions): SupportedTraversal {
	const edgeType = options.edgeTypes?.at(0);
	const direction = options.direction;

	if (edgeType === "INFLUENCED_DECISION" && direction === "incoming") {
		return {
			queryName: "GetInfluencingEvents",
			params: { decision_id: startNodeId },
			edgeType: "INFLUENCED_DECISION",
			direction: "incoming",
			resultNodeType: "ExternalEvent",
		};
	}

	if (edgeType === "INFLUENCED_DECISION" && direction === "outgoing") {
		return {
			queryName: "GetInfluencedDecisions",
			params: { event_id: startNodeId },
			edgeType: "INFLUENCED_DECISION",
			direction: "outgoing",
			resultNodeType: "TradeDecision",
		};
	}

	if (edgeType === "HAS_EVENT" && direction === "outgoing") {
		return {
			queryName: "GetTradeWithEvents",
			params: { decision_id: startNodeId },
			edgeType: "HAS_EVENT",
			direction: "outgoing",
			resultNodeType: "TradeLifecycleEvent",
		};
	}

	throw new Error(
		`Unsupported traversal: edgeTypes=${JSON.stringify(options.edgeTypes)} direction=${options.direction}`,
	);
}

function buildPathEdge(
	index: number,
	edgeType: string,
	startNodeId: string,
	targetNodeId: string,
	direction: "incoming" | "outgoing",
): GraphEdge {
	if (direction === "incoming") {
		return {
			id: `${edgeType}:${targetNodeId}->${startNodeId}:${index}`,
			type: edgeType,
			sourceId: targetNodeId,
			targetId: startNodeId,
			properties: {},
		};
	}

	return {
		id: `${edgeType}:${startNodeId}->${targetNodeId}:${index}`,
		type: edgeType,
		sourceId: startNodeId,
		targetId: targetNodeId,
		properties: {},
	};
}

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
	const startTime = performance.now();

	let selection: SupportedTraversal;
	try {
		selection = resolveTraversal(startNodeId, opts);
	} catch {
		return {
			paths: [],
			nodes: [],
			executionTimeMs: performance.now() - startTime,
		};
	}

	const result = await client.query<unknown[]>(selection.queryName, selection.params);
	const rows = toRowArray<Record<string, unknown>>(result.data).slice(0, opts.limit);
	const neighborNodes = rows.map((row, index) =>
		toGraphNode<T>(row, selection.resultNodeType, `${selection.resultNodeType}-${index}`),
	);
	const paths = neighborNodes.map((node, index) => ({
		nodes: [node],
		edges: [buildPathEdge(index, selection.edgeType, startNodeId, node.id, selection.direction)],
		length: 1,
	}));

	return {
		paths,
		nodes: neighborNodes,
		executionTimeMs: performance.now() - startTime,
	};
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

	return result.nodes.filter((node) => node.id !== nodeId);
}
