/**
 * Thesis Memory Module
 *
 * TypeScript types and utilities for thesis memory ingestion.
 * When a thesis closes in Turso, this module handles converting
 * it to a ThesisMemory node for HelixDB storage and retrieval.
 *
 * @see schema.hx - ThesisMemory node definition
 * @see docs/plans/05-agents.md - Memory Integration section
 */

import type { EmbeddingClient } from "./embeddings";

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
 * Minimal HelixDB client interface for thesis memory operations.
 * This is a local copy to avoid cyclic dependency.
 */
interface HelixClient {
  query<T = unknown>(queryName: string, params?: Record<string, unknown>): Promise<QueryResult<T>>;
}

// ============================================
// Types
// ============================================

/**
 * Thesis outcome classification
 */
export type ThesisOutcome = "WIN" | "LOSS" | "SCRATCH";

/**
 * Close reason from thesis state
 */
export type ThesisCloseReason =
  | "STOP_HIT"
  | "TARGET_HIT"
  | "INVALIDATED"
  | "MANUAL"
  | "TIME_DECAY"
  | "CORRELATION";

/**
 * ThesisMemory node for HelixDB storage
 */
export interface ThesisMemory {
  thesis_id: string;
  instrument_id: string;
  underlying_symbol?: string;
  entry_thesis: string;
  outcome: ThesisOutcome;
  pnl_percent: number;
  holding_period_days: number;
  lessons_learned: string; // JSON array of strings
  entry_regime: string;
  exit_regime?: string;
  close_reason: ThesisCloseReason;
  entry_price?: number;
  exit_price?: number;
  entry_date: string;
  closed_at: string;
  environment: string;
}

/**
 * Input for creating a thesis memory from a closed thesis
 */
export interface ThesisMemoryInput {
  thesisId: string;
  instrumentId: string;
  underlyingSymbol?: string;
  entryThesis: string;
  pnlPercent: number;
  entryDate: string;
  closedAt: string;
  closeReason: ThesisCloseReason;
  entryPrice?: number;
  exitPrice?: number;
  entryRegime: string;
  exitRegime?: string;
  environment: string;
}

/**
 * Result of thesis memory retrieval
 */
export interface ThesisMemoryResult {
  memory: ThesisMemory;
  similarityScore?: number;
}

/**
 * Options for retrieving similar thesis memories
 */
export interface ThesisMemoryRetrievalOptions {
  /** Maximum number of memories to retrieve */
  topK?: number;
  /** Minimum similarity score */
  minSimilarity?: number;
  /** Filter by outcome */
  filterOutcome?: ThesisOutcome;
  /** Filter by instrument */
  filterInstrument?: string;
  /** Filter by regime */
  filterRegime?: string;
  /** Environment filter */
  environment?: string;
}

// ============================================
// Constants
// ============================================

/**
 * Threshold for determining WIN vs LOSS vs SCRATCH
 * SCRATCH is when P&L is within this percentage of breakeven
 */
export const SCRATCH_THRESHOLD_PERCENT = 0.5;

/**
 * Default retrieval options
 */
export const DEFAULT_RETRIEVAL_OPTIONS: Required<ThesisMemoryRetrievalOptions> = {
  topK: 10,
  minSimilarity: 0.5,
  filterOutcome: undefined as unknown as ThesisOutcome,
  filterInstrument: "",
  filterRegime: "",
  environment: "PAPER",
};

// ============================================
// Outcome Classification
// ============================================

/**
 * Classify a thesis outcome based on P&L percentage.
 *
 * @param pnlPercent - Realized P&L percentage
 * @param scratchThreshold - Threshold for SCRATCH classification (default 0.5%)
 * @returns Outcome classification: WIN, LOSS, or SCRATCH
 */
export function classifyOutcome(
  pnlPercent: number,
  scratchThreshold = SCRATCH_THRESHOLD_PERCENT
): ThesisOutcome {
  if (Math.abs(pnlPercent) <= scratchThreshold) {
    return "SCRATCH";
  }
  return pnlPercent > 0 ? "WIN" : "LOSS";
}

/**
 * Calculate holding period in days from entry and close dates.
 *
 * @param entryDate - ISO 8601 entry date string
 * @param closedAt - ISO 8601 close date string
 * @returns Holding period in days (minimum 0)
 */
export function calculateHoldingPeriod(entryDate: string, closedAt: string): number {
  const entry = new Date(entryDate);
  const close = new Date(closedAt);
  const diffMs = close.getTime() - entry.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

// ============================================
// Post-Hoc Analysis
// ============================================

/**
 * Generate lessons learned from a thesis outcome.
 *
 * This performs basic post-hoc analysis based on the outcome and close reason.
 * In production, this could be enhanced with LLM-based analysis.
 *
 * @param input - Thesis memory input
 * @param outcome - Classified outcome
 * @returns Array of lessons learned strings
 */
export function generateLessonsLearned(input: ThesisMemoryInput, outcome: ThesisOutcome): string[] {
  const lessons: string[] = [];

  // Analyze based on close reason
  switch (input.closeReason) {
    case "STOP_HIT":
      lessons.push(`Stop loss triggered at ${input.exitPrice ?? "N/A"}`);
      if (outcome === "LOSS") {
        lessons.push("Risk management worked as intended - loss was limited");
      }
      break;

    case "TARGET_HIT":
      lessons.push(`Target reached at ${input.exitPrice ?? "N/A"}`);
      if (outcome === "WIN") {
        lessons.push("Entry thesis validated - target execution successful");
      }
      break;

    case "INVALIDATED":
      lessons.push("Original thesis was invalidated before full resolution");
      lessons.push("Early exit prevented potential larger loss or gain");
      break;

    case "MANUAL":
      lessons.push("Manual exit - discretionary decision");
      break;

    case "TIME_DECAY":
      lessons.push("Position closed due to time decay considerations");
      lessons.push("Consider time horizon in future similar setups");
      break;

    case "CORRELATION":
      lessons.push("Position closed due to correlation risk management");
      lessons.push("Monitor portfolio correlation in similar setups");
      break;
  }

  // Analyze based on outcome
  if (outcome === "WIN" && input.pnlPercent > 10) {
    lessons.push("Strong positive outcome - review entry timing and sizing");
  }
  if (outcome === "LOSS" && input.pnlPercent < -10) {
    lessons.push("Significant loss - review risk parameters and entry criteria");
  }
  if (outcome === "SCRATCH") {
    lessons.push("Breakeven trade - consider if edge was present");
  }

  // Analyze holding period
  const holdingDays = calculateHoldingPeriod(input.entryDate, input.closedAt);
  if (holdingDays <= 1) {
    lessons.push("Very short holding period - day trade or quick exit");
  } else if (holdingDays > 30) {
    lessons.push("Long holding period - swing/position trade");
  }

  // Regime analysis
  if (input.entryRegime !== input.exitRegime && input.exitRegime) {
    lessons.push(`Regime shifted from ${input.entryRegime} to ${input.exitRegime} during hold`);
  }

  return lessons;
}

// ============================================
// ThesisMemory Creation
// ============================================

/**
 * Create a ThesisMemory node from thesis input.
 *
 * @param input - Input data from closed thesis
 * @returns ThesisMemory ready for HelixDB storage
 */
export function createThesisMemory(input: ThesisMemoryInput): ThesisMemory {
  const outcome = classifyOutcome(input.pnlPercent);
  const holdingDays = calculateHoldingPeriod(input.entryDate, input.closedAt);
  const lessons = generateLessonsLearned(input, outcome);

  return {
    thesis_id: input.thesisId,
    instrument_id: input.instrumentId,
    underlying_symbol: input.underlyingSymbol,
    entry_thesis: input.entryThesis,
    outcome,
    pnl_percent: input.pnlPercent,
    holding_period_days: holdingDays,
    lessons_learned: JSON.stringify(lessons),
    entry_regime: input.entryRegime,
    exit_regime: input.exitRegime,
    close_reason: input.closeReason,
    entry_price: input.entryPrice,
    exit_price: input.exitPrice,
    entry_date: input.entryDate,
    closed_at: input.closedAt,
    environment: input.environment,
  };
}

// ============================================
// Embedding Generation
// ============================================

/**
 * Generate text for embedding from a thesis memory.
 *
 * Combines entry thesis with outcome and lessons for semantic search.
 *
 * @param memory - ThesisMemory to generate embedding text for
 * @returns Text suitable for embedding
 */
export function generateEmbeddingText(memory: ThesisMemory): string {
  const parts: string[] = [];

  // Entry thesis
  parts.push(`Thesis: ${memory.entry_thesis}`);

  // Outcome context
  parts.push(`Outcome: ${memory.outcome} (${memory.pnl_percent.toFixed(1)}%)`);

  // Regime context
  parts.push(`Regime: ${memory.entry_regime}`);
  if (memory.exit_regime && memory.exit_regime !== memory.entry_regime) {
    parts.push(`(shifted to ${memory.exit_regime})`);
  }

  // Close reason
  parts.push(`Close reason: ${memory.close_reason}`);

  // Lessons learned
  try {
    const lessons = JSON.parse(memory.lessons_learned) as string[];
    if (lessons.length > 0) {
      parts.push(`Lessons: ${lessons.slice(0, 3).join("; ")}`);
    }
  } catch {
    // Ignore parsing errors
  }

  return parts.join(". ");
}

// ============================================
// HelixDB Operations
// ============================================

/**
 * Store a thesis memory in HelixDB with embedding.
 *
 * @param client - HelixDB client
 * @param embeddingClient - Embedding client for generating embeddings
 * @param memory - ThesisMemory to store
 * @returns Promise resolving when stored
 */
export async function ingestThesisMemory(
  client: HelixClient,
  embeddingClient: EmbeddingClient,
  memory: ThesisMemory
): Promise<void> {
  // Generate embedding text
  const embeddingText = generateEmbeddingText(memory);

  // Generate embedding
  const embeddingResult = await embeddingClient.generateEmbedding(embeddingText);

  // Store in HelixDB
  // The client.query call would insert the ThesisMemory node with its embedding
  await client.query("InsertThesisMemory", {
    ...memory,
    entry_thesis_embedding: embeddingResult.values,
  });
}

/**
 * Retrieve similar thesis memories for agent use.
 *
 * @param client - HelixDB client
 * @param embeddingClient - Embedding client
 * @param query - Query text (typically current thesis or situation)
 * @param options - Retrieval options
 * @returns Array of similar thesis memories
 */
export async function retrieveSimilarTheses(
  client: HelixClient,
  embeddingClient: EmbeddingClient,
  query: string,
  options: ThesisMemoryRetrievalOptions = {}
): Promise<ThesisMemoryResult[]> {
  const opts = { ...DEFAULT_RETRIEVAL_OPTIONS, ...options };

  // Generate query embedding
  const embeddingResult = await embeddingClient.generateEmbedding(query);

  // Build filters
  const filters: Record<string, unknown> = {
    environment: opts.environment,
  };
  if (opts.filterOutcome) {
    filters.outcome = opts.filterOutcome;
  }
  if (opts.filterInstrument) {
    filters.instrument_id = opts.filterInstrument;
  }
  if (opts.filterRegime) {
    filters.entry_regime = opts.filterRegime;
  }

  // Execute vector search
  const results = await client.query<Array<{ node: ThesisMemory; similarity: number }>>(
    "SearchSimilarTheses",
    {
      query_embedding: embeddingResult.values,
      top_k: opts.topK,
      min_similarity: opts.minSimilarity,
      ...filters,
    }
  );

  // Convert to ThesisMemoryResult
  return results.data.map((r) => ({
    memory: r.node,
    similarityScore: r.similarity,
  }));
}

/**
 * Retrieve winning thesis memories for bullish research.
 *
 * Convenience function for Bullish Research Agent.
 */
export async function retrieveWinningTheses(
  client: HelixClient,
  embeddingClient: EmbeddingClient,
  query: string,
  options: Omit<ThesisMemoryRetrievalOptions, "filterOutcome"> = {}
): Promise<ThesisMemoryResult[]> {
  return retrieveSimilarTheses(client, embeddingClient, query, {
    ...options,
    filterOutcome: "WIN",
  });
}

/**
 * Retrieve losing thesis memories for bearish research.
 *
 * Convenience function for Bearish Research Agent.
 */
export async function retrieveLosingTheses(
  client: HelixClient,
  embeddingClient: EmbeddingClient,
  query: string,
  options: Omit<ThesisMemoryRetrievalOptions, "filterOutcome"> = {}
): Promise<ThesisMemoryResult[]> {
  return retrieveSimilarTheses(client, embeddingClient, query, {
    ...options,
    filterOutcome: "LOSS",
  });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Parse lessons learned from JSON string.
 *
 * @param lessonsJson - JSON string of lessons array
 * @returns Array of lesson strings
 */
export function parseLessonsLearned(lessonsJson: string): string[] {
  try {
    const parsed = JSON.parse(lessonsJson);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Convert ThesisMemory to a summary string for display.
 *
 * @param memory - ThesisMemory to summarize
 * @returns Human-readable summary
 */
export function summarizeThesisMemory(memory: ThesisMemory): string {
  const lessons = parseLessonsLearned(memory.lessons_learned);
  const lessonsText = lessons.length > 0 ? lessons[0] : "No lessons recorded";

  return [
    `${memory.outcome} on ${memory.instrument_id}`,
    `(${memory.pnl_percent > 0 ? "+" : ""}${memory.pnl_percent.toFixed(1)}%,`,
    `${memory.holding_period_days} days,`,
    `${memory.close_reason})`,
    `-`,
    lessonsText,
  ].join(" ");
}
