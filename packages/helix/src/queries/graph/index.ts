/**
 * Graph Traversal Query Helpers
 *
 * Type-safe helpers for graph traversal operations in HelixDB.
 * Target latency: <1ms for graph traversal operations.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

// Citations
export type { Citation, CitationSourceType } from "./citations.js";
export { getDecisionCitations } from "./citations.js";
// Node Queries
export { getCompanyNodes, getNode, getNodesByType } from "./nodes.js";
// Relationships
export {
	getInfluencedDecisions,
	getInfluencingEvents,
	getLifecycleEvents,
} from "./relationships.js";
// Scoring
export {
	calculateEdgePriority,
	calculateHubPenalty,
	calculateRecencyBoost,
	EDGE_TYPE_THRESHOLDS,
	filterAndPrioritizeEdges,
	getEdgeWeight,
	MENTION_TYPE_WEIGHTS,
	shouldFollowEdge,
	sortEdgesByPriority,
} from "./scoring.js";

// Temporal
export type { TemporalTraversalOptions, TemporalTraversalResponse } from "./temporal.js";
export {
	filterEdgesByTime,
	isEdgeActiveAtTime,
	traverseAtTime,
	wasEdgeRecordedBy,
} from "./temporal.js";
// Traversal
export { getNeighbors, traverse, weightedTraverse } from "./traversal.js";
// Types
export type {
	GraphEdge,
	GraphNode,
	GraphPath,
	TraversalOptions,
	TraversalResponse,
	WeightedTraversalResponse,
} from "./types.js";
export { DEFAULT_TRAVERSAL_OPTIONS } from "./types.js";
