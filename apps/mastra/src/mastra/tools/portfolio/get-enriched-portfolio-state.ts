/**
 * Get Enriched Portfolio State Tool
 *
 * Fetches enriched portfolio state with strategy, risk, and thesis context.
 */

import { getEnrichedPortfolioState as getEnrichedPortfolioStateImpl } from "@cream/agents/implementations";
import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

const PdtStatusSchema = z.object({
	dayTradeCount: z.number(),
	remainingDayTrades: z.number(),
	isPatternDayTrader: z.boolean(),
	isUnderThreshold: z.boolean(),
	lastEquity: z.number(),
	daytradingBuyingPower: z.number(),
});

const PositionStrategySchema = z.object({
	strategyFamily: z.string().nullable(),
	timeHorizon: z.string().nullable(),
	confidenceScore: z.number().nullable(),
	riskScore: z.number().nullable(),
	rationale: z.string().nullable(),
	bullishFactors: z.array(z.string()),
	bearishFactors: z.array(z.string()),
});

const PositionRiskParamsSchema = z.object({
	stopPrice: z.number().nullable(),
	targetPrice: z.number().nullable(),
	entryPrice: z.number().nullable(),
});

const PositionThesisContextSchema = z.object({
	thesisId: z.string().nullable(),
	state: z.string().nullable(),
	entryThesis: z.string().nullable(),
	invalidationConditions: z.string().nullable(),
	conviction: z.number().nullable(),
});

const EnrichedPortfolioPositionSchema = z.object({
	symbol: z.string(),
	quantity: z.number(),
	averageCost: z.number(),
	marketValue: z.number(),
	unrealizedPnL: z.number(),
	positionId: z.string().nullable(),
	decisionId: z.string().nullable(),
	openedAt: z.string().nullable(),
	holdingDays: z.number().nullable(),
	strategy: PositionStrategySchema.nullable(),
	riskParams: PositionRiskParamsSchema.nullable(),
	thesis: PositionThesisContextSchema.nullable(),
});

const GetEnrichedPortfolioStateInputSchema = z.object({});

const GetEnrichedPortfolioStateOutputSchema = z.object({
	positions: z.array(EnrichedPortfolioPositionSchema),
	buyingPower: z.number(),
	totalEquity: z.number(),
	dayPnL: z.number(),
	totalPnL: z.number(),
	pdt: PdtStatusSchema,
});

export const getEnrichedPortfolioState = createTool({
	id: "getEnrichedPortfolioState",
	description: `Get enriched portfolio state with full strategy, risk, and thesis context for each position.

This tool provides comprehensive position awareness including:
- **Strategy metadata**: strategyFamily, timeHorizon, confidence/risk scores, rationale, factors
- **Risk parameters**: stopPrice, targetPrice, entryPrice from the original decision
- **Thesis context**: entryThesis, invalidationConditions, conviction, current thesis state
- **Position age**: openedAt timestamp and holdingDays count

Use this tool when you need to:
- Check if positions are approaching stop/target levels
- Honor the intended timeHorizon for positions
- Assess whether invalidation conditions have been met
- Review the original thesis and conviction for existing positions
- Determine position age for swing vs intraday decisions`,
	inputSchema: GetEnrichedPortfolioStateInputSchema,
	outputSchema: GetEnrichedPortfolioStateOutputSchema,
	execute: async () => {
		const ctx = createToolContext();
		return getEnrichedPortfolioStateImpl(ctx);
	},
});

export { GetEnrichedPortfolioStateInputSchema, GetEnrichedPortfolioStateOutputSchema };
