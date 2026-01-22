/**
 * Graph Traversal Scoring Tests
 *
 * Tests for edge weight prioritization in GraphRAG traversal.
 *
 * @see docs/plans/04-memory-helixdb.md:317-330
 */

import { describe, expect, it } from "bun:test";
import {
	calculateEdgePriority,
	calculateHubPenalty,
	calculateRecencyBoost,
	EDGE_TYPE_THRESHOLDS,
	filterAndPrioritizeEdges,
	type GraphEdge,
	getEdgeWeight,
	MENTION_TYPE_WEIGHTS,
	shouldFollowEdge,
	sortEdgesByPriority,
	type TraversalOptions,
} from "../../src/queries/graph.js";

// ============================================
// Test Helpers
// ============================================

function createEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
	return {
		id: "edge-1",
		type: "INFLUENCED_DECISION",
		sourceId: "source-1",
		targetId: "target-1",
		properties: {},
		...overrides,
	};
}

function createOptions(overrides: Partial<TraversalOptions> = {}): Required<TraversalOptions> {
	return {
		maxDepth: 2,
		limit: 100,
		edgeTypes: [],
		direction: "outgoing",
		timeoutMs: 1000,
		edgeWeightThreshold: 0.3,
		edgeTypeWeights: {},
		recencyBoostDays: 30,
		recencyBoostMultiplier: 1.5,
		hubPenaltyThreshold: 500,
		hubPenaltyMultiplier: 0.5,
		maxNeighborsPerNode: 50,
		...overrides,
	};
}

// ============================================
// getEdgeWeight Tests
// ============================================

describe("getEdgeWeight", () => {
	it("extracts confidence_score from INFLUENCED_DECISION", () => {
		const edge = createEdge({
			type: "INFLUENCED_DECISION",
			properties: { confidence_score: 0.85 },
		});
		expect(getEdgeWeight(edge)).toBe(0.85);
	});

	it("extracts influence_score as fallback for INFLUENCED_DECISION", () => {
		const edge = createEdge({
			type: "INFLUENCED_DECISION",
			properties: { influence_score: 0.7 },
		});
		expect(getEdgeWeight(edge)).toBe(0.7);
	});

	it("extracts strength from DEPENDS_ON", () => {
		const edge = createEdge({
			type: "DEPENDS_ON",
			properties: { strength: 0.9 },
		});
		expect(getEdgeWeight(edge)).toBe(0.9);
	});

	it("extracts sensitivity from AFFECTED_BY", () => {
		const edge = createEdge({
			type: "AFFECTED_BY",
			properties: { sensitivity: 0.6 },
		});
		expect(getEdgeWeight(edge)).toBe(0.6);
	});

	it("returns PRIMARY weight for MENTIONED_IN with PRIMARY type", () => {
		const edge = createEdge({
			type: "MENTIONED_IN",
			properties: { mention_type: "PRIMARY" },
		});
		expect(getEdgeWeight(edge)).toBe(MENTION_TYPE_WEIGHTS.PRIMARY);
	});

	it("returns SECONDARY weight for MENTIONED_IN with SECONDARY type", () => {
		const edge = createEdge({
			type: "MENTIONED_IN",
			properties: { mention_type: "SECONDARY" },
		});
		expect(getEdgeWeight(edge)).toBe(MENTION_TYPE_WEIGHTS.SECONDARY);
	});

	it("returns PEER_COMPARISON weight for MENTIONED_IN", () => {
		const edge = createEdge({
			type: "MENTIONED_IN",
			properties: { mention_type: "PEER_COMPARISON" },
		});
		expect(getEdgeWeight(edge)).toBe(MENTION_TYPE_WEIGHTS.PEER_COMPARISON);
	});

	it("returns 0.5 default for MENTIONED_IN without mention_type", () => {
		const edge = createEdge({
			type: "MENTIONED_IN",
			properties: {},
		});
		expect(getEdgeWeight(edge)).toBe(0.5);
	});

	it("extracts generic weight property for unknown edge types", () => {
		const edge = createEdge({
			type: "CUSTOM_EDGE",
			properties: { weight: 0.75 },
		});
		expect(getEdgeWeight(edge)).toBe(0.75);
	});

	it("returns undefined for edges without weight attributes", () => {
		const edge = createEdge({
			type: "CUSTOM_EDGE",
			properties: {},
		});
		expect(getEdgeWeight(edge)).toBeUndefined();
	});
});

// ============================================
// shouldFollowEdge Tests
// ============================================

describe("shouldFollowEdge", () => {
	it("follows INFLUENCED_DECISION with confidence >= 0.6", () => {
		const edge = createEdge({
			type: "INFLUENCED_DECISION",
			properties: { confidence_score: 0.7 },
		});
		expect(shouldFollowEdge(edge, createOptions())).toBe(true);
	});

	it("skips INFLUENCED_DECISION with confidence < 0.6", () => {
		const edge = createEdge({
			type: "INFLUENCED_DECISION",
			properties: { confidence_score: 0.5 },
		});
		expect(shouldFollowEdge(edge, createOptions())).toBe(false);
	});

	it("uses default threshold for unknown edge types", () => {
		const edge = createEdge({
			type: "CUSTOM_EDGE",
			properties: { weight: 0.4 },
		});
		const opts = createOptions({ edgeWeightThreshold: 0.3 });
		expect(shouldFollowEdge(edge, opts)).toBe(true);
	});

	it("respects custom edge type weights", () => {
		const edge = createEdge({
			type: "INFLUENCED_DECISION",
			properties: { confidence_score: 0.5 },
		});
		const opts = createOptions({
			edgeTypeWeights: { INFLUENCED_DECISION: 0.4 },
		});
		expect(shouldFollowEdge(edge, opts)).toBe(true);
	});

	it("allows edges without weight attributes", () => {
		const edge = createEdge({
			type: "CUSTOM_EDGE",
			properties: {},
		});
		expect(shouldFollowEdge(edge, createOptions())).toBe(true);
	});
});

// ============================================
// calculateRecencyBoost Tests
// ============================================

describe("calculateRecencyBoost", () => {
	it("applies boost to edges created within recencyBoostDays", () => {
		const recentDate = new Date();
		recentDate.setDate(recentDate.getDate() - 10); // 10 days ago

		const edge = createEdge({
			properties: { created_at: recentDate.toISOString() },
		});
		const opts = createOptions({ recencyBoostDays: 30, recencyBoostMultiplier: 1.5 });

		expect(calculateRecencyBoost(edge, opts)).toBe(1.5);
	});

	it("returns 1.0 for edges older than recencyBoostDays", () => {
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

		const edge = createEdge({
			properties: { created_at: oldDate.toISOString() },
		});
		const opts = createOptions({ recencyBoostDays: 30, recencyBoostMultiplier: 1.5 });

		expect(calculateRecencyBoost(edge, opts)).toBe(1.0);
	});

	it("returns 1.0 for edges without timestamp", () => {
		const edge = createEdge({ properties: {} });
		expect(calculateRecencyBoost(edge, createOptions())).toBe(1.0);
	});

	it("extracts timestamp from various fields", () => {
		const recentDate = new Date();
		recentDate.setDate(recentDate.getDate() - 5);

		// Test timestamp field
		const edge1 = createEdge({
			properties: { timestamp: recentDate.toISOString() },
		});
		expect(calculateRecencyBoost(edge1, createOptions())).toBe(1.5);

		// Test computed_at field
		const edge2 = createEdge({
			properties: { computed_at: recentDate.toISOString() },
		});
		expect(calculateRecencyBoost(edge2, createOptions())).toBe(1.5);
	});
});

// ============================================
// calculateHubPenalty Tests
// ============================================

describe("calculateHubPenalty", () => {
	it("returns 1.0 for nodes under hub threshold", () => {
		const opts = createOptions({ hubPenaltyThreshold: 500, hubPenaltyMultiplier: 0.5 });
		expect(calculateHubPenalty(100, opts)).toBe(1.0);
	});

	it("applies penalty for nodes over hub threshold", () => {
		const opts = createOptions({ hubPenaltyThreshold: 500, hubPenaltyMultiplier: 0.5 });
		expect(calculateHubPenalty(600, opts)).toBe(0.5);
	});

	it("returns 1.0 at exactly the threshold", () => {
		const opts = createOptions({ hubPenaltyThreshold: 500, hubPenaltyMultiplier: 0.5 });
		expect(calculateHubPenalty(500, opts)).toBe(1.0);
	});
});

// ============================================
// calculateEdgePriority Tests
// ============================================

describe("calculateEdgePriority", () => {
	it("calculates priority from weight only for normal edges", () => {
		const edge = createEdge({
			type: "CUSTOM_EDGE",
			properties: { weight: 0.8 },
		});
		const opts = createOptions();

		// 0.8 base weight * 1.0 recency * 1.0 hub = 0.8
		expect(calculateEdgePriority(edge, 100, opts)).toBe(0.8);
	});

	it("applies recency boost to recent edges", () => {
		const recentDate = new Date();
		recentDate.setDate(recentDate.getDate() - 5);

		const edge = createEdge({
			type: "CUSTOM_EDGE",
			properties: { weight: 0.8, created_at: recentDate.toISOString() },
		});
		const opts = createOptions({ recencyBoostMultiplier: 1.5 });

		// 0.8 base * 1.5 recency * 1.0 hub = 1.2
		expect(calculateEdgePriority(edge, 100, opts)).toBeCloseTo(1.2);
	});

	it("applies hub penalty for high-degree nodes", () => {
		const edge = createEdge({
			type: "CUSTOM_EDGE",
			properties: { weight: 0.8 },
		});
		const opts = createOptions({ hubPenaltyThreshold: 500, hubPenaltyMultiplier: 0.5 });

		// 0.8 base * 1.0 recency * 0.5 hub = 0.4
		expect(calculateEdgePriority(edge, 600, opts)).toBe(0.4);
	});

	it("combines all modifiers", () => {
		const recentDate = new Date();
		recentDate.setDate(recentDate.getDate() - 5);

		const edge = createEdge({
			type: "CUSTOM_EDGE",
			properties: { weight: 0.8, created_at: recentDate.toISOString() },
		});
		const opts = createOptions({
			recencyBoostMultiplier: 1.5,
			hubPenaltyThreshold: 500,
			hubPenaltyMultiplier: 0.5,
		});

		// 0.8 base * 1.5 recency * 0.5 hub = 0.6
		expect(calculateEdgePriority(edge, 600, opts)).toBeCloseTo(0.6);
	});

	it("defaults to 0.5 weight for edges without weight attribute", () => {
		const edge = createEdge({ type: "UNKNOWN_EDGE", properties: {} });
		const opts = createOptions();

		expect(calculateEdgePriority(edge, 100, opts)).toBe(0.5);
	});
});

// ============================================
// sortEdgesByPriority Tests
// ============================================

describe("sortEdgesByPriority", () => {
	it("sorts edges by priority descending", () => {
		const edges = [
			{
				edge: createEdge({ id: "low", type: "CUSTOM_EDGE", properties: { weight: 0.3 } }),
				targetNodeEdgeCount: 0,
			},
			{
				edge: createEdge({ id: "high", type: "CUSTOM_EDGE", properties: { weight: 0.9 } }),
				targetNodeEdgeCount: 0,
			},
			{
				edge: createEdge({ id: "mid", type: "CUSTOM_EDGE", properties: { weight: 0.6 } }),
				targetNodeEdgeCount: 0,
			},
		];

		const sorted = sortEdgesByPriority(edges, createOptions());

		expect(sorted[0]?.edge.id).toBe("high");
		expect(sorted[1]?.edge.id).toBe("mid");
		expect(sorted[2]?.edge.id).toBe("low");
	});

	it("includes priority score in output", () => {
		const edges = [
			{
				edge: createEdge({ type: "CUSTOM_EDGE", properties: { weight: 0.7 } }),
				targetNodeEdgeCount: 0,
			},
		];

		const sorted = sortEdgesByPriority(edges, createOptions());

		expect(sorted[0]?.priority).toBe(0.7);
	});
});

// ============================================
// filterAndPrioritizeEdges Tests
// ============================================

describe("filterAndPrioritizeEdges", () => {
	it("filters out low-weight edges", () => {
		const edges = [
			createEdge({
				id: "pass",
				type: "INFLUENCED_DECISION",
				properties: { confidence_score: 0.8 },
			}),
			createEdge({
				id: "fail",
				type: "INFLUENCED_DECISION",
				properties: { confidence_score: 0.4 },
			}),
		];

		const filtered = filterAndPrioritizeEdges(edges, new Map(), createOptions());

		expect(filtered.length).toBe(1);
		expect(filtered[0]?.id).toBe("pass");
	});

	it("limits results to maxNeighborsPerNode", () => {
		const edges = Array.from({ length: 100 }, (_, i) =>
			createEdge({
				id: `edge-${i}`,
				type: "CUSTOM_EDGE",
				properties: { weight: 0.5 + i * 0.001 },
			}),
		);

		const opts = createOptions({ maxNeighborsPerNode: 10 });
		const filtered = filterAndPrioritizeEdges(edges, new Map(), opts);

		expect(filtered.length).toBe(10);
	});

	it("returns highest priority edges first", () => {
		const edges = [
			createEdge({ id: "low", type: "CUSTOM_EDGE", properties: { weight: 0.4 } }),
			createEdge({ id: "high", type: "CUSTOM_EDGE", properties: { weight: 0.9 } }),
		];

		const filtered = filterAndPrioritizeEdges(edges, new Map(), createOptions());

		expect(filtered[0]?.id).toBe("high");
	});

	it("considers hub penalty in prioritization", () => {
		const edges = [
			createEdge({
				id: "hub-target",
				type: "CUSTOM_EDGE",
				targetId: "hub",
				properties: { weight: 0.9 },
			}),
			createEdge({
				id: "normal-target",
				type: "CUSTOM_EDGE",
				targetId: "normal",
				properties: { weight: 0.7 },
			}),
		];

		const edgeCounts = new Map([
			["hub", 1000], // hub node
			["normal", 10], // normal node
		]);

		const opts = createOptions({ hubPenaltyThreshold: 500, hubPenaltyMultiplier: 0.5 });
		const filtered = filterAndPrioritizeEdges(edges, edgeCounts, opts);

		// hub-target: 0.9 * 0.5 = 0.45
		// normal-target: 0.7 * 1.0 = 0.7
		expect(filtered[0]?.id).toBe("normal-target");
	});
});

// ============================================
// Constants Tests
// ============================================

describe("EDGE_TYPE_THRESHOLDS", () => {
	it("has correct threshold for INFLUENCED_DECISION", () => {
		expect(EDGE_TYPE_THRESHOLDS.INFLUENCED_DECISION).toBe(0.6);
	});

	it("has correct thresholds for all documented edge types", () => {
		expect(EDGE_TYPE_THRESHOLDS.DEPENDS_ON).toBe(0.3);
		expect(EDGE_TYPE_THRESHOLDS.AFFECTED_BY).toBe(0.3);
		expect(EDGE_TYPE_THRESHOLDS.MENTIONED_IN).toBe(0.5);
	});
});

describe("MENTION_TYPE_WEIGHTS", () => {
	it("has correct weights as per plan spec", () => {
		expect(MENTION_TYPE_WEIGHTS.PRIMARY).toBe(1.0);
		expect(MENTION_TYPE_WEIGHTS.SECONDARY).toBe(0.7);
		expect(MENTION_TYPE_WEIGHTS.PEER_COMPARISON).toBe(0.5);
	});
});
