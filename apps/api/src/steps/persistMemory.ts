/**
 * Persist Memory Step
 *
 * Step 11: Store decision + outcome in HelixDB for future reference.
 *
 * Creates TradeDecision nodes in HelixDB for each decision in the plan.
 * These nodes are later used by retrieveMemory for GraphRAG retrieval.
 *
 * Memory persistence is CRITICAL for CBR (Case-Based Reasoning) to function.
 * By default, all environments (BACKTEST, PAPER, LIVE) persist to HelixDB.
 *
 * To explicitly skip persistence (e.g., for isolated tests), set:
 *   SKIP_HELIX_PERSISTENCE=true
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import { type CreamEnvironment, createContext, type ExecutionContext } from "@cream/domain";
import {
  type BatchMutationResult,
  batchUpsertTradeDecisions,
  type NodeWithEmbedding,
} from "@cream/helix";
import { getHelixClient } from "../db.js";

/**
 * Create ExecutionContext for step invocation.
 * Steps are invoked by the Mastra workflow during scheduled runs.
 */
function createStepContext(): ExecutionContext {
  const envValue = process.env.CREAM_ENV || "BACKTEST";
  return createContext(envValue as CreamEnvironment, "scheduled");
}

import type { Action, Environment, TradeDecision } from "@cream/helix-schema";
import { createEmbeddingClient, type EmbeddingClient } from "@cream/helix-schema";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { ExecutionResultSchema } from "./executeOrders.js";

// ============================================
// Schemas
// ============================================

/**
 * Decision from the trading plan (passed from validation step)
 * Includes thesis state fields for downstream ingestion
 */
export const DecisionSchema = z.object({
  decisionId: z.string(),
  instrumentId: z.string(),
  action: z.enum(["BUY", "SELL", "HOLD", "CLOSE"]),
  direction: z.enum(["LONG", "SHORT", "FLAT"]),
  size: z.object({
    value: z.number(),
    unit: z.enum(["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"]),
  }),
  stopLoss: z.object({ price: z.number(), type: z.enum(["FIXED", "TRAILING"]) }).optional(),
  takeProfit: z.object({ price: z.number() }).optional(),
  strategyFamily: z.string(),
  timeHorizon: z.string(),
  rationale: z.object({
    summary: z.string(),
    bullishFactors: z.array(z.string()),
    bearishFactors: z.array(z.string()),
    decisionLogic: z.string(),
    memoryReferences: z.array(z.string()),
  }),
  thesisState: z.string(),
  // Thesis closing fields (optional, used by ingestThesisMemory step)
  closeReason: z.string().optional(),
  exitPrice: z.number().optional(),
  realizedPnl: z.number().optional(),
});

/**
 * Extended input schema that includes decisions from the plan
 */
export const PersistMemoryInputSchema = ExecutionResultSchema.extend({
  cycleId: z.string().optional(),
  decisions: z.array(DecisionSchema).optional(),
  regimeLabel: z.string().optional(),
});

export const PersistMemoryOutputSchema = z.object({
  persisted: z.boolean(),
  memoryId: z.string().optional(),
  nodesCreated: z.number(),
  errors: z.array(z.string()),
  // Pass-through for next step
  cycleId: z.string().optional(),
  decisions: z.array(DecisionSchema).optional(),
  regimeLabel: z.string().optional(),
});

export type PersistMemoryInput = z.infer<typeof PersistMemoryInputSchema>;
export type PersistMemoryOutput = z.infer<typeof PersistMemoryOutputSchema>;
type Decision = z.infer<typeof DecisionSchema>;

// ============================================
// Embedding Client Singleton
// ============================================

let embeddingClient: EmbeddingClient | null = null;

function getEmbeddingClient(): EmbeddingClient | null {
  if (embeddingClient) {
    return embeddingClient;
  }

  try {
    embeddingClient = createEmbeddingClient();
    return embeddingClient;
  } catch {
    return null;
  }
}

// ============================================
// Conversion Helpers
// ============================================

/**
 * Map decision action to HelixDB Action enum
 * Note: CLOSE maps to SELL in HelixDB since it's closing a position
 */
function mapAction(action: string): Action {
  switch (action) {
    case "BUY":
      return "BUY";
    case "SELL":
      return "SELL";
    case "HOLD":
      return "HOLD";
    case "CLOSE":
      return "REDUCE"; // Closing a position is a form of reduction
    default:
      return "NO_TRADE";
  }
}

/**
 * Map ExecutionContext environment to HelixDB Environment
 */
function mapEnvironment(ctx: ExecutionContext): Environment {
  switch (ctx.environment) {
    case "BACKTEST":
      return "BACKTEST";
    case "PAPER":
      return "PAPER";
    case "LIVE":
      return "LIVE";
    default:
      return "BACKTEST";
  }
}

/**
 * Convert workflow Decision to HelixDB TradeDecision node
 */
function toTradeDecision(
  ctx: ExecutionContext,
  decision: Decision,
  cycleId: string,
  regimeLabel: string
): TradeDecision {
  return {
    decision_id: decision.decisionId,
    cycle_id: cycleId,
    instrument_id: decision.instrumentId,
    underlying_symbol: decision.instrumentId.split("_")[0], // Extract underlying from option symbol
    regime_label: regimeLabel,
    action: mapAction(decision.action),
    decision_json: JSON.stringify({
      action: decision.action,
      direction: decision.direction,
      size: decision.size,
      stopLoss: decision.stopLoss,
      takeProfit: decision.takeProfit,
      strategyFamily: decision.strategyFamily,
      timeHorizon: decision.timeHorizon,
      thesisState: decision.thesisState,
    }),
    rationale_text: decision.rationale.summary,
    snapshot_reference: `snapshot-${cycleId}`,
    created_at: new Date().toISOString(),
    environment: mapEnvironment(ctx),
  };
}

/**
 * Generate embedding for a decision's rationale
 */
async function generateDecisionEmbedding(
  decision: Decision,
  embedder: EmbeddingClient
): Promise<number[] | undefined> {
  try {
    // Create a rich text representation for embedding
    const text = [
      `Action: ${decision.action} ${decision.direction}`,
      `Instrument: ${decision.instrumentId}`,
      `Rationale: ${decision.rationale.summary}`,
      `Bullish factors: ${decision.rationale.bullishFactors.join(", ")}`,
      `Bearish factors: ${decision.rationale.bearishFactors.join(", ")}`,
      `Decision logic: ${decision.rationale.decisionLogic}`,
    ].join("\n");

    const result = await embedder.generateEmbedding(text);
    return result.values;
  } catch {
    return undefined;
  }
}

// ============================================
// Step Implementation
// ============================================

/**
 * Check if memory persistence should be skipped.
 * Only returns true if SKIP_HELIX_PERSISTENCE is explicitly set to "true".
 */
function shouldSkipPersistence(): boolean {
  const skipEnv = process.env.SKIP_HELIX_PERSISTENCE;
  return skipEnv === "true" || skipEnv === "1";
}

/**
 * Memory persistence error - thrown when HelixDB is unavailable or write fails.
 */
export class MemoryPersistenceError extends Error {
  constructor(
    message: string,
    public readonly code: "HELIX_UNAVAILABLE" | "WRITE_FAILED" | "PARTIAL_FAILURE",
    public override readonly cause?: Error
  ) {
    super(message);
    this.name = "MemoryPersistenceError";
  }
}

export const persistMemoryStep = createStep({
  id: "persist-memory",
  description: "Store decision + outcome in HelixDB",
  inputSchema: PersistMemoryInputSchema,
  outputSchema: PersistMemoryOutputSchema,
  retries: 3,
  execute: async ({ inputData }) => {
    const {
      ordersSubmitted,
      cycleId = `cycle-${Date.now()}`,
      decisions = [],
      regimeLabel = "UNKNOWN",
    } = inputData;

    // Create context at step boundary
    const ctx = createStepContext();

    // Check for explicit skip flag (for isolated tests only)
    if (shouldSkipPersistence()) {
      // biome-ignore lint/suspicious/noConsole: Explicit skip notification
      console.warn(
        `[persist-memory] Skipping HelixDB persistence (SKIP_HELIX_PERSISTENCE=true) for cycle ${cycleId}`
      );
      return {
        persisted: false,
        memoryId: undefined,
        nodesCreated: 0,
        errors: ["Persistence explicitly skipped via SKIP_HELIX_PERSISTENCE"],
        // Pass-through for next step
        cycleId,
        decisions,
        regimeLabel,
      };
    }

    // If no decisions to persist, return early
    if (decisions.length === 0) {
      return {
        persisted: true,
        memoryId: undefined,
        nodesCreated: 0,
        errors: ordersSubmitted === 0 ? [] : ["No decisions provided for persistence"],
        // Pass-through for next step
        cycleId,
        decisions,
        regimeLabel,
      };
    }

    // Get HelixDB client - REQUIRED for memory persistence
    const helix = getHelixClient();
    if (!helix) {
      const errorMsg =
        `HelixDB client unavailable. CBR memory will not be persisted for cycle ${cycleId}. ` +
        `Ensure HelixDB is running at ${process.env.HELIX_HOST ?? "localhost"}:${process.env.HELIX_PORT ?? "6969"} ` +
        `or set SKIP_HELIX_PERSISTENCE=true to explicitly skip.`;

      // biome-ignore lint/suspicious/noConsole: Critical error logging
      console.error(`[persist-memory] ${errorMsg}`);

      // Throw error - don't silently succeed
      throw new MemoryPersistenceError(errorMsg, "HELIX_UNAVAILABLE");
    }

    // Get embedding client (optional - persistence still works without embeddings)
    const embedder = getEmbeddingClient();
    if (!embedder) {
      // biome-ignore lint/suspicious/noConsole: Warning for missing embeddings
      console.warn(
        `[persist-memory] Embedding client unavailable. Decisions will be stored without embeddings for cycle ${cycleId}`
      );
    }

    // Convert decisions to TradeDecision nodes with embeddings
    const nodesWithEmbeddings: NodeWithEmbedding<TradeDecision>[] = await Promise.all(
      decisions.map(async (decision) => {
        const node = toTradeDecision(ctx, decision, cycleId, regimeLabel);
        const embedding = embedder
          ? await generateDecisionEmbedding(decision, embedder)
          : undefined;
        return {
          node,
          embedding,
          embeddingModelVersion: embedding ? "text-embedding-3-small" : undefined,
        };
      })
    );

    // Batch upsert to HelixDB
    let result: BatchMutationResult;
    try {
      result = await batchUpsertTradeDecisions(helix, nodesWithEmbeddings);
    } catch (error) {
      const errorMsg = `Failed to write to HelixDB for cycle ${cycleId}: ${error instanceof Error ? error.message : "Unknown error"}`;

      // biome-ignore lint/suspicious/noConsole: Critical error logging
      console.error(`[persist-memory] ${errorMsg}`);

      throw new MemoryPersistenceError(
        errorMsg,
        "WRITE_FAILED",
        error instanceof Error ? error : undefined
      );
    }

    const errors: string[] = [];
    if (result.failed.length > 0) {
      errors.push(...result.failed.map((f) => `Failed to persist ${f.id}: ${f.error}`));

      // biome-ignore lint/suspicious/noConsole: Partial failure logging
      console.warn(
        `[persist-memory] Partial failure for cycle ${cycleId}: ${result.failed.length}/${decisions.length} decisions failed`
      );
    }

    // If all writes failed, throw an error
    if (result.successful.length === 0 && decisions.length > 0) {
      const errorMsg = `All ${decisions.length} decision writes failed for cycle ${cycleId}`;

      // biome-ignore lint/suspicious/noConsole: Critical error logging
      console.error(`[persist-memory] ${errorMsg}`);

      throw new MemoryPersistenceError(errorMsg, "WRITE_FAILED");
    }

    // Log success
    // biome-ignore lint/suspicious/noConsole: Success logging
    console.log(
      `[persist-memory] Persisted ${result.successful.length}/${decisions.length} decisions for cycle ${cycleId}`
    );

    return {
      persisted: result.successful.length > 0,
      memoryId: result.successful.length > 0 ? `memory-batch-${cycleId}` : undefined,
      nodesCreated: result.successful.length,
      errors,
      // Pass-through for next step
      cycleId,
      decisions,
      regimeLabel,
    };
  },
});
