/**
 * Run Debate Step
 *
 * Step 6: Run Bullish and Bearish researchers in parallel.
 * Part of the DECIDE phase in the OODA loop.
 *
 * Mode selection:
 * - BACKTEST: Uses stub agents (no LLM calls)
 * - PAPER/LIVE: Uses real Mastra agents with LLM
 */

import { withAgentTimeout } from "@cream/agents";
import { createContext, type ExecutionContext, isBacktest, requireEnv } from "@cream/domain";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import {
  type AgentConfigEntry,
  type AgentContext,
  type AgentStreamChunk,
  type BearishResearchOutput,
  type BullishResearchOutput,
  type OnStreamChunk,
  runDebateParallel,
  runDebateParallelStreaming,
} from "../agents/mastra-agents.js";
import { log } from "../logger.js";
import { RunAnalystsOutputSchema } from "./runAnalysts.js";

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

export const RunDebateInputSchema = z.object({
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
  // Analyst outputs from previous step
  analystOutputs: RunAnalystsOutputSchema,
});

const ResearchSchema = z.object({
  instrument_id: z.string(),
  thesis: z.string(),
  supporting_factors: z.array(
    z.object({
      factor: z.string(),
      source: z.string(),
      strength: z.string(),
    })
  ),
  conviction_level: z.number(),
  memory_case_ids: z.array(z.string()),
  strongest_counterargument: z.string(),
});

export const RunDebateOutputSchema = z.object({
  bullish: z.array(ResearchSchema),
  bearish: z.array(ResearchSchema),
  durationMs: z.number(),
  mode: z.enum(["STUB", "LLM"]),
});

export type RunDebateInput = z.infer<typeof RunDebateInputSchema>;
export type RunDebateOutput = z.infer<typeof RunDebateOutputSchema>;

// ============================================
// Default Timeout
// ============================================

const DEFAULT_AGENT_TIMEOUT_MS = 1_800_000; // 30 minutes per agent

// ============================================
// Stub Implementations (for BACKTEST mode)
// ============================================

async function runBullishResearcherStub(instruments: string[]): Promise<BullishResearchOutput[]> {
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    thesis: "Potential for breakout if resistance breaks.",
    supporting_factors: [
      { factor: "Strong earnings", source: "FUNDAMENTAL", strength: "MODERATE" },
    ],
    conviction_level: 0.4,
    memory_case_ids: [],
    strongest_counterargument: "High valuation limits upside",
  }));
}

async function runBearishResearcherStub(instruments: string[]): Promise<BearishResearchOutput[]> {
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    thesis: "Elevated valuation creates downside risk.",
    supporting_factors: [{ factor: "High P/E", source: "FUNDAMENTAL", strength: "MODERATE" }],
    conviction_level: 0.4,
    memory_case_ids: [],
    strongest_counterargument: "Strong earnings momentum",
  }));
}

// ============================================
// Step Implementation
// ============================================

export const runDebateStep = createStep({
  id: "run-debate",
  description: "Run Bullish and Bearish researchers in parallel",
  inputSchema: RunDebateInputSchema,
  outputSchema: RunDebateOutputSchema,
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
      analystOutputs,
    } = inputData;

    const ctx = createStepContext();
    const startTime = Date.now();

    // In BACKTEST mode, use stub implementations
    if (isBacktest(ctx)) {
      log.debug({ cycleId, phase: "debate", mode: "STUB" }, "Running debate stubs");

      const [bullish, bearish] = await Promise.all([
        runBullishResearcherStub(symbols),
        runBearishResearcherStub(symbols),
      ]);

      return {
        bullish,
        bearish,
        durationMs: Date.now() - startTime,
        mode: "STUB" as const,
      };
    }

    // In PAPER/LIVE mode, use real Mastra agents
    log.info({ cycleId, phase: "debate" }, "Starting debate phase");

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

    const result = await withAgentTimeout(
      useStreaming
        ? runDebateParallelStreaming(agentContext, analystOutputs, streamChunkHandler)
        : runDebateParallel(agentContext, analystOutputs),
      agentTimeoutMs * 2, // 2 agents running
      "debate"
    );

    const durationMs = Date.now() - startTime;

    if (result.timedOut) {
      log.warn({ cycleId, phase: "debate", durationMs }, "Research agents timed out");
      throw new Error("Research agents timed out");
    }

    if (result.errored) {
      log.error(
        { cycleId, phase: "debate", error: result.error, durationMs },
        "Research agents failed"
      );
      throw new Error(`Research agents failed: ${result.error}`);
    }

    const debateOutputs = result.result;

    // Validate outputs
    if (!debateOutputs.bullish || !debateOutputs.bearish) {
      const missing = [
        !debateOutputs.bullish && "bullish",
        !debateOutputs.bearish && "bearish",
      ].filter(Boolean);
      throw new Error(`Research agents returned undefined outputs: ${missing.join(", ")}`);
    }

    log.info(
      {
        cycleId,
        phase: "debate",
        bullishCount: debateOutputs.bullish.length,
        bearishCount: debateOutputs.bearish.length,
        durationMs,
      },
      "Debate phase complete"
    );

    return {
      bullish: debateOutputs.bullish,
      bearish: debateOutputs.bearish,
      durationMs,
      mode: "LLM" as const,
    };
  },
});

export default runDebateStep;
