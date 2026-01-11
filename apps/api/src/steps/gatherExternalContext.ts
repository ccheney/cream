/**
 * Gather External Context Step
 *
 * Step 4: Get news, sentiment, macro context from external sources.
 *
 * Uses @cream/external-context pipeline for:
 * - News extraction and sentiment scoring
 * - Macro release processing
 * - Entity linking to symbols
 *
 * Also includes prediction market signals from the database
 * (populated by the separate prediction markets workflow).
 *
 * Events are stored to the external_events table for retrieval.
 */

import { createContext, type ExecutionContext, isBacktest, requireEnv } from "@cream/domain";
import {
  createExtractionPipeline,
  type ExtractedEvent,
  type FMPNewsArticle,
} from "@cream/external-context";

/**
 * Create ExecutionContext for step invocation.
 * Steps are invoked by the Mastra workflow during scheduled runs.
 */
function createStepContext(): ExecutionContext {
  return createContext(requireEnv(), "scheduled");
}

import type { CreateExternalEventInput } from "@cream/storage";
import { createFMPClient, type FMPClient, type FMPStockNews } from "@cream/universe";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { getExternalEventsRepo } from "../db.js";
import { log } from "../logger.js";
import { getLatestPredictionMarketSignals } from "./fetchPredictionMarkets.js";
import { MemoryOutputSchema } from "./retrieveMemory.js";

/**
 * Prediction market signals for agent context
 */
export const PredictionMarketSignalsSchema = z.object({
  fedCutProbability: z.number().optional(),
  fedHikeProbability: z.number().optional(),
  recessionProbability12m: z.number().optional(),
  macroUncertaintyIndex: z.number().optional(),
  policyEventRisk: z.number().optional(),
  marketConfidence: z.number().optional(),
  cpiSurpriseDirection: z.number().optional(),
  gdpSurpriseDirection: z.number().optional(),
  timestamp: z.string().optional(),
  platforms: z.array(z.string()).optional(),
});

export const ExternalContextSchema = z.object({
  news: z.array(z.any()),
  sentiment: z.record(z.string(), z.number()),
  macroIndicators: z.record(z.string(), z.number()),
  predictionMarketSignals: PredictionMarketSignalsSchema.optional(),
});

export type ExternalContext = z.infer<typeof ExternalContextSchema>;

// Singleton FMP client
let fmpClient: FMPClient | null = null;

function getFMPClient(): FMPClient | null {
  if (fmpClient) {
    return fmpClient;
  }

  const apiKey = process.env.FMP_KEY;
  if (!apiKey) {
    return null;
  }

  fmpClient = createFMPClient({ apiKey });
  return fmpClient;
}

/**
 * Convert FMPStockNews to FMPNewsArticle format expected by pipeline
 */
function toFMPNewsArticle(article: FMPStockNews): FMPNewsArticle {
  return {
    symbol: article.symbol,
    publishedDate: article.publishedDate,
    title: article.title,
    image: article.image,
    site: article.site,
    text: article.text,
    url: article.url,
  };
}

/**
 * Extract sentiment scores from processed events by symbol
 */
function extractSentimentBySymbol(events: ExtractedEvent[]): Record<string, number> {
  const sentimentMap: Record<string, { total: number; count: number }> = {};

  for (const event of events) {
    const score = event.scores.sentimentScore;
    for (const symbol of event.relatedInstrumentIds) {
      if (!sentimentMap[symbol]) {
        sentimentMap[symbol] = { total: 0, count: 0 };
      }
      sentimentMap[symbol].total += score;
      sentimentMap[symbol].count += 1;
    }
  }

  // Compute average sentiment per symbol
  const result: Record<string, number> = {};
  for (const [symbol, { total, count }] of Object.entries(sentimentMap)) {
    result[symbol] = total / count;
  }

  return result;
}

/**
 * Extract macro indicators from processed events
 */
function extractMacroIndicators(events: ExtractedEvent[]): Record<string, number> {
  const macroIndicators: Record<string, number> = {};

  for (const event of events) {
    if (event.sourceType === "macro") {
      // Extract indicator name and surprise score
      const indicator = event.extraction.summary.split(":")[0]?.trim() || "unknown";
      macroIndicators[indicator] = event.scores.surpriseScore;
    }
  }

  return macroIndicators;
}

/**
 * Convert ExtractedEvent to CreateExternalEventInput for storage
 */
function toStorageEvent(event: ExtractedEvent): CreateExternalEventInput {
  return {
    id: event.eventId,
    sourceType: event.sourceType,
    eventType: event.eventType,
    eventTime: event.eventTime.toISOString(),
    processedAt: event.processedAt.toISOString(),

    sentiment: event.extraction.sentiment,
    confidence: event.extraction.confidence,
    importance: event.extraction.importance,
    summary: event.extraction.summary,
    keyInsights: event.extraction.keyInsights,
    entities: event.extraction.entities,
    dataPoints: event.extraction.dataPoints,

    sentimentScore: event.scores.sentimentScore,
    importanceScore: event.scores.importanceScore,
    surpriseScore: event.scores.surpriseScore,

    relatedInstruments: event.relatedInstrumentIds,
    originalContent: event.originalContent.slice(0, 10000), // Truncate very long content
  };
}

export const gatherExternalContextStep = createStep({
  id: "gather-external-context",
  description: "Get news, sentiment, macro context",
  inputSchema: MemoryOutputSchema,
  outputSchema: ExternalContextSchema,
  retries: 2,
  execute: async ({ inputData: _inputData }) => {
    // Create context at step boundary
    const ctx = createStepContext();

    // In backtest mode, return empty context for faster execution
    if (isBacktest(ctx)) {
      return {
        news: [],
        sentiment: {},
        macroIndicators: {},
        predictionMarketSignals: undefined,
      };
    }

    // Fetch prediction market signals from database (non-blocking for main flow)
    const pmSignalsPromise = getLatestPredictionMarketSignals().catch(() => null);

    // Check if FMP API is available
    const client = getFMPClient();
    if (!client) {
      // No FMP API key - still try to return prediction market signals
      const pmContext = await pmSignalsPromise;
      return {
        news: [],
        sentiment: {},
        macroIndicators: {},
        predictionMarketSignals: pmContext
          ? {
              fedCutProbability: pmContext.signals.fedCutProbability,
              fedHikeProbability: pmContext.signals.fedHikeProbability,
              recessionProbability12m: pmContext.signals.recessionProbability12m,
              macroUncertaintyIndex: pmContext.signals.macroUncertaintyIndex,
              policyEventRisk: pmContext.signals.policyEventRisk,
              marketConfidence: pmContext.signals.marketConfidence,
              cpiSurpriseDirection: pmContext.scores.cpiSurpriseDirection,
              gdpSurpriseDirection: pmContext.scores.gdpSurpriseDirection,
              timestamp: pmContext.signals.timestamp,
              platforms: pmContext.signals.platforms,
            }
          : undefined,
      };
    }

    // Create extraction pipeline - uses Claude for LLM extraction
    // Requires ANTHROPIC_API_KEY environment variable for real extraction
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const pipeline = createExtractionPipeline({
      dryRun: !hasAnthropicKey, // Fallback to dry run if no API key
    });

    if (!hasAnthropicKey) {
      log.warn({}, "ANTHROPIC_API_KEY not set - using dry run mode (no LLM extraction)");
    }

    try {
      // Fetch news and economic calendar in parallel
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fromDate = weekAgo.toISOString().split("T")[0];
      const toDate = today.toISOString().split("T")[0];

      const [newsArticles, economicEvents] = await Promise.all([
        client.getGeneralNews(50).catch(() => [] as FMPStockNews[]),
        client.getEconomicCalendar(fromDate, toDate).catch(() => []),
      ]);

      // Process news through pipeline
      const newsResults = await pipeline.processNews(newsArticles.map(toFMPNewsArticle));

      // Process macro releases through pipeline
      const macroResults = await pipeline.processMacroReleases(economicEvents);

      log.info(
        {
          newsSuccess: newsResults.stats.successCount,
          newsTotal: newsResults.stats.inputCount,
          newsErrors: newsResults.stats.errorCount,
          newsTimeMs: newsResults.stats.processingTimeMs,
          macroSuccess: macroResults.stats.successCount,
          macroTotal: macroResults.stats.inputCount,
          macroErrors: macroResults.stats.errorCount,
          macroTimeMs: macroResults.stats.processingTimeMs,
          mode: hasAnthropicKey ? "llm" : "dry-run",
        },
        "External context extraction complete"
      );

      // Combine all events
      const allEvents = [...newsResults.events, ...macroResults.events];

      // Store events to database (fire-and-forget, don't block workflow)
      if (allEvents.length > 0) {
        getExternalEventsRepo()
          .then((repo) => repo.createMany(allEvents.map(toStorageEvent)))
          .catch((err) => {
            log.warn(
              { error: err instanceof Error ? err.message : String(err) },
              "Failed to store external events"
            );
          });
      }

      // Extract sentiment by symbol
      const sentiment = extractSentimentBySymbol(newsResults.events);

      // Extract macro indicators
      const macroIndicators = extractMacroIndicators(macroResults.events);

      // Wait for prediction market signals
      const pmContext = await pmSignalsPromise;

      return {
        news: allEvents.map((event) => ({
          eventId: event.eventId,
          type: event.eventType,
          summary: event.extraction.summary,
          sentiment: event.extraction.sentiment,
          symbols: event.relatedInstrumentIds,
          importance: event.scores.importanceScore,
          eventTime: event.eventTime.toISOString(),
        })),
        sentiment,
        macroIndicators,
        predictionMarketSignals: pmContext
          ? {
              fedCutProbability: pmContext.signals.fedCutProbability,
              fedHikeProbability: pmContext.signals.fedHikeProbability,
              recessionProbability12m: pmContext.signals.recessionProbability12m,
              macroUncertaintyIndex: pmContext.signals.macroUncertaintyIndex,
              policyEventRisk: pmContext.signals.policyEventRisk,
              marketConfidence: pmContext.signals.marketConfidence,
              cpiSurpriseDirection: pmContext.scores.cpiSurpriseDirection,
              gdpSurpriseDirection: pmContext.scores.gdpSurpriseDirection,
              timestamp: pmContext.signals.timestamp,
              platforms: pmContext.signals.platforms,
            }
          : undefined,
      };
    } catch (error) {
      log.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to gather external context"
      );
      return {
        news: [],
        sentiment: {},
        macroIndicators: {},
        predictionMarketSignals: undefined,
      };
    }
  },
});
