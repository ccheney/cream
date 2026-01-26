/**
 * Get Prediction Signals Tool
 *
 * Derive trading signals from prediction market probabilities.
 * Uses the shared prediction markets repository provider.
 */

import { createContext, isTest, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getPredictionMarketsRepo, type PredictionSignal } from "./get-market-snapshots.js";

function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

// Schemas
const GetPredictionSignalsInputSchema = z.object({});

const PredictionSignalSchema = z.object({
	signalType: z.string().describe("Type of signal (e.g., fed_cut_probability, recession_12m)"),
	signalValue: z.number().describe("Signal value (typically 0-1 for probabilities)"),
	confidence: z.number().nullable().describe("Confidence in the signal (0-1)"),
	computedAt: z.string().describe("When the signal was computed (ISO 8601)"),
});

const GetPredictionSignalsOutputSchema = z.object({
	signals: z.array(PredictionSignalSchema),
	summary: z.object({
		fedCutProbability: z.number().optional(),
		fedHikeProbability: z.number().optional(),
		recessionProbability12m: z.number().optional(),
		macroUncertaintyIndex: z.number().optional(),
		policyEventRisk: z.number().optional(),
	}),
	timestamp: z.string(),
});

export const getPredictionSignals = createTool({
	id: "getPredictionSignals",
	description: `Get latest prediction market signals for macro indicators. Use this tool to:
- Check current Fed rate cut/hike probabilities from prediction markets
- Assess recession probability over the next 12 months
- Gauge macro uncertainty and policy event risk
- Inform position sizing and risk management based on market-implied probabilities

These signals are derived from real-money bets on Kalshi and Polymarket.`,
	inputSchema: GetPredictionSignalsInputSchema,
	outputSchema: GetPredictionSignalsOutputSchema,
	execute: async (): Promise<z.infer<typeof GetPredictionSignalsOutputSchema>> => {
		const ctx = createToolContext();

		// In test mode, return empty results
		if (isTest(ctx)) {
			return {
				signals: [],
				summary: {},
				timestamp: new Date().toISOString(),
			};
		}

		const repo = await getPredictionMarketsRepo();
		const signals = await repo.getLatestSignals();

		// Build summary from signals
		const summary: z.infer<typeof GetPredictionSignalsOutputSchema>["summary"] = {};
		for (const signal of signals) {
			switch (signal.signalType) {
				case "fed_cut_probability":
					summary.fedCutProbability = signal.signalValue;
					break;
				case "fed_hike_probability":
					summary.fedHikeProbability = signal.signalValue;
					break;
				case "recession_12m":
					summary.recessionProbability12m = signal.signalValue;
					break;
				case "macro_uncertainty":
					summary.macroUncertaintyIndex = signal.signalValue;
					break;
				case "policy_event_risk":
					summary.policyEventRisk = signal.signalValue;
					break;
			}
		}

		return {
			signals: signals.map((s: PredictionSignal) => ({
				signalType: s.signalType,
				signalValue: s.signalValue,
				confidence: s.confidence,
				computedAt: s.computedAt,
			})),
			summary,
			timestamp: new Date().toISOString(),
		};
	},
});

export { GetPredictionSignalsInputSchema, GetPredictionSignalsOutputSchema };
