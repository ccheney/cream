/**
 * Information Coefficient (IC) Calculator
 *
 * Measures the predictive power of signals by computing correlation between
 * predicted and realized returns. Standard metric for evaluating alpha factors
 * in quantitative finance.
 *
 * @see docs/research/indicator-validation-statistics.md Section 3
 */

// Analysis and evaluation
export { analyzeIC, analyzeICDecay, evaluateIC, isICSignificant } from "./analysis.js";
// IC metric calculations
export { calculateICStats, crossSectionalIC, timeSeriesIC } from "./metrics.js";
// Statistical functions
export { computeRanks, pearsonCorrelation, spearmanCorrelation } from "./statistics.js";
// Types and schemas
export {
  IC_DEFAULTS,
  type ICAnalysisOptions,
  type ICAnalysisResult,
  ICAnalysisResultSchema,
  type ICDecayResult,
  ICDecayResultSchema,
  type ICEvaluation,
  type ICSignificanceThresholds,
  type ICStats,
  ICStatsSchema,
  type ICValue,
  ICValueSchema,
} from "./types.js";
