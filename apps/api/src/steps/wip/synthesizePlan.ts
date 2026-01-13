/**
 * Synthesize Plan Step
 *
 * Step 7: Trader agent creates DecisionPlan from research outputs.
 * Part of the DECIDE phase in the OODA loop.
 *
 * THESIS INTEGRATION:
 * - For new opportunities: Creates thesis in WATCHING state
 * - For entries (BUY/SELL with position): Transitions thesis WATCHING → ENTERED
 * - For exits (CLOSE): Transitions thesis to EXITING or CLOSED
 *
 * Mode selection:
 * - BACKTEST: Uses stub agents (no LLM calls)
 * - PAPER/LIVE: Uses real Mastra agents with LLM
 */

import type { PortfolioStateResponse } from "@cream/agents";
import { getPortfolioState, withAgentTimeout } from "@cream/agents";
import { createContext, type ExecutionContext, isBacktest, requireEnv } from "@cream/domain";
import type { ThesisStateRepository } from "@cream/storage";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
  type AgentConfigEntry,
  type AgentContext,
  type AgentStreamChunk,
  type DecisionPlan,
  type OnStreamChunk,
  runTrader,
  runTraderStreaming,
} from "../agents/mastra-agents.js";
import { getThesisStateRepo } from "../db.js";
import { log } from "../logger.js";
import { RunAnalystsOutputSchema } from "./runAnalysts.js";
import { RunDebateOutputSchema } from "./runDebate.js";

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

export const SynthesizePlanInputSchema = z.object({
  cycleId: z.string(),
  symbols: z.array(z.string()),
  snapshots: z.record(z.string(), z.any()),
  memory: z.object({
    relevantCases: z.array(z.any()),
  }),
  externalContext: z.object({
    news: z.array(z.any()),
    macroIndicators: z.record(z.string(), z.number()),
    sentiment: z.record(z.string(), z.number()),
  }),
  regimeLabels: z.record(
    z.string(),
    z.object({
      regime: z.string(),
      confidence: z.number(),
      reasoning: z.string().optional(),
    })
  ),
  predictionMarketSignals: z.any().optional(),
  agentConfigs: z.record(z.string(), z.any()).optional(),
  agentTimeoutMs: z.number().optional(),
  useStreaming: z.boolean().optional(),
  environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),
  // Previous step outputs
  analystOutputs: RunAnalystsOutputSchema,
  debateOutputs: RunDebateOutputSchema,
});

const DecisionSchema = z.object({
  decisionId: z.string(),
  instrumentId: z.string(),
  action: z.enum(["BUY", "SELL", "HOLD", "CLOSE"]),
  direction: z.enum(["LONG", "SHORT", "FLAT"]),
  size: z.object({
    value: z.number(),
    unit: z.string(),
  }),
  strategyFamily: z.string().optional(),
  timeHorizon: z.string().optional(),
  rationale: z
    .object({
      summary: z.string(),
      bullishFactors: z.array(z.string()),
      bearishFactors: z.array(z.string()),
      decisionLogic: z.string(),
      memoryReferences: z.array(z.string()),
    })
    .optional(),
  stopLoss: z.object({ price: z.number() }).optional(),
  takeProfit: z.object({ price: z.number() }).optional(),
  thesisState: z.string(),
  thesisId: z.string().optional(),
});

export const SynthesizePlanOutputSchema = z.object({
  plan: z.object({
    cycleId: z.string(),
    timestamp: z.string(),
    decisions: z.array(DecisionSchema),
    portfolioNotes: z.string().optional(),
  }),
  thesisUpdates: z.array(
    z.object({
      thesisId: z.string(),
      instrumentId: z.string(),
      action: z.string(),
      previousState: z.string().optional(),
      newState: z.string(),
    })
  ),
  durationMs: z.number(),
  mode: z.enum(["STUB", "LLM"]),
});

export type SynthesizePlanInput = z.infer<typeof SynthesizePlanInputSchema>;
export type SynthesizePlanOutput = z.infer<typeof SynthesizePlanOutputSchema>;

// ============================================
// Default Timeout
// ============================================

const DEFAULT_AGENT_TIMEOUT_MS = 1_800_000; // 30 minutes per agent

// ============================================
// Thesis Management
// ============================================

interface ThesisUpdate {
  thesisId: string;
  instrumentId: string;
  action: string;
  previousState?: string;
  newState: string;
}

/**
 * Process thesis lifecycle based on decision.
 * Returns the thesis ID and any state changes made.
 */
async function processThesisForDecision(
  repo: ThesisStateRepository,
  decision: DecisionPlan["decisions"][0],
  environment: string,
  cycleId: string,
  currentPrice?: number
): Promise<ThesisUpdate | null> {
  const { instrumentId, action, direction, stopLoss, takeProfit, rationale } = decision;

  // Look up existing thesis for this instrument
  const existingThesis = await repo.findActiveForInstrument(instrumentId, environment);

  // Handle based on action
  switch (action) {
    case "HOLD": {
      // HOLD doesn't change thesis state
      if (existingThesis) {
        return null; // No update needed
      }
      // If no thesis exists and we're watching, create one
      if (direction === "FLAT") {
        const thesisId = `thesis-${instrumentId}-${Date.now()}`;
        await repo.create({
          thesisId,
          instrumentId,
          state: "WATCHING",
          entryThesis: rationale?.summary ?? "Monitoring opportunity",
          invalidationConditions: rationale?.bearishFactors?.join("; "),
          conviction: decision.confidence,
          environment,
        });
        return {
          thesisId,
          instrumentId,
          action: "CREATE",
          newState: "WATCHING",
        };
      }
      return null;
    }

    case "BUY":
    case "SELL": {
      if (existingThesis) {
        // Transition existing thesis based on current state
        const fromState = existingThesis.state;

        if (fromState === "WATCHING") {
          // Entry: WATCHING → ENTERED
          const entryPrice = currentPrice ?? 0;
          const stopPrice = stopLoss?.price ?? entryPrice * 0.95;
          const targetPrice = takeProfit?.price;

          await repo.enterPosition(
            existingThesis.thesisId,
            entryPrice,
            stopPrice,
            targetPrice,
            cycleId
          );

          return {
            thesisId: existingThesis.thesisId,
            instrumentId,
            action: "ENTER",
            previousState: fromState,
            newState: "ENTERED",
          };
        }

        if (fromState === "ENTERED" || fromState === "MANAGING") {
          // Adding to position: ENTERED/MANAGING → ADDING
          await repo.transitionState(existingThesis.thesisId, {
            toState: "ADDING",
            triggerReason: "Adding to position",
            cycleId,
            priceAtTransition: currentPrice,
          });
          await repo.incrementAddCount(existingThesis.thesisId);

          return {
            thesisId: existingThesis.thesisId,
            instrumentId,
            action: "ADD",
            previousState: fromState,
            newState: "ADDING",
          };
        }

        // Already in ADDING or other state
        return null;
      }

      // No existing thesis - create new one in WATCHING then immediately enter
      const thesisId = `thesis-${instrumentId}-${Date.now()}`;
      await repo.create({
        thesisId,
        instrumentId,
        state: "WATCHING",
        entryThesis: rationale?.summary ?? `${action} signal detected`,
        invalidationConditions: rationale?.bearishFactors?.join("; "),
        conviction: decision.confidence,
        currentStop: stopLoss?.price,
        currentTarget: takeProfit?.price,
        environment,
      });

      // Immediately transition to ENTERED
      const entryPrice = currentPrice ?? 0;
      const stopPrice = stopLoss?.price ?? entryPrice * 0.95;
      await repo.enterPosition(thesisId, entryPrice, stopPrice, takeProfit?.price, cycleId);

      return {
        thesisId,
        instrumentId,
        action: "CREATE_AND_ENTER",
        newState: "ENTERED",
      };
    }

    case "CLOSE": {
      if (!existingThesis) {
        return null; // Nothing to close
      }

      // Close the thesis
      const closeReason = decision.closeReason ?? "MANUAL";
      await repo.close(
        existingThesis.thesisId,
        closeReason as
          | "STOP_HIT"
          | "TARGET_HIT"
          | "INVALIDATED"
          | "MANUAL"
          | "TIME_DECAY"
          | "CORRELATION",
        currentPrice,
        decision.realizedPnl,
        cycleId
      );

      return {
        thesisId: existingThesis.thesisId,
        instrumentId,
        action: "CLOSE",
        previousState: existingThesis.state,
        newState: "CLOSED",
      };
    }

    default:
      return null;
  }
}

// ============================================
// Stub Implementations (for BACKTEST mode)
// ============================================

interface WorkflowDecisionPlan {
  cycleId: string;
  timestamp: string;
  decisions: Array<{
    decisionId: string;
    instrumentId: string;
    action: "BUY" | "SELL" | "HOLD" | "CLOSE";
    direction: "LONG" | "SHORT" | "FLAT";
    size: { value: number; unit: string };
    strategyFamily: string;
    timeHorizon: string;
    rationale: {
      summary: string;
      bullishFactors: string[];
      bearishFactors: string[];
      decisionLogic: string;
      memoryReferences: string[];
    };
    thesisState: string;
    confidence?: number;
    closeReason?: string;
    realizedPnl?: number;
  }>;
  portfolioNotes: string;
}

async function runTraderAgentStub(
  cycleId: string,
  bullish: Array<{ instrument_id: string }>,
  _bearish: Array<{ instrument_id: string }>
): Promise<WorkflowDecisionPlan> {
  return {
    cycleId,
    timestamp: new Date().toISOString(),
    decisions: bullish.map((br) => ({
      decisionId: `dec-${br.instrument_id}-${Date.now()}`,
      instrumentId: br.instrument_id,
      action: "HOLD" as const,
      direction: "FLAT" as const,
      size: { value: 0, unit: "SHARES" },
      strategyFamily: "EQUITY_LONG",
      timeHorizon: "SWING",
      rationale: {
        summary: "No clear edge. Bull and bear cases balanced.",
        bullishFactors: ["Strong earnings"],
        bearishFactors: ["High valuation"],
        decisionLogic: "Conviction delta < 0.2, staying flat",
        memoryReferences: [],
      },
      thesisState: "WATCHING",
    })),
    portfolioNotes: "No new positions. Monitoring for clearer setups.",
  };
}

// ============================================
// Step Implementation
// ============================================

export const synthesizePlanStep = createStep({
  id: "synthesize-plan",
  description: "Trader agent creates DecisionPlan with thesis integration",
  inputSchema: SynthesizePlanInputSchema,
  outputSchema: SynthesizePlanOutputSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    const {
      cycleId,
      symbols,
      snapshots,
      memory,
      externalContext,
      regimeLabels,
      predictionMarketSignals,
      agentConfigs,
      agentTimeoutMs = DEFAULT_AGENT_TIMEOUT_MS,
      useStreaming = false,
      environment,
      analystOutputs: _analystOutputs,
      debateOutputs,
    } = inputData;

    const ctx = createStepContext();
    const startTime = Date.now();

    // Get thesis repository for lifecycle management
    const thesisRepo = await getThesisStateRepo();
    const thesisUpdates: ThesisUpdate[] = [];

    // In BACKTEST mode, use stub implementations
    if (isBacktest(ctx)) {
      log.debug({ cycleId, phase: "trader", mode: "STUB" }, "Running trader stub");

      const plan = await runTraderAgentStub(cycleId, debateOutputs.bullish, debateOutputs.bearish);

      // Still process thesis updates in backtest for consistency
      for (const decision of plan.decisions) {
        const update = await processThesisForDecision(
          thesisRepo,
          decision as DecisionPlan["decisions"][0],
          environment,
          cycleId,
          snapshots[decision.instrumentId]?.latestPrice
        );
        if (update) {
          thesisUpdates.push(update);
        }
      }

      return {
        plan,
        thesisUpdates,
        durationMs: Date.now() - startTime,
        mode: "STUB" as const,
      };
    }

    // In PAPER/LIVE mode, use real Mastra agents
    log.info({ cycleId, phase: "trader" }, "Starting trader phase");

    // Fetch portfolio state for position-aware decisions
    let portfolioState: PortfolioStateResponse | undefined;
    try {
      portfolioState = await getPortfolioState(ctx);
      log.info(
        {
          cycleId,
          phase: "trader",
          positionCount: portfolioState.positions.length,
          buyingPower: portfolioState.buyingPower,
        },
        "Fetched portfolio state for trader"
      );
    } catch (error) {
      log.warn(
        { cycleId, phase: "trader", error: error instanceof Error ? error.message : String(error) },
        "Failed to fetch portfolio state, continuing without position context"
      );
    }

    const agentContext: AgentContext = {
      cycleId,
      symbols,
      snapshots,
      memory: { relevantCases: memory.relevantCases },
      externalContext,
      regimeLabels,
      predictionMarketSignals,
      agentConfigs: agentConfigs as Record<string, AgentConfigEntry> | undefined,
    };

    // Stream handler (no-op if not streaming)
    const streamChunkHandler: OnStreamChunk = (_chunk: AgentStreamChunk) => {
      // Streaming is handled at the workflow level via writer
    };

    // Cast for agent function compatibility
    const portfolioStateRecord = portfolioState as Record<string, unknown> | undefined;

    const result = await withAgentTimeout(
      useStreaming
        ? runTraderStreaming(agentContext, debateOutputs, streamChunkHandler, portfolioStateRecord)
        : runTrader(agentContext, debateOutputs, portfolioStateRecord),
      agentTimeoutMs,
      "trader"
    );

    const durationMs = Date.now() - startTime;

    if (result.timedOut) {
      log.warn({ cycleId, phase: "trader", durationMs }, "Trader agent timed out");
      throw new Error("Trader agent timed out");
    }

    if (result.errored) {
      log.error(
        { cycleId, phase: "trader", error: result.error, durationMs },
        "Trader agent failed"
      );
      throw new Error(`Trader agent failed: ${result.error}`);
    }

    const plan = result.result;

    log.info(
      {
        cycleId,
        phase: "trader",
        decisionCount: plan.decisions.length,
        decisions: plan.decisions.map((d) => ({
          symbol: d.instrumentId,
          action: d.action,
          direction: d.direction,
          size: d.size,
        })),
      },
      "Trader phase complete"
    );

    // Process thesis lifecycle for each decision
    for (const decision of plan.decisions) {
      const currentPrice = snapshots[decision.instrumentId]?.latestPrice;
      const update = await processThesisForDecision(
        thesisRepo,
        decision,
        environment,
        cycleId,
        currentPrice
      );
      if (update) {
        thesisUpdates.push(update);
        // Attach thesis ID to decision for downstream steps
        (decision as Record<string, unknown>).thesisId = update.thesisId;
      }
    }

    if (thesisUpdates.length > 0) {
      log.info(
        {
          cycleId,
          phase: "trader",
          thesisUpdates: thesisUpdates.map((u) => ({
            thesisId: u.thesisId,
            action: u.action,
            newState: u.newState,
          })),
        },
        "Thesis lifecycle updates applied"
      );
    }

    return {
      plan,
      thesisUpdates,
      durationMs,
      mode: "LLM" as const,
    };
  },
});

export default synthesizePlanStep;
