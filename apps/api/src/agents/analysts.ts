/**
 * Analyst agents for market analysis.
 *
 * Contains News & Sentiment, and Fundamentals analyst agents.
 */

import { z } from "zod";

import { buildGenerateOptions, createAgent, getAgentRuntimeSettings } from "./factory.js";
import {
  buildDatetimeContext,
  buildIndicatorContext,
  buildIndicatorSummary,
  buildPredictionMarketContext,
  buildRegimeContext,
} from "./prompts.js";
import { FundamentalsAnalysisSchema, SentimentAnalysisSchema } from "./schemas.js";
import type {
  AgentContext,
  AgentStreamChunk,
  FundamentalsAnalysisOutput,
  OnStreamChunk,
  SentimentAnalysisOutput,
} from "./types.js";

// ============================================
// Types
// ============================================

export interface AnalystOutputs {
  news: SentimentAnalysisOutput[];
  fundamentals: FundamentalsAnalysisOutput[];
}

// ============================================
// Agent Instances
// ============================================

/** News & Sentiment Analyst - Assesses news impact */
export const newsAnalystAgent = createAgent("news_analyst");

/** Fundamentals & Macro Analyst - Evaluates fundamentals */
export const fundamentalsAnalystAgent = createAgent("fundamentals_analyst");

// ============================================
// Execution Functions
// ============================================

/**
 * Run News & Sentiment Analyst agent.
 */
export async function runNewsAnalyst(context: AgentContext): Promise<SentimentAnalysisOutput[]> {
  const newsEvents = (context.recentEvents ?? []).filter(
    (e) => e.sourceType === "news" || e.sourceType === "press_release"
  );

  // Build indicator context with sentiment signals
  const indicatorContext = buildIndicatorContext(context.indicators);
  const indicatorSummary = buildIndicatorSummary(context.indicators);

  const prompt = `${buildDatetimeContext()}Analyze news and sentiment for the following instruments:

Current News from Pipeline:
${JSON.stringify(context.externalContext?.news ?? [], null, 2)}

Recent Historical Events (from database):
${JSON.stringify(newsEvents, null, 2)}
${indicatorContext}${indicatorSummary ? `\n${indicatorSummary}` : ""}
Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

IMPORTANT: Use the sentiment indicators above to contextualize your analysis:
- overall_score: Aggregated sentiment from news and social sources (-1 to 1)
- sentiment_strength: Confidence level of the sentiment signal
- news_volume: Number of recent news articles (high volume may indicate event risk)
- event_risk: Flag indicating significant upcoming or recent events
- classification: Sentiment category (STRONG_BULLISH to STRONG_BEARISH)

When sentiment indicators conflict with news content, highlight this divergence.
If event_risk is true, pay special attention to potential catalysts.`;

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

  // Build indicator context with value and quality factors
  const indicatorContext = buildIndicatorContext(context.indicators);

  const prompt = `${buildDatetimeContext()}Analyze fundamentals and macro context for the following instruments:

Current Macro Indicators:
${JSON.stringify(context.externalContext?.macroIndicators ?? {}, null, 2)}
${regimeContext}${predictionMarketContext}
Recent Fundamental/Macro Events (from database):
${JSON.stringify(fundamentalEvents, null, 2)}
${indicatorContext}
Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

The market regime classification reflects the current market environment.
Use this context to assess whether fundamental drivers align with or diverge from the regime.
HIGH_VOL regimes may warrant more conservative positioning; BULL_TREND supports growth exposure.

VALUE FACTORS from the indicators above:
- pe_ratio_ttm / pe_ratio_forward: Valuation relative to earnings
- pb_ratio: Price to book value
- ev_ebitda: Enterprise value multiple
- earnings_yield: Inverse of P/E, useful for comparisons
- dividend_yield: Income component of return

QUALITY FACTORS from the indicators above:
- gross_profitability: Novy-Marx factor - higher is better
- roe / roa: Return metrics
- asset_growth: Cooper factor - high growth often predicts lower returns
- accruals_ratio: Sloan factor - high accruals suggest lower quality
- cash_flow_quality: OCF/Net Income ratio
- beneish_m_score: Score > -2.22 suggests manipulation risk

Use these quantitative factors to support or challenge qualitative assessments.
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
  news: SentimentAnalysisOutput[];
  fundamentals: FundamentalsAnalysisOutput[];
}> {
  const [news, fundamentals] = await Promise.all([
    runNewsAnalyst(context),
    runFundamentalsAnalyst(context),
  ]);

  return { news, fundamentals };
}

// ============================================
// Streaming Functions
// ============================================

/**
 * Process stream chunks and emit via callback.
 */
function processStreamChunk(
  chunk: { type: string; payload: Record<string, unknown> },
  agentType: "news_analyst" | "fundamentals_analyst",
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
 * Run News & Sentiment Analyst agent with streaming.
 */
export async function runNewsAnalystStreaming(
  context: AgentContext,
  onChunk: OnStreamChunk
): Promise<SentimentAnalysisOutput[]> {
  const newsEvents = (context.recentEvents ?? []).filter(
    (e) => e.sourceType === "news" || e.sourceType === "press_release"
  );

  // Build indicator context with sentiment signals
  const indicatorContext = buildIndicatorContext(context.indicators);
  const indicatorSummary = buildIndicatorSummary(context.indicators);

  const prompt = `${buildDatetimeContext()}Analyze news and sentiment for the following instruments:

Current News from Pipeline:
${JSON.stringify(context.externalContext?.news ?? [], null, 2)}

Recent Historical Events (from database):
${JSON.stringify(newsEvents, null, 2)}
${indicatorContext}${indicatorSummary ? `\n${indicatorSummary}` : ""}
Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

IMPORTANT: Use the sentiment indicators above to contextualize your analysis:
- overall_score: Aggregated sentiment from news and social sources (-1 to 1)
- sentiment_strength: Confidence level of the sentiment signal
- news_volume: Number of recent news articles (high volume may indicate event risk)
- event_risk: Flag indicating significant upcoming or recent events
- classification: Sentiment category (STRONG_BULLISH to STRONG_BEARISH)

When sentiment indicators conflict with news content, highlight this divergence.
If event_risk is true, pay special attention to potential catalysts.`;

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

  // Build indicator context with value and quality factors
  const indicatorContext = buildIndicatorContext(context.indicators);

  const prompt = `${buildDatetimeContext()}Analyze fundamentals and macro context for the following instruments:

Current Macro Indicators:
${JSON.stringify(context.externalContext?.macroIndicators ?? {}, null, 2)}
${regimeContext}${predictionMarketContext}
Recent Fundamental/Macro Events (from database):
${JSON.stringify(fundamentalEvents, null, 2)}
${indicatorContext}
Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

The market regime classification reflects the current market environment.
Use this context to assess whether fundamental drivers align with or diverge from the regime.
HIGH_VOL regimes may warrant more conservative positioning; BULL_TREND supports growth exposure.

VALUE FACTORS from the indicators above:
- pe_ratio_ttm / pe_ratio_forward: Valuation relative to earnings
- pb_ratio: Price to book value
- ev_ebitda: Enterprise value multiple
- earnings_yield: Inverse of P/E, useful for comparisons
- dividend_yield: Income component of return

QUALITY FACTORS from the indicators above:
- gross_profitability: Novy-Marx factor - higher is better
- roe / roa: Return metrics
- asset_growth: Cooper factor - high growth often predicts lower returns
- accruals_ratio: Sloan factor - high accruals suggest lower quality
- cash_flow_quality: OCF/Net Income ratio
- beneish_m_score: Score > -2.22 suggests manipulation risk

Use these quantitative factors to support or challenge qualitative assessments.
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
  news: SentimentAnalysisOutput[];
  fundamentals: FundamentalsAnalysisOutput[];
}> {
  const [news, fundamentals] = await Promise.all([
    runNewsAnalystStreaming(context, onChunk),
    runFundamentalsAnalystStreaming(context, onChunk),
  ]);

  return { news, fundamentals };
}
