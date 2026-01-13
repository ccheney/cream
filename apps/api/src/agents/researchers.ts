/**
 * Research agents for constructing bullish and bearish cases.
 *
 * Contains Bullish and Bearish researcher agents for the debate phase.
 */

import type { AgentType } from "@cream/agents";
import { z } from "zod";

import type { AnalystOutputs } from "./analysts.js";
import { buildGenerateOptions, createAgent, getAgentRuntimeSettings } from "./factory.js";
import { buildDatetimeContext, buildIndicatorSummary } from "./prompts.js";
import { BearishResearchSchema, BullishResearchSchema } from "./schemas.js";
import type {
  AgentConfigEntry,
  AgentContext,
  AgentStreamChunk,
  BearishResearchOutput,
  BullishResearchOutput,
  OnStreamChunk,
} from "./types.js";

// Re-export for convenience
export type { AnalystOutputs };

// ============================================
// Agent Instances
// ============================================

/** Bullish Researcher - Constructs the long case */
export const bullishResearcherAgent = createAgent("bullish_researcher");

/** Bearish Researcher - Constructs the short/avoid case */
export const bearishResearcherAgent = createAgent("bearish_researcher");

// ============================================
// Execution Functions
// ============================================

/**
 * Run Bullish Researcher agent.
 */
export async function runBullishResearcher(
  context: AgentContext,
  analystOutputs: AnalystOutputs
): Promise<BullishResearchOutput[]> {
  // Build compact indicator summary for momentum/trend signals
  const indicatorSummary = buildIndicatorSummary(context.indicators);

  const prompt = `${buildDatetimeContext()}Construct the bullish case for the following instruments based on analyst outputs:

News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}
${indicatorSummary ? `\nKey Technical Signals:\n${indicatorSummary}` : ""}
Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

IMPORTANT: Build the bullish thesis considering:
- RSI signals: OVERSOLD suggests potential reversal opportunity
- MACD: Bullish crossovers or strong positive momentum support the case
- Trend: UPTREND or STRONG UPTREND from moving averages
- P/C ratio: BULLISH SENTIMENT from low put/call ratios
- Quality factors: High gross profitability, strong cash flow quality

Weight technical factors alongside fundamental drivers.`;

  const settings = getAgentRuntimeSettings("bullish_researcher", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(BullishResearchSchema) });

  const response = await bullishResearcherAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  const result = response.object as BullishResearchOutput[] | undefined;
  return result ?? [];
}

/**
 * Run Bearish Researcher agent.
 */
export async function runBearishResearcher(
  context: AgentContext,
  analystOutputs: AnalystOutputs
): Promise<BearishResearchOutput[]> {
  // Build compact indicator summary for momentum/trend signals
  const indicatorSummary = buildIndicatorSummary(context.indicators);

  const prompt = `${buildDatetimeContext()}Construct the bearish case for the following instruments based on analyst outputs:

News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}
${indicatorSummary ? `\nKey Technical Signals:\n${indicatorSummary}` : ""}
Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

IMPORTANT: Build the bearish thesis considering:
- RSI signals: OVERBOUGHT suggests potential reversal risk
- MACD: Bearish crossovers or negative momentum support the case
- Trend: DOWNTREND or STRONG DOWNTREND from moving averages
- P/C ratio: BEARISH SENTIMENT from high put/call ratios
- Quality concerns: High accruals, Beneish M-Score > -2.22 (manipulation risk)
- Asset growth: High asset growth often predicts lower future returns

Weight technical factors alongside fundamental headwinds.`;

  const settings = getAgentRuntimeSettings("bearish_researcher", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(BearishResearchSchema) });

  const response = await bearishResearcherAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  const result = response.object as BearishResearchOutput[] | undefined;
  return result ?? [];
}

/**
 * Run both research agents in parallel (debate phase).
 */
export async function runDebateParallel(
  context: AgentContext,
  analystOutputs: AnalystOutputs
): Promise<{
  bullish: BullishResearchOutput[];
  bearish: BearishResearchOutput[];
}> {
  const [bullish, bearish] = await Promise.all([
    runBullishResearcher(context, analystOutputs),
    runBearishResearcher(context, analystOutputs),
  ]);

  return { bullish, bearish };
}

// ============================================
// Streaming Functions
// ============================================

/**
 * Process stream chunks and emit via callback.
 * Handles Gemini grounding sources as google_search tool calls for UI visibility.
 */
function processStreamChunk(
  chunk: { type: string; payload?: Record<string, unknown>; [key: string]: unknown },
  agentType: AgentType,
  onChunk: OnStreamChunk
): void {
  const timestamp = new Date().toISOString();

  // Handle Gemini grounding source chunks as google_search tool calls
  if (chunk.type === "source" && chunk.sourceType === "url") {
    const sourceId = (chunk.id as string) ?? `source-${Date.now()}`;

    onChunk({
      type: "tool-call",
      agentType,
      payload: {
        toolName: "google_search",
        toolCallId: sourceId,
        toolArgs: { query: chunk.title as string },
      },
      timestamp,
    });

    onChunk({
      type: "tool-result",
      agentType,
      payload: {
        toolCallId: sourceId,
        toolName: "google_search",
        result: { title: chunk.title, url: chunk.url, sourceType: chunk.sourceType },
        success: true,
      },
      timestamp,
    });
    return;
  }

  const payload = chunk.payload ?? {};
  const streamChunk: AgentStreamChunk = {
    type: chunk.type as AgentStreamChunk["type"],
    agentType,
    payload: {},
    timestamp,
  };

  switch (chunk.type) {
    case "text-delta":
      streamChunk.payload.text = payload.text as string;
      onChunk(streamChunk);
      break;
    case "tool-call":
      streamChunk.payload.toolName = payload.toolName as string;
      streamChunk.payload.toolArgs = payload.args as Record<string, unknown>;
      streamChunk.payload.toolCallId = payload.toolCallId as string;
      onChunk(streamChunk);
      break;
    case "tool-result":
      streamChunk.payload.toolCallId = payload.toolCallId as string;
      streamChunk.payload.result = payload.result;
      streamChunk.payload.success = true;
      onChunk(streamChunk);
      break;
    case "reasoning-delta":
      streamChunk.payload.text = payload.text as string;
      onChunk(streamChunk);
      break;
    case "error":
      streamChunk.payload.error =
        payload.error instanceof Error ? payload.error.message : String(payload.error);
      onChunk(streamChunk);
      break;
  }
}

/**
 * Run Bullish Researcher agent with streaming.
 */
export async function runBullishResearcherStreaming(
  context: AgentContext,
  analystOutputs: AnalystOutputs,
  onChunk: OnStreamChunk
): Promise<BullishResearchOutput[]> {
  // Build compact indicator summary for momentum/trend signals
  const indicatorSummary = buildIndicatorSummary(context.indicators);

  const prompt = `${buildDatetimeContext()}Construct the bullish case for the following instruments based on analyst outputs:

News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}
${indicatorSummary ? `\nKey Technical Signals:\n${indicatorSummary}` : ""}
Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

IMPORTANT: Build the bullish thesis considering:
- RSI signals: OVERSOLD suggests potential reversal opportunity
- MACD: Bullish crossovers or strong positive momentum support the case
- Trend: UPTREND or STRONG UPTREND from moving averages
- P/C ratio: BULLISH SENTIMENT from low put/call ratios
- Quality factors: High gross profitability, strong cash flow quality

Weight technical factors alongside fundamental drivers.`;

  const settings = getAgentRuntimeSettings("bullish_researcher", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(BullishResearchSchema) });

  const stream = await bullishResearcherAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    processStreamChunk(
      chunk as { type: string; payload: Record<string, unknown> },
      "bullish_researcher",
      onChunk
    );
  }

  const result = (await stream.object) as BullishResearchOutput[] | undefined;
  return result ?? [];
}

/**
 * Run Bearish Researcher agent with streaming.
 */
export async function runBearishResearcherStreaming(
  context: AgentContext,
  analystOutputs: AnalystOutputs,
  onChunk: OnStreamChunk
): Promise<BearishResearchOutput[]> {
  // Build compact indicator summary for momentum/trend signals
  const indicatorSummary = buildIndicatorSummary(context.indicators);

  const prompt = `${buildDatetimeContext()}Construct the bearish case for the following instruments based on analyst outputs:

News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}
${indicatorSummary ? `\nKey Technical Signals:\n${indicatorSummary}` : ""}
Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

IMPORTANT: Build the bearish thesis considering:
- RSI signals: OVERBOUGHT suggests potential reversal risk
- MACD: Bearish crossovers or negative momentum support the case
- Trend: DOWNTREND or STRONG DOWNTREND from moving averages
- P/C ratio: BEARISH SENTIMENT from high put/call ratios
- Quality concerns: High accruals, Beneish M-Score > -2.22 (manipulation risk)
- Asset growth: High asset growth often predicts lower future returns

Weight technical factors alongside fundamental headwinds.`;

  const settings = getAgentRuntimeSettings("bearish_researcher", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(BearishResearchSchema) });

  const stream = await bearishResearcherAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    processStreamChunk(
      chunk as { type: string; payload: Record<string, unknown> },
      "bearish_researcher",
      onChunk
    );
  }

  const result = (await stream.object) as BearishResearchOutput[] | undefined;
  return result ?? [];
}

/**
 * Run both research agents in parallel with streaming (debate phase).
 */
export async function runDebateParallelStreaming(
  context: AgentContext,
  analystOutputs: AnalystOutputs,
  onChunk: OnStreamChunk
): Promise<{
  bullish: BullishResearchOutput[];
  bearish: BearishResearchOutput[];
}> {
  const [bullish, bearish] = await Promise.all([
    runBullishResearcherStreaming(context, analystOutputs, onChunk),
    runBearishResearcherStreaming(context, analystOutputs, onChunk),
  ]);

  return { bullish, bearish };
}

// ============================================
// Idea Agent
// ============================================

import type { IdeaContext, ResearcherInput } from "@cream/agents";
import { buildIdeaAgentUserPrompt, buildResearcherPrompt } from "@cream/agents";
import type { ResearchTrigger } from "@cream/domain";
import type { IndicatorHypothesis } from "@cream/indicators";
import { IndicatorHypothesisSchema } from "@cream/indicators";

import { type IdeaAgentOutput, IdeaAgentOutputSchema } from "./schemas.js";
import type { IdeaAgentContext } from "./types.js";

/** Idea Agent - Generates alpha factor hypotheses */
export const ideaAgentAgent = createAgent("idea_agent");

/** Indicator Researcher - Formulates indicator hypotheses */
export const indicatorResearcherAgent = createAgent("indicator_researcher");

/**
 * Run Idea Agent to generate alpha factor hypotheses.
 * Uses the shared buildIdeaAgentUserPrompt from @cream/agents for consistency.
 */
export async function runIdeaAgent(context: IdeaAgentContext): Promise<IdeaAgentOutput> {
  // Convert IdeaAgentContext to IdeaContext for the shared prompt builder
  // IdeaAgentContext uses loose string types; cast to ResearchTrigger for type safety
  const trigger: ResearchTrigger = {
    type: context.trigger.type as ResearchTrigger["type"],
    severity: context.trigger.severity as ResearchTrigger["severity"],
    affectedFactors: context.trigger.affectedFactors,
    suggestedFocus: context.trigger.suggestedFocus,
    detectedAt: context.trigger.detectedAt,
    metadata: {},
  };

  const ideaContext: IdeaContext = {
    regime: context.regime,
    gaps: context.gaps,
    decayingFactors: context.decayingFactors,
    factorZooSummary: context.factorZooSummary,
    trigger,
    memoryResults: context.memoryResults ?? [],
  };

  const prompt = buildIdeaAgentUserPrompt(ideaContext);

  const settings = getAgentRuntimeSettings("idea_agent", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: IdeaAgentOutputSchema });

  const response = await ideaAgentAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as IdeaAgentOutput;
}

/**
 * Run Indicator Researcher agent to formulate indicator hypotheses.
 */
export async function runIndicatorResearcher(
  input: ResearcherInput,
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): Promise<IndicatorHypothesis> {
  const prompt = buildResearcherPrompt(input);

  const settings = getAgentRuntimeSettings("indicator_researcher", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: IndicatorHypothesisSchema });

  const response = await indicatorResearcherAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  return response.object as IndicatorHypothesis;
}
