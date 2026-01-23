/**
 * Orient Step
 *
 * Second step in the OODA trading cycle. Loads memory context,
 * computes regime classifications, and fetches prediction market signals.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { classifyRegime, DEFAULT_RULE_BASED_CONFIG } from "@cream/regime";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { MarketSnapshotSchema, MemoryContextSchema, RegimeDataSchema } from "../schemas.js";

// ============================================
// Schemas
// ============================================

const OrientInputSchema = z.object({
	cycleId: z.string(),
	marketSnapshot: MarketSnapshotSchema,
	regimeLabels: z.record(z.string(), RegimeDataSchema),
});

const OrientOutputSchema = z.object({
	cycleId: z.string(),
	marketSnapshot: MarketSnapshotSchema,
	memoryContext: MemoryContextSchema,
	regimeLabels: z.record(z.string(), RegimeDataSchema),
	predictionMarketSignals: z
		.object({
			fedCutProbability: z.number().optional(),
			fedHikeProbability: z.number().optional(),
			recessionProbability12m: z.number().optional(),
			macroUncertaintyIndex: z.number().optional(),
			timestamp: z.string().optional(),
		})
		.optional(),
	mode: z.enum(["STUB", "LLM"]),
	errors: z.array(z.string()),
	warnings: z.array(z.string()),
});

// ============================================
// Types
// ============================================

interface Candle {
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

// ============================================
// Step Definition
// ============================================

export const orientStep = createStep({
	id: "orient-context",
	description: "Load memory context and compute regime classifications",
	inputSchema: OrientInputSchema,
	outputSchema: OrientOutputSchema,
	execute: async ({ inputData }) => {
		const { cycleId, marketSnapshot, regimeLabels: inputRegimeLabels } = inputData;
		const errors: string[] = [];
		const warnings: string[] = [];

		// Determine mode based on NODE_ENV (test mode uses stubs)
		const mode: "STUB" | "LLM" = Bun.env.NODE_ENV === "test" ? "STUB" : "LLM";

		// Refine regime classifications using full candle history
		const regimeLabels = refineRegimeClassifications(
			marketSnapshot.instruments,
			marketSnapshot.candles,
			inputRegimeLabels,
			warnings,
		);

		// Load memory context (stub for now - will integrate HelixDB)
		const memoryContext = await loadMemoryContext(marketSnapshot.instruments, mode, warnings);

		// Fetch prediction market signals (stub for now)
		const predictionMarketSignals =
			mode === "LLM" ? await fetchPredictionSignals(errors) : undefined;

		return {
			cycleId,
			marketSnapshot,
			memoryContext,
			regimeLabels,
			predictionMarketSignals,
			mode,
			errors,
			warnings,
		};
	},
});

// ============================================
// Helper Functions
// ============================================

function refineRegimeClassifications(
	instruments: string[],
	candles: Record<string, Candle[]>,
	inputRegimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	warnings: string[],
): Record<string, z.infer<typeof RegimeDataSchema>> {
	const regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>> = {};

	for (const symbol of instruments) {
		const symbolCandles = candles[symbol];

		if (!symbolCandles || symbolCandles.length < 51) {
			regimeLabels[symbol] = inputRegimeLabels[symbol] ?? {
				regime: "RANGE_BOUND",
				confidence: 0.5,
				reasoning: "Insufficient data for refinement",
			};
			continue;
		}

		try {
			const result = classifyRegime({ candles: symbolCandles }, DEFAULT_RULE_BASED_CONFIG);

			const regimeMap: Record<string, string> = {
				BULL_TREND: "BULL_TREND",
				BEAR_TREND: "BEAR_TREND",
				RANGE: "RANGE_BOUND",
				HIGH_VOL: "HIGH_VOL",
				LOW_VOL: "LOW_VOL",
			};

			regimeLabels[symbol] = {
				regime: regimeMap[result.regime] ?? "RANGE_BOUND",
				confidence: result.confidence ?? 0.7,
				reasoning: result.reasoning,
			};
		} catch (error) {
			warnings.push(`Regime classification failed for ${symbol}: ${formatError(error)}`);
			regimeLabels[symbol] = inputRegimeLabels[symbol] ?? {
				regime: "RANGE_BOUND",
				confidence: 0.5,
				reasoning: "Classification error",
			};
		}
	}

	return regimeLabels;
}

async function loadMemoryContext(
	_instruments: string[],
	mode: "STUB" | "LLM",
	warnings: string[],
): Promise<z.infer<typeof MemoryContextSchema>> {
	if (mode === "STUB") {
		return {
			relevantCases: [],
			regimeLabels: {},
		};
	}

	warnings.push("HelixDB memory retrieval not yet integrated - using empty context");
	return {
		relevantCases: [],
		regimeLabels: {},
	};
}

async function fetchPredictionSignals(_errors: string[]): Promise<
	| {
			fedCutProbability?: number;
			fedHikeProbability?: number;
			recessionProbability12m?: number;
			macroUncertaintyIndex?: number;
			timestamp?: string;
	  }
	| undefined
> {
	return undefined;
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
