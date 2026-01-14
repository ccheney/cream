/**
 * Edge Scoring Functions
 *
 * Functions for calculating edge weights, priorities, and filtering
 * based on traversal options.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { GraphEdge, TraversalOptions } from "./types.js";

/**
 * Default edge type weight thresholds.
 *
 * @see docs/plans/04-memory-helixdb.md:325-330
 */
export const EDGE_TYPE_THRESHOLDS: Record<string, number> = {
	INFLUENCED_DECISION: 0.6, // confidence_score >= 0.6
	DEPENDS_ON: 0.3, // strength weighted
	AFFECTED_BY: 0.3, // sensitivity threshold
	MENTIONED_IN: 0.5, // mention_type dependent
};

/**
 * Mention type weights for MENTIONED_IN edges.
 */
export const MENTION_TYPE_WEIGHTS: Record<string, number> = {
	PRIMARY: 1.0,
	SECONDARY: 0.7,
	PEER_COMPARISON: 0.5,
};

/**
 * Extract the weight attribute from an edge based on its type.
 *
 * @param edge - Graph edge with properties
 * @returns Weight value [0, 1] or undefined if no weight attribute
 */
export function getEdgeWeight(edge: GraphEdge): number | undefined {
	const props = edge.properties;

	switch (edge.type) {
		case "INFLUENCED_DECISION":
			if (typeof props.confidence_score === "number") {
				return props.confidence_score;
			}
			if (typeof props.influence_score === "number") {
				return props.influence_score;
			}
			return undefined;

		case "DEPENDS_ON":
			return typeof props.strength === "number" ? props.strength : undefined;

		case "AFFECTED_BY":
			return typeof props.sensitivity === "number" ? props.sensitivity : undefined;

		case "MENTIONED_IN": {
			const mentionType = props.mention_type as string | undefined;
			return mentionType ? (MENTION_TYPE_WEIGHTS[mentionType] ?? 0.5) : 0.5;
		}

		default:
			if (typeof props.weight === "number") {
				return props.weight;
			}
			if (typeof props.score === "number") {
				return props.score;
			}
			if (typeof props.strength === "number") {
				return props.strength;
			}
			return undefined;
	}
}

/**
 * Check if an edge meets the weight threshold for traversal.
 *
 * @param edge - Graph edge to check
 * @param options - Traversal options with thresholds
 * @returns true if edge should be followed
 */
export function shouldFollowEdge(edge: GraphEdge, options: Required<TraversalOptions>): boolean {
	const customThreshold = options.edgeTypeWeights[edge.type];
	const typeThreshold = EDGE_TYPE_THRESHOLDS[edge.type];
	const threshold = customThreshold ?? typeThreshold ?? options.edgeWeightThreshold;

	const weight = getEdgeWeight(edge);

	if (weight === undefined) {
		return true;
	}

	return weight >= threshold;
}

/**
 * Calculate recency boost for an edge based on its timestamp.
 *
 * @param edge - Graph edge with timestamp
 * @param options - Traversal options with recency settings
 * @returns Multiplier (1.0 for old edges, recencyBoostMultiplier for recent)
 */
export function calculateRecencyBoost(
	edge: GraphEdge,
	options: Required<TraversalOptions>
): number {
	const props = edge.properties;

	const timestampStr = props.created_at ?? props.timestamp ?? props.computed_at ?? props.derived_at;

	if (typeof timestampStr !== "string") {
		return 1.0;
	}

	const edgeDate = new Date(timestampStr);
	const now = new Date();
	const daysSinceCreation = (now.getTime() - edgeDate.getTime()) / (1000 * 60 * 60 * 24);

	if (daysSinceCreation <= options.recencyBoostDays) {
		return options.recencyBoostMultiplier;
	}

	return 1.0;
}

/**
 * Calculate hub penalty for a node based on its edge count.
 *
 * @param edgeCount - Number of edges connected to the node
 * @param options - Traversal options with hub penalty settings
 * @returns Multiplier (1.0 for normal nodes, hubPenaltyMultiplier for hubs)
 */
export function calculateHubPenalty(
	edgeCount: number,
	options: Required<TraversalOptions>
): number {
	if (edgeCount > options.hubPenaltyThreshold) {
		return options.hubPenaltyMultiplier;
	}
	return 1.0;
}

/**
 * Calculate the final traversal priority score for an edge.
 *
 * Combines:
 * 1. Base edge weight
 * 2. Recency boost for recent edges
 * 3. Hub penalty for high-degree target nodes
 *
 * @param edge - Graph edge to score
 * @param targetNodeEdgeCount - Number of edges on the target node
 * @param options - Traversal options
 * @returns Priority score (higher = traverse first)
 */
export function calculateEdgePriority(
	edge: GraphEdge,
	targetNodeEdgeCount: number,
	options: Required<TraversalOptions>
): number {
	const baseWeight = getEdgeWeight(edge) ?? 0.5;
	const recencyMultiplier = calculateRecencyBoost(edge, options);
	const hubMultiplier = calculateHubPenalty(targetNodeEdgeCount, options);

	return baseWeight * recencyMultiplier * hubMultiplier;
}

/**
 * Sort edges by priority score (highest first).
 *
 * @param edges - Array of edges with target node edge counts
 * @param options - Traversal options
 * @returns Sorted edges
 */
export function sortEdgesByPriority(
	edges: Array<{ edge: GraphEdge; targetNodeEdgeCount: number }>,
	options: Required<TraversalOptions>
): Array<{ edge: GraphEdge; targetNodeEdgeCount: number; priority: number }> {
	return edges
		.map((e) => ({
			...e,
			priority: calculateEdgePriority(e.edge, e.targetNodeEdgeCount, options),
		}))
		.sort((a, b) => b.priority - a.priority);
}

/**
 * Filter and sort edges for weighted traversal.
 *
 * Applies:
 * 1. Edge weight threshold filtering
 * 2. Priority scoring with recency boost and hub penalty
 * 3. Sorting by priority (highest first)
 * 4. Limiting to maxNeighborsPerNode
 *
 * @param edges - Edges to process
 * @param targetNodeEdgeCounts - Map of node ID to edge count
 * @param options - Traversal options
 * @returns Filtered and sorted edges
 */
export function filterAndPrioritizeEdges(
	edges: GraphEdge[],
	targetNodeEdgeCounts: Map<string, number>,
	options: Required<TraversalOptions>
): GraphEdge[] {
	const filtered = edges.filter((edge) => shouldFollowEdge(edge, options));

	const withCounts = filtered.map((edge) => ({
		edge,
		targetNodeEdgeCount: targetNodeEdgeCounts.get(edge.targetId) ?? 0,
	}));

	const sorted = sortEdgesByPriority(withCounts, options);

	return sorted.slice(0, options.maxNeighborsPerNode).map((e) => e.edge);
}
