/**
 * Ingest Thesis Memory Step
 *
 * Step 12: Ingest closed theses into HelixDB for agent learning.
 *
 * When theses are marked as CLOSED by agent decisions, this step:
 * 1. Closes them in Turso (updating state to CLOSED)
 * 2. Ingests them into HelixDB as ThesisMemory nodes
 *
 * This enables agents to learn from past thesis outcomes:
 * - Bullish Research retrieves similar winning theses
 * - Bearish Research retrieves similar losing theses
 *
 * @see packages/helix-schema/src/thesisMemory.ts - ThesisMemory types
 * @see apps/api/workflows/steps/thesisMemoryIngestion.ts - Core ingestion logic
 */

import {
  type CreamEnvironment,
  createContext,
  env,
  type ExecutionContext,
  isBacktest,
} from "@cream/domain";
import type { Thesis, ThesisStateRepository } from "@cream/storage";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

/**
 * Create ExecutionContext for step invocation.
 * Steps are invoked by the Mastra workflow during scheduled runs.
 */
function createStepContext(): ExecutionContext {
  const envValue = process.env.CREAM_ENV || "BACKTEST";
  return createContext(envValue as CreamEnvironment, "scheduled");
}
import {
  ingestClosedThesis,
  type ThesisIngestionInput,
  type ThesisIngestionResult,
} from "../../workflows/steps/thesisMemoryIngestion.js";
import { getThesisStateRepo } from "../db.js";
import { PersistMemoryOutputSchema } from "./persistMemory.js";

// ============================================
// Schemas
// ============================================

/**
 * Input schema - receives output from persistMemory step
 * Extends PersistMemoryOutputSchema with optional environment override
 */
export const IngestThesisMemoryInputSchema = PersistMemoryOutputSchema.extend({
  environment: z.enum(["BACKTEST", "PAPER", "LIVE"]).optional(),
});

/**
 * Output schema - ingestion results
 */
export const IngestThesisMemoryOutputSchema = z.object({
  processed: z.number(),
  ingested: z.number(),
  skipped: z.number(),
  failed: z.number(),
  thesisIds: z.array(z.string()),
  errors: z.array(z.string()),
});

export type IngestThesisMemoryInput = z.infer<typeof IngestThesisMemoryInputSchema>;
export type IngestThesisMemoryOutput = z.infer<typeof IngestThesisMemoryOutputSchema>;

// ============================================
// Helper Functions
// ============================================

/**
 * Map decision close reason to thesis close reason
 */
function mapCloseReason(
  reason?: string
): "STOP_HIT" | "TARGET_HIT" | "INVALIDATED" | "MANUAL" | "TIME_DECAY" | "CORRELATION" {
  switch (reason?.toUpperCase()) {
    case "STOP_HIT":
    case "STOP":
      return "STOP_HIT";
    case "TARGET_HIT":
    case "TARGET":
      return "TARGET_HIT";
    case "INVALIDATED":
    case "INVALID":
      return "INVALIDATED";
    case "TIME_DECAY":
    case "DECAY":
      return "TIME_DECAY";
    case "CORRELATION":
      return "CORRELATION";
    default:
      return "MANUAL";
  }
}

/**
 * Find and close thesis for instrument, then prepare for ingestion
 */
async function closeAndPrepareThesis(
  repo: ThesisStateRepository,
  instrumentId: string,
  environment: string,
  closeReason: string | undefined,
  exitPrice: number | undefined,
  realizedPnl: number | undefined,
  cycleId: string
): Promise<Thesis | null> {
  // Find active thesis for this instrument
  const thesis = await repo.findActiveForInstrument(instrumentId, environment);

  if (!thesis) {
    return null;
  }

  // Skip if already closed
  if (thesis.state === "CLOSED") {
    return thesis;
  }

  // Close the thesis in Turso
  const closedThesis = await repo.close(
    thesis.thesisId,
    mapCloseReason(closeReason),
    exitPrice,
    realizedPnl,
    cycleId
  );

  return closedThesis;
}

// ============================================
// Step Implementation
// ============================================

export const ingestThesisMemoryStep = createStep({
  id: "ingest-thesis-memory",
  description: "Ingest closed theses into HelixDB for agent learning",
  inputSchema: IngestThesisMemoryInputSchema,
  outputSchema: IngestThesisMemoryOutputSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    // Create context at step boundary
    const ctx = createStepContext();

    const {
      cycleId = `cycle-${Date.now()}`,
      decisions = [],
      regimeLabel = "UNKNOWN",
      environment = ctx.environment,
    } = inputData;

    // Filter for decisions that close theses
    const closingDecisions = decisions.filter((d) => d.thesisState === "CLOSED");

    // If no theses to close, return early
    if (closingDecisions.length === 0) {
      return {
        processed: 0,
        ingested: 0,
        skipped: 0,
        failed: 0,
        thesisIds: [],
        errors: [],
      };
    }

    // In backtest mode, skip memory ingestion for performance
    // (can be backfilled later via batch ingestion)
    if (isBacktest(ctx)) {
      return {
        processed: closingDecisions.length,
        ingested: 0,
        skipped: closingDecisions.length,
        failed: 0,
        thesisIds: [],
        errors: ["Skipped in backtest mode - use batch backfill for historical theses"],
      };
    }

    // Get thesis repository
    const thesisRepo = await getThesisStateRepo();

    const results: {
      thesisId?: string;
      result?: ThesisIngestionResult;
      error?: string;
    }[] = [];

    // Process each closing decision
    for (const decision of closingDecisions) {
      try {
        // Close thesis in Turso
        const closedThesis = await closeAndPrepareThesis(
          thesisRepo,
          decision.instrumentId,
          environment,
          decision.closeReason,
          decision.exitPrice,
          decision.realizedPnl,
          cycleId
        );

        if (!closedThesis) {
          results.push({
            error: `No active thesis found for ${decision.instrumentId}`,
          });
          continue;
        }

        // Prepare ingestion input
        const ingestionInput: ThesisIngestionInput = {
          thesis: closedThesis,
          entryRegime: regimeLabel, // Use current regime as entry regime approximation
          exitRegime: regimeLabel, // Current regime at exit
          relatedDecisionIds: [decision.decisionId],
        };

        // Ingest into HelixDB
        const ingestionResult = await ingestClosedThesis(ingestionInput);

        results.push({
          thesisId: closedThesis.thesisId,
          result: ingestionResult,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          error: `Failed to process ${decision.instrumentId}: ${message}`,
        });
      }
    }

    // Aggregate results
    const ingested = results.filter((r) => r.result?.success).length;
    const skipped = results.filter((r) => r.result?.skippedReason).length;
    const failed = results.filter((r) => r.error || r.result?.error).length;
    const thesisIds = results
      .filter((r) => r.thesisId)
      .map((r) => r.thesisId)
      .filter((id): id is string => id !== undefined);
    const errors = results
      .map((r) => r.error ?? r.result?.error ?? r.result?.skippedReason)
      .filter((e): e is string => e !== undefined);

    return {
      processed: closingDecisions.length,
      ingested,
      skipped,
      failed,
      thesisIds,
      errors,
    };
  },
});

export default ingestThesisMemoryStep;
