/**
 * Analysts Step
 *
 * Fourth step in the OODA trading cycle. Runs news analyst and fundamentals
 * analyst agents in parallel, with each processing symbols in batches to
 * improve structured output reliability.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createNodeLogger } from "@cream/logger";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { fundamentalsAnalyst, newsAnalyst } from "../../../agents/index.js";

const log = createNodeLogger({ service: "trading-cycle:analysts" });

import { getModelId } from "@cream/domain";
import { xmlPredictionMarketSignals } from "../prompt-helpers.js";
import {
	FundamentalsAnalysisSchema,
	PredictionMarketSignalsSchema,
	RegimeDataSchema,
	SentimentAnalysisSchema,
} from "../schemas.js";

// ============================================
// Constants
// ============================================

const BATCH_SIZE = 5;

// ============================================
// Schemas
// ============================================

const SymbolContextSchema = z.object({
	symbol: z.string(),
	news: z.array(z.string()),
	fundamentals: z.array(z.string()),
	bullCase: z.array(z.string()),
	bearCase: z.array(z.string()),
});

const GlobalContextSchema = z.object({
	macro: z.array(z.string()),
	events: z.array(z.string()),
});

const AnalystsInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	instruments: z.array(z.string()).min(1).describe("Symbols to analyze"),
	regimeLabels: z.record(z.string(), RegimeDataSchema).describe("Regime labels for context"),
	groundingContext: z
		.object({
			perSymbol: z.array(SymbolContextSchema),
			global: GlobalContextSchema,
		})
		.optional()
		.describe("Grounding context from previous step"),
	predictionMarketSignals: PredictionMarketSignalsSchema.optional().describe(
		"Prediction market signals from orient step",
	),
});

const AnalystsOutputSchema = z.object({
	cycleId: z.string(),
	newsAnalysis: z.array(SentimentAnalysisSchema),
	fundamentalsAnalysis: z.array(FundamentalsAnalysisSchema),
	errors: z.array(z.string()),
	warnings: z.array(z.string()),
	metrics: z.object({
		totalMs: z.number(),
		newsAnalystMs: z.number(),
		fundamentalsAnalystMs: z.number(),
		batchCount: z.number(),
	}),
});

// ============================================
// Step Definition
// ============================================

export const analystsStep = createStep({
	id: "analysts-parallel",
	description: "Run news and fundamentals analysts in parallel with batched symbols",
	inputSchema: AnalystsInputSchema,
	outputSchema: AnalystsOutputSchema,
	execute: async ({ inputData }) => {
		const startTime = performance.now();
		const { cycleId, instruments, regimeLabels, groundingContext, predictionMarketSignals } =
			inputData;
		const errors: string[] = [];
		const warnings: string[] = [];

		const batches = chunk(instruments, BATCH_SIZE);
		log.info(
			{
				cycleId,
				symbolCount: instruments.length,
				batchCount: batches.length,
				batchSize: BATCH_SIZE,
			},
			"Starting analysts step with batching",
		);

		// Run news and fundamentals analysts in parallel, each processing batches sequentially
		const newsStart = performance.now();
		const fundamentalsStart = performance.now();

		const [newsResults, fundamentalsResults] = await Promise.all([
			runNewsAnalystBatched(
				cycleId,
				batches,
				regimeLabels,
				groundingContext,
				predictionMarketSignals,
				errors,
			),
			runFundamentalsAnalystBatched(
				cycleId,
				batches,
				regimeLabels,
				groundingContext,
				predictionMarketSignals,
				errors,
			),
		]);

		const newsAnalystMs = performance.now() - newsStart;
		const fundamentalsAnalystMs = performance.now() - fundamentalsStart;

		log.info(
			{
				cycleId,
				newsResultCount: newsResults.length,
				fundamentalsResultCount: fundamentalsResults.length,
				errorCount: errors.length,
				warningCount: warnings.length,
			},
			"Completed analysts step",
		);

		return {
			cycleId,
			newsAnalysis: newsResults,
			fundamentalsAnalysis: fundamentalsResults,
			errors,
			warnings,
			metrics: {
				totalMs: performance.now() - startTime,
				newsAnalystMs,
				fundamentalsAnalystMs,
				batchCount: batches.length,
			},
		};
	},
});

// ============================================
// Helper Functions
// ============================================

function chunk<T>(array: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		result.push(array.slice(i, i + size));
	}
	return result;
}

async function runNewsAnalystBatched(
	cycleId: string,
	batches: string[][],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	groundingContext:
		| {
				perSymbol: z.infer<typeof SymbolContextSchema>[];
				global: z.infer<typeof GlobalContextSchema>;
		  }
		| undefined,
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
	errors: string[],
): Promise<z.infer<typeof SentimentAnalysisSchema>[]> {
	const allResults: z.infer<typeof SentimentAnalysisSchema>[] = [];

	for (let i = 0; i < batches.length; i++) {
		const batch = batches[i];
		if (!batch) continue;

		log.debug(
			{ cycleId, batchIndex: i + 1, batchCount: batches.length, symbols: batch },
			"Processing news analyst batch",
		);

		try {
			const prompt = buildNewsAnalystPrompt(
				batch,
				regimeLabels,
				groundingContext,
				predictionMarketSignals,
			);

			log.info(
				{
					cycleId,
					batchIndex: i + 1,
					promptLength: prompt.length,
					promptPreview: prompt.slice(0, 500),
				},
				"News analyst batch prompt built",
			);
			log.debug({ cycleId, batchIndex: i + 1, fullPrompt: prompt }, "Full news analyst prompt");

			const response = await newsAnalyst.generate(prompt, {
				structuredOutput: {
					schema: z.array(SentimentAnalysisSchema),
					model: getModelId(),
				},
				abortSignal: AbortSignal.timeout(600_000), // 10 min per batch
			});

			if (response.object) {
				allResults.push(...response.object);
				log.debug(
					{ cycleId, batchIndex: i + 1, resultCount: response.object.length },
					"News analyst batch complete",
				);
			}
		} catch (err) {
			const errorMsg = `News analyst batch ${i + 1}/${batches.length} failed: ${formatError(err)}`;
			errors.push(errorMsg);
			log.error(
				{ cycleId, batchIndex: i + 1, error: formatError(err) },
				"News analyst batch failed",
			);
		}
	}

	return allResults;
}

async function runFundamentalsAnalystBatched(
	cycleId: string,
	batches: string[][],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	groundingContext:
		| {
				perSymbol: z.infer<typeof SymbolContextSchema>[];
				global: z.infer<typeof GlobalContextSchema>;
		  }
		| undefined,
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
	errors: string[],
): Promise<z.infer<typeof FundamentalsAnalysisSchema>[]> {
	const allResults: z.infer<typeof FundamentalsAnalysisSchema>[] = [];

	for (let i = 0; i < batches.length; i++) {
		const batch = batches[i];
		if (!batch) continue;

		log.debug(
			{ cycleId, batchIndex: i + 1, batchCount: batches.length, symbols: batch },
			"Processing fundamentals analyst batch",
		);

		try {
			const prompt = buildFundamentalsPrompt(
				batch,
				regimeLabels,
				groundingContext,
				predictionMarketSignals,
			);

			log.info(
				{
					cycleId,
					batchIndex: i + 1,
					promptLength: prompt.length,
					promptPreview: prompt.slice(0, 500),
				},
				"Fundamentals analyst batch prompt built",
			);
			log.debug(
				{ cycleId, batchIndex: i + 1, fullPrompt: prompt },
				"Full fundamentals analyst prompt",
			);

			const response = await fundamentalsAnalyst.generate(prompt, {
				structuredOutput: {
					schema: z.array(FundamentalsAnalysisSchema),
					model: getModelId(),
				},
				abortSignal: AbortSignal.timeout(600_000), // 10 min per batch
			});

			if (response.object) {
				allResults.push(...response.object);
				log.debug(
					{ cycleId, batchIndex: i + 1, resultCount: response.object.length },
					"Fundamentals analyst batch complete",
				);
			}
		} catch (err) {
			const errorMsg = `Fundamentals analyst batch ${i + 1}/${batches.length} failed: ${formatError(err)}`;
			errors.push(errorMsg);
			log.error(
				{ cycleId, batchIndex: i + 1, error: formatError(err) },
				"Fundamentals analyst batch failed",
			);
		}
	}

	return allResults;
}

function buildNewsAnalystPrompt(
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	groundingContext:
		| {
				perSymbol: z.infer<typeof SymbolContextSchema>[];
				global: z.infer<typeof GlobalContextSchema>;
		  }
		| undefined,
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
): string {
	const symbolSections = instruments.map((symbol) => {
		const regime = regimeLabels[symbol];
		const ctx = groundingContext?.perSymbol.find((s) => s.symbol === symbol);
		const parts: string[] = [];
		if (regime)
			parts.push(
				`  <regime classification="${regime.regime}" confidence="${regime.confidence}" />`,
			);
		if (ctx?.news?.length) parts.push(`  <news>${ctx.news.join("; ")}</news>`);
		if (ctx?.bullCase?.length) parts.push(`  <bull_case>${ctx.bullCase.join("; ")}</bull_case>`);
		if (ctx?.bearCase?.length) parts.push(`  <bear_case>${ctx.bearCase.join("; ")}</bear_case>`);
		return `<instrument symbol="${symbol}">\n${parts.join("\n")}\n</instrument>`;
	});

	const globalSection = groundingContext?.global?.macro?.length
		? `<global_macro>\n${groundingContext.global.macro.map((m) => `  <item>${m}</item>`).join("\n")}\n</global_macro>\n`
		: "";

	const predictionSection = xmlPredictionMarketSignals(predictionMarketSignals);

	return `Analyze news and sentiment for all symbols. Consider cross-market themes.

<instruments>
${symbolSections.join("\n")}
</instruments>

${globalSection}${predictionSection}

Return analysis for each symbol.`;
}

function buildFundamentalsPrompt(
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	groundingContext:
		| {
				perSymbol: z.infer<typeof SymbolContextSchema>[];
				global: z.infer<typeof GlobalContextSchema>;
		  }
		| undefined,
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
): string {
	const symbolSections = instruments.map((symbol) => {
		const regime = regimeLabels[symbol];
		const ctx = groundingContext?.perSymbol.find((s) => s.symbol === symbol);
		const parts: string[] = [];
		if (regime)
			parts.push(
				`  <regime classification="${regime.regime}" confidence="${regime.confidence}" />`,
			);
		if (ctx?.fundamentals?.length)
			parts.push(`  <fundamentals>${ctx.fundamentals.join("; ")}</fundamentals>`);
		if (ctx?.bullCase?.length) parts.push(`  <bull_case>${ctx.bullCase.join("; ")}</bull_case>`);
		if (ctx?.bearCase?.length) parts.push(`  <bear_case>${ctx.bearCase.join("; ")}</bear_case>`);
		return `<instrument symbol="${symbol}">\n${parts.join("\n")}\n</instrument>`;
	});

	const globalParts: string[] = [];
	if (groundingContext?.global?.macro?.length) {
		globalParts.push(`  <macro>${groundingContext.global.macro.join("; ")}</macro>`);
	}
	if (groundingContext?.global?.events?.length) {
		globalParts.push(`  <events>${groundingContext.global.events.join("; ")}</events>`);
	}
	const globalSection = globalParts.length
		? `<global_context>\n${globalParts.join("\n")}\n</global_context>\n`
		: "";
	const predictionSection = xmlPredictionMarketSignals(predictionMarketSignals);

	return `Analyze fundamentals and valuation for all symbols. Consider sector themes.

<instruments>
${symbolSections.join("\n")}
</instruments>

${globalSection}${predictionSection}

Return analysis for each symbol.`;
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
