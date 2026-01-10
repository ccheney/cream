/**
 * HelixDB Retrieval Workflow Step (GraphRAG)
 *
 * Retrieves relevant context from HelixDB using GraphRAG (35-80% better than vector-only RAG)
 * with filters for same asset/underlying and same regime.
 *
 * GraphRAG combines:
 * - Vector similarity search (~2ms target)
 * - Graph traversal filtering (<1ms target)
 * - RRF fusion for optimal ranking
 *
 * @see docs/plans/01-architecture.md (HelixDB Memory Layer, Orient phase)
 * @see docs/plans/04-memory-helixdb.md (GraphRAG specification)
 */

import {
  createHelixClientFromEnv,
  type GraphNode,
  getNodesByType,
  type HelixClient,
  type VectorSearchResult,
  vectorSearch,
} from "@cream/helix";
import type { TradeDecision } from "@cream/helix-schema";
import {
  DEFAULT_RRF_K,
  fuseWithRRF,
  type RRFResult,
  type RetrievalResult as RRFRetrievalResult,
} from "@cream/helix-schema";

// ============================================
// Types
// ============================================

/**
 * Input for the retrieval workflow step.
 */
export interface RetrievalInput {
  /** Query embedding for similarity search */
  queryEmbedding: number[];
  /** Current instrument ID for asset filtering */
  instrumentId?: string;
  /** Current underlying symbol for asset filtering */
  underlyingSymbol?: string;
  /** Current market regime for filtering */
  regime?: string;
  /** Maximum results to return */
  topK?: number;
  /** Minimum similarity threshold */
  minSimilarity?: number;
}

/**
 * Summary of a retrieved trade decision.
 */
export interface DecisionSummary {
  /** Decision ID */
  decisionId: string;
  /** Instrument ID */
  instrumentId: string;
  /** Underlying symbol (if applicable) */
  underlyingSymbol?: string;
  /** Trade action taken */
  action: string;
  /** Rationale summary (truncated) */
  rationaleSummary: string;
  /** Market regime at time of decision */
  regime: string;
  /** Outcome if known */
  outcome?: string;
  /** Decision timestamp */
  createdAt: string;
  /** Relevance score (0-1 normalized RRF) */
  relevanceScore: number;
  /** Whether this was found via both vector and graph search */
  multiSourceMatch: boolean;
}

/**
 * Result of the retrieval operation.
 */
export interface RetrievalResult {
  success: boolean;
  /** Similar historical decisions with summaries */
  decisions: DecisionSummary[];
  /** Performance metrics */
  metrics: {
    vectorSearchMs: number;
    graphTraversalMs: number;
    fusionMs: number;
    totalMs: number;
  };
  /** Number of results from each source */
  sourceCounts: {
    vectorOnly: number;
    graphOnly: number;
    both: number;
  };
  /** Empty result reason if no matches */
  emptyReason?: string;
}

// ============================================
// Configuration
// ============================================

/**
 * Default retrieval configuration.
 */
export const DEFAULT_RETRIEVAL_CONFIG = {
  topK: 10,
  minSimilarity: 0.5,
  vectorTopK: 20, // Retrieve more for filtering
  graphLimit: 50, // Graph traversal limit
  maxRationaleSummaryLength: 200,
  rrfK: DEFAULT_RRF_K,
};

/**
 * Performance targets (milliseconds).
 */
export const PERFORMANCE_TARGETS = {
  vectorSearchMs: 2,
  graphTraversalMs: 1,
  totalMs: 10,
};

// ============================================
// Main Workflow Step
// ============================================

/**
 * Execute the HelixDB retrieval workflow step.
 *
 * Implements GraphRAG:
 * 1. Vector similarity search for semantically similar decisions
 * 2. Graph traversal to find decisions with same asset/regime
 * 3. RRF fusion to combine and rank results
 *
 * @param input - Retrieval input with query and filters
 * @param client - Optional HelixDB client
 * @returns Retrieval result with decision summaries
 */
export async function executeHelixRetrieval(
  input: RetrievalInput,
  client?: HelixClient
): Promise<RetrievalResult> {
  const startTime = performance.now();
  const helixClient = client ?? createHelixClientFromEnv();

  try {
    const topK = input.topK ?? DEFAULT_RETRIEVAL_CONFIG.topK;
    const minSimilarity = input.minSimilarity ?? DEFAULT_RETRIEVAL_CONFIG.minSimilarity;

    // Phase 1: Vector similarity search
    const vectorStart = performance.now();
    const vectorResults = await performVectorSearch(
      helixClient,
      input.queryEmbedding,
      DEFAULT_RETRIEVAL_CONFIG.vectorTopK,
      minSimilarity
    );
    const vectorSearchMs = performance.now() - vectorStart;

    // Phase 2: Graph traversal filtering
    const graphStart = performance.now();
    const graphResults = await performGraphTraversal(
      helixClient,
      input.instrumentId,
      input.underlyingSymbol,
      input.regime,
      DEFAULT_RETRIEVAL_CONFIG.graphLimit
    );
    const graphTraversalMs = performance.now() - graphStart;

    // Phase 3: RRF fusion
    const fusionStart = performance.now();
    const fusedResults = fuseResults(vectorResults, graphResults, topK);
    const fusionMs = performance.now() - fusionStart;

    // Calculate source counts
    const sourceCounts = calculateSourceCounts(fusedResults);

    // Convert to decision summaries
    const decisions = fusedResults.map((r) => createDecisionSummary(r.node as TradeDecision, r));

    const totalMs = performance.now() - startTime;

    // Check for empty results
    const emptyReason = getEmptyReason(decisions.length, vectorResults.length, graphResults.length);

    return {
      success: true,
      decisions,
      metrics: {
        vectorSearchMs,
        graphTraversalMs,
        fusionMs,
        totalMs,
      },
      sourceCounts,
      emptyReason,
    };
  } catch (error) {
    const totalMs = performance.now() - startTime;

    return {
      success: false,
      decisions: [],
      metrics: {
        vectorSearchMs: 0,
        graphTraversalMs: 0,
        fusionMs: 0,
        totalMs,
      },
      sourceCounts: { vectorOnly: 0, graphOnly: 0, both: 0 },
      emptyReason: `Retrieval error: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    if (!client) {
      helixClient.close();
    }
  }
}

// ============================================
// Vector Search
// ============================================

/**
 * Perform vector similarity search for trade decisions.
 */
async function performVectorSearch(
  client: HelixClient,
  embedding: number[],
  topK: number,
  minSimilarity: number
): Promise<RRFRetrievalResult<TradeDecision>[]> {
  const response = await vectorSearch<TradeDecision>(client, embedding, {
    topK,
    minSimilarity,
    nodeType: "TradeDecision",
  });

  return response.results.map((r: VectorSearchResult<TradeDecision>) => ({
    node: r.properties,
    nodeId: r.id,
    score: r.similarity,
  }));
}

// ============================================
// Graph Traversal
// ============================================

/**
 * Perform graph traversal to find related decisions.
 *
 * Uses multiple strategies:
 * 1. Same instrument ID
 * 2. Same underlying symbol
 * 3. Same regime
 */
async function performGraphTraversal(
  client: HelixClient,
  instrumentId?: string,
  underlyingSymbol?: string,
  regime?: string,
  limit = 50
): Promise<RRFRetrievalResult<TradeDecision>[]> {
  const results: Map<string, { node: TradeDecision; score: number }> = new Map();

  // Strategy 1: Same instrument
  if (instrumentId) {
    const instrumentResults = await findDecisionsByInstrument(client, instrumentId, limit);
    for (const decision of instrumentResults) {
      results.set(decision.decision_id, {
        node: decision,
        score: 1.0, // Exact match
      });
    }
  }

  // Strategy 2: Same underlying
  if (underlyingSymbol) {
    const underlyingResults = await findDecisionsByUnderlying(client, underlyingSymbol, limit);
    for (const decision of underlyingResults) {
      const existing = results.get(decision.decision_id);
      if (existing) {
        // Boost score for multiple matches
        existing.score = Math.min(existing.score + 0.5, 1.0);
      } else {
        results.set(decision.decision_id, {
          node: decision,
          score: 0.8, // Strong match
        });
      }
    }
  }

  // Strategy 3: Same regime
  if (regime) {
    const regimeResults = await findDecisionsByRegime(client, regime, limit);
    for (const decision of regimeResults) {
      const existing = results.get(decision.decision_id);
      if (existing) {
        existing.score = Math.min(existing.score + 0.3, 1.0);
      } else {
        results.set(decision.decision_id, {
          node: decision,
          score: 0.5, // Moderate match
        });
      }
    }
  }

  return Array.from(results.entries()).map(([id, { node, score }]) => ({
    node,
    nodeId: id,
    score,
  }));
}

/**
 * Find decisions for a specific instrument.
 */
async function findDecisionsByInstrument(
  client: HelixClient,
  instrumentId: string,
  limit: number
): Promise<TradeDecision[]> {
  try {
    const nodes = await getNodesByType<TradeDecision>(client, "TradeDecision", {
      limit,
      filters: { instrument_id: instrumentId },
    });
    return nodes.map((n: GraphNode<TradeDecision>) => n.properties);
  } catch {
    return [];
  }
}

/**
 * Find decisions for a specific underlying symbol.
 */
async function findDecisionsByUnderlying(
  client: HelixClient,
  underlyingSymbol: string,
  limit: number
): Promise<TradeDecision[]> {
  try {
    const nodes = await getNodesByType<TradeDecision>(client, "TradeDecision", {
      limit,
      filters: { underlying_symbol: underlyingSymbol },
    });
    return nodes.map((n: GraphNode<TradeDecision>) => n.properties);
  } catch {
    return [];
  }
}

/**
 * Find decisions in a specific regime.
 */
async function findDecisionsByRegime(
  client: HelixClient,
  regime: string,
  limit: number
): Promise<TradeDecision[]> {
  try {
    const nodes = await getNodesByType<TradeDecision>(client, "TradeDecision", {
      limit,
      filters: { regime_label: regime },
    });
    return nodes.map((n: GraphNode<TradeDecision>) => n.properties);
  } catch {
    return [];
  }
}

// ============================================
// RRF Fusion
// ============================================

/**
 * Fuse vector and graph results using RRF.
 */
function fuseResults(
  vectorResults: RRFRetrievalResult<TradeDecision>[],
  graphResults: RRFRetrievalResult<TradeDecision>[],
  topK: number
): RRFResult<TradeDecision>[] {
  return fuseWithRRF(vectorResults, graphResults, {
    k: DEFAULT_RETRIEVAL_CONFIG.rrfK,
    topK,
  });
}

// ============================================
// Result Processing
// ============================================

/**
 * Calculate how many results came from each source.
 */
function calculateSourceCounts(results: RRFResult<TradeDecision>[]): {
  vectorOnly: number;
  graphOnly: number;
  both: number;
} {
  let vectorOnly = 0;
  let graphOnly = 0;
  let both = 0;

  for (const result of results) {
    if (result.sources.includes("vector") && result.sources.includes("graph")) {
      both++;
    } else if (result.sources.includes("vector")) {
      vectorOnly++;
    } else {
      graphOnly++;
    }
  }

  return { vectorOnly, graphOnly, both };
}

/**
 * Create a summary of a trade decision.
 */
function createDecisionSummary(
  decision: TradeDecision,
  rrfResult: RRFResult<TradeDecision>
): DecisionSummary {
  // Truncate rationale to summary length
  const maxLen = DEFAULT_RETRIEVAL_CONFIG.maxRationaleSummaryLength;
  let rationaleSummary = decision.rationale_text ?? "";
  if (rationaleSummary.length > maxLen) {
    rationaleSummary = `${rationaleSummary.substring(0, maxLen - 3)}...`;
  }

  // Normalize RRF score to 0-1 (max is 2 * 1/(60+1) ≈ 0.0328)
  const maxScore = 2 * (1 / (DEFAULT_RETRIEVAL_CONFIG.rrfK + 1));
  const relevanceScore = Math.min(rrfResult.rrfScore / maxScore, 1);

  return {
    decisionId: decision.decision_id,
    instrumentId: decision.instrument_id,
    underlyingSymbol: decision.underlying_symbol,
    action: decision.action,
    rationaleSummary,
    regime: decision.regime_label,
    outcome: decision.realized_outcome,
    createdAt: decision.created_at,
    relevanceScore,
    multiSourceMatch: rrfResult.sources.includes("vector") && rrfResult.sources.includes("graph"),
  };
}

/**
 * Get reason for empty results.
 */
function getEmptyReason(
  totalResults: number,
  vectorCount: number,
  graphCount: number
): string | undefined {
  if (totalResults > 0) {
    return undefined;
  }

  if (vectorCount === 0 && graphCount === 0) {
    return "No historical trade decisions found in memory";
  }

  if (vectorCount === 0) {
    return "No semantically similar decisions found";
  }

  if (graphCount === 0) {
    return "No decisions found for this asset/regime combination";
  }

  return "No results passed similarity threshold";
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Retrieve similar decisions for a specific symbol.
 *
 * Convenience wrapper for symbol-based retrieval.
 */
export async function retrieveSimilarDecisions(
  queryEmbedding: number[],
  symbol: string,
  regime?: string,
  topK = 5,
  client?: HelixClient
): Promise<RetrievalResult> {
  return executeHelixRetrieval(
    {
      queryEmbedding,
      instrumentId: symbol,
      underlyingSymbol: symbol,
      regime,
      topK,
    },
    client
  );
}

/**
 * Retrieve decisions in the same regime.
 *
 * Useful for regime-based analysis.
 */
export async function retrieveRegimeDecisions(
  queryEmbedding: number[],
  regime: string,
  topK = 10,
  client?: HelixClient
): Promise<RetrievalResult> {
  return executeHelixRetrieval(
    {
      queryEmbedding,
      regime,
      topK,
    },
    client
  );
}

/**
 * Vector-only retrieval (for comparison/fallback).
 */
export async function retrieveVectorOnly(
  queryEmbedding: number[],
  topK = 10,
  minSimilarity = 0.5,
  client?: HelixClient
): Promise<RetrievalResult> {
  return executeHelixRetrieval(
    {
      queryEmbedding,
      topK,
      minSimilarity,
    },
    client
  );
}
