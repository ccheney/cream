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

export const getQuotesTool = createTool({
  id: "get_quotes",
  description: `Get real-time quotes for instruments. Use this tool to:
- Fetch current bid/ask/last prices for stocks or ETFs
- Get volume data for liquidity assessment
- Check prices before making trading decisions`,
  inputSchema: GetQuotesInputSchema,
  outputSchema: GetQuotesOutputSchema,
  execute: async (inputData): Promise<{ quotes: Quote[] }> => {
    const ctx = createToolContext();
    const quotes = await getQuotes(ctx, inputData.instruments);
    return { quotes };
  },
});

// ============================================
// Get Portfolio State Tool
// ============================================

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

const GetPortfolioStateOutputSchema = z.object({
  positions: z.array(PortfolioPositionSchema).describe("All current positions in the portfolio"),
  buyingPower: z.number().describe("Available cash for new trades. Consider margin requirements"),
  totalEquity: z.number().describe("Total account value = cash + positions market value"),
  dayPnL: z.number().describe("Profit/loss for current trading day across all positions"),
  totalPnL: z.number().describe("All-time realized + unrealized profit/loss"),
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
  maxExpirations: z
    .number()
    .min(1)
    .max(12)
    .optional()
    .describe("Maximum expirations to return (default: 4)"),
  maxContractsPerSide: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum calls and puts per expiration (default: 20)"),
});

const OptionContractSchema = z.object({
  symbol: z.string().describe("OCC option symbol in standard format (e.g., AAPL240119C00185000)"),
  strike: z.number().describe("Strike price of the option contract"),
  expiration: z.string().describe("Expiration date in YYYY-MM-DD format"),
  type: z.enum(["call", "put"]).describe("Option type: call (right to buy) or put (right to sell)"),
  bid: z.number().describe("Best bid price. Use for selling options"),
  ask: z.number().describe("Best ask price. Use for buying options"),
  last: z.number().describe("Last traded price. May be stale for illiquid strikes"),
  volume: z.number().describe("Contracts traded today. Higher = better liquidity"),
  openInterest: z.number().describe("Total open contracts. Higher = more liquid, easier to exit"),
});

const OptionExpirationSchema = z.object({
  expiration: z.string().describe("Expiration date in YYYY-MM-DD format"),
  calls: z
    .array(OptionContractSchema)
    .describe("All call options for this expiration, sorted by strike"),
  puts: z
    .array(OptionContractSchema)
    .describe("All put options for this expiration, sorted by strike"),
});

const GetOptionChainOutputSchema = z.object({
  underlying: z.string().describe("Underlying stock/ETF symbol for this option chain"),
  expirations: z
    .array(OptionExpirationSchema)
    .describe("All available expirations with their contracts"),
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
  execute: async (inputData): Promise<OptionChainResponse> => {
    const ctx = createToolContext();
    const full = await getOptionChain(ctx, inputData.underlying);

    // Guardrail: option chains can be extremely large (SPY, QQQ, etc.) and easily
    // exceed provider token limits when included in downstream prompts.
    const maxExpirations = inputData.maxExpirations ?? 4;
    const maxContractsPerSide = inputData.maxContractsPerSide ?? 20;

    const expirations = (full.expirations ?? []).slice(0, maxExpirations).map((exp) => {
      const calls = [...(exp.calls ?? [])]
        .sort((a, b) => b.openInterest - a.openInterest)
        .slice(0, maxContractsPerSide)
        .sort((a, b) => a.strike - b.strike);

      const puts = [...(exp.puts ?? [])]
        .sort((a, b) => b.openInterest - a.openInterest)
        .slice(0, maxContractsPerSide)
        .sort((a, b) => a.strike - b.strike);

      return {
        expiration: exp.expiration,
        calls,
        puts,
      };
    });

    return { underlying: full.underlying, expirations };
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
  execute: async (inputData): Promise<Greeks> => {
    const ctx = createToolContext();
    return getGreeks(ctx, inputData.contractSymbol);
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
