/**
 * Extract News Context Tool
 *
 * Extract events and context from news articles for trading analysis.
 */

import { extractNewsContext as extractNewsContextImpl } from "@cream/agents/implementations";
import { createContext, requireEnv } from "@cream/domain";
import { EventTypeSchema, ExtractionResultSchema } from "@cream/external-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

/**
 * Guardrail: keep raw content bounded so tool results don't explode downstream prompts.
 */
const MAX_ORIGINAL_CONTENT_CHARS = 5_000;

function truncateText(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	const omitted = text.length - maxChars;
	return `${text.slice(0, maxChars)}\n...[truncated ${omitted} chars]`;
}

const ExtractNewsContextInputSchema = z.object({
	symbols: z
		.array(z.string())
		.min(1)
		.describe("Stock symbols to analyze news for (e.g., ['AAPL', 'MSFT'])"),
	limit: z.number().min(1).max(20).optional().describe("Maximum articles to process (default: 10)"),
	dryRun: z.boolean().optional().describe("Skip LLM calls for testing (default: false)"),
});

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

const ExtractNewsContextOutputSchema = z.object({
	events: z.array(ExtractedEventSchema),
	stats: StatsSchema,
	errors: z.array(ErrorSchema),
});

type ExtractNewsContextOutput = z.infer<typeof ExtractNewsContextOutputSchema>;

export const extractNewsContext = createTool({
	id: "extract_news_context",
	description: `Deep extraction and analysis of news for symbols using structured outputs.

Use this tool when you need:
- LLM-powered sentiment analysis (not just keyword matching)
- Entity extraction and ticker symbol linking
- Importance and surprise scoring for prioritization
- Event type classification (earnings, M&A, regulatory, etc.)
- Key insights extraction for decision support

Returns full extraction results with:
- sentiment: bullish/bearish/neutral with confidence score
- entities: companies, people, products mentioned with ticker links
- dataPoints: numeric metrics extracted (revenue, growth %, etc.)
- eventType: classification for event-driven analysis
- scores: sentimentScore, importanceScore, surpriseScore

Requires ALPACA_KEY and ALPACA_SECRET for news fetching.`,
	inputSchema: ExtractNewsContextInputSchema,
	outputSchema: ExtractNewsContextOutputSchema,
	execute: async (inputData): Promise<ExtractNewsContextOutput> => {
		const ctx = createToolContext();
		const result = await extractNewsContextImpl(ctx, {
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
				originalContent: truncateText(e.originalContent, MAX_ORIGINAL_CONTENT_CHARS),
				processedAt: e.processedAt.toISOString(),
			})),
			stats: result.stats,
			errors: result.errors,
		};
	},
});

export { ExtractNewsContextInputSchema, ExtractNewsContextOutputSchema };
