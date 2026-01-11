/**
 * Analyst agents for market analysis.
 *
 * Contains Technical, News & Sentiment, and Fundamentals analyst agents.
 */

import { z } from "zod";

import { buildGenerateOptions, createAgent, getAgentRuntimeSettings } from "./factory.js";
import { buildPredictionMarketContext, buildRegimeContext } from "./prompts.js";
import {
  FundamentalsAnalysisSchema,
  SentimentAnalysisSchema,
  TechnicalAnalysisSchema,
} from "./schemas.js";
import type {
  AgentContext,
  AgentStreamChunk,
  FundamentalsAnalysisOutput,
  OnStreamChunk,
  SentimentAnalysisOutput,
  TechnicalAnalysisOutput,
} from "./types.js";

// ============================================
// Types
// ============================================

export interface AnalystOutputs {
  technical: TechnicalAnalysisOutput[];
  news: SentimentAnalysisOutput[];
  fundamentals: FundamentalsAnalysisOutput[];
}

// ============================================
// Agent Instances
// ============================================

/** Technical Analyst - Analyzes price action and indicators */
export const technicalAnalystAgent = createAgent("technical_analyst");

/** News & Sentiment Analyst - Assesses news impact */
export const newsAnalystAgent = createAgent("news_analyst");

/** Fundamentals & Macro Analyst - Evaluates fundamentals */
export const fundamentalsAnalystAgent = createAgent("fundamentals_analyst");

// ============================================
// Execution Functions
// ============================================

/**
 * Run Technical Analyst agent.
 */
export async function runTechnicalAnalyst(
  context: AgentContext
): Promise<TechnicalAnalysisOutput[]> {
  const regimeContext = buildRegimeContext(context.regimeLabels);

  const prompt = `Analyze the following instruments:
${JSON.stringify(context.snapshots, null, 2)}
${regimeContext}
Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

Consider the market regime when assessing trend, momentum, and volatility.
Regime context should inform your setup classification and technical thesis.`;

  const settings = getAgentRuntimeSettings("technical_analyst", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(TechnicalAnalysisSchema) });

  const response = await technicalAnalystAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  const result = response.object as TechnicalAnalysisOutput[] | undefined;
  return result ?? [];
}

/**
 * Run News & Sentiment Analyst agent.
 */
export async function runNewsAnalyst(context: AgentContext): Promise<SentimentAnalysisOutput[]> {
  const newsEvents = (context.recentEvents ?? []).filter(
    (e) => e.sourceType === "news" || e.sourceType === "press_release"
  );

  const prompt = `Analyze news and sentiment for the following instruments:

Current News from Pipeline:
${JSON.stringify(context.externalContext?.news ?? [], null, 2)}

Recent Historical Events (from database):
${JSON.stringify(newsEvents, null, 2)}

Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const settings = getAgentRuntimeSettings("news_analyst", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(SentimentAnalysisSchema) });

  const response = await newsAnalystAgent.generate([{ role: "user", content: prompt }], options);

  const result = response.object as SentimentAnalysisOutput[] | undefined;
  return result ?? [];
}

/**
 * Run Fundamentals & Macro Analyst agent.
 */
export async function runFundamentalsAnalyst(
  context: AgentContext
): Promise<FundamentalsAnalysisOutput[]> {
  const fundamentalEvents = (context.recentEvents ?? []).filter(
    (e) =>
      e.sourceType === "macro" ||
      e.sourceType === "transcript" ||
      e.eventType === "earnings" ||
      e.eventType === "guidance" ||
      e.eventType === "macro_release"
  );

  const regimeContext = buildRegimeContext(context.regimeLabels);
  const predictionMarketContext = buildPredictionMarketContext(context.predictionMarketSignals);

  const prompt = `Analyze fundamentals and macro context for the following instruments:

Current Macro Indicators:
${JSON.stringify(context.externalContext?.macroIndicators ?? {}, null, 2)}
${regimeContext}${predictionMarketContext}
Recent Fundamental/Macro Events (from database):
${JSON.stringify(fundamentalEvents, null, 2)}

Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

The market regime classification reflects the current market environment.
Use this context to assess whether fundamental drivers align with or diverge from the regime.
HIGH_VOL regimes may warrant more conservative positioning; BULL_TREND supports growth exposure.

${
  context.predictionMarketSignals
    ? `IMPORTANT: Prediction market signals reflect real-money bets on macro outcomes.
- High Fed cut probability suggests easing expectations - generally supportive for equities
- High recession probability warrants defensive positioning
- High macro uncertainty may justify smaller position sizes
- Use these signals to inform your fundamental thesis and event risk assessment.`
    : ""
}`;

  const settings = getAgentRuntimeSettings("fundamentals_analyst", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(FundamentalsAnalysisSchema) });

  const response = await fundamentalsAnalystAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  const result = response.object as FundamentalsAnalysisOutput[] | undefined;
  return result ?? [];
}

/**
 * Run all analyst agents in parallel.
 */
export async function runAnalystsParallel(context: AgentContext): Promise<{
  technical: TechnicalAnalysisOutput[];
  news: SentimentAnalysisOutput[];
  fundamentals: FundamentalsAnalysisOutput[];
}> {
  const [technical, news, fundamentals] = await Promise.all([
    runTechnicalAnalyst(context),
    runNewsAnalyst(context),
    runFundamentalsAnalyst(context),
  ]);

  return { technical, news, fundamentals };
}

// ============================================
// Streaming Functions
// ============================================

/**
 * Process stream chunks and emit via callback.
 */
function processStreamChunk(
  chunk: { type: string; payload: Record<string, unknown> },
  agentType: "technical_analyst" | "news_analyst" | "fundamentals_analyst",
  onChunk: OnStreamChunk
): void {
  const streamChunk: AgentStreamChunk = {
    type: chunk.type as AgentStreamChunk["type"],
    agentType,
    payload: {},
    timestamp: new Date().toISOString(),
  };

  switch (chunk.type) {
    case "text-delta":
      streamChunk.payload.text = chunk.payload.text as string;
      onChunk(streamChunk);
      break;
    case "tool-call":
      streamChunk.payload.toolName = chunk.payload.toolName as string;
      streamChunk.payload.toolArgs = chunk.payload.args as Record<string, unknown>;
      streamChunk.payload.toolCallId = chunk.payload.toolCallId as string;
      onChunk(streamChunk);
      break;
    case "tool-result":
      streamChunk.payload.toolCallId = chunk.payload.toolCallId as string;
      streamChunk.payload.result = chunk.payload.result;
      streamChunk.payload.success = true;
      onChunk(streamChunk);
      break;
    case "reasoning-delta":
      streamChunk.payload.text = chunk.payload.text as string;
      onChunk(streamChunk);
      break;
    case "error":
      streamChunk.payload.error =
        chunk.payload.error instanceof Error
          ? chunk.payload.error.message
          : String(chunk.payload.error);
      onChunk(streamChunk);
      break;
  }
}

/**
 * Run Technical Analyst agent with streaming.
 */
export async function runTechnicalAnalystStreaming(
  context: AgentContext,
  onChunk: OnStreamChunk
): Promise<TechnicalAnalysisOutput[]> {
  const regimeContext = buildRegimeContext(context.regimeLabels);

  const prompt = `Analyze the following instruments:
${JSON.stringify(context.snapshots, null, 2)}
${regimeContext}
Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

Consider the market regime when assessing trend, momentum, and volatility.
Regime context should inform your setup classification and technical thesis.`;

  const settings = getAgentRuntimeSettings("technical_analyst", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(TechnicalAnalysisSchema) });

  const stream = await technicalAnalystAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    processStreamChunk(
      chunk as { type: string; payload: Record<string, unknown> },
      "technical_analyst",
      onChunk
    );
  }

  const result = (await stream.object) as TechnicalAnalysisOutput[] | undefined;
  return result ?? [];
}

/**
 * Run News & Sentiment Analyst agent with streaming.
 */
export async function runNewsAnalystStreaming(
  context: AgentContext,
  onChunk: OnStreamChunk
): Promise<SentimentAnalysisOutput[]> {
  const newsEvents = (context.recentEvents ?? []).filter(
    (e) => e.sourceType === "news" || e.sourceType === "press_release"
  );

  const prompt = `Analyze news and sentiment for the following instruments:

Current News from Pipeline:
${JSON.stringify(context.externalContext?.news ?? [], null, 2)}

Recent Historical Events (from database):
${JSON.stringify(newsEvents, null, 2)}

Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const settings = getAgentRuntimeSettings("news_analyst", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(SentimentAnalysisSchema) });

  const stream = await newsAnalystAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    processStreamChunk(
      chunk as { type: string; payload: Record<string, unknown> },
      "news_analyst",
      onChunk
    );
  }

  const result = (await stream.object) as SentimentAnalysisOutput[] | undefined;
  return result ?? [];
}

/**
 * Run Fundamentals & Macro Analyst agent with streaming.
 */
export async function runFundamentalsAnalystStreaming(
  context: AgentContext,
  onChunk: OnStreamChunk
): Promise<FundamentalsAnalysisOutput[]> {
  const fundamentalEvents = (context.recentEvents ?? []).filter(
    (e) =>
      e.sourceType === "macro" ||
      e.sourceType === "transcript" ||
      e.eventType === "earnings" ||
      e.eventType === "guidance" ||
      e.eventType === "macro_release"
  );

  const regimeContext = buildRegimeContext(context.regimeLabels);
  const predictionMarketContext = buildPredictionMarketContext(context.predictionMarketSignals);

  const prompt = `Analyze fundamentals and macro context for the following instruments:

Current Macro Indicators:
${JSON.stringify(context.externalContext?.macroIndicators ?? {}, null, 2)}
${regimeContext}${predictionMarketContext}
Recent Fundamental/Macro Events (from database):
${JSON.stringify(fundamentalEvents, null, 2)}

Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

The market regime classification reflects the current market environment.
Use this context to assess whether fundamental drivers align with or diverge from the regime.
HIGH_VOL regimes may warrant more conservative positioning; BULL_TREND supports growth exposure.

${
  context.predictionMarketSignals
    ? `IMPORTANT: Prediction market signals reflect real-money bets on macro outcomes.
- High Fed cut probability suggests easing expectations - generally supportive for equities
- High recession probability warrants defensive positioning
- High macro uncertainty may justify smaller position sizes
- Use these signals to inform your fundamental thesis and event risk assessment.`
    : ""
}`;

  const settings = getAgentRuntimeSettings("fundamentals_analyst", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(FundamentalsAnalysisSchema) });

  const stream = await fundamentalsAnalystAgent.stream(
    [{ role: "user", content: prompt }],
    options
  );

  for await (const chunk of stream.fullStream) {
    processStreamChunk(
      chunk as { type: string; payload: Record<string, unknown> },
      "fundamentals_analyst",
      onChunk
    );
  }

  const result = (await stream.object) as FundamentalsAnalysisOutput[] | undefined;
  return result ?? [];
}

/**
 * Run all analyst agents in parallel with streaming.
 */
export async function runAnalystsParallelStreaming(
  context: AgentContext,
  onChunk: OnStreamChunk
): Promise<{
  technical: TechnicalAnalysisOutput[];
  news: SentimentAnalysisOutput[];
  fundamentals: FundamentalsAnalysisOutput[];
}> {
  const [technical, news, fundamentals] = await Promise.all([
    runTechnicalAnalystStreaming(context, onChunk),
    runNewsAnalystStreaming(context, onChunk),
    runFundamentalsAnalystStreaming(context, onChunk),
  ]);

  return { technical, news, fundamentals };
}
