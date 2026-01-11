/**
 * Orthogonality Checker Module
 *
 * Assesses indicator independence using correlation analysis and Variance Inflation Factor (VIF).
 * Ensures new indicators provide unique information not captured by existing factors.
 *
 * @see docs/research/indicator-validation-statistics.md Section 5
 */

// Correlation Functions
export {
  computeCorrelationMatrix,
  computePairwiseCorrelations,
  pearsonCorrelation,
} from "./correlation.js";
// Selection and Evaluation
export {
  checkOrthogonality,
  evaluateOrthogonality,
  isIndicatorOrthogonal,
  rankByOrthogonality,
} from "./selection.js";
// Types and Schemas
export {
  type CorrelationResult,
  CorrelationResultSchema,
  ORTHOGONALITY_DEFAULTS,
  type OrthogonalityInput,
  OrthogonalityInputSchema,
  type OrthogonalityResult,
  OrthogonalityResultSchema,
  type VIFResult,
  VIFResultSchema,
} from "./types.js";
// VIF and Orthogonalization
export {
  computeAllVIFs,
  computeVIF,
  orthogonalize,
  orthogonalizeMultiple,
} from "./weighting.js";
