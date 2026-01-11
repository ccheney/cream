/**
 * Freshness validation for HelixDB embeddings.
 * @module
 */

import { STALE_EMBEDDING_THRESHOLD_MS } from "./constants.js";
import type { FreshnessInfo } from "./types.js";

/**
 * Check if embeddings are stale.
 *
 * @param lastUpdate - Last embedding update time
 * @param thresholdMs - Staleness threshold (ms)
 * @returns Whether embeddings are stale
 */
export function isEmbeddingStale(
  lastUpdate: Date,
  thresholdMs: number = STALE_EMBEDDING_THRESHOLD_MS
): boolean {
  const ageMs = Date.now() - lastUpdate.getTime();
  return ageMs > thresholdMs;
}

/**
 * Calculate embedding age in hours.
 *
 * @param lastUpdate - Last embedding update time
 * @returns Age in hours
 */
export function getEmbeddingAgeHours(lastUpdate: Date): number {
  const ageMs = Date.now() - lastUpdate.getTime();
  return ageMs / (60 * 60 * 1000);
}

/**
 * Validate data freshness.
 *
 * @param lastEmbeddingUpdate - When embeddings were last updated
 * @param currentRegime - Current market regime
 * @param embeddingRegime - Regime when embeddings were created
 * @returns Freshness validation result
 */
export function validateFreshness(
  lastEmbeddingUpdate: Date,
  currentRegime?: string,
  embeddingRegime?: string
): FreshnessInfo {
  const isStale = isEmbeddingStale(lastEmbeddingUpdate);
  const ageHours = getEmbeddingAgeHours(lastEmbeddingUpdate);
  const regimeChanged =
    currentRegime !== undefined &&
    embeddingRegime !== undefined &&
    currentRegime !== embeddingRegime;

  return {
    lastEmbeddingUpdate,
    isStale,
    ageHours,
    currentRegime,
    embeddingRegime,
    regimeChanged,
  };
}

/**
 * Determine if re-embedding is needed.
 *
 * @param freshness - Freshness info
 * @returns Whether re-embedding should be triggered
 */
export function needsReembedding(freshness: FreshnessInfo): boolean {
  return freshness.isStale || freshness.regimeChanged;
}
