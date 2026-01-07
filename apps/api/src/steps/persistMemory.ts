/**
 * Persist Memory Step
 *
 * Step 11: Store decision + outcome in HelixDB for future reference.
 *
 * Creates TradeDecision nodes in HelixDB for each decision in the plan.
 * These nodes are later used by retrieveMemory for GraphRAG retrieval.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import { env, isBacktest } from "@cream/domain";
import {
  batchUpsertTradeDecisions,
  createHelixClientFromEnv,
  type HelixClient,
  type NodeWithEmbedding,
} from "@cream/helix";
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
// Client Singletons
// ============================================

let helixClient: HelixClient | null = null;
let embeddingClient: EmbeddingClient | null = null;

function getHelixClient(): HelixClient | null {
  if (helixClient) {
    return helixClient;
  }

  try {
    helixClient = createHelixClientFromEnv();
    return helixClient;
  } catch {
    return null;
  }
}

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
 * Map CREAM_ENV to HelixDB Environment
 */
function mapEnvironment(): Environment {
  switch (env.CREAM_ENV) {
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
function toTradeDecision(decision: Decision, cycleId: string, regimeLabel: string): TradeDecision {
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
    environment: mapEnvironment(),
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

export const persistMemoryStep = createStep({
  id: "persist-memory",
  description: "Store decision + outcome in HelixDB",
  inputSchema: PersistMemoryInputSchema,
  outputSchema: PersistMemoryOutputSchema,
  retries: 3,
  execute: async ({ inputData }) => {
    const {
      ordersSubmitted,
      orderIds,
      cycleId = `cycle-${Date.now()}`,
      decisions = [],
      regimeLabel = "UNKNOWN",
    } = inputData;

    // In backtest mode, skip memory persistence for faster execution
    if (isBacktest()) {
      return {
        persisted: true,
        memoryId: `backtest-memory-${Date.now()}`,
        nodesCreated: 0,
        errors: [],
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

    // Get HelixDB client
    const helix = getHelixClient();
    if (!helix) {
      // HelixDB not available - return mock success
      return {
        persisted: true,
        memoryId: `memory-batch-${Date.now()}`,
        nodesCreated: orderIds.length,
        errors: ["HelixDB client not available - persistence skipped"],
        // Pass-through for next step
        cycleId,
        decisions,
        regimeLabel,
      };
    }

    // Get embedding client (optional - persistence still works without embeddings)
    const embedder = getEmbeddingClient();

    // Convert decisions to TradeDecision nodes with embeddings
    const nodesWithEmbeddings: NodeWithEmbedding<TradeDecision>[] = await Promise.all(
      decisions.map(async (decision) => {
        const node = toTradeDecision(decision, cycleId, regimeLabel);
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
    const result = await batchUpsertTradeDecisions(helix, nodesWithEmbeddings);

    const errors: string[] = [];
    if (result.failed.length > 0) {
      errors.push(...result.failed.map((f) => `Failed to persist ${f.id}: ${f.error}`));
    }

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
