/**
 * Polymarket Score Calculation
 *
 * Functions for calculating aggregated scores from prediction market events.
 */

import type { PredictionMarketEvent, PredictionMarketScores } from "@cream/domain";

/**
 * Calculate Fed rate probabilities from Fed rate markets
 */
function calculateFedRateProbabilities(
	events: PredictionMarketEvent[],
	scores: PredictionMarketScores
): void {
	const fedMarkets = events.filter((e) => e.payload.marketType === "FED_RATE");
	if (fedMarkets.length === 0) {
		return;
	}

	for (const market of fedMarkets) {
		for (const outcome of market.payload.outcomes) {
			const outcomeLower = outcome.outcome.toLowerCase();

			if (outcomeLower.includes("cut") || outcomeLower.includes("decrease")) {
				scores.fedCutProbability = Math.max(scores.fedCutProbability ?? 0, outcome.probability);
			}

			if (outcomeLower.includes("hike") || outcomeLower.includes("increase")) {
				scores.fedHikeProbability = Math.max(scores.fedHikeProbability ?? 0, outcome.probability);
			}
		}
	}
}

/**
 * Calculate recession probability from recession markets
 */
function calculateRecessionProbability(
	events: PredictionMarketEvent[],
	scores: PredictionMarketScores
): void {
	const recessionMarkets = events.filter((e) =>
		e.payload.marketQuestion.toLowerCase().includes("recession")
	);

	if (recessionMarkets.length === 0) {
		return;
	}

	// biome-ignore lint/style/noNonNullAssertion: length check ensures element exists
	const market = recessionMarkets[0]!;
	const yesOutcome = market.payload.outcomes.find((o) => o.outcome.toLowerCase() === "yes");

	if (yesOutcome) {
		scores.recessionProbability12m = yesOutcome.probability;
	}
}

/**
 * Calculate macro uncertainty index from Fed rate probabilities
 */
function calculateMacroUncertainty(scores: PredictionMarketScores): void {
	if (scores.fedCutProbability === undefined || scores.fedHikeProbability === undefined) {
		return;
	}

	const maxProb = Math.max(scores.fedCutProbability, scores.fedHikeProbability);
	const minProb = Math.min(scores.fedCutProbability, scores.fedHikeProbability);

	if (maxProb > 0) {
		scores.macroUncertaintyIndex = minProb / maxProb;
	}
}

/**
 * Calculate aggregated scores from prediction market events
 */
export function calculateScores(events: PredictionMarketEvent[]): PredictionMarketScores {
	const scores: PredictionMarketScores = {};

	calculateFedRateProbabilities(events, scores);
	calculateRecessionProbability(events, scores);
	calculateMacroUncertainty(scores);

	return scores;
}
