/**
 * Scoring Index
 *
 * Re-exports all scoring functions and types.
 */

export {
  computeSentimentScore,
  computeSentimentFromExtraction,
  aggregateSentimentScores,
  classifySentimentScore,
  computeSentimentMomentum,
  type SentimentScoringConfig,
} from "./sentiment.js";

export {
  computeImportanceScore,
  getSourceCredibility,
  computeRecencyScore,
  computeEntityRelevance,
  applyEventTypeBoost,
  classifyImportance,
  type ImportanceScoringConfig,
} from "./importance.js";

export {
  computeSurpriseScore,
  computeAggregatedSurprise,
  computeSurpriseFromExtraction,
  classifySurprise,
  isSurpriseSignificant,
  getSurpriseDirection,
  type SurpriseScoringConfig,
  type MetricExpectation,
} from "./surprise.js";
