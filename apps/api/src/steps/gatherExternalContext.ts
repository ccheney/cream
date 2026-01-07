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
 * Events are stored to the external_events table for retrieval.
 */

import { isBacktest } from "@cream/domain";
import {
  createExtractionPipeline,
  type ExtractedEvent,
  type FMPNewsArticle,
} from "@cream/external-context";
import type { CreateExternalEventInput } from "@cream/storage";
import { createFMPClient, type FMPClient, type FMPStockNews } from "@cream/universe";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { getExternalEventsRepo } from "../db.js";
import { MemoryOutputSchema } from "./retrieveMemory.js";

export const ExternalContextSchema = z.object({
  news: z.array(z.any()),
  sentiment: z.record(z.string(), z.number()),
  macroIndicators: z.record(z.string(), z.number()),
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
    // In backtest mode, return empty context for faster execution
    if (isBacktest()) {
      return {
        news: [],
        sentiment: {},
        macroIndicators: {},
      };
    }

    // Check if FMP API is available
    const client = getFMPClient();
    if (!client) {
      // No API key configured - return empty context
      return {
        news: [],
        sentiment: {},
        macroIndicators: {},
      };
    }

    // Create extraction pipeline with dry-run mode (skip LLM calls for now)
    // TODO: Remove dryRun when LLM extraction is fully tested
    const pipeline = createExtractionPipeline({
      dryRun: true,
    });

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

      // Combine all events
      const allEvents = [...newsResults.events, ...macroResults.events];

      // Store events to database (fire-and-forget, don't block workflow)
      if (allEvents.length > 0) {
        getExternalEventsRepo()
          .then((repo) => repo.createMany(allEvents.map(toStorageEvent)))
          .catch((err) => {
            // Log but don't fail - storage is non-critical for workflow
            console.warn("[gatherExternalContext] Failed to store events:", err);
          });
      }

      // Extract sentiment by symbol
      const sentiment = extractSentimentBySymbol(newsResults.events);

      // Extract macro indicators
      const macroIndicators = extractMacroIndicators(macroResults.events);

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
      };
    } catch (_error) {
      // Error gathering external context - return empty context to avoid blocking workflow
      return {
        news: [],
        sentiment: {},
        macroIndicators: {},
      };
    }
  },
});
