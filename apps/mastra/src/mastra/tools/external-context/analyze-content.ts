/**
 * Analyze Content Tool
 *
 * Analyze content for sentiment, relevance, and actionability scores.
 */

import { analyzeContent as analyzeContentImpl } from "@cream/agents/implementations";
import { createContext, requireEnv } from "@cream/domain";
import { ExtractionResultSchema } from "@cream/external-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

const AnalyzeContentInputSchema = z.object({
	content: z.string().min(10).describe("Raw text content to analyze"),
	sourceType: z.enum(["news", "press_release", "transcript", "macro"]).describe("Type of content"),
	symbols: z.array(z.string()).optional().describe("Related symbols for relevance scoring"),
	dryRun: z.boolean().optional().describe("Skip LLM calls for testing (default: false)"),
});

const ContentScoresSchema = z.object({
	sentimentScore: z.number().describe("Sentiment from -1.0 (bearish) to 1.0 (bullish)"),
	importanceScore: z.number().describe("Importance from 0.0 to 1.0"),
	surpriseScore: z.number().describe("Surprise from -1.0 to 1.0 (actual vs expected)"),
});

const AnalyzeContentOutputSchema = z.object({
	extraction: ExtractionResultSchema.nullable(),
	scores: ContentScoresSchema.nullable(),
	relatedSymbols: z.array(z.string()),
});

type AnalyzeContentOutput = z.infer<typeof AnalyzeContentOutputSchema>;

export const analyzeContent = createTool({
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
		const result = await analyzeContentImpl(ctx, {
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

export { AnalyzeContentInputSchema, AnalyzeContentOutputSchema };
