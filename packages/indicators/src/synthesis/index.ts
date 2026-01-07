/**
 * Indicator Synthesis Module
 *
 * Tools for dynamic indicator generation, validation, and lifecycle management.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md
 */

// AST Similarity (Deduplication)
export {
  AST_SIMILARITY_DEFAULTS,
  type ASTSignature,
  ASTSignatureSchema,
  type ASTSimilarityResult,
  ASTSimilarityResultSchema,
  compareComputationalCore,
  compareIndicator,
  computeSimilarity,
  createSignatureHash,
  evaluateSimilarityResult,
  extractComputationalCore,
  longestCommonSubsequence,
  normalizeCode,
  parseToSignature,
} from "./astSimilarity.js";
// Deflated Sharpe Ratio
export {
  calculateDSR,
  calculateDSRFromReturns,
  calculateReturnStatistics,
  DSR_DEFAULTS,
  type DSRInput,
  DSRInputSchema,
  type DSRResult,
  DSRResultSchema,
  evaluateDSR,
  expectedMaxSharpe,
  isDSRSignificant,
  minimumRequiredSharpe,
  type ReturnStatistics,
  ReturnStatisticsSchema,
  sharpeStandardError,
} from "./dsr.js";
// Information Coefficient (IC)
export {
  analyzeIC,
  analyzeICDecay,
  calculateICStats,
  computeRanks,
  crossSectionalIC,
  evaluateIC,
  IC_DEFAULTS,
  type ICAnalysisResult,
  ICAnalysisResultSchema,
  type ICDecayResult,
  ICDecayResultSchema,
  type ICStats,
  ICStatsSchema,
  type ICValue,
  ICValueSchema,
  isICSignificant,
  pearsonCorrelation,
  spearmanCorrelation,
  timeSeriesIC,
} from "./ic.js";
// Probability of Backtest Overfitting (PBO)
export {
  type CSCVCombinationResult,
  CSCVCombinationResultSchema,
  combinations,
  computePBO,
  computeSharpe,
  evaluatePBO,
  generateSyntheticReturns,
  generateSyntheticSignals,
  isPBOAcceptable,
  minimumBacktestLength,
  nCr,
  PBO_DEFAULTS,
  type PBOInput,
  PBOInputSchema,
  type PBOResult,
  PBOResultSchema,
  rankStrategiesByPBO,
} from "./pbo.js";
// Security Scanning
export {
  getCriticalIssues,
  isCodeSafe,
  type SecurityIssue,
  SecurityIssueSchema,
  type SecurityScanResult,
  SecurityScanResultSchema,
  scanIndicatorCode,
  validateIndicatorFile,
} from "./securityScan.js";
// Trigger Detection
export {
  calculateICDecayDays,
  calculateRollingIC,
  createTriggerConditions,
  daysSince,
  evaluateTriggerConditions,
  type ICHistoryEntry,
  ICHistoryEntrySchema,
  isUnderperforming,
  shouldTriggerGeneration,
  TRIGGER_DEFAULTS,
  type TriggerConditions,
  TriggerConditionsSchema,
  type TriggerEvaluationResult,
  TriggerEvaluationResultSchema,
} from "./trigger.js";
// Walk-Forward Validation
export {
  compareWalkForwardMethods,
  evaluateWalkForward,
  isWalkForwardRobust,
  minimumWalkForwardLength,
  type WalkForwardInput,
  WalkForwardInputSchema,
  type WalkForwardMethod,
  type WalkForwardPeriod,
  WalkForwardPeriodSchema,
  type WalkForwardResult,
  WalkForwardResultSchema,
  WF_DEFAULTS,
  walkForwardSweep,
  walkForwardValidation,
} from "./walkForward.js";
