/**
 * Get Portfolio State Tool
 *
 * Fetches current portfolio state including positions and buying power.
 */

import { getPortfolioState as getPortfolioStateImpl } from "@cream/agents/implementations";
import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

const GetPortfolioStateInputSchema = z.object({});

const PortfolioPositionSchema = z.object({
	symbol: z.string().describe("Ticker symbol of held position"),
	quantity: z.number().describe("Number of shares held. Positive = long, negative = short"),
	averageCost: z.number().describe("Average cost basis per share including commissions"),
	marketValue: z.number().describe("Current position value = quantity × current price"),
	unrealizedPnL: z
		.number()
		.describe("Unrealized profit/loss = marketValue - (quantity × averageCost)"),
});

const PdtStatusSchema = z.object({
	dayTradeCount: z
		.number()
		.describe("Day trades used in rolling 5-day window. Limit is 3 when under $25k"),
	remainingDayTrades: z
		.number()
		.describe("Day trades remaining. -1 means unlimited (account above $25k)"),
	isPatternDayTrader: z
		.boolean()
		.describe("Whether broker has flagged account as pattern day trader"),
	isUnderThreshold: z
		.boolean()
		.describe("Whether account is under $25k PDT threshold (restricts day trades to 3)"),
	lastEquity: z.number().describe("Previous day's closing equity. Used for PDT threshold check"),
	daytradingBuyingPower: z
		.number()
		.describe(
			"Day trading buying power (4x equity for PDT accounts, otherwise same as buying power)",
		),
});

const GetPortfolioStateOutputSchema = z.object({
	positions: z.array(PortfolioPositionSchema).describe("All current positions in the portfolio"),
	buyingPower: z.number().describe("Available cash for new trades. Consider margin requirements"),
	totalEquity: z.number().describe("Total account value = cash + positions market value"),
	dayPnL: z.number().describe("Profit/loss for current trading day across all positions"),
	totalPnL: z.number().describe("All-time realized + unrealized profit/loss"),
	pdt: PdtStatusSchema.describe(
		"Pattern Day Trader status. CRITICAL: Check remainingDayTrades before selling same-day positions",
	),
});

interface PortfolioStateResponse {
	positions: Array<{
		symbol: string;
		quantity: number;
		averageCost: number;
		marketValue: number;
		unrealizedPnL: number;
	}>;
	buyingPower: number;
	totalEquity: number;
	dayPnL: number;
	totalPnL: number;
	pdt: {
		dayTradeCount: number;
		remainingDayTrades: number;
		isPatternDayTrader: boolean;
		isUnderThreshold: boolean;
		lastEquity: number;
		daytradingBuyingPower: number;
	};
}

export const getPortfolioState = createTool({
	id: "get_portfolio_state",
	description: `Get current portfolio state including positions and buying power. Use this tool to:
- Check existing positions before making trades
- Assess available buying power for new positions
- Review P&L performance (day and total)
- Understand current portfolio composition`,
	inputSchema: GetPortfolioStateInputSchema,
	outputSchema: GetPortfolioStateOutputSchema,
	execute: async (): Promise<PortfolioStateResponse> => {
		const ctx = createToolContext();
		return getPortfolioStateImpl(ctx);
	},
});

export { GetPortfolioStateInputSchema, GetPortfolioStateOutputSchema };
