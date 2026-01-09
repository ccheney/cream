/**
 * Case-Based Reasoning (CBR) Retrieval
 *
 * Implements the CBR cycle for trade memory retrieval:
 * - Retrieve: Find similar historical cases from HelixDB
 * - Reuse: Apply past decisions to current context
 * - Revise: Adjust based on differences
 * - Retain: Store new cases for future reference
 *
 * This module bridges the HelixDB trade memory retrieval with the
 * domain-level RetrievedCase and MemoryContext types.
 *
 * @see docs/plans/03-market-snapshot.md - memoryContext
 * @see docs/plans/04-memory-helixdb.md - Trade Memory Retrieval
 */

import type {
  CaseResult,
  CaseStatistics,
  KeyOutcomes,
  MemoryContext,
  RetrievedCase,
} from "@cream/domain";
import { calculateCaseStatistics } from "@cream/domain";
import type { EmbeddingClient } from "./embeddings";
import type { TradeDecision } from "./index";

// ============================================
// Local Type Definitions (to avoid cyclic dependency with @cream/helix)
// ============================================

/**
 * Query result from HelixDB.
 * This is a local copy to avoid cyclic dependency.
 */
interface QueryResult<T = unknown> {
  data: T;
  executionTimeMs: number;
}

/**
 * Minimal HelixDB client interface for CBR operations.
 * This is a local copy to avoid cyclic dependency.
 */
interface HelixClient {
  query<T = unknown>(queryName: string, params?: Record<string, unknown>): Promise<QueryResult<T>>;
}

// ============================================
// Types
// ============================================

/**
 * Market snapshot for CBR retrieval.
 * Contains the context needed to find similar historical cases.
 */
export interface CBRMarketSnapshot {
  /** Instrument being traded (e.g., "AAPL", "AAPL240119C150") */
  instrumentId: string;
  /** Underlying symbol for options (e.g., "AAPL") */
  underlyingSymbol?: string;
  /** Current market regime classification */
  regimeLabel: string;
  /** Sector classification (e.g., "Technology") */
  sector?: string;
  /** Key technical indicators */
  indicators?: {
    rsi?: number;
    atr?: number;
    volatility?: number;
    sma20?: number;
    sma50?: number;
    volumeRatio?: number;
  };
  /** Current price */
  currentPrice?: number;
  /** Position context description */
  positionContext?: string;
}

/**
 * CBR retrieval options.
 */
export interface CBRRetrievalOptions {
  /** Maximum number of cases to retrieve (default: 10) */
  topK?: number;
  /** Minimum similarity score (default: 0.5) */
  minSimilarity?: number;
  /** Whether to include influencing events (default: false) */
  includeEvents?: boolean;
  /** Filter by specific regime (uses snapshot regime if not set) */
  filterRegime?: string;
  /** Filter by sector */
  filterSector?: string;
  /** Maximum age of cases in days (default: unlimited) */
  maxAgeDays?: number;
  /** Environment filter (default: current environment) */
  environment?: "BACKTEST" | "PAPER" | "LIVE";
}

/**
 * Result of CBR retrieval.
 */
export interface CBRRetrievalResult {
  /** Retrieved cases in domain format */
  cases: RetrievedCase[];
  /** Aggregate statistics */
  statistics: CaseStatistics;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Query embedding used */
  queryEmbedding?: number[];
  /** Whether corrective retrieval was applied */
  correctionApplied?: boolean;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CBR_OPTIONS: Required<CBRRetrievalOptions> = {
  topK: 10,
  minSimilarity: 0.5,
  includeEvents: false,
  filterRegime: "",
  filterSector: "",
  maxAgeDays: 365, // 1 year by default
  environment: "PAPER",
};

// ============================================
// Situation Brief Generation
// ============================================

/**
 * Generate a situation brief from a market snapshot.
 * This text is embedded for similarity search.
 */
export function generateCBRSituationBrief(snapshot: CBRMarketSnapshot): string {
  const parts: string[] = [];

  // Core context
  parts.push(`Trading ${snapshot.instrumentId}`);
  if (snapshot.underlyingSymbol) {
    parts.push(`(underlying: ${snapshot.underlyingSymbol})`);
  }
  parts.push(`in ${snapshot.regimeLabel} market regime.`);

  // Sector context
  if (snapshot.sector) {
    parts.push(`Sector: ${snapshot.sector}.`);
  }

  // Technical indicators
  if (snapshot.indicators) {
    const indicators: string[] = [];
    if (snapshot.indicators.rsi !== undefined) {
      indicators.push(`RSI: ${snapshot.indicators.rsi.toFixed(1)}`);
    }
    if (snapshot.indicators.volatility !== undefined) {
      indicators.push(`Volatility: ${(snapshot.indicators.volatility * 100).toFixed(1)}%`);
    }
    if (snapshot.indicators.atr !== undefined) {
      indicators.push(`ATR: ${snapshot.indicators.atr.toFixed(2)}`);
    }
    if (snapshot.indicators.volumeRatio !== undefined) {
      indicators.push(`Volume ratio: ${snapshot.indicators.volumeRatio.toFixed(1)}x`);
    }
    if (indicators.length > 0) {
      parts.push(`Indicators: ${indicators.join(", ")}.`);
    }
  }

  // Price context
  if (snapshot.currentPrice !== undefined) {
    parts.push(`Current price: $${snapshot.currentPrice.toFixed(2)}.`);
  }

  // Position context
  if (snapshot.positionContext) {
    parts.push(`Position: ${snapshot.positionContext}.`);
  }

  return parts.join(" ");
}

// ============================================
// Type Conversion
// ============================================

/**
 * Convert a TradeDecision from HelixDB to a RetrievedCase for domain use.
 */
export function convertToRetrievedCase(
  decision: TradeDecision,
  similarityScore?: number
): RetrievedCase {
  // Parse realized outcome if available
  let keyOutcomes: KeyOutcomes = {
    result: "breakeven" as CaseResult,
    return: 0,
    durationHours: 0,
  };

  if (decision.realized_outcome) {
    try {
      const outcome = JSON.parse(decision.realized_outcome) as {
        pnl?: number;
        return_pct?: number;
        holding_hours?: number;
        entry_price?: number;
        exit_price?: number;
        mae?: number;
        mfe?: number;
      };

      // Determine result from P&L
      let result: CaseResult = "breakeven";
      if (typeof outcome.pnl === "number") {
        if (outcome.pnl > 0) {
          result = "win";
        } else if (outcome.pnl < 0) {
          result = "loss";
        }
      }

      keyOutcomes = {
        result,
        return: outcome.return_pct ?? 0,
        durationHours: outcome.holding_hours ?? 0,
        entryPrice: outcome.entry_price,
        exitPrice: outcome.exit_price,
        mae: outcome.mae,
        mfe: outcome.mfe,
      };
    } catch {
      // Keep default outcomes if parsing fails
    }
  }

  // Generate short summary from rationale
  const shortSummary = generateShortSummary(decision);

  return {
    caseId: decision.decision_id,
    shortSummary,
    keyOutcomes,
    asOfTimestamp: decision.created_at,
    ticker: decision.instrument_id,
    regime: decision.regime_label,
    similarityScore,
  };
}

/**
 * Generate a short summary from a trade decision.
 */
function generateShortSummary(decision: TradeDecision): string {
  const action = decision.action;
  const instrument = decision.instrument_id;
  const regime = decision.regime_label;

  // Extract first sentence or first 100 chars of rationale
  let rationalePreview = decision.rationale_text.split(".")[0] ?? decision.rationale_text;
  if (rationalePreview.length > 100) {
    rationalePreview = `${rationalePreview.slice(0, 97)}...`;
  }

  return `${action} ${instrument} (${regime}): ${rationalePreview}`;
}

// ============================================
// CBR Retrieval
// ============================================

/**
 * Retrieve similar cases using Case-Based Reasoning.
 *
 * This is the main entry point for CBR retrieval. It:
 * 1. Generates a situation brief from the snapshot
 * 2. Creates an embedding using Gemini
 * 3. Performs vector similarity search in HelixDB
 * 4. Converts results to domain RetrievedCase format
 * 5. Calculates aggregate statistics
 *
 * @param client - HelixDB client
 * @param embeddingClient - Embedding client for generating embeddings
 * @param snapshot - Current market context
 * @param options - Retrieval options
 * @returns CBR retrieval result with cases and statistics
 *
 * @example
 * ```typescript
 * const client = createHelixClient();
 * const embedder = createEmbeddingClient();
 *
 * const result = await retrieveSimilarCases(client, embedder, {
 *   instrumentId: "AAPL",
 *   regimeLabel: "BULL_TREND",
 *   indicators: { rsi: 65, volatility: 0.25 },
 * });
 *
 * console.log(`Found ${result.cases.length} similar cases`);
 * console.log(`Win rate: ${result.statistics.winRate}`);
 * ```
 */
export async function retrieveSimilarCases(
  client: HelixClient,
  embeddingClient: EmbeddingClient,
  snapshot: CBRMarketSnapshot,
  options: CBRRetrievalOptions = {}
): Promise<CBRRetrievalResult> {
  const opts = { ...DEFAULT_CBR_OPTIONS, ...options };
  const startTime = performance.now();

  // 1. Generate situation brief
  const situationBrief = generateCBRSituationBrief(snapshot);

  // 2. Generate embedding
  const embeddingResult = await embeddingClient.generateEmbedding(situationBrief);
  const queryEmbedding = embeddingResult.values;

  // 3. Build filter conditions
  const filters: Record<string, unknown> = {};

  // Regime filter
  if (opts.filterRegime) {
    filters.regime_label = opts.filterRegime;
  } else {
    filters.regime_label = snapshot.regimeLabel;
  }

  // Environment filter
  filters.environment = opts.environment;

  // Instrument filter (prefer underlying for options)
  if (snapshot.underlyingSymbol) {
    filters.underlying_symbol = snapshot.underlyingSymbol;
  }

  // 4. Execute vector search via HelixDB
  // Note: HelixDB generates embeddings internally, so we pass the situation brief text
  const vectorResults = await executeVectorSearch(
    client,
    situationBrief,
    opts.topK,
    opts.minSimilarity,
    filters
  );

  // 5. Convert to domain types
  const cases = vectorResults.map((result) =>
    convertToRetrievedCase(result.decision, result.similarity)
  );

  // 6. Apply additional filters
  let filteredCases = cases;

  // Age filter
  if (opts.maxAgeDays > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - opts.maxAgeDays);
    filteredCases = filteredCases.filter((c) => new Date(c.asOfTimestamp) >= cutoffDate);
  }

  // Sector filter (if provided and cases have sector info)
  if (opts.filterSector) {
    // Note: sector filtering would require additional graph traversal
    // to Company nodes - simplified here
  }

  // 7. Calculate statistics
  const statistics = calculateCaseStatistics(filteredCases);

  const executionTimeMs = performance.now() - startTime;

  return {
    cases: filteredCases,
    statistics,
    executionTimeMs,
    queryEmbedding,
    correctionApplied: false,
  };
}

/**
 * Raw result from SearchSimilarDecisions query.
 */
interface SearchSimilarDecisionsResult {
  decision_id: string;
  instrument_id: string;
  regime_label: string;
  action: string;
  rationale_text: string;
  environment: string;
  similarity_score: number;
  // Additional fields that might be included
  underlying_symbol?: string;
  decision_json?: string;
  realized_outcome?: string;
  created_at?: string;
  cycle_id?: string;
  snapshot_reference?: string;
  closed_at?: string;
}

/**
 * Execute vector search against HelixDB using SearchSimilarDecisions query.
 *
 * Note: HelixDB generates embeddings internally using the query text,
 * so we use the situation brief text for similarity search rather than
 * pre-computed embeddings.
 *
 * @param client - HelixDB client
 * @param queryText - Text to search for (situation brief)
 * @param topK - Maximum results to return
 * @param minSimilarity - Minimum similarity threshold
 * @param filters - Optional filters (regime_label, instrument_id, environment)
 * @returns Array of decisions with similarity scores
 */
async function executeVectorSearch(
  client: HelixClient,
  queryText: string,
  topK: number,
  minSimilarity: number,
  filters: Record<string, unknown>
): Promise<Array<{ decision: TradeDecision; similarity: number }>> {
  try {
    // Call SearchSimilarDecisions query
    // Note: HelixDB generates embeddings internally from query_text
    const result = await client.query<SearchSimilarDecisionsResult[]>("SearchSimilarDecisions", {
      query_text: queryText,
      instrument_id: filters.underlying_symbol ?? filters.instrument_id ?? null,
      regime_label: filters.regime_label ?? null,
      limit: topK,
    });

    // Filter by minimum similarity and convert to TradeDecision format
    return result.data
      .filter((r) => r.similarity_score >= minSimilarity)
      .map((r) => ({
        decision: {
          decision_id: r.decision_id,
          cycle_id: r.cycle_id ?? "",
          instrument_id: r.instrument_id,
          underlying_symbol: r.underlying_symbol,
          regime_label: r.regime_label,
          action: r.action as TradeDecision["action"],
          decision_json: r.decision_json ?? "{}",
          rationale_text: r.rationale_text,
          snapshot_reference: r.snapshot_reference ?? "",
          realized_outcome: r.realized_outcome,
          created_at: r.created_at ?? new Date().toISOString(),
          closed_at: r.closed_at,
          environment: r.environment as TradeDecision["environment"],
        },
        similarity: r.similarity_score,
      }));
  } catch (_error) {
    return [];
  }
}

// Note: executeVectorSearchWithEmbedding was removed as it was deprecated.
// HelixDB generates embeddings internally via SearchSimilarDecisions query.
// If you need to use pre-computed embeddings, implement a separate query.

// ============================================
// Memory Context Builder
// ============================================

/**
 * Build a MemoryContext from CBR retrieval result.
 *
 * This creates the complete memory context structure that agents
 * use for decision-making.
 *
 * @param retrievalResult - Result from retrieveSimilarCases
 * @returns MemoryContext for agent consumption
 */
export function buildMemoryContext(retrievalResult: CBRRetrievalResult): MemoryContext {
  return {
    retrievedCases: retrievalResult.cases,
    caseStatistics: retrievalResult.statistics,
  };
}

/**
 * Retrieve similar cases and build memory context in one call.
 *
 * Convenience function that combines retrieval and context building.
 *
 * @param client - HelixDB client
 * @param embeddingClient - Embedding client
 * @param snapshot - Current market context
 * @param options - Retrieval options
 * @returns MemoryContext ready for agent use
 */
export async function retrieveMemoryContext(
  client: HelixClient,
  embeddingClient: EmbeddingClient,
  snapshot: CBRMarketSnapshot,
  options: CBRRetrievalOptions = {}
): Promise<MemoryContext> {
  const result = await retrieveSimilarCases(client, embeddingClient, snapshot, options);
  return buildMemoryContext(result);
}

// ============================================
// Case Retention (Store New Cases)
// ============================================

/**
 * Result of retaining a case.
 */
export interface CaseRetentionResult {
  /** Whether the case was successfully stored */
  success: boolean;
  /** Decision ID of the stored case */
  decisionId: string;
  /** Error message if storage failed */
  error?: string;
}

/**
 * Store a new trade decision as a case for future retrieval.
 *
 * This implements the "Retain" step of the CBR cycle.
 * After a trade is closed, the decision and outcome should be
 * stored so similar situations can benefit from this experience.
 *
 * Note: HelixDB generates embeddings internally via InsertTradeDecision query.
 *
 * @param client - HelixDB client
 * @param decision - The trade decision to store
 * @returns Result indicating success or failure
 */
export async function retainCase(
  client: HelixClient,
  decision: TradeDecision
): Promise<CaseRetentionResult> {
  try {
    // Call InsertTradeDecision query
    // HelixDB generates embeddings internally via Embed(rationale_text, "gemini:gemini-embedding-001")
    await client.query("InsertTradeDecision", {
      decision_id: decision.decision_id,
      cycle_id: decision.cycle_id,
      instrument_id: decision.instrument_id,
      underlying_symbol: decision.underlying_symbol ?? null,
      regime_label: decision.regime_label,
      action: decision.action,
      decision_json: decision.decision_json,
      rationale_text: decision.rationale_text,
      snapshot_reference: decision.snapshot_reference,
      created_at: decision.created_at,
      environment: decision.environment,
    });

    return {
      success: true,
      decisionId: decision.decision_id,
    };
  } catch (error) {
    return {
      success: false,
      decisionId: decision.decision_id,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update a retained case with outcome data.
 *
 * Called after a trade is closed to update the case with realized P&L
 * and other outcome metrics. This enables the CBR system to learn from
 * the success or failure of past decisions.
 *
 * @param client - HelixDB client
 * @param decisionId - ID of the decision to update
 * @param outcome - Realized outcome data
 * @returns Whether update succeeded
 */
export async function updateCaseOutcome(
  client: HelixClient,
  decisionId: string,
  outcome: {
    pnl: number;
    returnPct: number;
    holdingHours: number;
    entryPrice?: number;
    exitPrice?: number;
    mae?: number;
    mfe?: number;
  }
): Promise<boolean> {
  try {
    // Serialize outcome to JSON for storage
    const outcomeJson = JSON.stringify({
      pnl: outcome.pnl,
      return_pct: outcome.returnPct,
      holding_hours: outcome.holdingHours,
      entry_price: outcome.entryPrice,
      exit_price: outcome.exitPrice,
      mae: outcome.mae,
      mfe: outcome.mfe,
    });

    await client.query("UpdateDecisionOutcome", {
      decision_id: decisionId,
      realized_outcome: outcomeJson,
      closed_at: new Date().toISOString(),
    });

    return true;
  } catch (_error) {
    return false;
  }
}

// ============================================
// Similarity Feature Extraction
// ============================================

/**
 * Feature weights for case similarity calculation.
 * Higher weight = more important for similarity.
 */
export const SIMILARITY_WEIGHTS = {
  regime: 0.3, // Same regime is very important
  indicators: 0.25, // Technical similarity
  sector: 0.15, // Sector context
  instrument: 0.2, // Same or similar instrument
  recency: 0.1, // More recent cases slightly preferred
} as const;

/**
 * Extract similarity features from a market snapshot.
 *
 * These features are used for hybrid retrieval (combining vector
 * similarity with structured matching).
 */
export interface SimilarityFeatures {
  /** Regime classification */
  regime: string;
  /** RSI bucket (oversold/neutral/overbought) */
  rsiBucket: "oversold" | "neutral" | "overbought";
  /** Volatility bucket (low/medium/high) */
  volatilityBucket: "low" | "medium" | "high";
  /** Sector classification */
  sector?: string;
  /** Instrument or underlying symbol */
  symbol: string;
}

/**
 * Extract similarity features from a snapshot.
 */
export function extractSimilarityFeatures(snapshot: CBRMarketSnapshot): SimilarityFeatures {
  // RSI bucket
  let rsiBucket: SimilarityFeatures["rsiBucket"] = "neutral";
  if (snapshot.indicators?.rsi !== undefined) {
    if (snapshot.indicators.rsi < 30) {
      rsiBucket = "oversold";
    } else if (snapshot.indicators.rsi > 70) {
      rsiBucket = "overbought";
    }
  }

  // Volatility bucket
  let volatilityBucket: SimilarityFeatures["volatilityBucket"] = "medium";
  if (snapshot.indicators?.volatility !== undefined) {
    if (snapshot.indicators.volatility < 0.15) {
      volatilityBucket = "low";
    } else if (snapshot.indicators.volatility > 0.35) {
      volatilityBucket = "high";
    }
  }

  return {
    regime: snapshot.regimeLabel,
    rsiBucket,
    volatilityBucket,
    sector: snapshot.sector,
    symbol: snapshot.underlyingSymbol ?? snapshot.instrumentId,
  };
}

// ============================================
// CBR Quality Metrics
// ============================================

/**
 * Quality metrics for CBR retrieval.
 */
export interface CBRQualityMetrics {
  /** Average similarity score of retrieved cases */
  avgSimilarity: number;
  /** Number of cases retrieved */
  caseCount: number;
  /** Whether enough cases were found (>= minCases) */
  sufficientCases: boolean;
  /** Diversity of regimes in retrieved cases */
  regimeDiversity: number;
  /** Win rate of retrieved cases */
  historicalWinRate: number;
  /** Quality score (0-1) */
  qualityScore: number;
}

/**
 * Calculate quality metrics for a CBR retrieval result.
 */
export function calculateCBRQuality(result: CBRRetrievalResult, minCases = 5): CBRQualityMetrics {
  const { cases, statistics } = result;

  // Average similarity
  const similarities = cases
    .filter((c) => c.similarityScore !== undefined)
    .map((c) => c.similarityScore!);
  const avgSimilarity =
    similarities.length > 0 ? similarities.reduce((a, b) => a + b, 0) / similarities.length : 0;

  // Regime diversity (unique regimes / total cases)
  const uniqueRegimes = new Set(cases.filter((c) => c.regime).map((c) => c.regime));
  const regimeDiversity = cases.length > 0 ? uniqueRegimes.size / Math.min(cases.length, 5) : 0;

  // Win rate
  const historicalWinRate = statistics.winRate ?? 0;

  // Composite quality score
  const qualityScore =
    avgSimilarity * 0.4 +
    (cases.length >= minCases ? 0.3 : (cases.length / minCases) * 0.3) +
    regimeDiversity * 0.15 +
    historicalWinRate * 0.15;

  return {
    avgSimilarity,
    caseCount: cases.length,
    sufficientCases: cases.length >= minCases,
    regimeDiversity,
    historicalWinRate,
    qualityScore,
  };
}
