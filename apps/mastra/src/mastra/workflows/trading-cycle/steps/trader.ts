/**
 * Trader Step
 *
 * Sixth step in the OODA trading cycle. Synthesizes all analysis
 * (bullish/bearish research, news, fundamentals) into a decision plan.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createNodeLogger } from "@cream/logger";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { trader } from "../../../agents/index.js";

const log = createNodeLogger({ service: "trading-cycle:trader" });

import {
	type Constraints,
	ConstraintsSchema,
	DecisionPlanSchema,
	type DecisionSchema,
	ResearchSchema,
} from "../schemas.js";

// ============================================
// Schemas
// ============================================

const TraderInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	instruments: z.array(z.string()).min(1).describe("Symbols to trade"),
	constraints: ConstraintsSchema.optional().describe("Runtime risk constraints"),
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
		const { cycleId, instruments, constraints, bullishResearch, bearishResearch } = inputData;
		const errors: string[] = [];
		const warnings: string[] = [];

		log.info(
			{
				cycleId,
				symbolCount: instruments.length,
				bullishResearchCount: bullishResearch.length,
				bearishResearchCount: bearishResearch.length,
				hasConstraints: !!constraints,
			},
			"Starting trader step",
		);

		const decisionPlan = await runTraderAgent(
			cycleId,
			instruments,
			constraints,
			bullishResearch,
			bearishResearch,
			errors,
			warnings,
		);

		log.info(
			{
				cycleId,
				decisionCount: decisionPlan.decisions.length,
				decisions: decisionPlan.decisions.map((d) => ({
					symbol: d.instrumentId,
					action: d.action,
					confidence: d.confidence,
				})),
				errorCount: errors.length,
				warningCount: warnings.length,
				errors: errors.length > 0 ? errors : undefined,
				warnings: warnings.length > 0 ? warnings : undefined,
			},
			"Completed trader step",
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
	constraints: Constraints | undefined,
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
		const prompt = buildTraderPrompt(
			cycleId,
			instruments,
			constraints,
			bullishResearch,
			bearishResearch,
		);
		log.debug({ cycleId, promptLength: prompt.length }, "Calling trader agent");
		const response = await trader.generate(prompt);

		const plan = parseDecisionPlan(cycleId, response.text, instruments, warnings);
		if (plan) {
			log.debug({ cycleId, decisionCount: plan.decisions.length }, "Trader agent returned plan");
			return plan;
		}
		log.warn({ cycleId }, "Trader agent returned unparseable response, using empty plan");
		return emptyPlan;
	} catch (err) {
		const errorMsg = `Trader agent failed: ${formatError(err)}`;
		errors.push(errorMsg);
		log.error({ cycleId, error: formatError(err) }, "Trader agent LLM call failed");
		return emptyPlan;
	}
}

function buildTraderPrompt(
	cycleId: string,
	instruments: string[],
	constraints: Constraints | undefined,
	bullishResearch: z.infer<typeof ResearchSchema>[],
	bearishResearch: z.infer<typeof ResearchSchema>[],
): string {
	const parts = [
		`Create a decision plan for cycle ${cycleId}.`,
		`Instruments: ${instruments.join(", ")}`,
	];

	if (constraints) {
		parts.push(`\n## Risk Constraints (ACTUAL LIMITS - MUST COMPLY)`);
		parts.push(`### Per-Instrument Limits`);
		parts.push(
			`- maxPctEquity: ${(constraints.perInstrument.maxPctEquity * 100).toFixed(1)}% of portfolio per position`,
		);
		parts.push(
			`- maxNotional: $${constraints.perInstrument.maxNotional.toLocaleString()} per position`,
		);
		parts.push(
			`- maxShares: ${constraints.perInstrument.maxShares.toLocaleString()} shares per equity position`,
		);
		parts.push(
			`- maxContracts: ${constraints.perInstrument.maxContracts} contracts per options position`,
		);
		parts.push(`### Portfolio Limits`);
		parts.push(`- maxPositions: ${constraints.portfolio.maxPositions} total positions`);
		parts.push(
			`- maxConcentration: ${(constraints.portfolio.maxConcentration * 100).toFixed(1)}% max single position`,
		);
		parts.push(
			`- maxGrossExposure: ${(constraints.portfolio.maxGrossExposure * 100).toFixed(0)}% of equity`,
		);
		parts.push(
			`- maxNetExposure: ${(constraints.portfolio.maxNetExposure * 100).toFixed(0)}% of equity`,
		);
		parts.push(
			`- maxRiskPerTrade: ${(constraints.portfolio.maxRiskPerTrade * 100).toFixed(1)}% of portfolio per trade`,
		);
		parts.push(
			`- maxDrawdown: ${(constraints.portfolio.maxDrawdown * 100).toFixed(0)}% max drawdown limit`,
		);
		parts.push(
			`- maxSectorExposure: ${(constraints.portfolio.maxSectorExposure * 100).toFixed(0)}% per sector`,
		);
		parts.push(`### Options Greeks Limits`);
		parts.push(`- maxDelta: ${constraints.options.maxDelta.toLocaleString()}`);
		parts.push(`- maxGamma: ${constraints.options.maxGamma.toLocaleString()}`);
		parts.push(`- maxVega: $${constraints.options.maxVega.toLocaleString()}`);
		parts.push(`- maxTheta: $${constraints.options.maxTheta.toLocaleString()}/day`);
	}

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
- decisions: array of {decisionId, instrumentId, action (BUY/SELL/HOLD/CLOSE), direction (LONG/SHORT/FLAT), size {value, unit}, stopLoss (REQUIRED for BUY/SELL - {price, type: "FIXED"|"TRAILING"}), takeProfit?, strategyFamily, timeHorizon, rationale {summary, bullishFactors[], bearishFactors[], decisionLogic, memoryReferences[]}, thesisState, confidence (0-1)}
- portfolioNotes: overall portfolio commentary

IMPORTANT: Every BUY or SELL decision MUST include a stopLoss. Trades without stop-losses will be rejected.`);

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
		const warnMsg = "Could not extract JSON from trader response";
		warnings.push(warnMsg);
		log.warn({ cycleId, responsePreview: text.slice(0, 500) }, "No JSON found in trader response");
		return null;
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

		const decisions: z.infer<typeof DecisionSchema>[] = [];

		if (Array.isArray(parsed.decisions)) {
			for (const d of parsed.decisions) {
				const dec = d as Record<string, unknown>;
				const action = (dec.action as "BUY" | "SELL" | "HOLD" | "CLOSE") ?? "HOLD";
				const decisionId = String(dec.decisionId ?? `${cycleId}-${dec.instrumentId}`);
				const instrumentId = String(dec.instrumentId ?? "");
				const hasStopLoss = !!dec.stopLoss;

				if ((action === "BUY" || action === "SELL") && !hasStopLoss) {
					const warnMsg = `Decision ${decisionId} (${instrumentId}) missing stop-loss for ${action} action`;
					warnings.push(warnMsg);
					log.warn(
						{ cycleId, decisionId, instrumentId, action },
						"Missing stop-loss for actionable trade",
					);
				}

				decisions.push({
					decisionId,
					instrumentId,
					action,
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
	} catch (err) {
		const warnMsg = "Failed to parse trader response JSON";
		warnings.push(warnMsg);
		log.warn(
			{ cycleId, error: formatError(err), jsonPreview: jsonMatch[0].slice(0, 500) },
			"JSON parse failed for trader",
		);
		return null;
	}
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
