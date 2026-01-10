/**
 * Mastra Trading Tool Definitions
 *
 * Tools for market data access, portfolio state, and options.
 * These tools wrap the core implementations from tools/index.ts.
 */

import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  type Greeks,
  getGreeks,
  getOptionChain,
  getPortfolioState,
  getQuotes,
  type OptionChainResponse,
  type PortfolioStateResponse,
  type Quote,
} from "../index.js";

/**
 * Create ExecutionContext for tool invocation.
 * Tools are invoked by the agent framework during scheduled runs.
 */
function createToolContext() {
  return createContext(requireEnv(), "scheduled");
}

// ============================================
// Get Quotes Tool
// ============================================

const GetQuotesInputSchema = z.object({
  instruments: z.array(z.string()).min(1).describe("Array of instrument symbols to get quotes for"),
});

const QuoteSchema = z.object({
  symbol: z.string(),
  bid: z.number(),
  ask: z.number(),
  last: z.number(),
  volume: z.number(),
  timestamp: z.string(),
});

const GetQuotesOutputSchema = z.object({
  quotes: z.array(QuoteSchema),
});

export const getQuotesTool = createTool({
  id: "get_quotes",
  description: `Get real-time quotes for instruments. Use this tool to:
- Fetch current bid/ask/last prices for stocks or ETFs
- Get volume data for liquidity assessment
- Check prices before making trading decisions`,
  inputSchema: GetQuotesInputSchema,
  outputSchema: GetQuotesOutputSchema,
  execute: async ({ context }): Promise<{ quotes: Quote[] }> => {
    const ctx = createToolContext();
    const quotes = await getQuotes(ctx, context.instruments);
    return { quotes };
  },
});

// ============================================
// Get Portfolio State Tool
// ============================================

const GetPortfolioStateInputSchema = z.object({});

const PortfolioPositionSchema = z.object({
  symbol: z.string(),
  quantity: z.number(),
  averageCost: z.number(),
  marketValue: z.number(),
  unrealizedPnL: z.number(),
});

const GetPortfolioStateOutputSchema = z.object({
  positions: z.array(PortfolioPositionSchema),
  buyingPower: z.number(),
  totalEquity: z.number(),
  dayPnL: z.number(),
  totalPnL: z.number(),
});

export const getPortfolioStateTool = createTool({
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
    return getPortfolioState(ctx);
  },
});

// ============================================
// Get Option Chain Tool
// ============================================

const GetOptionChainInputSchema = z.object({
  underlying: z.string().describe("Underlying symbol (e.g., AAPL, SPY)"),
});

const OptionContractSchema = z.object({
  symbol: z.string(),
  strike: z.number(),
  expiration: z.string(),
  type: z.enum(["call", "put"]),
  bid: z.number(),
  ask: z.number(),
  last: z.number(),
  volume: z.number(),
  openInterest: z.number(),
});

const OptionExpirationSchema = z.object({
  expiration: z.string(),
  calls: z.array(OptionContractSchema),
  puts: z.array(OptionContractSchema),
});

const GetOptionChainOutputSchema = z.object({
  underlying: z.string(),
  expirations: z.array(OptionExpirationSchema),
});

export const getOptionChainTool = createTool({
  id: "option_chain",
  description: `Get option chain for an underlying. Use this tool to:
- Find available strikes and expirations for options strategies
- Assess option liquidity via volume and open interest
- Compare call/put premiums for strategy selection
- Identify pricing opportunities across the chain`,
  inputSchema: GetOptionChainInputSchema,
  outputSchema: GetOptionChainOutputSchema,
  execute: async ({ context }): Promise<OptionChainResponse> => {
    const ctx = createToolContext();
    return getOptionChain(ctx, context.underlying);
  },
});

// ============================================
// Get Greeks Tool
// ============================================

const GetGreeksInputSchema = z.object({
  contractSymbol: z
    .string()
    .describe("Option contract symbol in OSI format (e.g., AAPL  240119C00185000)"),
});

const GetGreeksOutputSchema = z.object({
  delta: z.number().describe("Rate of change of option price vs underlying (call: 0-1, put: -1-0)"),
  gamma: z.number().describe("Rate of change of delta vs underlying price"),
  theta: z.number().describe("Time decay per day (usually negative)"),
  vega: z.number().describe("Sensitivity to implied volatility changes"),
  rho: z.number().describe("Sensitivity to interest rate changes"),
  iv: z.number().describe("Implied volatility (annualized)"),
});

export const getGreeksTool = createTool({
  id: "get_greeks",
  description: `Get Greeks for an option contract. Use this tool to:
- Assess delta exposure and directional risk
- Understand gamma risk near expiration
- Calculate time decay (theta) impact on position
- Evaluate vega exposure to volatility changes
- Check implied volatility levels

Requires OSI-format symbol (ROOT + YYMMDD + C/P + strike*1000 padded).`,
  inputSchema: GetGreeksInputSchema,
  outputSchema: GetGreeksOutputSchema,
  execute: async ({ context }): Promise<Greeks> => {
    const ctx = createToolContext();
    return getGreeks(ctx, context.contractSymbol);
  },
});

// Re-export schemas for testing
export {
  GetGreeksInputSchema,
  GetGreeksOutputSchema,
  GetOptionChainInputSchema,
  GetOptionChainOutputSchema,
  GetPortfolioStateInputSchema,
  GetPortfolioStateOutputSchema,
  GetQuotesInputSchema,
  GetQuotesOutputSchema,
};
