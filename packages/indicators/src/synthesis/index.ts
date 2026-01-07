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
