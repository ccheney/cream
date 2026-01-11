/**
 * External Context Tools
 *
 * Deep extraction pipeline for news, transcripts, and macro data
 * using structured outputs via @cream/external-context.
 */

import { type ExecutionContext, isBacktest } from "@cream/domain";
import {
  type ContentScores,
  type ContentSourceType,
  createExtractionPipeline,
  type ExtractedEvent,
  type ExtractionResult,
  type PipelineResult,
} from "@cream/external-context";
import { getFMPClient } from "../clients.js";

// ============================================
// Types
// ============================================

export interface ExtractNewsContextParams {
  /** Stock symbols to focus on */
  symbols: string[];
  /** Maximum number of articles to process */
  limit?: number;
  /** Enable dry run (skip LLM calls) - useful for testing */
  dryRun?: boolean;
}

export interface ExtractNewsContextResult {
  events: ExtractedEvent[];
  stats: PipelineResult["stats"];
  errors: PipelineResult["errors"];
}

export interface ExtractTranscriptParams {
  /** Stock symbol (e.g., "AAPL") */
  symbol: string;
  /** Fiscal year */
  year: number;
  /** Fiscal quarter (1-4) */
  quarter: number;
  /** Enable dry run (skip LLM calls) */
  dryRun?: boolean;
}

export interface ExtractTranscriptResult {
  event: ExtractedEvent | null;
  stats: PipelineResult["stats"];
  error?: string;
}

export interface AnalyzeContentParams {
  /** Raw content to analyze */
  content: string;
  /** Type of content */
  sourceType: ContentSourceType;
  /** Related symbols (optional) */
  symbols?: string[];
  /** Enable dry run (skip LLM calls) */
  dryRun?: boolean;
}

export interface AnalyzeContentResult {
  extraction: ExtractionResult | null;
  scores: ContentScores | null;
  relatedSymbols: string[];
  error?: string;
}

// ============================================
// Implementations
// ============================================

/**
 * Extract and analyze news context for symbols
 *
 * Uses the full external-context extraction pipeline:
 * 1. Fetches news from FMP API
 * 2. Runs structured outputs extraction
 * 3. Computes sentiment, importance, and surprise scores
 * 4. Links entities to ticker symbols
 *
 * @param ctx - ExecutionContext
 * @param params - Extraction parameters
 * @returns Extracted events with scores and entity links
 */
export async function extractNewsContext(
  ctx: ExecutionContext,
  params: ExtractNewsContextParams
): Promise<ExtractNewsContextResult> {
  const { symbols, limit = 10, dryRun = false } = params;

  // In backtest mode, return empty result for consistent/fast execution
  if (isBacktest(ctx)) {
    return {
      events: [],
      stats: { inputCount: 0, successCount: 0, errorCount: 0, processingTimeMs: 0 },
      errors: [],
    };
  }

  const client = getFMPClient();
  if (!client) {
    return {
      events: [],
      stats: { inputCount: 0, successCount: 0, errorCount: 0, processingTimeMs: 0 },
      errors: [{ content: "FMP client", error: "FMP_KEY not configured" }],
    };
  }

  try {
    // Fetch news from FMP
    const newsItems = await client.getStockNews(symbols, limit);

    // Transform to FMPNewsArticle format expected by pipeline
    const articles = newsItems.map((item) => ({
      symbol: item.symbol,
      publishedDate: item.publishedDate,
      title: item.title,
      image: item.image,
      site: item.site,
      text: item.text,
      url: item.url,
    }));

    // Create pipeline with target symbols for relevance scoring
    const pipeline = createExtractionPipeline({
      targetSymbols: symbols,
      dryRun,
    });

    // Process through extraction pipeline
    const result = await pipeline.processNews(articles);

    return {
      events: result.events,
      stats: result.stats,
      errors: result.errors,
    };
  } catch (error) {
    return {
      events: [],
      stats: { inputCount: 0, successCount: 0, errorCount: 0, processingTimeMs: 0 },
      errors: [
        { content: "pipeline", error: error instanceof Error ? error.message : "Unknown error" },
      ],
    };
  }
}

/**
 * Extract and analyze earnings transcript
 *
 * @deprecated Use `graphrag_query` tool instead for unified semantic search
 * across filings, transcripts, news, and events. This tool requires FMP Ultimate
 * tier subscription ($149/month) and is narrowly scoped to single company/quarter.
 *
 * See docs/plans/34-graphrag-query-tool.md for migration details.
 *
 * Fetches earnings call transcript and runs deep extraction:
 * 1. Fetches transcript from FMP API
 * 2. Parses speaker segments and executive comments
 * 3. Extracts guidance, metrics, and key insights
 * 4. Computes sentiment and importance scores
 *
 * @param ctx - ExecutionContext
 * @param params - Transcript parameters
 * @returns Extracted transcript event with analysis
 */
export async function extractTranscript(
  ctx: ExecutionContext,
  params: ExtractTranscriptParams
): Promise<ExtractTranscriptResult> {
  const { symbol, year, quarter, dryRun = false } = params;

  // In backtest mode, return empty result
  if (isBacktest(ctx)) {
    return {
      event: null,
      stats: { inputCount: 0, successCount: 0, errorCount: 0, processingTimeMs: 0 },
    };
  }

  const client = getFMPClient();
  if (!client) {
    return {
      event: null,
      stats: { inputCount: 0, successCount: 0, errorCount: 0, processingTimeMs: 0 },
      error: "FMP_KEY not configured",
    };
  }

  try {
    // Fetch transcript from FMP
    const transcripts = await client.getEarningsTranscript(symbol, year, quarter);

    if (transcripts.length === 0) {
      return {
        event: null,
        stats: { inputCount: 0, successCount: 0, errorCount: 0, processingTimeMs: 0 },
        error: `No transcript found for ${symbol} Q${quarter} ${year}`,
      };
    }

    // Transform to FMPTranscript format
    const transcript = transcripts[0];
    const fmpTranscripts = [
      {
        symbol: transcript?.symbol ?? symbol,
        quarter,
        year,
        date: transcript?.date ?? new Date().toISOString(),
        content: transcript?.content ?? "",
      },
    ];

    // Create pipeline with target symbol
    const pipeline = createExtractionPipeline({
      targetSymbols: [symbol],
      dryRun,
    });

    // Process transcript
    const result = await pipeline.processTranscripts(fmpTranscripts);

    return {
      event: result.events[0] ?? null,
      stats: result.stats,
      error: result.errors[0]?.error,
    };
  } catch (error) {
    return {
      event: null,
      stats: { inputCount: 0, successCount: 0, errorCount: 0, processingTimeMs: 0 },
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Analyze arbitrary content with extraction pipeline
 *
 * Runs content through the full extraction pipeline:
 * 1. Structured outputs extraction
 * 2. Entity recognition and linking
 * 3. Sentiment, importance, surprise scoring
 *
 * Use for press releases, SEC filings, or other text content.
 *
 * @param ctx - ExecutionContext
 * @param params - Content and analysis parameters
 * @returns Extraction result with scores
 */
export async function analyzeContent(
  ctx: ExecutionContext,
  params: AnalyzeContentParams
): Promise<AnalyzeContentResult> {
  const { content, sourceType, symbols = [], dryRun = false } = params;

  // In backtest mode, return empty result
  if (isBacktest(ctx)) {
    return {
      extraction: null,
      scores: null,
      relatedSymbols: [],
    };
  }

  try {
    // Create pipeline
    const pipeline = createExtractionPipeline({
      targetSymbols: symbols,
      dryRun,
    });

    // Process single content item
    const event = await pipeline.processContent(
      content,
      sourceType,
      new Date(),
      "user_provided",
      symbols
    );

    if (!event) {
      return {
        extraction: null,
        scores: null,
        relatedSymbols: [],
        error: "Extraction failed",
      };
    }

    return {
      extraction: event.extraction,
      scores: event.scores,
      relatedSymbols: event.relatedInstrumentIds,
    };
  } catch (error) {
    return {
      extraction: null,
      scores: null,
      relatedSymbols: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
