/**
 * Trading Cycle Workflow (Mastra Step-Based)
 *
 * Implements the OODA loop (Observe → Orient → Decide → Act) for trading decisions.
 * Uses extracted step logic while maintaining compatibility with the existing system.
 *
 * IMPORTANT: This workflow is under development. Use USE_MASTRA_WORKFLOW=true
 * to enable it. The default (inline) implementation is in trading-cycle.ts.
 *
 * Steps:
 * OBSERVE Phase:
 *   1. loadState - Load portfolio positions, open orders, thesis states from Turso
 *   2. buildSnapshot - Build feature snapshots for universe symbols
 *
 * ORIENT Phase:
 *   3. retrieveMemory - Fetch relevant memories from HelixDB
 *   4. gatherExternalContext - Get news, sentiment, macro context
 *   5. checkResearchTriggers - Check for conditions requiring autonomous research
 *
 * DECIDE Phase:
 *   6. runAnalysts - Run Technical, News, Fundamentals analysts
 *   7. runDebate - Run Bull vs Bear debate agents
 *   8. synthesizePlan - Trader agent creates DecisionPlan with thesis lifecycle
 *   9. runConsensus - Risk Manager + Critic approve/revise plan
 *
 * ACT Phase:
 *   10. executeOrders - Send approved orders to execution engine
 *   11. persistDecisions - Store decisions in database
 *   12. persistMemory - Store decision + outcome in HelixDB
 *   13. ingestThesisMemory - Ingest closed theses into HelixDB
 *
 * @see docs/plans/21-mastra-workflow-refactor.md
 */

import { createContext, type ExecutionContext, requireEnv } from "@cream/domain";
import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { log } from "../logger.js";

// ============================================
// Workflow Definition (Stub for now)
// ============================================

/**
 * Create ExecutionContext for workflow invocation.
 */
function createWorkflowContext(): ExecutionContext {
  return createContext(requireEnv(), "scheduled");
}

export const tradingCycleWorkflow = createWorkflow({
  id: "trading-cycle-mastra",
  description: "OODA loop for hourly trading decisions with thesis lifecycle (Mastra)",
  inputSchema: z.object({
    cycleId: z.string(),
    environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),
    triggerTime: z.string(),
    useDraftConfig: z.boolean().optional(),
    instruments: z.array(z.string()).optional(),
    useStreaming: z.boolean().optional(),
  }),
  outputSchema: z.object({
    cycleId: z.string(),
    success: z.boolean(),
    approved: z.boolean(),
    ordersExecuted: z.number(),
    memoryId: z.string().optional(),
    thesisUpdates: z.array(z.any()),
    researchTriggered: z.boolean(),
    hypothesisId: z.string().optional(),
  }),
});

// ============================================
// Type Exports
// ============================================

export type TradingCycleInput = z.infer<typeof tradingCycleWorkflow.inputSchema>;
export type TradingCycleOutput = z.infer<typeof tradingCycleWorkflow.outputSchema>;

// ============================================
// Execution Helper
// ============================================

/**
 * Execute the trading cycle workflow.
 *
 * NOTE: This is a placeholder that calls the inline implementation.
 * The full step-based implementation is in development.
 *
 * @param input - Workflow input parameters
 * @returns Workflow result
 */
export async function executeTradingCycle(input: TradingCycleInput): Promise<TradingCycleOutput> {
  const _ctx = createWorkflowContext();

  log.info(
    {
      cycleId: input.cycleId,
      environment: input.environment,
      instruments: input.instruments,
    },
    "Executing trading cycle (Mastra workflow - placeholder)"
  );

  // TODO: Implement step-by-step execution once type issues are resolved
  // For now, return a placeholder result
  return {
    cycleId: input.cycleId,
    success: false,
    approved: false,
    ordersExecuted: 0,
    thesisUpdates: [],
    researchTriggered: false,
  };
}
