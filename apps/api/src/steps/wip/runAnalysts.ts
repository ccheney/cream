/**
 * Run Analysts Step
 *
 * Step 5: Run Technical, News, and Fundamentals analysts in parallel.
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
  type FundamentalsAnalysisOutput,
  type OnStreamChunk,
  runAnalystsParallel,
  runAnalystsParallelStreaming,
  type SentimentAnalysisOutput,
  type TechnicalAnalysisOutput,
} from "../agents/mastra-agents.js";
import { log } from "../logger.js";

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

export const RunAnalystsInputSchema = z.object({
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
});

const TechnicalAnalysisSchema = z.object({
  instrument_id: z.string(),
  setup_classification: z.string(),
  key_levels: z.object({
    support: z.array(z.number()),
    resistance: z.array(z.number()),
    pivot: z.number(),
  }),
  trend_assessment: z.string(),
  momentum_assessment: z.string(),
  volatility_assessment: z.string(),
  technical_thesis: z.string(),
  invalidation_conditions: z.array(z.string()),
});

const SentimentAnalysisSchema = z.object({
  instrument_id: z.string(),
  event_impacts: z.array(z.any()),
  overall_sentiment: z.string(),
  sentiment_strength: z.number(),
  duration_expectation: z.string(),
  linked_event_ids: z.array(z.string()),
});

const FundamentalsAnalysisSchema = z.object({
  instrument_id: z.string(),
  fundamental_drivers: z.array(z.string()),
  fundamental_headwinds: z.array(z.string()),
  valuation_context: z.string(),
  macro_context: z.string(),
  event_risk: z.array(z.any()),
  fundamental_thesis: z.string(),
  linked_event_ids: z.array(z.string()),
});

export const RunAnalystsOutputSchema = z.object({
  technical: z.array(TechnicalAnalysisSchema),
  news: z.array(SentimentAnalysisSchema),
  fundamentals: z.array(FundamentalsAnalysisSchema),
  durationMs: z.number(),
  mode: z.enum(["STUB", "LLM"]),
});

export type RunAnalystsInput = z.infer<typeof RunAnalystsInputSchema>;
export type RunAnalystsOutput = z.infer<typeof RunAnalystsOutputSchema>;

// ============================================
// Default Timeout
// ============================================

const DEFAULT_AGENT_TIMEOUT_MS = 1_800_000; // 30 minutes per agent

// ============================================
// Stub Implementations (for BACKTEST mode)
// ============================================

async function runTechnicalAnalystStub(instruments: string[]): Promise<TechnicalAnalysisOutput[]> {
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    setup_classification: "NO_SETUP",
    key_levels: { support: [100], resistance: [110], pivot: 105 },
    trend_assessment: "Neutral, consolidating in range",
    momentum_assessment: "RSI at 50, neutral momentum",
    volatility_assessment: "Normal volatility regime",
    technical_thesis: "No clear setup. Waiting for breakout.",
    invalidation_conditions: ["Break below 100", "Break above 110"],
  }));
}

async function runNewsAnalystStub(instruments: string[]): Promise<SentimentAnalysisOutput[]> {
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    event_impacts: [],
    overall_sentiment: "NEUTRAL",
    sentiment_strength: 0.5,
    duration_expectation: "DAYS",
    linked_event_ids: [],
  }));
}

async function runFundamentalsAnalystStub(
  instruments: string[]
): Promise<FundamentalsAnalysisOutput[]> {
  return instruments.map((instrument) => ({
    instrument_id: instrument,
    fundamental_drivers: ["Strong earnings growth"],
    fundamental_headwinds: ["High valuation"],
    valuation_context: "Trading at 25x P/E",
    macro_context: "Fed on hold, stable rates",
    event_risk: [],
    fundamental_thesis: "Fundamentally sound but priced for perfection.",
    linked_event_ids: [],
  }));
}

// ============================================
// Step Implementation
// ============================================

export const runAnalystsStep = createStep({
  id: "run-analysts",
  description: "Run Technical, News, and Fundamentals analysts in parallel",
  inputSchema: RunAnalystsInputSchema,
  outputSchema: RunAnalystsOutputSchema,
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
    } = inputData;

    const ctx = createStepContext();
    const startTime = Date.now();

    // In BACKTEST mode, use stub implementations
    if (isBacktest(ctx)) {
      log.debug({ cycleId, phase: "analysts", mode: "STUB" }, "Running analyst stubs");

      const [technical, news, fundamentals] = await Promise.all([
        runTechnicalAnalystStub(symbols),
        runNewsAnalystStub(symbols),
        runFundamentalsAnalystStub(symbols),
      ]);

      return {
        technical,
        news,
        fundamentals,
        durationMs: Date.now() - startTime,
        mode: "STUB" as const,
      };
    }

    // In PAPER/LIVE mode, use real Mastra agents
    log.info({ cycleId, symbols, phase: "analysts" }, "Starting analyst phase");

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
        ? runAnalystsParallelStreaming(agentContext, streamChunkHandler)
        : runAnalystsParallel(agentContext),
      agentTimeoutMs * 3, // 3 agents running
      "analysts"
    );

    const durationMs = Date.now() - startTime;

    if (result.timedOut) {
      log.warn({ cycleId, phase: "analysts", durationMs }, "Analyst agents timed out");
      throw new Error("Analyst agents timed out");
    }

    if (result.errored) {
      log.error(
        { cycleId, phase: "analysts", error: result.error, durationMs },
        "Analyst agents failed"
      );
      throw new Error(`Analyst agents failed: ${result.error}`);
    }

    const analystsOutput = result.result;

    // Validate outputs
    if (!analystsOutput.technical || !analystsOutput.news || !analystsOutput.fundamentals) {
      const missing = [
        !analystsOutput.technical && "technical",
        !analystsOutput.news && "news",
        !analystsOutput.fundamentals && "fundamentals",
      ].filter(Boolean);
      throw new Error(`Analyst agents returned undefined outputs: ${missing.join(", ")}`);
    }

    log.info(
      {
        cycleId,
        phase: "analysts",
        technicalCount: analystsOutput.technical.length,
        newsCount: analystsOutput.news.length,
        fundamentalsCount: analystsOutput.fundamentals.length,
        durationMs,
      },
      "Analyst phase complete"
    );

    return {
      technical: analystsOutput.technical,
      news: analystsOutput.news,
      fundamentals: analystsOutput.fundamentals,
      durationMs,
      mode: "LLM" as const,
    };
  },
});

export default runAnalystsStep;
