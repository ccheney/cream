/**
 * Option Chain Tool
 *
 * Fetches option chain data for an underlying symbol.
 */

import { getOptionChain as getOptionChainImpl } from "@cream/agents/implementations";
import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

const GetOptionChainInputSchema = z.object({
	underlying: z.string().describe("Underlying symbol (e.g., AAPL, SPY)"),
	maxExpirations: z
		.number()
		.min(1)
		.max(52)
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

export interface OptionContract {
	symbol: string;
	strike: number;
	expiration: string;
	type: "call" | "put";
	bid: number;
	ask: number;
	last: number;
	volume: number;
	openInterest: number;
}

export interface OptionChainResponse {
	underlying: string;
	expirations: Array<{
		expiration: string;
		calls: OptionContract[];
		puts: OptionContract[];
	}>;
}

export const optionChain = createTool({
	id: "optionChain",
	description: `Get option chain for an underlying. Use this tool to:
- Find available strikes and expirations for options strategies
- Assess option liquidity via volume and open interest
- Compare call/put premiums for strategy selection
- Identify pricing opportunities across the chain`,
	inputSchema: GetOptionChainInputSchema,
	outputSchema: GetOptionChainOutputSchema,
	execute: async (inputData): Promise<OptionChainResponse> => {
		const ctx = createToolContext();
		const full = await getOptionChainImpl(ctx, inputData.underlying);

		// Guardrail: option chains can be extremely large
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

export { GetOptionChainInputSchema, GetOptionChainOutputSchema };
