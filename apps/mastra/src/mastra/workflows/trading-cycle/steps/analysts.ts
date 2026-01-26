/**
 * Analysts Step
 *
 * Fourth step in the OODA trading cycle. Runs news analyst and fundamentals
 * analyst agents in parallel to gather analysis for all instruments at once.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createNodeLogger } from "@cream/logger";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { fundamentalsAnalyst, newsAnalyst } from "../../../agents/index.js";

const log = createNodeLogger({ service: "trading-cycle:analysts" });

import {
	FundamentalsAnalysisSchema,
	RegimeDataSchema,
	SentimentAnalysisSchema,
} from "../schemas.js";

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
	}),
});

// ============================================
// Step Definition
// ============================================

export const analystsStep = createStep({
	id: "analysts-parallel",
	description: "Run news and fundamentals analysts in parallel",
	inputSchema: AnalystsInputSchema,
	outputSchema: AnalystsOutputSchema,
	execute: async ({ inputData }) => {
		const startTime = performance.now();
		const { cycleId, instruments, regimeLabels, groundingContext } = inputData;
		const errors: string[] = [];
		const warnings: string[] = [];

		log.info({ cycleId, symbolCount: instruments.length }, "Starting analysts step");

		// Run analysts in parallel
		const newsStart = performance.now();
		const fundamentalsStart = performance.now();

		const [newsResults, fundamentalsResults] = await Promise.all([
			runNewsAnalyst(cycleId, instruments, regimeLabels, groundingContext, errors, warnings),
			runFundamentalsAnalyst(
				cycleId,
				instruments,
				regimeLabels,
				groundingContext,
				errors,
				warnings,
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
			},
		};
	},
});

// ============================================
// Helper Functions
// ============================================

async function runNewsAnalyst(
	cycleId: string,
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	groundingContext:
		| {
				perSymbol: z.infer<typeof SymbolContextSchema>[];
				global: z.infer<typeof GlobalContextSchema>;
		  }
		| undefined,
	errors: string[],
	_warnings: string[],
): Promise<z.infer<typeof SentimentAnalysisSchema>[]> {
	try {
		const prompt = buildNewsAnalystPrompt(instruments, regimeLabels, groundingContext);
		log.debug({ cycleId, symbolCount: instruments.length }, "Calling news analyst");

		const response = await newsAnalyst.generate(prompt, {
			structuredOutput: {
				schema: z.array(SentimentAnalysisSchema),
			},
		});

		log.debug({ cycleId, resultCount: response.object?.length ?? 0 }, "News analysis complete");
		return response.object ?? [];
	} catch (err) {
		errors.push(`News analyst failed: ${formatError(err)}`);
		log.error({ cycleId, error: formatError(err) }, "News analyst failed");
		return [];
	}
}

async function runFundamentalsAnalyst(
	cycleId: string,
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	groundingContext:
		| {
				perSymbol: z.infer<typeof SymbolContextSchema>[];
				global: z.infer<typeof GlobalContextSchema>;
		  }
		| undefined,
	errors: string[],
	_warnings: string[],
): Promise<z.infer<typeof FundamentalsAnalysisSchema>[]> {
	try {
		const prompt = buildFundamentalsPrompt(instruments, regimeLabels, groundingContext);
		log.debug({ cycleId, symbolCount: instruments.length }, "Calling fundamentals analyst");

		const response = await fundamentalsAnalyst.generate(prompt, {
			structuredOutput: {
				schema: z.array(FundamentalsAnalysisSchema),
			},
		});

		log.debug(
			{ cycleId, resultCount: response.object?.length ?? 0 },
			"Fundamentals analysis complete",
		);
		return response.object ?? [];
	} catch (err) {
		errors.push(`Fundamentals analyst failed: ${formatError(err)}`);
		log.error({ cycleId, error: formatError(err) }, "Fundamentals analyst failed");
		return [];
	}
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
): string {
	const symbolContexts = instruments.map((symbol) => {
		const regime = regimeLabels[symbol];
		const ctx = groundingContext?.perSymbol.find((s) => s.symbol === symbol);

		const lines = [`## ${symbol}`];
		if (regime) lines.push(`Regime: ${regime.regime} (confidence: ${regime.confidence})`);
		if (ctx?.news?.length) lines.push(`News: ${ctx.news.join("; ")}`);
		if (ctx?.bullCase?.length) lines.push(`Bullish: ${ctx.bullCase.join("; ")}`);
		if (ctx?.bearCase?.length) lines.push(`Bearish: ${ctx.bearCase.join("; ")}`);
		return lines.join("\n");
	});

	const globalSection = groundingContext?.global?.macro?.length
		? `\n## Global Macro\n${groundingContext.global.macro.join("\n")}`
		: "";

	return `Analyze news and sentiment for all symbols. Consider cross-market themes.

${symbolContexts.join("\n\n")}${globalSection}

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
): string {
	const symbolContexts = instruments.map((symbol) => {
		const regime = regimeLabels[symbol];
		const ctx = groundingContext?.perSymbol.find((s) => s.symbol === symbol);

		const lines = [`## ${symbol}`];
		if (regime) lines.push(`Regime: ${regime.regime} (confidence: ${regime.confidence})`);
		if (ctx?.fundamentals?.length) lines.push(`Fundamentals: ${ctx.fundamentals.join("; ")}`);
		if (ctx?.bullCase?.length) lines.push(`Bullish: ${ctx.bullCase.join("; ")}`);
		if (ctx?.bearCase?.length) lines.push(`Bearish: ${ctx.bearCase.join("; ")}`);
		return lines.join("\n");
	});

	const globalSection = [];
	if (groundingContext?.global?.macro?.length) {
		globalSection.push(`Macro: ${groundingContext.global.macro.join("; ")}`);
	}
	if (groundingContext?.global?.events?.length) {
		globalSection.push(`Events: ${groundingContext.global.events.join("; ")}`);
	}
	const globalText = globalSection.length ? `\n## Global Context\n${globalSection.join("\n")}` : "";

	return `Analyze fundamentals and valuation for all symbols. Consider sector themes.

${symbolContexts.join("\n\n")}${globalText}

Return analysis for each symbol.`;
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
