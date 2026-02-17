/**
 * Polymarket Score Calculation
 *
 * Functions for calculating aggregated scores from prediction market events.
 */

import type { PredictionMarketEvent, PredictionMarketScores } from "@cream/domain";

const CUT_QUESTION_TERMS = ["cut", "decrease", "lower"];
const HIKE_QUESTION_TERMS = ["hike", "increase", "raise"];
const CUT_OUTCOME_TERMS = ["cut", "decrease"];
const HIKE_OUTCOME_TERMS = ["hike", "increase"];

type FedProbabilityKey = "fedCutProbability" | "fedHikeProbability";

function includesAnyKeyword(value: string, keywords: readonly string[]): boolean {
	return keywords.some((keyword) => value.includes(keyword));
}

function updateFedProbability(
	scores: PredictionMarketScores,
	key: FedProbabilityKey,
	probability: number | undefined,
): void {
	if (probability === undefined) {
		return;
	}

	scores[key] = Math.max(scores[key] ?? 0, probability);
}

function getOutcomeProbability(
	market: PredictionMarketEvent,
	outcomeName: "yes" | "no",
): number | undefined {
	const outcome = market.payload.outcomes.find(
		(candidate) => candidate.outcome.toLowerCase() === outcomeName,
	);
	return outcome?.probability;
}

function applyQuestionBasedFedSignals(
	questionLower: string,
	yesProbability: number | undefined,
	noProbability: number | undefined,
	scores: PredictionMarketScores,
): void {
	if (yesProbability === undefined) {
		return;
	}

	const isCutMarket = includesAnyKeyword(questionLower, CUT_QUESTION_TERMS);
	const isHikeMarket = includesAnyKeyword(questionLower, HIKE_QUESTION_TERMS);
	const isNoCutsMarket = questionLower.includes("no") && isCutMarket;

	if (isCutMarket && !isNoCutsMarket) {
		updateFedProbability(scores, "fedCutProbability", yesProbability);
		return;
	}

	if (isNoCutsMarket) {
		updateFedProbability(scores, "fedCutProbability", noProbability);
		return;
	}

	if (isHikeMarket) {
		updateFedProbability(scores, "fedHikeProbability", yesProbability);
	}
}

function applyOutcomeBasedFedSignals(
	outcomes: PredictionMarketEvent["payload"]["outcomes"],
	scores: PredictionMarketScores,
): void {
	for (const outcome of outcomes) {
		const outcomeLower = outcome.outcome.toLowerCase();

		if (includesAnyKeyword(outcomeLower, CUT_OUTCOME_TERMS)) {
			updateFedProbability(scores, "fedCutProbability", outcome.probability);
		}

		if (includesAnyKeyword(outcomeLower, HIKE_OUTCOME_TERMS)) {
			updateFedProbability(scores, "fedHikeProbability", outcome.probability);
		}
	}
}

/**
 * Calculate Fed rate probabilities from Fed rate markets
 */
function calculateFedRateProbabilities(
	events: PredictionMarketEvent[],
	scores: PredictionMarketScores,
): void {
	const fedMarkets = events.filter((e) => e.payload.marketType === "FED_RATE");
	if (fedMarkets.length === 0) {
		return;
	}

	for (const market of fedMarkets) {
		const questionLower = market.payload.marketQuestion.toLowerCase();
		const yesProbability = getOutcomeProbability(market, "yes");
		const noProbability = getOutcomeProbability(market, "no");

		applyQuestionBasedFedSignals(questionLower, yesProbability, noProbability, scores);
		applyOutcomeBasedFedSignals(market.payload.outcomes, scores);
	}
}

/**
 * Calculate recession probability from recession markets
 */
function calculateRecessionProbability(
	events: PredictionMarketEvent[],
	scores: PredictionMarketScores,
): void {
	const recessionMarkets = events.filter((e) =>
		e.payload.marketQuestion.toLowerCase().includes("recession"),
	);

	if (recessionMarkets.length === 0) {
		return;
	}

	const [market] = recessionMarkets;
	if (!market) {
		return;
	}
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
