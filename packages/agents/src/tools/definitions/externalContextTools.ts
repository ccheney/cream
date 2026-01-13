/**
 * External Context Mastra Tool Definitions
 *
 * Deep extraction tools using @cream/external-context pipeline.
 * Provides LLM-powered sentiment analysis, entity extraction,
 * and importance scoring for news, transcripts, and custom content.
 */

import { createContext, requireEnv } from "@cream/domain";
import { EventTypeSchema, ExtractionResultSchema } from "@cream/external-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { analyzeContent, extractNewsContext } from "../implementations/index.js";

/**
 * Create ExecutionContext for tool invocation.
 */
function createToolContext() {
  return createContext(requireEnv(), "scheduled");
}

// ============================================
// Shared Schemas
// ============================================

const ContentScoresSchema = z.object({
  sentimentScore: z.number().describe("Sentiment from -1.0 (bearish) to 1.0 (bullish)"),
  importanceScore: z.number().describe("Importance from 0.0 to 1.0"),
  surpriseScore: z.number().describe("Surprise from -1.0 to 1.0 (actual vs expected)"),
});

const ExtractedEventSchema = z.object({
  eventId: z.string(),
  sourceType: z.enum(["news", "press_release", "transcript", "macro"]),
  eventType: EventTypeSchema,
  eventTime: z.string(),
  extraction: ExtractionResultSchema,
  scores: ContentScoresSchema,
  relatedInstrumentIds: z.array(z.string()),
  originalContent: z.string(),
  processedAt: z.string(),
});

const StatsSchema = z.object({
  inputCount: z.number(),
  successCount: z.number(),
  errorCount: z.number(),
  processingTimeMs: z.number(),
});

const ErrorSchema = z.object({
  content: z.string(),
  error: z.string(),
});

// ============================================
// Extract News Context Tool
// ============================================

const ExtractNewsContextInputSchema = z.object({
  symbols: z
    .array(z.string())
    .min(1)
    .describe("Stock symbols to analyze news for (e.g., ['AAPL', 'MSFT'])"),
  limit: z.number().min(1).max(20).optional().describe("Maximum articles to process (default: 10)"),
  dryRun: z.boolean().optional().describe("Skip LLM calls for testing (default: false)"),
});

const ExtractNewsContextOutputSchema = z.object({
  events: z.array(ExtractedEventSchema),
  stats: StatsSchema,
  errors: z.array(ErrorSchema),
});

type ExtractNewsContextOutput = z.infer<typeof ExtractNewsContextOutputSchema>;

export const extractNewsContextTool = createTool({
  id: "extract_news_context",
  description: `Deep extraction and analysis of news for symbols using structured outputs.

Use this tool when you need:
- LLM-powered sentiment analysis (not just keyword matching)
- Entity extraction and ticker symbol linking
- Importance and surprise scoring for prioritization
- Event type classification (earnings, M&A, regulatory, etc.)
- Key insights extraction for decision support

This is more sophisticated than news_search which only provides basic keyword sentiment.
Returns full extraction results with:
- sentiment: bullish/bearish/neutral with confidence score
- entities: companies, people, products mentioned with ticker links
- dataPoints: numeric metrics extracted (revenue, growth %, etc.)
- eventType: classification for event-driven analysis
- scores: sentimentScore, importanceScore, surpriseScore

Requires FMP_KEY for news fetching.`,
  inputSchema: ExtractNewsContextInputSchema,
  outputSchema: ExtractNewsContextOutputSchema,
  execute: async (inputData): Promise<ExtractNewsContextOutput> => {
    const ctx = createToolContext();
    const result = await extractNewsContext(ctx, {
      symbols: inputData.symbols,
      limit: inputData.limit,
      dryRun: inputData.dryRun,
    });
    // Convert Date objects to ISO strings for JSON serialization
    return {
      events: result.events.map((e) => ({
        eventId: e.eventId,
        sourceType: e.sourceType,
        eventType: e.eventType,
        eventTime: e.eventTime.toISOString(),
        extraction: e.extraction,
        scores: e.scores,
        relatedInstrumentIds: e.relatedInstrumentIds,
        originalContent: e.originalContent,
        processedAt: e.processedAt.toISOString(),
      })),
      stats: result.stats,
      errors: result.errors,
    };
  },
});

// ============================================
// Analyze Content Tool
// ============================================

const AnalyzeContentInputSchema = z.object({
  content: z.string().min(10).describe("Raw text content to analyze"),
  sourceType: z.enum(["news", "press_release", "transcript", "macro"]).describe("Type of content"),
  symbols: z.array(z.string()).optional().describe("Related symbols for relevance scoring"),
  dryRun: z.boolean().optional().describe("Skip LLM calls for testing (default: false)"),
});

const AnalyzeContentOutputSchema = z.object({
  extraction: ExtractionResultSchema.nullable(),
  scores: ContentScoresSchema.nullable(),
  relatedSymbols: z.array(z.string()),
});

type AnalyzeContentOutput = z.infer<typeof AnalyzeContentOutputSchema>;

export const analyzeContentTool = createTool({
  id: "analyze_content",
  description: `Analyze arbitrary text content with extraction pipeline.

Use this tool for deep analysis of:
- Press releases
- SEC filing excerpts
- Custom news or research content
- Any text requiring sentiment/entity/importance analysis

Runs the full extraction pipeline:
1. Structured outputs extraction
2. Entity recognition with ticker linking
3. Sentiment scoring (-1.0 to 1.0)
4. Importance scoring (0.0 to 1.0)
5. Surprise scoring vs expectations

Returns:
- extraction: Full extraction result (sentiment, entities, dataPoints, eventType, keyInsights)
- scores: Numeric scores for sentiment, importance, surprise
- relatedSymbols: Ticker symbols identified from entities`,
  inputSchema: AnalyzeContentInputSchema,
  outputSchema: AnalyzeContentOutputSchema,
  execute: async (inputData): Promise<AnalyzeContentOutput> => {
    const ctx = createToolContext();
    const result = await analyzeContent(ctx, {
      content: inputData.content,
      sourceType: inputData.sourceType,
      symbols: inputData.symbols,
      dryRun: inputData.dryRun,
    });
    // Throw on error so mastra can handle it
    if (result.error) {
      throw new Error(result.error);
    }
    return {
      extraction: result.extraction,
      scores: result.scores,
      relatedSymbols: result.relatedSymbols,
    };
  },
});

// ============================================
// Schema Exports
// ============================================

export {
  AnalyzeContentInputSchema,
  AnalyzeContentOutputSchema,
  ContentScoresSchema,
  ExtractedEventSchema,
  ExtractNewsContextInputSchema,
  ExtractNewsContextOutputSchema,
};
