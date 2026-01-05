/**
 * Normalization Transforms
 *
 * Feature engineering transforms for normalizing and scaling indicator values.
 */

// Percentile Rank
export {
  calculateMultiplePercentileRanks,
  calculatePercentileOfValue,
  calculatePercentileRank,
  generatePercentileOutputName,
  getPercentileSignal,
  getQuintile,
  getRegimeSignal,
  isExtreme,
  PERCENTILE_RANK_DEFAULTS,
  type PercentileRankParams,
  type PercentileRankResult,
  percentileRankRequiredPeriods,
} from "./percentileRank";
// Pipeline
export {
  applyTransforms,
  applyTransformsToIndicators,
  DEFAULT_TRANSFORM_CONFIG,
  getTransformWarmupPeriod,
  type TransformPipelineConfig,
  type TransformSnapshot,
} from "./pipeline";
// Returns
export {
  calculateMultiPeriodReturns,
  calculateReturns,
  calculateReturnsFromCandles,
  generateReturnOutputNames,
  logReturn,
  type MultiPeriodReturnResult,
  RETURNS_DEFAULTS,
  type ReturnResult,
  type ReturnsParams,
  returnsRequiredPeriods,
  simpleReturn,
} from "./returns";

// Volatility Scale
export {
  calculateMultipleVolatilityScales,
  calculatePositionMultiplier,
  calculateRollingVolatility,
  calculateScaleFactor,
  calculateVolatilityScale,
  generateVolatilityScaleOutputName,
  getVolatilityRegime,
  VOLATILITY_SCALE_DEFAULTS,
  type VolatilityScaleParams,
  type VolatilityScaleResult,
  volatilityScaleRequiredPeriods,
} from "./volatilityScale";
// Z-Score
export {
  calculateMean,
  calculateMultipleZScores,
  calculateStdDev,
  calculateZScore,
  generateZScoreOutputName,
  getZScoreSignal,
  isSignificant,
  meanReversionSignal,
  ZSCORE_DEFAULTS,
  type ZScoreParams,
  type ZScoreResult,
  zscoreRequiredPeriods,
} from "./zscore";
