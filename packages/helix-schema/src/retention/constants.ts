/**
 * Constants for Active Forgetting Policy
 *
 * Defines thresholds and parameters for the Ebbinghaus forgetting curve
 * implementation used in trading memory retention.
 */

/**
 * Decay constant in days for the forgetting curve.
 * 365 days = 1 year half-life for trading decisions.
 * At t=365 days, recency factor = 0.368 (1/e)
 */
export const DECAY_CONSTANT_DAYS = 365;

/**
 * SEC Rule 17a-4 compliance period in days (6 years)
 */
export const COMPLIANCE_PERIOD_DAYS = 6 * 365; // 2190 days

/**
 * Frequency scaling factor for log transformation
 * Prevents over-weighting highly accessed nodes
 */
export const FREQUENCY_SCALE_FACTOR = 10;

/**
 * P/L normalization factor for importance calculation ($10K)
 */
export const PNL_NORMALIZATION_FACTOR = 10_000;

/**
 * Edge count normalization factor for importance calculation
 */
export const EDGE_COUNT_NORMALIZATION_FACTOR = 50;

/**
 * Threshold below which nodes are candidates for summarization
 */
export const SUMMARIZATION_THRESHOLD = 0.1;

/**
 * Threshold below which nodes are candidates for deletion (non-LIVE only)
 */
export const DELETION_THRESHOLD = 0.05;

/**
 * Infinite retention score (never forget - compliance requirement)
 */
export const INFINITE_RETENTION = Number.POSITIVE_INFINITY;
