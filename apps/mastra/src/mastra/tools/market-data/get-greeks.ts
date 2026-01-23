/**
 * Get Greeks Tool
 *
 * Fetches option Greeks for a contract symbol.
 */

import { getGreeks as getGreeksImpl } from "@cream/agents/implementations";
import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

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

export interface Greeks {
	delta: number;
	gamma: number;
	theta: number;
	vega: number;
	rho: number;
	iv: number;
}

export const getGreeks = createTool({
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
		return getGreeksImpl(ctx, inputData.contractSymbol);
	},
});

export { GetGreeksInputSchema, GetGreeksOutputSchema };
