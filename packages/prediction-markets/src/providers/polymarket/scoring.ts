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
		const questionLower = market.payload.marketQuestion.toLowerCase();
		const yesOutcome = market.payload.outcomes.find((o) => o.outcome.toLowerCase() === "yes");
		const noOutcome = market.payload.outcomes.find((o) => o.outcome.toLowerCase() === "no");

		// Check if this is a rate cut market (question contains "cut" or "decrease")
		const isCutMarket =
			questionLower.includes("cut") ||
			questionLower.includes("decrease") ||
			questionLower.includes("lower");

		// Check if this is a rate hike market (question contains "hike" or "increase")
		const isHikeMarket =
			questionLower.includes("hike") ||
			questionLower.includes("increase") ||
			questionLower.includes("raise");

		// Check if this is a "no cuts" market (negation)
		const isNoCutsMarket = questionLower.includes("no") && isCutMarket;

		if (yesOutcome) {
			if (isCutMarket && !isNoCutsMarket) {
				// "Fed rate cut?" with Yes outcome = probability of cut
				scores.fedCutProbability = Math.max(scores.fedCutProbability ?? 0, yesOutcome.probability);
			} else if (isNoCutsMarket) {
				// "No Fed rate cuts?" with Yes = probability of NO cuts, so No outcome = probability of cuts
				if (noOutcome) {
					scores.fedCutProbability = Math.max(scores.fedCutProbability ?? 0, noOutcome.probability);
				}
			} else if (isHikeMarket) {
				// "Fed rate hike?" with Yes outcome = probability of hike
				scores.fedHikeProbability = Math.max(
					scores.fedHikeProbability ?? 0,
					yesOutcome.probability
				);
			}
		}

		// Also check outcome names for explicit "cut"/"hike" labels (Kalshi style)
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
