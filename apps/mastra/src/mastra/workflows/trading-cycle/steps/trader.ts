/**
 * Trader Step
 *
 * Sixth step in the OODA trading cycle. Synthesizes all analysis
 * (bullish/bearish research, news, fundamentals) into a decision plan.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { trader } from "../../../agents/index.js";
import { DecisionPlanSchema, type DecisionSchema, ResearchSchema } from "../schemas.js";

// ============================================
// Schemas
// ============================================

const TraderInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	instruments: z.array(z.string()).min(1).describe("Symbols to trade"),
	bullishResearch: z.array(ResearchSchema).describe("Bullish research from debate step"),
	bearishResearch: z.array(ResearchSchema).describe("Bearish research from debate step"),
});

const TraderOutputSchema = z.object({
	cycleId: z.string(),
	decisionPlan: DecisionPlanSchema,
	errors: z.array(z.string()),
	warnings: z.array(z.string()),
	metrics: z.object({
		totalMs: z.number(),
	}),
});

// ============================================
// Step Definition
// ============================================

export const traderStep = createStep({
	id: "trader-synthesize",
	description: "Synthesize research into decision plan",
	inputSchema: TraderInputSchema,
	outputSchema: TraderOutputSchema,
	execute: async ({ inputData }) => {
		const startTime = performance.now();
		const { cycleId, instruments, bullishResearch, bearishResearch } = inputData;
		const errors: string[] = [];
		const warnings: string[] = [];

		const decisionPlan = await runTraderAgent(
			cycleId,
			instruments,
			bullishResearch,
			bearishResearch,
			errors,
			warnings,
		);

		return {
			cycleId,
			decisionPlan,
			errors,
			warnings,
			metrics: {
				totalMs: performance.now() - startTime,
			},
		};
	},
});

// ============================================
// Helper Functions
// ============================================

async function runTraderAgent(
	cycleId: string,
	instruments: string[],
	bullishResearch: z.infer<typeof ResearchSchema>[],
	bearishResearch: z.infer<typeof ResearchSchema>[],
	errors: string[],
	warnings: string[],
): Promise<z.infer<typeof DecisionPlanSchema>> {
	const emptyPlan: z.infer<typeof DecisionPlanSchema> = {
		cycleId,
		timestamp: new Date().toISOString(),
		decisions: [],
		portfolioNotes: "No decisions generated",
	};

	try {
		const prompt = buildTraderPrompt(cycleId, instruments, bullishResearch, bearishResearch);
		const response = await trader.generate(prompt);

		return parseDecisionPlan(cycleId, response.text, instruments, warnings) ?? emptyPlan;
	} catch (err) {
		errors.push(`Trader agent failed: ${formatError(err)}`);
		return emptyPlan;
	}
}

function buildTraderPrompt(
	cycleId: string,
	instruments: string[],
	bullishResearch: z.infer<typeof ResearchSchema>[],
	bearishResearch: z.infer<typeof ResearchSchema>[],
): string {
	const parts = [
		`Create a decision plan for cycle ${cycleId}.`,
		`Instruments: ${instruments.join(", ")}`,
	];

	for (const symbol of instruments) {
		const bullish = bullishResearch.find((r) => r.instrument_id === symbol);
		const bearish = bearishResearch.find((r) => r.instrument_id === symbol);

		parts.push(`\n## ${symbol}`);

		if (bullish) {
			parts.push(`**Bullish Thesis** (conviction: ${bullish.conviction_level}):`);
			parts.push(bullish.thesis);
			if (bullish.supporting_factors.length > 0) {
				parts.push(
					`Supporting factors: ${bullish.supporting_factors.map((f) => `${f.factor} (${f.source}: ${f.strength})`).join(", ")}`,
				);
			}
			parts.push(`Strongest counterargument: ${bullish.strongest_counterargument}`);
		}

		if (bearish) {
			parts.push(`**Bearish Thesis** (conviction: ${bearish.conviction_level}):`);
			parts.push(bearish.thesis);
			if (bearish.supporting_factors.length > 0) {
				parts.push(
					`Supporting factors: ${bearish.supporting_factors.map((f) => `${f.factor} (${f.source}: ${f.strength})`).join(", ")}`,
				);
			}
			parts.push(`Strongest counterargument: ${bearish.strongest_counterargument}`);
		}
	}

	parts.push(`\nReturn JSON with:
- decisions: array of {decisionId, instrumentId, action (BUY/SELL/HOLD/CLOSE), direction (LONG/SHORT/FLAT), size {value, unit}, stopLoss?, takeProfit?, strategyFamily, timeHorizon, rationale {summary, bullishFactors[], bearishFactors[], decisionLogic, memoryReferences[]}, thesisState, confidence (0-1)}
- portfolioNotes: overall portfolio commentary`);

	return parts.join("\n");
}

function parseDecisionPlan(
	cycleId: string,
	text: string,
	_instruments: string[],
	warnings: string[],
): z.infer<typeof DecisionPlanSchema> | null {
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		warnings.push("Could not extract JSON from trader response");
		return null;
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

		const decisions: z.infer<typeof DecisionSchema>[] = [];

		if (Array.isArray(parsed.decisions)) {
			for (const d of parsed.decisions) {
				const dec = d as Record<string, unknown>;
				decisions.push({
					decisionId: String(dec.decisionId ?? `${cycleId}-${dec.instrumentId}`),
					instrumentId: String(dec.instrumentId ?? ""),
					action: (dec.action as "BUY" | "SELL" | "HOLD" | "CLOSE") ?? "HOLD",
					direction: (dec.direction as "LONG" | "SHORT" | "FLAT") ?? "FLAT",
					size: {
						value: Number((dec.size as Record<string, unknown>)?.value ?? 0),
						unit: String((dec.size as Record<string, unknown>)?.unit ?? "SHARES"),
					},
					stopLoss: dec.stopLoss
						? {
								price: Number((dec.stopLoss as Record<string, unknown>).price ?? 0),
								type:
									((dec.stopLoss as Record<string, unknown>).type as "FIXED" | "TRAILING") ??
									"FIXED",
							}
						: undefined,
					takeProfit: dec.takeProfit
						? { price: Number((dec.takeProfit as Record<string, unknown>).price ?? 0) }
						: undefined,
					strategyFamily: String(dec.strategyFamily ?? "EQUITY_LONG"),
					timeHorizon: String(dec.timeHorizon ?? "SWING"),
					rationale: {
						summary: String((dec.rationale as Record<string, unknown>)?.summary ?? ""),
						bullishFactors: Array.isArray(
							(dec.rationale as Record<string, unknown>)?.bullishFactors,
						)
							? ((dec.rationale as Record<string, unknown>).bullishFactors as string[])
							: [],
						bearishFactors: Array.isArray(
							(dec.rationale as Record<string, unknown>)?.bearishFactors,
						)
							? ((dec.rationale as Record<string, unknown>).bearishFactors as string[])
							: [],
						decisionLogic: String((dec.rationale as Record<string, unknown>)?.decisionLogic ?? ""),
						memoryReferences: Array.isArray(
							(dec.rationale as Record<string, unknown>)?.memoryReferences,
						)
							? ((dec.rationale as Record<string, unknown>).memoryReferences as string[])
							: [],
					},
					thesisState: String(dec.thesisState ?? "WATCHING"),
					confidence: Number(dec.confidence ?? 0.5),
					legs: undefined,
					netLimitPrice: undefined,
				});
			}
		}

		return {
			cycleId,
			timestamp: new Date().toISOString(),
			decisions,
			portfolioNotes: String(parsed.portfolioNotes ?? ""),
		};
	} catch {
		warnings.push("Failed to parse trader response JSON");
		return null;
	}
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
