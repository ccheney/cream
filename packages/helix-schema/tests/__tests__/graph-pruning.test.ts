/**
 * Graph Pruning Tests
 *
 * Tests for edge pruning, isolated node detection, hub pruning, and subgraph merging.
 */

import { describe, expect, it } from "bun:test";
import {
  type EdgeInfo,
  evaluateSubgraphForMerge,
  findHubsTooPrune,
  findIsolatedNodes,
  type NodeConnectivity,
  pruneEdgesByWeight,
} from "../../src/retention/forgetting.js";

describe("pruneEdgesByWeight", () => {
  it("returns edges below weight threshold", () => {
    const edges: EdgeInfo[] = [
      { edgeId: "e1", sourceId: "n1", targetId: "n2", weight: 0.1 },
      { edgeId: "e2", sourceId: "n2", targetId: "n3", weight: 0.5 },
      { edgeId: "e3", sourceId: "n3", targetId: "n4", weight: 0.2 },
    ];

    const actions = pruneEdgesByWeight(edges);

    expect(actions.length).toBe(2);
    expect(actions[0].type).toBe("remove_edge");
    expect(actions.some((a) => a.type === "remove_edge" && a.edgeId === "e1")).toBe(true);
    expect(actions.some((a) => a.type === "remove_edge" && a.edgeId === "e3")).toBe(true);
  });

  it("returns empty for all edges above threshold", () => {
    const edges: EdgeInfo[] = [
      { edgeId: "e1", sourceId: "n1", targetId: "n2", weight: 0.5 },
      { edgeId: "e2", sourceId: "n2", targetId: "n3", weight: 0.8 },
    ];

    const actions = pruneEdgesByWeight(edges);

    expect(actions.length).toBe(0);
  });

  it("accepts custom threshold", () => {
    const edges: EdgeInfo[] = [{ edgeId: "e1", sourceId: "n1", targetId: "n2", weight: 0.4 }];

    expect(pruneEdgesByWeight(edges, 0.3).length).toBe(0);
    expect(pruneEdgesByWeight(edges, 0.5).length).toBe(1);
  });
});

describe("findIsolatedNodes", () => {
  it("finds nodes with no edges", () => {
    const nodes: NodeConnectivity[] = [
      { nodeId: "n1", edgeIds: ["e1", "e2"] },
      { nodeId: "n2", edgeIds: [] },
      { nodeId: "n3", edgeIds: ["e3"] },
      { nodeId: "n4", edgeIds: [] },
    ];

    const actions = findIsolatedNodes(nodes);

    expect(actions.length).toBe(2);
    expect(actions.every((a) => a.type === "remove_node")).toBe(true);
    expect(actions.some((a) => a.type === "remove_node" && a.nodeId === "n2")).toBe(true);
    expect(actions.some((a) => a.type === "remove_node" && a.nodeId === "n4")).toBe(true);
  });
});

describe("findHubsTooPrune", () => {
  it("finds hubs exceeding threshold", () => {
    const nodes: NodeConnectivity[] = [
      { nodeId: "n1", edgeIds: Array.from({ length: 50 }, (_, i) => `e${i}`) },
      { nodeId: "n2", edgeIds: Array.from({ length: 1500 }, (_, i) => `e${i}`) },
    ];

    const actions = findHubsTooPrune(nodes);

    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("prune_hub");
    if (actions[0].type === "prune_hub") {
      expect(actions[0].nodeId).toBe("n2");
      expect(actions[0].retainedEdges).toBe(100);
      expect(actions[0].prunedEdges).toBe(1400);
    }
  });
});

describe("evaluateSubgraphForMerge", () => {
  it("returns merge action for small subgraphs", () => {
    const nodeIds = ["n1", "n2", "n3"];

    const action = evaluateSubgraphForMerge(nodeIds);

    expect(action).not.toBeNull();
    expect(action?.type).toBe("merge_subgraph");
    if (action?.type === "merge_subgraph") {
      expect(action.nodeIds).toEqual(nodeIds);
    }
  });

  it("returns null for subgraphs at max size", () => {
    const nodeIds = ["n1", "n2", "n3", "n4", "n5"];

    const action = evaluateSubgraphForMerge(nodeIds);

    expect(action).toBeNull();
  });

  it("returns null for single node", () => {
    const action = evaluateSubgraphForMerge(["n1"]);

    expect(action).toBeNull();
  });
});
