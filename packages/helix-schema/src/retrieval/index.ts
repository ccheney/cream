/**
 * Retrieval Module
 *
 * Utilities for hybrid retrieval combining vector search and graph traversal.
 */

export {
  // Types
  type RetrievalResult,
  type RankedResult,
  type RRFResult,
  type RRFOptions,
  // Constants
  DEFAULT_RRF_K,
  DEFAULT_TOP_K,
  // Core functions
  calculateRRFScore,
  assignRanks,
  fuseWithRRF,
  fuseMultipleWithRRF,
  // Utilities
  calculateCombinedRRFScore,
  getMaxRRFScore,
  normalizeRRFScores,
  calculateMultiMethodBoost,
} from "./rrf";

// ============================================
// Corrective Retrieval
// ============================================

export {
  // Constants
  DEFAULT_QUALITY_THRESHOLD,
  DEFAULT_MIN_RESULTS,
  DEFAULT_DIVERSITY_THRESHOLD,
  DEFAULT_BROADENING_FACTOR,
  MAX_CORRECTION_ATTEMPTS,
  THRESHOLD_REDUCTION_STEP,
  DEFAULT_QUALITY_THRESHOLDS,
  // Types
  type QualityAssessment,
  type QualityThresholds,
  type CorrectionStrategy,
  type CorrectionStrategyConfig,
  type CorrectionAttempt,
  type CorrectiveRetrievalResult,
  type CorrectiveRetrievalOptions,
  type RetrievalFunction,
  type CorrectionLogEntry,
  type CorrectionMetrics,
  // Quality assessment functions
  calculateAvgScore,
  calculateDiversityScore,
  calculateCoverageScore,
  assessRetrievalQuality,
  shouldCorrect,
  // Correction strategies
  calculateBroadenedK,
  calculateLoweredThreshold,
  generateExpansionTerms,
  selectCorrectionStrategy,
  // Corrective retrieval pipeline
  correctiveRetrieval,
  withCorrectiveRetrieval,
  // RRF integration
  assessRRFQuality,
  shouldCorrectRRF,
  // Logging and metrics
  calculateCorrectionMetrics,
  createCorrectionLogEntry,
} from "./corrective";
