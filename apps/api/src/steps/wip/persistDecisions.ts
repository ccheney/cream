/**
 * Persist Decisions Step
 *
 * Step 9: Persist approved decisions to the database.
 * Part of the ACT phase in the OODA loop.
 *
 * Stores decision records in Turso for:
 * - Audit trail and compliance
 * - Performance tracking
 * - Agent learning (via HelixDB ingestion in later step)
 */

import { createContext, type ExecutionContext, isBacktest, requireEnv } from "@cream/domain";
import type { DecisionPlan } from "@cream/mastra-kit";
import type { CreateDecisionInput } from "@cream/storage";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { getDecisionsRepo } from "../db.js";
import { log } from "../logger.js";
import { RunConsensusOutputSchema } from "./runConsensus.js";

// ============================================
// Types
// ============================================

/**
 * Create ExecutionContext for step invocation.
 */
function createStepContext(): ExecutionContext {
  return createContext(requireEnv(), "scheduled");
}

// ============================================
// Input/Output Schemas
// ============================================

export const PersistDecisionsInputSchema = z.object({
  cycleId: z.string(),
  environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),
  regimeLabel: z.string().optional(),
  consensusOutput: RunConsensusOutputSchema,
});

export const PersistDecisionsOutputSchema = z.object({
  persisted: z.number(),
  skipped: z.number(),
  failed: z.number(),
  decisionIds: z.array(z.string()),
  errors: z.array(z.string()),
});

export type PersistDecisionsInput = z.infer<typeof PersistDecisionsInputSchema>;
export type PersistDecisionsOutput = z.infer<typeof PersistDecisionsOutputSchema>;

// ============================================
// Step Implementation
// ============================================

export const persistDecisionsStep = createStep({
  id: "persist-decisions",
  description: "Persist approved decisions to database",
  inputSchema: PersistDecisionsInputSchema,
  outputSchema: PersistDecisionsOutputSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    const { cycleId, environment, regimeLabel, consensusOutput } = inputData;

    const ctx = createStepContext();
    const plan = consensusOutput.plan as DecisionPlan;
    const { approved } = consensusOutput;

    // If no decisions to persist, return early
    if (!plan.decisions || plan.decisions.length === 0) {
      return {
        persisted: 0,
        skipped: 0,
        failed: 0,
        decisionIds: [],
        errors: [],
      };
    }

    log.info({ cycleId, decisionCount: plan.decisions.length }, "Persisting decisions to database");

    // In BACKTEST mode, skip persistence for faster execution
    if (isBacktest(ctx)) {
      log.debug({ cycleId, mode: "BACKTEST" }, "Skipping decision persistence in backtest mode");
      return {
        persisted: 0,
        skipped: plan.decisions.length,
        failed: 0,
        decisionIds: plan.decisions.map((d) => d.decisionId),
        errors: ["Skipped in backtest mode"],
      };
    }

    // Get decisions repository
    const decisionsRepo = await getDecisionsRepo();
    const persistedDecisions: string[] = [];
    const errors: string[] = [];
    const skipped = 0;

    for (const decision of plan.decisions) {
      try {
        const decisionInput: CreateDecisionInput = {
          id: decision.decisionId,
          cycleId,
          symbol: decision.instrumentId,
          action: decision.action as "BUY" | "SELL" | "HOLD" | "CLOSE",
          direction: decision.direction as "LONG" | "SHORT" | "FLAT",
          size: decision.size.value,
          sizeUnit: decision.size.unit,
          entryPrice: null, // Will be set when order fills
          stopPrice: decision.stopLoss?.price ?? null,
          targetPrice: decision.takeProfit?.price ?? null,
          status: approved ? "approved" : "rejected",
          strategyFamily: decision.strategyFamily ?? null,
          timeHorizon: decision.timeHorizon ?? null,
          rationale: decision.rationale?.summary ?? null,
          bullishFactors: decision.rationale?.bullishFactors ?? [],
          bearishFactors: decision.rationale?.bearishFactors ?? [],
          decisionLogic: decision.rationale?.decisionLogic ?? null,
          memoryReferenceIds: decision.rationale?.memoryReferences ?? [],
          confidence: decision.confidence ?? null,
          regimeLabel: regimeLabel ?? null,
          environment,
          thesisId: ((decision as Record<string, unknown>).thesisId as string | null) ?? null,
        };

        await decisionsRepo.create(decisionInput);
        persistedDecisions.push(decision.decisionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to persist ${decision.decisionId}: ${message}`);
        log.error(
          { cycleId, decisionId: decision.decisionId, error: message },
          "Failed to persist decision"
        );
      }
    }

    log.info(
      {
        cycleId,
        persisted: persistedDecisions.length,
        skipped,
        failed: errors.length,
      },
      "Decision persistence complete"
    );

    return {
      persisted: persistedDecisions.length,
      skipped,
      failed: errors.length,
      decisionIds: persistedDecisions,
      errors,
    };
  },
});

export default persistDecisionsStep;
