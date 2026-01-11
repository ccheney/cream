/**
 * Retrieve Memory Step
 *
 * Step 3: Fetch relevant memories from HelixDB (similar trades, patterns).
 *
 * Uses GraphRAG (vector similarity + graph traversal) to retrieve similar trade
 * decisions and relevant events. This provides agents with historical context
 * about what worked in similar market conditions.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import { createContext, type ExecutionContext, isBacktest, requireEnv } from "@cream/domain";
import {
  createEventIngestionService,
  createHelixClientFromEnv,
  formatTradeMemorySummary,
  generateSituationBrief,
  type HelixClient,
  type MarketSnapshot,
  retrieveTradeMemories,
  type TradeMemory,
  type TradeMemoryRetrievalResult,
} from "@cream/helix";

/**
 * Create ExecutionContext for step invocation.
 * Steps are invoked by the Mastra workflow during scheduled runs.
 */
function createStepContext(): ExecutionContext {
  return createContext(requireEnv(), "scheduled");
}

import {
  createEmbeddingClient,
  type EmbeddingClient,
  parseLessonsLearned,
  retrieveSimilarTheses,
  summarizeThesisMemory,
  type ThesisMemoryResult,
} from "@cream/helix-schema";
import type { ExternalEvent } from "@cream/storage";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { getExternalEventsRepo } from "../db.js";
import { log } from "../logger.js";
import { SnapshotOutputSchema } from "./buildSnapshot.js";

// ============================================
// Types
// ============================================

const TradeMemorySchema = z.object({
  decisionId: z.string(),
  instrumentId: z.string(),
  action: z.string(),
  rationale: z.string(),
  outcome: z.string().optional(),
  rrfScore: z.number(),
  similarity: z.number().optional(),
});

const RecentEventSchema = z.object({
  id: z.string(),
  sourceType: z.string(),
  eventType: z.string(),
  eventTime: z.string(),
  sentiment: z.string(),
  summary: z.string(),
  importanceScore: z.number(),
  relatedInstruments: z.array(z.string()),
});

const SemanticEventSchema = z.object({
  eventId: z.string(),
  similarity: z.number(),
  textSummary: z.string(),
});

/**
 * Schema for thesis memory results
 */
const ThesisMemorySchema = z.object({
  thesisId: z.string(),
  instrumentId: z.string(),
  entryThesis: z.string(),
  outcome: z.enum(["WIN", "LOSS", "SCRATCH"]),
  pnlPercent: z.number(),
  holdingPeriodDays: z.number(),
  lessonsLearned: z.array(z.string()),
  entryRegime: z.string(),
  exitRegime: z.string().optional(),
  closeReason: z.string(),
  similarityScore: z.number().optional(),
});

export const MemoryOutputSchema = z.object({
  /** Similar trade decisions per symbol */
  similarTrades: z.record(z.string(), z.array(TradeMemorySchema)),
  /** Formatted memory summaries for agent context */
  memorySummaries: z.record(z.string(), z.string()),
  /** Similar thesis memories per symbol (for agent learning) */
  similarTheses: z.record(z.string(), z.array(ThesisMemorySchema)),
  /** Formatted thesis summaries for agent context */
  thesisSummaries: z.record(z.string(), z.string()),
  /** Recent external events (news, macro, etc.) from Turso */
  recentEvents: z.array(RecentEventSchema),
  /** Semantically similar events from HelixDB (vector search) */
  semanticEvents: z.array(SemanticEventSchema),
  /** Aggregate statistics */
  stats: z.object({
    totalMemoriesRetrieved: z.number(),
    symbolsWithMemories: z.number(),
    totalThesesRetrieved: z.number(),
    symbolsWithTheses: z.number(),
    avgRetrievalTimeMs: z.number(),
    recentEventsCount: z.number(),
    semanticEventsCount: z.number(),
  }),
});

export type MemoryOutput = z.infer<typeof MemoryOutputSchema>;

// ============================================
// Singleton Clients (lazy initialization)
// ============================================

let helixClient: HelixClient | null = null;
let embeddingClient: EmbeddingClient | null = null;

function getHelixClient(): HelixClient {
  if (!helixClient) {
    helixClient = createHelixClientFromEnv();
  }
  return helixClient;
}

function getEmbeddingClient(): EmbeddingClient {
  if (!embeddingClient) {
    embeddingClient = createEmbeddingClient();
  }
  return embeddingClient;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Convert snapshot to MarketSnapshot for retrieval
 */
function snapshotToMarketSnapshot(symbol: string, snapshot: unknown): MarketSnapshot {
  const s = snapshot as {
    regime?: { label: string };
    indicators?: Record<string, number>;
  };

  return {
    instrumentId: symbol,
    regimeLabel: s.regime?.label ?? "UNKNOWN",
    indicators: s.indicators,
  };
}

/**
 * Convert TradeMemory to serializable format
 */
function formatTradeMemory(memory: TradeMemory): z.infer<typeof TradeMemorySchema> {
  const d = memory.decision;
  return {
    decisionId: d.decision_id,
    instrumentId: d.instrument_id,
    action: d.action,
    rationale: d.rationale_text.slice(0, 500), // Truncate for context window
    outcome: d.realized_outcome ?? undefined,
    rrfScore: memory.rrfScore,
    similarity: memory.vectorSimilarity,
  };
}

/**
 * Convert ExternalEvent to serializable format for output
 */
function formatExternalEvent(event: ExternalEvent): z.infer<typeof RecentEventSchema> {
  return {
    id: event.id,
    sourceType: event.sourceType,
    eventType: event.eventType,
    eventTime: event.eventTime,
    sentiment: event.sentiment,
    summary: event.summary,
    importanceScore: event.importanceScore,
    relatedInstruments: event.relatedInstruments,
  };
}

/**
 * Convert ThesisMemoryResult to serializable format for output
 */
function formatThesisMemoryResult(result: ThesisMemoryResult): z.infer<typeof ThesisMemorySchema> {
  const tm = result.memory;
  return {
    thesisId: tm.thesis_id,
    instrumentId: tm.instrument_id,
    entryThesis: tm.entry_thesis.slice(0, 500), // Truncate for context window
    outcome: tm.outcome,
    pnlPercent: tm.pnl_percent,
    holdingPeriodDays: tm.holding_period_days,
    lessonsLearned: parseLessonsLearned(tm.lessons_learned),
    entryRegime: tm.entry_regime,
    exitRegime: tm.exit_regime ?? undefined,
    closeReason: tm.close_reason,
    similarityScore: result.similarityScore,
  };
}

/**
 * Generate a summary of multiple thesis memory results
 */
function summarizeThesisMemories(results: ThesisMemoryResult[]): string {
  if (results.length === 0) {
    return "No similar thesis memories found.";
  }

  const summaries = results.map((r) => summarizeThesisMemory(r.memory));
  return `Found ${results.length} similar thesis memories:\n${summaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}

/**
 * Retrieve recent external events for given symbols from Turso
 */
async function retrieveRecentEvents(symbols: string[]): Promise<ExternalEvent[]> {
  try {
    const repo = await getExternalEventsRepo();
    // Get events from last 24 hours relevant to our symbols
    const events = await repo.findBySymbols(symbols, 50);
    return events;
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to retrieve recent events"
    );
    return [];
  }
}

/**
 * Result from semantic event search
 */
interface SemanticEventResult {
  eventId: string;
  similarity: number;
  textSummary: string;
}

/**
 * Retrieve semantically similar events from HelixDB
 *
 * Uses vector similarity search to find events similar to the current
 * market context, providing historical pattern matching beyond just
 * time-based filtering.
 */
async function retrieveSimilarEventsFromHelix(
  helix: HelixClient,
  situationBrief: string,
  limit = 10
): Promise<SemanticEventResult[]> {
  try {
    const service = createEventIngestionService(helix);
    const results = await service.searchSimilarEvents(situationBrief, limit);
    return results;
  } catch (error) {
    log.debug(
      { error: error instanceof Error ? error.message : String(error) },
      "Semantic event search not available"
    );
    return [];
  }
}

/**
 * Retrieve thesis memories for a single symbol
 */
async function retrieveThesesForSymbol(
  symbol: string,
  snapshot: unknown,
  helix: HelixClient,
  embedder: EmbeddingClient
): Promise<ThesisMemoryResult[] | null> {
  try {
    const marketSnapshot = snapshotToMarketSnapshot(symbol, snapshot);
    const situationBrief = generateSituationBrief(marketSnapshot);

    // Retrieve similar theses (both winning and losing for learning)
    // The function handles embedding generation internally
    const results = await retrieveSimilarTheses(helix, embedder, situationBrief, {
      filterInstrument: symbol,
      topK: 5,
    });

    return results;
  } catch (error) {
    log.warn(
      { symbol, error: error instanceof Error ? error.message : String(error) },
      "Failed to retrieve thesis memories"
    );
    return null;
  }
}

/**
 * Retrieve memories for a single symbol
 */
async function retrieveMemoriesForSymbol(
  symbol: string,
  snapshot: unknown,
  helix: HelixClient,
  embedder: EmbeddingClient
): Promise<TradeMemoryRetrievalResult | null> {
  try {
    const marketSnapshot = snapshotToMarketSnapshot(symbol, snapshot);
    const situationBrief = generateSituationBrief(marketSnapshot);

    // Generate embedding for the situation brief
    const embeddingResult = await embedder.generateEmbedding(situationBrief);

    // Retrieve similar trades
    const result = await retrieveTradeMemories(helix, embeddingResult.values, marketSnapshot, {
      topK: 5,
      includeInfluencingEvents: false, // Keep it fast
      enableCorrective: true,
    });

    return result;
  } catch (error) {
    log.warn(
      { symbol, error: error instanceof Error ? error.message : String(error) },
      "Failed to retrieve trade memories"
    );
    return null;
  }
}

// ============================================
// Workflow Step
// ============================================

export const retrieveMemoryStep = createStep({
  id: "retrieve-memory",
  description: "Fetch relevant trade memories from HelixDB using GraphRAG",
  inputSchema: SnapshotOutputSchema,
  outputSchema: MemoryOutputSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    const { snapshots, symbolCount } = inputData;

    // Create context at step boundary
    const ctx = createStepContext();

    // Empty result structure
    const emptyResult: MemoryOutput = {
      similarTrades: {},
      memorySummaries: {},
      similarTheses: {},
      thesisSummaries: {},
      recentEvents: [],
      semanticEvents: [],
      stats: {
        totalMemoriesRetrieved: 0,
        symbolsWithMemories: 0,
        totalThesesRetrieved: 0,
        symbolsWithTheses: 0,
        avgRetrievalTimeMs: 0,
        recentEventsCount: 0,
        semanticEventsCount: 0,
      },
    };

    // In backtest mode, return empty memories for faster execution
    if (isBacktest(ctx)) {
      return emptyResult;
    }

    // Skip if no symbols to process
    if (symbolCount === 0) {
      return emptyResult;
    }

    // Get symbols list
    const symbols = Object.keys(snapshots);

    // Initialize clients
    let helix: HelixClient;
    let embedder: EmbeddingClient;

    try {
      helix = getHelixClient();
      embedder = getEmbeddingClient();
    } catch (error) {
      log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Memory retrieval clients not available"
      );
      // Still try to get recent events even if Helix is unavailable
      const recentEvents = await retrieveRecentEvents(symbols);
      return {
        ...emptyResult,
        recentEvents: recentEvents.map(formatExternalEvent),
        stats: {
          ...emptyResult.stats,
          recentEventsCount: recentEvents.length,
        },
      };
    }

    // Retrieve memories and events in parallel
    const retrievalTimes: number[] = [];

    // Generate a combined situation brief for semantic event search
    const combinedSituationBrief = symbols
      .map((symbol) => {
        const snapshot = snapshots[symbol];
        const marketSnapshot = snapshotToMarketSnapshot(symbol, snapshot);
        return generateSituationBrief(marketSnapshot);
      })
      .slice(0, 3) // Use first 3 symbols to keep brief concise
      .join("\n");

    const [memoryResults, thesisResults, recentEvents, semanticEvents] = await Promise.all([
      // Trade memories
      Promise.all(
        symbols.map(async (symbol) => {
          const startTime = performance.now();
          const result = await retrieveMemoriesForSymbol(
            symbol,
            snapshots[symbol],
            helix,
            embedder
          );
          retrievalTimes.push(performance.now() - startTime);
          return { symbol, result };
        })
      ),
      // Thesis memories
      Promise.all(
        symbols.map(async (symbol) => {
          const result = await retrieveThesesForSymbol(symbol, snapshots[symbol], helix, embedder);
          return { symbol, result };
        })
      ),
      // Recent external events from Turso
      retrieveRecentEvents(symbols),
      // Semantically similar events from HelixDB
      retrieveSimilarEventsFromHelix(helix, combinedSituationBrief, 10),
    ]);

    // Aggregate trade memory results
    const similarTrades: Record<string, z.infer<typeof TradeMemorySchema>[]> = {};
    const memorySummaries: Record<string, string> = {};
    let totalMemories = 0;
    let symbolsWithMemories = 0;

    for (const { symbol, result } of memoryResults) {
      if (result && result.memories.length > 0) {
        similarTrades[symbol] = result.memories.map(formatTradeMemory);
        memorySummaries[symbol] = formatTradeMemorySummary(result);
        totalMemories += result.memories.length;
        symbolsWithMemories++;
      }
    }

    // Aggregate thesis memory results
    const similarTheses: Record<string, z.infer<typeof ThesisMemorySchema>[]> = {};
    const thesisSummaries: Record<string, string> = {};
    let totalTheses = 0;
    let symbolsWithTheses = 0;

    for (const { symbol, result } of thesisResults) {
      if (result && result.length > 0) {
        similarTheses[symbol] = result.map(formatThesisMemoryResult);
        thesisSummaries[symbol] = summarizeThesisMemories(result);
        totalTheses += result.length;
        symbolsWithTheses++;
      }
    }

    const avgRetrievalTimeMs =
      retrievalTimes.length > 0
        ? retrievalTimes.reduce((a, b) => a + b, 0) / retrievalTimes.length
        : 0;

    return {
      similarTrades,
      memorySummaries,
      similarTheses,
      thesisSummaries,
      recentEvents: recentEvents.map(formatExternalEvent),
      semanticEvents,
      stats: {
        totalMemoriesRetrieved: totalMemories,
        symbolsWithMemories,
        totalThesesRetrieved: totalTheses,
        symbolsWithTheses,
        avgRetrievalTimeMs,
        recentEventsCount: recentEvents.length,
        semanticEventsCount: semanticEvents.length,
      },
    };
  },
});
