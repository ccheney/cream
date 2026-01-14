/**
 * Scoring Index
 *
 * Re-exports all scoring functions and types.
 */

export {
	applyEventTypeBoost,
	classifyImportance,
	computeEntityRelevance,
	computeImportanceScore,
	computeRecencyScore,
	getSourceCredibility,
	type ImportanceScoringConfig,
} from "./importance.js";
export {
	aggregateSentimentScores,
	classifySentimentScore,
	computeSentimentFromExtraction,
	computeSentimentMomentum,
	computeSentimentScore,
	type SentimentScoringConfig,
} from "./sentiment.js";

export {
	classifySurprise,
	computeAggregatedSurprise,
	computeSurpriseFromExtraction,
	computeSurpriseScore,
	getSurpriseDirection,
	isSurpriseSignificant,
	type MetricExpectation,
	type SurpriseScoringConfig,
} from "./surprise.js";
