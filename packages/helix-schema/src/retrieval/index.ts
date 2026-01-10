/**
 * Retrieval Module
 *
 * Utilities for hybrid retrieval combining vector search and graph traversal.
 */

export {
  assignRanks,
  // Utilities
  calculateCombinedRRFScore,
  calculateMultiMethodBoost,
  // Core functions
  calculateRRFScore,
  // Constants
  DEFAULT_RRF_K,
  DEFAULT_TOP_K,
  fuseMultipleWithRRF,
  fuseWithRRF,
  getMaxRRFScore,
  normalizeRRFScores,
  type RankedResult,
  // Types
  type RetrievalResult,
  type RRFOptions,
  type RRFResult,
} from "./rrf";

// ============================================
// Corrective Retrieval
// ============================================

export {
  assessRetrievalQuality,
  // RRF integration
  assessRRFQuality,
  type CorrectionAttempt,
  type CorrectionLogEntry,
  type CorrectionMetrics,
  type CorrectionStrategy,
  type CorrectionStrategyConfig,
  type CorrectiveRetrievalOptions,
  type CorrectiveRetrievalResult,
  // Quality assessment functions
  calculateAvgScore,
  // Correction strategies
  calculateBroadenedK,
  // Logging and metrics
  calculateCorrectionMetrics,
  calculateCoverageScore,
  calculateDiversityScore,
  calculateLoweredThreshold,
  // Corrective retrieval pipeline
  correctiveRetrieval,
  createCorrectionLogEntry,
  DEFAULT_BROADENING_FACTOR,
  DEFAULT_DIVERSITY_THRESHOLD,
  DEFAULT_MIN_RESULTS,
  // Constants
  DEFAULT_QUALITY_THRESHOLD,
  DEFAULT_QUALITY_THRESHOLDS,
  generateExpansionTerms,
  MAX_CORRECTION_ATTEMPTS,
  // Types
  type QualityAssessment,
  type QualityThresholds,
  type RetrievalFunction,
  selectCorrectionStrategy,
  shouldCorrect,
  shouldCorrectRRF,
  THRESHOLD_REDUCTION_STEP,
  withCorrectiveRetrieval,
} from "./corrective";

// ============================================
// Situation Brief
// ============================================

export {
  type AssetType,
  calculateRetrievalStatistics,
  DEFAULT_SITUATION_BRIEF_CONFIG,
  formatRetrievalStatistics,
  generateSituationBrief,
  type PositionDirection,
  type RetrievalStatistics,
  type ReturnDistribution,
  type SituationBrief,
  type SituationBriefConfig,
  type SituationBriefEvent,
  type SituationBriefIndicator,
  type SituationBriefInput,
  type SituationBriefInstrument,
  type SituationBriefPosition,
  type SituationBriefRegime,
} from "./situationBrief";
