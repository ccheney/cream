/**
 * Normalization Transforms
 *
 * Feature engineering transforms for normalizing and scaling indicator values.
 */

// Returns
export {
  calculateReturns,
  calculateMultiPeriodReturns,
  calculateReturnsFromCandles,
  returnsRequiredPeriods,
  generateReturnOutputNames,
  simpleReturn,
  logReturn,
  RETURNS_DEFAULTS,
  type ReturnsParams,
  type ReturnResult,
  type MultiPeriodReturnResult,
} from "./returns";

// Z-Score
export {
  calculateZScore,
  calculateMultipleZScores,
  zscoreRequiredPeriods,
  isSignificant,
  getZScoreSignal,
  meanReversionSignal,
  generateZScoreOutputName,
  calculateMean,
  calculateStdDev,
  ZSCORE_DEFAULTS,
  type ZScoreParams,
  type ZScoreResult,
} from "./zscore";

// Percentile Rank
export {
  calculatePercentileRank,
  calculateMultiplePercentileRanks,
  calculatePercentileOfValue,
  percentileRankRequiredPeriods,
  getQuintile,
  getPercentileSignal,
  isExtreme,
  getRegimeSignal,
  generatePercentileOutputName,
  PERCENTILE_RANK_DEFAULTS,
  type PercentileRankParams,
  type PercentileRankResult,
} from "./percentileRank";

// Volatility Scale
export {
  calculateVolatilityScale,
  calculateMultipleVolatilityScales,
  calculateRollingVolatility,
  calculateScaleFactor,
  volatilityScaleRequiredPeriods,
  getVolatilityRegime,
  calculatePositionMultiplier,
  generateVolatilityScaleOutputName,
  VOLATILITY_SCALE_DEFAULTS,
  type VolatilityScaleParams,
  type VolatilityScaleResult,
} from "./volatilityScale";

// Pipeline
export {
  applyTransforms,
  applyTransformsToIndicators,
  getTransformWarmupPeriod,
  DEFAULT_TRANSFORM_CONFIG,
  type TransformPipelineConfig,
  type TransformSnapshot,
} from "./pipeline";
