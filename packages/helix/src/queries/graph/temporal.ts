/**
 * Temporal Traversal Functions
 *
 * Point-in-time graph traversal for historical queries.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { HelixClient } from "../../client.js";
import { weightedTraverse } from "./traversal.js";
import type { GraphEdge, TraversalOptions, WeightedTraversalResponse } from "./types.js";

/**
 * Options for point-in-time graph traversal.
 */
export interface TemporalTraversalOptions extends TraversalOptions {
  /**
   * Query timestamp - only include edges active at this point in time.
   * Edge is active when: valid_from <= asOfTimestamp AND (valid_to IS NULL OR valid_to > asOfTimestamp)
   */
  asOfTimestamp?: number;

  /**
   * Include only edges we knew about by this timestamp.
   * Enables "what did we know at time X?" reconstruction.
   */
  knownAsOfTimestamp?: number;

  /**
   * Include expired edges (where valid_to < asOfTimestamp).
   * Default: false (only include active edges).
   */
  includeExpired?: boolean;
}

/**
 * Response from point-in-time traversal.
 */
export interface TemporalTraversalResponse<T = Record<string, unknown>>
  extends WeightedTraversalResponse<T> {
  /** Point in time this query represents */
  asOfTimestamp?: number;
  /** Statistics about temporal filtering */
  temporalStats: {
    /** Total edges before temporal filtering */
    beforeFiltering: number;
    /** Edges remaining after temporal filtering */
    afterFiltering: number;
    /** Edges excluded due to not yet valid (valid_from > asOfTimestamp) */
    notYetValid: number;
    /** Edges excluded due to expired (valid_to <= asOfTimestamp) */
    expired: number;
    /** Edges excluded due to not yet recorded (recorded_at > knownAsOfTimestamp) */
    notYetRecorded: number;
  };
}

/**
 * Check if an edge is active at a given point in time.
 *
 * @param edge - Graph edge with properties
 * @param asOfTimestamp - Point in time to check
 * @returns true if edge is active at that time
 */
export function isEdgeActiveAtTime(edge: GraphEdge, asOfTimestamp: number): boolean {
  const props = edge.properties;

  const validFrom = props.valid_from;
  if (typeof validFrom === "number" && validFrom > asOfTimestamp) {
    return false;
  }

  const validTo = props.valid_to;
  if (validTo !== undefined && validTo !== null && typeof validTo === "number") {
    if (validTo <= asOfTimestamp) {
      return false;
    }
  }

  return true;
}

/**
 * Check if an edge was recorded by a given timestamp.
 *
 * @param edge - Graph edge with properties
 * @param knownAsOfTimestamp - Point in time to check
 * @returns true if edge was recorded by that time
 */
export function wasEdgeRecordedBy(edge: GraphEdge, knownAsOfTimestamp: number): boolean {
  const recordedAt = edge.properties.recorded_at;

  if (typeof recordedAt !== "number") {
    return true;
  }

  return recordedAt <= knownAsOfTimestamp;
}

/**
 * Filter edges based on temporal criteria.
 *
 * @param edges - Edges to filter
 * @param options - Temporal filtering options
 * @returns Filtered edges and statistics
 */
export function filterEdgesByTime(
  edges: GraphEdge[],
  options: Pick<TemporalTraversalOptions, "asOfTimestamp" | "knownAsOfTimestamp" | "includeExpired">
): { filtered: GraphEdge[]; stats: TemporalTraversalResponse["temporalStats"] } {
  const stats = {
    beforeFiltering: edges.length,
    afterFiltering: 0,
    notYetValid: 0,
    expired: 0,
    notYetRecorded: 0,
  };

  const filtered = edges.filter((edge) => {
    if (options.asOfTimestamp !== undefined) {
      const props = edge.properties;

      const validFrom = props.valid_from;
      if (typeof validFrom === "number" && validFrom > options.asOfTimestamp) {
        stats.notYetValid++;
        return false;
      }

      if (!options.includeExpired) {
        const validTo = props.valid_to;
        if (validTo !== undefined && validTo !== null && typeof validTo === "number") {
          if (validTo <= options.asOfTimestamp) {
            stats.expired++;
            return false;
          }
        }
      }
    }

    if (options.knownAsOfTimestamp !== undefined) {
      if (!wasEdgeRecordedBy(edge, options.knownAsOfTimestamp)) {
        stats.notYetRecorded++;
        return false;
      }
    }

    return true;
  });

  stats.afterFiltering = filtered.length;
  return { filtered, stats };
}

/**
 * Traverse the graph at a specific point in time.
 *
 * This function enables historical queries like:
 * - "What were AAPL's suppliers in Q3 2024?"
 * - "What did we know about this company at decision time?"
 * - "How have relationships changed over time?"
 *
 * Edges are filtered based on:
 * 1. valid_from <= asOfTimestamp (relationship had started)
 * 2. valid_to IS NULL OR valid_to > asOfTimestamp (relationship hadn't ended)
 * 3. recorded_at <= knownAsOfTimestamp (we knew about it)
 *
 * @param client - HelixDB client
 * @param startNodeId - Starting node ID
 * @param options - Temporal traversal options
 * @returns Filtered traversal results with temporal statistics
 *
 * @example
 * ```typescript
 * // What were AAPL's suppliers in Q3 2024?
 * const q3_2024 = Date.parse("2024-09-30");
 * const result = await traverseAtTime(client, "AAPL", {
 *   asOfTimestamp: q3_2024,
 *   edgeTypes: ["DEPENDS_ON"],
 *   direction: "outgoing",
 * });
 *
 * // What did we know at the time of the decision?
 * const decisionTime = Date.parse("2024-06-15T10:30:00Z");
 * const result = await traverseAtTime(client, decisionId, {
 *   asOfTimestamp: decisionTime,
 *   knownAsOfTimestamp: decisionTime,
 *   edgeTypes: ["INFLUENCED_DECISION"],
 * });
 * ```
 */
export async function traverseAtTime<T = Record<string, unknown>>(
  client: HelixClient,
  startNodeId: string,
  options: TemporalTraversalOptions = {}
): Promise<TemporalTraversalResponse<T>> {
  const startTime = performance.now();

  const weightedResult = await weightedTraverse<T>(client, startNodeId, options);

  if (options.asOfTimestamp === undefined && options.knownAsOfTimestamp === undefined) {
    return {
      ...weightedResult,
      asOfTimestamp: undefined,
      temporalStats: {
        beforeFiltering: weightedResult.filterStats.totalEdges,
        afterFiltering: weightedResult.filterStats.totalEdges,
        notYetValid: 0,
        expired: 0,
        notYetRecorded: 0,
      },
    };
  }

  const allEdges = new Map<string, (typeof weightedResult.paths)[0]["edges"][0]>();
  for (const path of weightedResult.paths) {
    for (const edge of path.edges) {
      allEdges.set(edge.id, edge);
    }
  }

  const { filtered: temporallyFiltered, stats: temporalStats } = filterEdgesByTime(
    Array.from(allEdges.values()),
    options
  );

  const validEdgeIds = new Set(temporallyFiltered.map((e) => e.id));

  const filteredPaths = weightedResult.paths.filter((path) =>
    path.edges.every((edge) => validEdgeIds.has(edge.id))
  );

  const filteredPrioritizedEdges = weightedResult.prioritizedEdges.filter((pe) =>
    validEdgeIds.has(pe.edge.id)
  );

  const validNodeIds = new Set<string>();
  for (const path of filteredPaths) {
    for (const node of path.nodes) {
      validNodeIds.add(node.id);
    }
  }
  const filteredNodes = weightedResult.nodes.filter((n) => validNodeIds.has(n.id));

  return {
    paths: filteredPaths,
    nodes: filteredNodes,
    executionTimeMs: performance.now() - startTime,
    prioritizedEdges: filteredPrioritizedEdges,
    filterStats: {
      totalEdges: weightedResult.filterStats.totalEdges,
      filteredEdges: temporallyFiltered.length,
      averagePriority:
        filteredPrioritizedEdges.length > 0
          ? filteredPrioritizedEdges.reduce((sum, e) => sum + e.priority, 0) /
            filteredPrioritizedEdges.length
          : 0,
    },
    asOfTimestamp: options.asOfTimestamp,
    temporalStats,
  };
}
