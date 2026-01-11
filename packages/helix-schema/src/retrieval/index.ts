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
  assessRRFQuality,
  type CorrectionAttempt,
  type CorrectionLogEntry,
  type CorrectionMetrics,
  type CorrectionStrategy,
  type CorrectionStrategyConfig,
  type CorrectiveRetrievalOptions,
  type CorrectiveRetrievalResult,
  calculateAvgScore,
  calculateBroadenedK,
  calculateCorrectionMetrics,
  calculateCoverageScore,
  calculateDiversityScore,
  calculateLoweredThreshold,
  correctiveRetrieval,
  createCorrectionLogEntry,
  DEFAULT_BROADENING_FACTOR,
  DEFAULT_DIVERSITY_THRESHOLD,
  DEFAULT_MIN_RESULTS,
  DEFAULT_QUALITY_THRESHOLD,
  DEFAULT_QUALITY_THRESHOLDS,
  generateExpansionTerms,
  MAX_CORRECTION_ATTEMPTS,
  type QualityAssessment,
  type QualityThresholds,
  type RetrievalFunction,
  selectCorrectionStrategy,
  shouldCorrect,
  shouldCorrectRRF,
  THRESHOLD_REDUCTION_STEP,
  withCorrectiveRetrieval,
} from "./corrective/index.js";

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
