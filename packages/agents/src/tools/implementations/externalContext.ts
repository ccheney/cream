/**
 * External Context Tools
 *
 * Deep extraction pipeline for news, transcripts, and macro data
 * using structured outputs via @cream/external-context with Gemini.
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
import { createExtractionClient } from "../../extraction/index.js";
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

		// Create extraction client and pipeline
		const extractionClient = createExtractionClient();
		const pipeline = createExtractionPipeline({
			extractionClient,
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
		// Create extraction client and pipeline
		const extractionClient = createExtractionClient();
		const pipeline = createExtractionPipeline({
			extractionClient,
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
