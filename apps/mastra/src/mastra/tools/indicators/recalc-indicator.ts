/**
 * Recalc Indicator Tool
 *
 * Recalculate technical indicators using gRPC MarketDataService for bars
 * and @cream/indicators for calculations.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { recalcIndicator as recalcIndicatorImpl } from "@cream/agents/implementations";

interface IndicatorResult {
	indicator: string;
	symbol: string;
	values: number[];
	timestamps: string[];
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

const RecalcIndicatorInputSchema = z.object({
	indicator: z
		.enum(["RSI", "SMA", "EMA", "ATR", "BOLLINGER", "STOCHASTIC", "VOLUME_SMA"])
		.describe("Indicator type to calculate"),
	symbol: z.string().describe("Instrument symbol (e.g., AAPL, SPY)"),
	params: z
		.record(z.string(), z.number())
		.optional()
		.describe(
			"Indicator parameters (e.g., { period: 14 } for RSI, { period: 20, stdDev: 2 } for Bollinger)",
		),
});

const RecalcIndicatorOutputSchema = z.object({
	indicator: z.string().describe("Indicator type that was calculated"),
	symbol: z.string().describe("Symbol the indicator was calculated for"),
	values: z.array(z.number()).describe("Indicator values, most recent last"),
	timestamps: z.array(z.string()).describe("ISO 8601 timestamps for each value"),
});

// ============================================
// Tool Definition
// ============================================

export const recalcIndicator = createTool({
	id: "recalc_indicator",
	description: `Recalculate a technical indicator for a symbol. Use this tool to:
- Get fresh RSI readings for momentum assessment
- Calculate moving averages (SMA, EMA) for trend analysis
- Compute ATR for volatility-based position sizing
- Generate Bollinger Bands for mean reversion setups
- Calculate Stochastic for overbought/oversold conditions
- Assess volume trends via Volume SMA

Supported indicators:
- RSI: Relative Strength Index (params: period, default 14)
- SMA: Simple Moving Average (params: period, default 20)
- EMA: Exponential Moving Average (params: period, default 20)
- ATR: Average True Range (params: period, default 14)
- BOLLINGER: Bollinger Bands (params: period, stdDev, defaults 20, 2)
- STOCHASTIC: Stochastic Oscillator (params: kPeriod, dPeriod, defaults 14, 3)
- VOLUME_SMA: Volume Simple Moving Average (params: period, default 20)`,
	inputSchema: RecalcIndicatorInputSchema,
	outputSchema: RecalcIndicatorOutputSchema,
	execute: async (inputData, _context): Promise<IndicatorResult> => {
		const ctx = createToolContext();
		return recalcIndicatorImpl(ctx, inputData.indicator, inputData.symbol, inputData.params);
	},
});
