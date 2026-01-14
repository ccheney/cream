/**
 * Prediction Markets Types
 *
 * Types for prediction market integration with Kalshi and Polymarket.
 * Provides probability data for macro-level trading signals.
 *
 * @see docs/plans/18-prediction-markets.md
 */

import { z } from "zod";

export const PredictionPlatform = z.enum(["KALSHI", "POLYMARKET"]);
export type PredictionPlatform = z.infer<typeof PredictionPlatform>;

export const PredictionMarketType = z.enum([
	"FED_RATE",
	"ECONOMIC_DATA",
	"RECESSION",
	"GEOPOLITICAL",
	"REGULATORY",
	"ELECTION",
]);
export type PredictionMarketType = z.infer<typeof PredictionMarketType>;

export const PredictionOutcomeSchema = z.object({
	/** Outcome description (e.g., "25bps cut") */
	outcome: z.string(),

	/** Probability of this outcome (0 to 1) */
	probability: z.number().min(0).max(1),

	/** Current market price */
	price: z.number(),

	/** 24-hour volume for this outcome */
	volume24h: z.number().optional(),
});
export type PredictionOutcome = z.infer<typeof PredictionOutcomeSchema>;

export const PredictionMarketPayloadSchema = z.object({
	/** Platform source */
	platform: PredictionPlatform,

	/** Type of market */
	marketType: PredictionMarketType,

	/** Market ticker (e.g., "KXFED-26JAN29") */
	marketTicker: z.string(),

	/** Market question (e.g., "Will Fed cut rates in Jan 2026?") */
	marketQuestion: z.string(),

	/** Available outcomes with probabilities */
	outcomes: z.array(PredictionOutcomeSchema),

	/** Last update timestamp (ISO 8601) */
	lastUpdated: z.string(),

	/** Total open interest */
	openInterest: z.number().optional(),

	/** 24-hour trading volume */
	volume24h: z.number().optional(),

	/** Liquidity score (0 to 1) */
	liquidityScore: z.number().min(0).max(1).optional(),
});
export type PredictionMarketPayload = z.infer<typeof PredictionMarketPayloadSchema>;

export const PredictionMarketEventSchema = z.object({
	/** Unique identifier (e.g., "pm_kalshi_fed_jan26") */
	eventId: z.string(),

	/** Event type discriminator */
	eventType: z.literal("PREDICTION_MARKET"),

	/** Resolution/expiration time (ISO 8601) */
	eventTime: z.string(),

	/** Market data payload */
	payload: PredictionMarketPayloadSchema,

	/** Related instrument IDs (e.g., ["XLF", "TLT", "IYR"]) */
	relatedInstrumentIds: z.array(z.string()),
});
export type PredictionMarketEvent = z.infer<typeof PredictionMarketEventSchema>;

export const PredictionMarketScoresSchema = z.object({
	/** Probability of Fed rate cut at next meeting */
	fedCutProbability: z.number().min(0).max(1).optional(),

	/** Probability of Fed rate hike at next meeting */
	fedHikeProbability: z.number().min(0).max(1).optional(),

	/** Probability of recession within 12 months */
	recessionProbability12m: z.number().min(0).max(1).optional(),

	/** CPI surprise direction (-1 = below expectations, +1 = above) */
	cpiSurpriseDirection: z.number().min(-1).max(1).optional(),

	/** GDP surprise direction (-1 = below expectations, +1 = above) */
	gdpSurpriseDirection: z.number().min(-1).max(1).optional(),

	/** Probability of government shutdown */
	shutdownProbability: z.number().min(0).max(1).optional(),

	/** Probability of tariff escalation */
	tariffEscalationProbability: z.number().min(0).max(1).optional(),

	/** Macro uncertainty index (higher = more uncertainty) */
	macroUncertaintyIndex: z.number().min(0).max(1).optional(),

	/** Policy event risk score */
	policyEventRisk: z.number().min(0).max(1).optional(),
});
export type PredictionMarketScores = z.infer<typeof PredictionMarketScoresSchema>;

export const AggregatedPredictionDataSchema = z.object({
	/** All prediction market events */
	events: z.array(PredictionMarketEventSchema),

	/** Computed scores from prediction data */
	scores: PredictionMarketScoresSchema,

	/** Last aggregation timestamp */
	lastUpdated: z.string(),

	/** Platforms included in aggregation */
	platforms: z.array(PredictionPlatform),
});
export type AggregatedPredictionData = z.infer<typeof AggregatedPredictionDataSchema>;

export function createEmptyPredictionScores(): PredictionMarketScores {
	return {};
}

export function hasHighMacroUncertainty(scores: PredictionMarketScores, threshold = 0.5): boolean {
	return (scores.macroUncertaintyIndex ?? 0) >= threshold;
}

export function hasHighPolicyRisk(scores: PredictionMarketScores, threshold = 0.4): boolean {
	return (scores.policyEventRisk ?? 0) >= threshold;
}

export function getFedDirection(scores: PredictionMarketScores): "CUT" | "HIKE" | "HOLD" {
	const cutProb = scores.fedCutProbability ?? 0;
	const hikeProb = scores.fedHikeProbability ?? 0;
	const holdProb = 1 - cutProb - hikeProb;

	if (cutProb > hikeProb && cutProb > holdProb) {
		return "CUT";
	}
	if (hikeProb > cutProb && hikeProb > holdProb) {
		return "HIKE";
	}
	return "HOLD";
}

export function toNumericScores(scores: PredictionMarketScores): Record<string, number> {
	const result: Record<string, number> = {};

	if (scores.fedCutProbability !== undefined) {
		result.pm_fed_cut = scores.fedCutProbability;
	}
	if (scores.fedHikeProbability !== undefined) {
		result.pm_fed_hike = scores.fedHikeProbability;
	}
	if (scores.recessionProbability12m !== undefined) {
		result.pm_recession_12m = scores.recessionProbability12m;
	}
	if (scores.macroUncertaintyIndex !== undefined) {
		result.pm_macro_uncertainty = scores.macroUncertaintyIndex;
	}
	if (scores.policyEventRisk !== undefined) {
		result.pm_policy_risk = scores.policyEventRisk;
	}
	if (scores.cpiSurpriseDirection !== undefined) {
		result.pm_cpi_surprise = scores.cpiSurpriseDirection;
	}
	if (scores.gdpSurpriseDirection !== undefined) {
		result.pm_gdp_surprise = scores.gdpSurpriseDirection;
	}
	if (scores.shutdownProbability !== undefined) {
		result.pm_shutdown = scores.shutdownProbability;
	}
	if (scores.tariffEscalationProbability !== undefined) {
		result.pm_tariff_escalation = scores.tariffEscalationProbability;
	}

	return result;
}
