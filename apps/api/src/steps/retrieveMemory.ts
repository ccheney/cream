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

import { isBacktest } from "@cream/domain";
import {
  createHelixClientFromEnv,
  formatTradeMemorySummary,
  generateSituationBrief,
  type HelixClient,
  type MarketSnapshot,
  retrieveTradeMemories,
  type TradeMemory,
  type TradeMemoryRetrievalResult,
} from "@cream/helix";
import { createEmbeddingClient, type EmbeddingClient } from "@cream/helix-schema";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

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

export const MemoryOutputSchema = z.object({
  /** Similar trade decisions per symbol */
  similarTrades: z.record(z.string(), z.array(TradeMemorySchema)),
  /** Formatted memory summaries for agent context */
  memorySummaries: z.record(z.string(), z.string()),
  /** Aggregate statistics */
  stats: z.object({
    totalMemoriesRetrieved: z.number(),
    symbolsWithMemories: z.number(),
    avgRetrievalTimeMs: z.number(),
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
    // Log but don't fail - memory is optional context
    // biome-ignore lint/suspicious/noConsole: Intentional - debug logging
    console.warn(`Failed to retrieve memories for ${symbol}:`, error);
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

    // Empty result structure
    const emptyResult: MemoryOutput = {
      similarTrades: {},
      memorySummaries: {},
      stats: {
        totalMemoriesRetrieved: 0,
        symbolsWithMemories: 0,
        avgRetrievalTimeMs: 0,
      },
    };

    // In backtest mode, return empty memories for faster execution
    if (isBacktest()) {
      return emptyResult;
    }

    // Skip if no symbols to process
    if (symbolCount === 0) {
      return emptyResult;
    }

    // Initialize clients
    let helix: HelixClient;
    let embedder: EmbeddingClient;

    try {
      helix = getHelixClient();
      embedder = getEmbeddingClient();
    } catch (error) {
      // If clients fail to initialize (missing API keys, etc.), return empty
      // biome-ignore lint/suspicious/noConsole: Intentional - debug logging
      console.warn("Memory retrieval clients not available:", error);
      return emptyResult;
    }

    // Retrieve memories for each symbol in parallel
    const symbols = Object.keys(snapshots);
    const retrievalTimes: number[] = [];

    const results = await Promise.all(
      symbols.map(async (symbol) => {
        const startTime = performance.now();
        const result = await retrieveMemoriesForSymbol(symbol, snapshots[symbol], helix, embedder);
        retrievalTimes.push(performance.now() - startTime);
        return { symbol, result };
      })
    );

    // Aggregate results
    const similarTrades: Record<string, z.infer<typeof TradeMemorySchema>[]> = {};
    const memorySummaries: Record<string, string> = {};
    let totalMemories = 0;
    let symbolsWithMemories = 0;

    for (const { symbol, result } of results) {
      if (result && result.memories.length > 0) {
        similarTrades[symbol] = result.memories.map(formatTradeMemory);
        memorySummaries[symbol] = formatTradeMemorySummary(result);
        totalMemories += result.memories.length;
        symbolsWithMemories++;
      }
    }

    const avgRetrievalTimeMs =
      retrievalTimes.length > 0
        ? retrievalTimes.reduce((a, b) => a + b, 0) / retrievalTimes.length
        : 0;

    return {
      similarTrades,
      memorySummaries,
      stats: {
        totalMemoriesRetrieved: totalMemories,
        symbolsWithMemories,
        avgRetrievalTimeMs,
      },
    };
  },
});
