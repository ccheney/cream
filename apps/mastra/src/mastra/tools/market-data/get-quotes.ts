/**
 * Get Quotes Tool
 *
 * Fetches real-time quotes for instruments using gRPC MarketDataService.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { getQuotes as getQuotesImpl } from "@cream/agents/implementations";

export interface Quote {
	symbol: string;
	bid: number;
	ask: number;
	last: number;
	volume: number;
	timestamp: string;
}

import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Create ExecutionContext for tool invocation.
 */
function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

// ============================================
// Schemas
// ============================================

const GetQuotesInputSchema = z.object({
	instruments: z.array(z.string()).min(1).describe("Array of instrument symbols to get quotes for"),
});

const QuoteSchema = z.object({
	symbol: z.string().describe("Ticker symbol (e.g., AAPL, SPY, MSFT)"),
	bid: z.number().describe("Highest price buyer willing to pay. Use for sell limit orders"),
	ask: z.number().describe("Lowest price seller willing to accept. Use for buy limit orders"),
	last: z.number().describe("Most recent trade price. May differ from bid/ask in illiquid markets"),
	volume: z.number().describe("Total shares traded today. Higher = better liquidity"),
	timestamp: z.string().describe("Quote timestamp in ISO 8601 format"),
});

const GetQuotesOutputSchema = z.object({
	quotes: z.array(QuoteSchema).describe("Real-time quotes for requested instruments"),
});

// ============================================
// Tool Definition
// ============================================

export const getQuotes = createTool({
	id: "get_quotes",
	description: `Get real-time quotes for instruments. Use this tool to:
- Fetch current bid/ask/last prices for stocks or ETFs
- Get volume data for liquidity assessment
- Check prices before making trading decisions`,
	inputSchema: GetQuotesInputSchema,
	outputSchema: GetQuotesOutputSchema,
	execute: async (inputData, _context): Promise<{ quotes: Quote[] }> => {
		const ctx = createToolContext();
		const quotes = await getQuotesImpl(ctx, inputData.instruments);
		return { quotes };
	},
});
