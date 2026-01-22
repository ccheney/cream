/**
 * Graph Pruning Module
 *
 * Provides functions for pruning graph structures to reduce memory
 * footprint while preserving important relationships.
 */

import type {
	EdgeInfo,
	GraphPruningAction,
	GraphPruningConfig,
	NodeConnectivity,
} from "./types.js";
import { DEFAULT_PRUNING_CONFIG } from "./types.js";

/**
 * Determine edges to prune based on weight threshold.
 *
 * @param edges - Array of edges to evaluate
 * @param minWeight - Minimum weight to retain (default: 0.3)
 * @returns Array of pruning actions for low-weight edges
 */
export function pruneEdgesByWeight(edges: EdgeInfo[], minWeight = 0.3): GraphPruningAction[] {
	return edges
		.filter((edge) => edge.weight < minWeight)
		.map((edge) => ({
			type: "remove_edge" as const,
			edgeId: edge.edgeId,
			reason: `Edge weight ${edge.weight.toFixed(3)} below threshold ${minWeight}`,
		}));
}

/**
 * Find isolated nodes (nodes with no edges) for removal.
 *
 * @param nodes - Array of node connectivity info
 * @returns Array of pruning actions for isolated nodes
 */
export function findIsolatedNodes(nodes: NodeConnectivity[]): GraphPruningAction[] {
	return nodes
		.filter((node) => node.edgeIds.length === 0)
		.map((node) => ({
			type: "remove_node" as const,
			nodeId: node.nodeId,
			reason: "Node has no edges (isolated)",
		}));
}

/**
 * Find hub nodes that exceed edge threshold and should be pruned.
 *
 * @param nodes - Array of node connectivity info with edges sorted by weight
 * @param config - Pruning configuration
 * @returns Array of pruning actions for hub nodes
 */
export function findHubsTooPrune(
	nodes: NodeConnectivity[],
	config: GraphPruningConfig = DEFAULT_PRUNING_CONFIG,
): GraphPruningAction[] {
	const actions: GraphPruningAction[] = [];

	for (const node of nodes) {
		if (node.edgeIds.length > config.hubEdgeThreshold) {
			const prunedEdges = node.edgeIds.length - config.maxHubEdges;
			actions.push({
				type: "prune_hub",
				nodeId: node.nodeId,
				retainedEdges: config.maxHubEdges,
				prunedEdges,
				reason: `Hub node has ${node.edgeIds.length} edges, pruning to top ${config.maxHubEdges} by weight`,
			});
		}
	}

	return actions;
}

/**
 * Find small isolated subgraphs for merging.
 *
 * A subgraph is considered isolated if it's not connected to the main graph.
 * Small isolated subgraphs are candidates for summarization into a single node.
 *
 * @param subgraphNodeIds - Array of node IDs in the subgraph
 * @param maxSize - Maximum subgraph size for merging
 * @param summaryNodeIdGenerator - Function to generate summary node ID
 * @returns Pruning action if subgraph should be merged, null otherwise
 */
export function evaluateSubgraphForMerge(
	subgraphNodeIds: string[],
	maxSize = 5,
	summaryNodeIdGenerator: () => string = () => `summary_${Date.now()}`,
): GraphPruningAction | null {
	if (subgraphNodeIds.length >= maxSize || subgraphNodeIds.length <= 1) {
		return null;
	}

	return {
		type: "merge_subgraph",
		nodeIds: subgraphNodeIds,
		summaryNodeId: summaryNodeIdGenerator(),
		reason: `Isolated subgraph with ${subgraphNodeIds.length} nodes merged into summary node`,
	};
}
