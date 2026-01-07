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
// Forward Returns Calculator
export {
  calculateForwardReturns,
  calculateForwardReturnsDetailed,
  type ForwardReturn,
  type ForwardReturnsConfig,
  type PriceProvider,
  validatePriceCoverage,
} from "./forwardReturns.js";
// Indicator Hypothesis Schema
export {
  type ExpectedProperties,
  ExpectedPropertiesSchema,
  HYPOTHESIS_CATEGORIES,
  HYPOTHESIS_STATUSES,
  HYPOTHESIS_TIMEFRAMES,
  type HypothesisCategory,
  type HypothesisRecord,
  HypothesisRecordSchema,
  type HypothesisStatus,
  type HypothesisTimeframe,
  type IndicatorHypothesis,
  IndicatorHypothesisSchema,
  isValidCategory,
  isValidHypothesisName,
  safeValidateHypothesis,
  validateHypothesis,
} from "./hypothesis.js";
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
// Production Monitoring
export {
  type DailyICMetrics,
  DailyICMetricsSchema,
  type DecisionAttribution,
  DecisionAttributionSchema,
  IndicatorMonitor,
  MONITORING_DEFAULTS,
  type RetirementCheck,
  RetirementCheckSchema,
  type RetirementReason,
  RetirementReasonSchema,
  type RollingMetrics,
  RollingMetricsSchema,
} from "./monitoring.js";
// Orthogonality Checker (Correlation + VIF)
export {
  type CorrelationResult,
  CorrelationResultSchema,
  checkOrthogonality,
  computeAllVIFs,
  computeCorrelationMatrix,
  computePairwiseCorrelations,
  computeVIF,
  evaluateOrthogonality,
  isIndicatorOrthogonal,
  ORTHOGONALITY_DEFAULTS,
  type OrthogonalityInput,
  OrthogonalityInputSchema,
  type OrthogonalityResult,
  OrthogonalityResultSchema,
  orthogonalize,
  orthogonalizeMultiple,
  pearsonCorrelation as orthPearsonCorrelation,
  rankByOrthogonality,
  type VIFResult,
  VIFResultSchema,
} from "./orthogonality.js";
// Paper Trading Validation
export {
  aggregatePaperTradingResults,
  type BacktestedMetrics,
  BacktestedMetricsSchema,
  calculateRealizedMetrics,
  canEvaluatePaperTrading,
  daysUntilEvaluation,
  determinePaperTradingAction,
  evaluatePaperTrading,
  PAPER_TRADING_DEFAULTS,
  type PaperSignal,
  PaperSignalSchema,
  type PaperTradingConfig,
  PaperTradingConfigSchema,
  type PaperTradingResult,
  PaperTradingResultSchema,
  type RealizedMetrics,
  RealizedMetricsSchema,
  tradingDaysBetween,
} from "./paperTrading.js";
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
// Retirement Pipeline
export {
  generateDeprecationComment,
  generateRetirementPRBody,
  IndicatorRetirement,
  RETIREMENT_DEFAULTS,
  type RetirementRequest,
  RetirementRequestSchema,
  type RetirementResult,
  RetirementResultSchema,
} from "./retirement.js";
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
// Signal Recording (Paper Trading)
export {
  addTradingDays,
  type PaperSignal as RecordedPaperSignal,
  type PendingOutcome,
  SignalRecorder,
  type SignalRecorderConfig,
  subtractTradingDays,
} from "./signalRecorder.js";
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
// Validation Pipeline Orchestrator
export {
  type DSRGateResult,
  DSRGateResultSchema,
  estimateSurvivalRate,
  evaluateValidation,
  type ICGateResult,
  ICGateResultSchema,
  isIndicatorValid,
  type OrthogonalityGateResult,
  OrthogonalityGateResultSchema,
  type PBOGateResult,
  PBOGateResultSchema,
  runValidationPipeline,
  type TrialInfo,
  TrialInfoSchema,
  VALIDATION_DEFAULTS,
  type ValidationInput,
  ValidationInputSchema,
  type ValidationResult,
  ValidationResultSchema,
  validateAndRank,
  type WalkForwardGateResult,
  WalkForwardGateResultSchema,
} from "./validationPipeline.js";
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
